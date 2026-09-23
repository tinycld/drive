package drive

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/logging"
	"tinycld.org/core/sharequota"
	"tinycld.org/packages/drive/api"
)

var shareLog = logging.ForPackage("drive")

// Share-link counters are written with targeted UPDATEs rather than
// app.Save(link), because app.Save writes the WHOLE record back from a copy
// that was read earlier in the request.
//
// Two public handlers touch the same row on every hit: the file download
// increments download_count, and the metadata fetch stamps last_accessed_at.
// Each used to load the record, mutate one field, and save all of them. Two
// concurrent downloads therefore both read download_count = N and both write
// N+1, losing an increment — and a metadata request racing a download wrote
// back the download_count it had read before the download ran, DECREMENTING
// the counter. A visitor could hold the count down indefinitely just by
// fetching metadata alongside downloads.
//
// That was tolerable while the counter was only a display number. It is not
// tolerable once anything depends on it, so both writes are now single
// statements that name the column they change and derive the new value in
// SQL. Nothing is read first, so there is nothing to be stale.

// touchShareLink stamps last_accessed_at without touching any other column.
func touchShareLink(app core.App, token string) error {
	_, err := app.NonconcurrentDB().NewQuery(`
		UPDATE drive_share_links
		SET last_accessed_at = {:now}
		WHERE token = {:token}
	`).Bind(map[string]any{
		"now":   time.Now().UTC().Format(time.RFC3339),
		"token": token,
	}).Execute()
	return err
}

// claimShareLinkDownload charges one download against the link's ceilings and
// reports whether it may proceed.
//
// The check and the charge are ONE statement. Splitting them — read the
// counters, compare, then increment — reopens the race the rest of this file
// exists to close, and reopens it in the place it matters most: concurrent
// requests would all read a count below the ceiling and all pass. Here the
// WHERE clause is the enforcement and RowsAffected() is the verdict, so there
// is no window between deciding and charging.
//
// The day rollover is folded into the same statement. When download_day is
// stale the CASE resets the counter to 1 and the day comparison sees 0, so a
// new day costs no extra write and nothing has to run at midnight.
//
// A zero ceiling means unlimited, matching sharequota.ShareLimits — the
// `{:x} = 0 OR ...` guards are how that convention is expressed in SQL.
//
// Returns false only on a definite, successfully-computed over-limit. An
// error is the caller's to fail open on; see the call site.
//
// # What this ceiling does not cover
//
// Two paths read a shared item's bytes without passing through here. Both are
// known and neither is the anonymous redistribution the ceiling exists to
// stop, but a reader counting on "every public read is metered" would be
// wrong.
//
// A GUEST admitted through the share-link OTP flow gets a users row and a
// drive_shares row, which satisfies drive_items' view rule — so they can
// fetch through PocketBase's own file route instead of the share endpoint.
// Reaching that state requires the owner to have minted a COMMENTOR or
// EDITOR link (the OTP flow rejects viewer links) and the guest to have
// proven an email address, so it is a named individual holding a collaboration
// grant, not a crowd behind a URL. Metering it would also need a link
// reference on drive_shares, which carries only {item, user, role} today.
//
// A CALC OR TEXT document opened from a share link never loads its bytes
// through any endpoint: the editor receives the document over the realtime
// WebSocket as a yjs state update, reconstructed server-side from the stored
// file. What travels is cell values and text runs rather than the xlsx or
// docx, embedded images do not resolve for an anonymous viewer at all, and
// the server reads the source file once per ROOM rather than once per
// visitor. The original file is still served — and still metered — through
// the share endpoint below; only the derived projection escapes.
func claimShareLinkDownload(app core.App, token string, limits sharequota.ShareLimits) (bool, error) {
	now := time.Now().UTC()

	res, err := app.NonconcurrentDB().NewQuery(`
		UPDATE drive_share_links
		SET download_count     = COALESCE(download_count, 0) + 1,
		    day_download_count = CASE WHEN download_day = {:day}
		                              THEN COALESCE(day_download_count, 0) + 1
		                              ELSE 1 END,
		    download_day       = {:day},
		    last_accessed_at   = {:now}
		WHERE token = {:token}
		  AND ({:lifetime} = 0 OR COALESCE(download_count, 0) < {:lifetime})
		  AND ({:perDay} = 0 OR COALESCE(
		        CASE WHEN download_day = {:day} THEN day_download_count ELSE 0 END, 0
		      ) < {:perDay})
	`).Bind(map[string]any{
		"day":      now.Format("2006-01-02"),
		"now":      now.Format(time.RFC3339),
		"token":    token,
		"lifetime": limits.Lifetime,
		"perDay":   limits.PerDay,
	}).Execute()
	if err != nil {
		return false, err
	}

	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// isChargeableRange reports whether this request counts as a download.
//
// The share endpoint serves through fsys.Serve, which honours Range, so one
// video scrub is dozens of requests for a single logical download. Charging
// each would drain a link in seconds and make the ceiling mean something
// different here than it does for a board attachment.
//
// So only a request that is not a mid-file continuation is charged: no Range
// header, or one starting at byte zero. The unit is "one transfer a client
// started" — a player seeking within a file pays once for opening it, and a
// download resuming at byte N is not charged twice for the same file.
//
// Deliberately inexact, and both inaccuracies forgive the visitor: a client
// re-opening from byte zero pays each time, which is right because those are
// real transfers, and a client fetching in chunks after one at zero pays
// once, undercounting by at most one file.
//
// Kept identical to the boards meter's version on purpose. If you change the
// rule here, change it there — the two packages share one ceiling.
func isChargeableRange(r *http.Request) bool {
	v := r.Header.Get("Range")
	if v == "" {
		return true
	}
	return strings.HasPrefix(v, "bytes=0-")
}

// refuseShareDownload answers a download the ceilings turned away.
//
// Two statuses, because the two ceilings mean different things to whoever is
// holding the link. A lifetime refusal is terminal — nothing resets it and
// only the owner minting a new link changes anything — so 410 Gone, which is
// already this endpoint's word for a link that is over (revoked and expired
// both return it). A daily refusal resolves on its own at midnight, so 429
// with Retry-After: telling a client "never" about something that is true
// only until tonight makes it discard a file the visitor is entitled to.
func refuseShareDownload(app core.App, re *core.RequestEvent, token string) error {
	limits := sharequota.Limits(app)
	lifetime, day, err := shareLinkDownloadCounts(app, token)
	if err != nil {
		// The claim already refused; we only wanted to name which ceiling.
		shareLog.Warn("could not read share link counters after a refusal", "token", token, "err", err)
		return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{
			Error: "this share link has reached its download limit",
		})
	}

	if limits.Lifetime > 0 && lifetime >= limits.Lifetime {
		shareLog.Warn("share link refused at its lifetime download ceiling",
			"token", token, "downloads", lifetime, "ceiling", limits.Lifetime)
		return re.JSON(http.StatusGone, api.ErrorResponse{
			Error: "this share link has reached its download limit",
		})
	}

	shareLog.Warn("share link refused at its daily download ceiling",
		"token", token, "downloadsToday", day, "ceiling", limits.PerDay)
	re.Response.Header().Set("Retry-After", strconv.Itoa(secondsUntilUTCMidnight(time.Now().UTC())))
	return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{
		Error: "this share link has hit today's download limit; it resets at midnight UTC",
	})
}

// secondsUntilUTCMidnight is the Retry-After for a daily refusal. At least 1,
// because a Retry-After of 0 invites an immediate retry that would refuse
// again.
func secondsUntilUTCMidnight(now time.Time) int {
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Add(24 * time.Hour)
	if s := int(midnight.Sub(now).Seconds()); s > 0 {
		return s
	}
	return 1
}

// shareLinkDownloadCounts reads a link's counters, to say WHICH ceiling a
// refusal hit. Only called after a refusal, and never used to decide one —
// the claim above already did that atomically.
func shareLinkDownloadCounts(app core.App, token string) (lifetime, day int, err error) {
	var row struct {
		DownloadCount    int    `db:"download_count"`
		DayDownloadCount int    `db:"day_download_count"`
		DownloadDay      string `db:"download_day"`
	}
	err = app.DB().NewQuery(`
		SELECT COALESCE(download_count, 0)     AS download_count,
		       COALESCE(day_download_count, 0) AS day_download_count,
		       COALESCE(download_day, '')      AS download_day
		FROM drive_share_links
		WHERE token = {:token}
	`).Bind(map[string]any{"token": token}).One(&row)
	if err != nil {
		return 0, 0, err
	}

	// A stale day means today's tally is zero, whatever the stored counter says.
	if row.DownloadDay != time.Now().UTC().Format("2006-01-02") {
		return row.DownloadCount, 0, nil
	}
	return row.DownloadCount, row.DayDownloadCount, nil
}
