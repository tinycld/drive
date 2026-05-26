package drive

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"tinycld.org/core/mailer"
	"tinycld.org/core/sharelink"
)

// otpCodeLength is the length of the numeric OTP we email.
// 6 digits is the same length PocketBase's stock OTP flow uses
// (security.RandomStringWithAlphabet(6, "1234567890")).
const otpCodeLength = 6

// otpDuration is how long a minted OTP stays valid. PocketBase's stock
// OTP flow uses 15 min by default; we mirror that. Keep short enough
// that a leaked email is not a long-lived credential, long enough that
// a human can actually read their inbox and paste the code.
const otpDuration = 15 * time.Minute

// otpRequestBody is the POST body of the otp-request endpoint.
type otpRequestBody struct {
	Email string `json:"email"`
}

// otpVerifyBody is the POST body of the otp-verify endpoint.
type otpVerifyBody struct {
	Email string `json:"email"`
	Code  string `json:"code"`
	OTPID string `json:"otp_id"`
}

// handleShareOTPRequest mints a one-time email-delivered code that an
// anonymous visitor of a commentor/editor share link can later present
// at otp-verify to obtain a real (limited) PocketBase auth token.
//
// Public. Rate-limited (publicShareLimiter — same one the session and
// other public-share endpoints use).
//
// Security:
//
//   - The link is re-resolved on every call so revocation/expiry takes
//     effect immediately.
//   - viewer links are rejected — they grant only anonymous read-only
//     viewing, so no account is needed.
//   - The code is emailed; it is NEVER returned in the HTTP response.
//   - We DO create the `users` record here (PocketBase OTPs are anchored
//     to an auth record), but we do NOT create the org membership or
//     drive_shares row — those are created at verify, after email proof.
//     An unverified user with no membership has no org access, so
//     request-but-never-verify is harmless.
func handleShareOTPRequest(app core.App, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	shareToken := re.Request.PathValue("token")

	link, item, err := sharelink.ResolveLink(app, shareToken)
	if err != nil {
		return re.JSON(sharelink.HTTPStatus(err), map[string]string{"error": err.Error()})
	}

	role := link.GetString("role")
	if role != sharelink.RoleCommentor && role != sharelink.RoleEditor {
		return re.JSON(http.StatusBadRequest, map[string]string{
			"error": "this link does not require sign-in",
		})
	}

	var body otpRequestBody
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	emailAddr, err := parseEmail(body.Email)
	if err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid email address"})
	}

	// Find-or-create the auth record. We do not touch org membership here;
	// the user is provisioned with verified=false and a random password,
	// and only becomes useful once they prove ownership of the address.
	userRecord, err := findOrCreateGuestUser(app, emailAddr)
	if err != nil {
		return re.InternalServerError("failed to prepare account", err)
	}

	// Generate the one-time code. Even a 6-digit numeric code is rate-
	// limited at verify (publicShareLimiter, plus single-use deletion on
	// success), so brute force from a single IP is bounded.
	code := security.RandomStringWithAlphabet(otpCodeLength, "1234567890")

	otp := core.NewOTP(app)
	otp.SetCollectionRef(userRecord.Collection().Id)
	otp.SetRecordRef(userRecord.Id)
	otp.SetSentTo(emailAddr)
	otp.SetPassword(code)
	if err := app.Save(otp); err != nil {
		return re.InternalServerError("failed to mint OTP", err)
	}

	if err := sendShareOTPEmail(app, emailAddr, code, item.GetString("name")); err != nil {
		// The email send failed but the OTP exists. We delete it so the
		// user can re-request without bumping into "too many" guards, and
		// we fail the request so the client sees the problem. We do NOT
		// leak the code to the response in any fallback.
		_ = app.Delete(otp)
		return re.InternalServerError("failed to send code", err)
	}

	// The otp_id is an opaque server pointer — the code itself goes via
	// email only. The client echoes otp_id at verify.
	return re.JSON(http.StatusOK, map[string]any{
		"ok":     true,
		"otp_id": otp.Id,
	})
}

// handleShareOTPVerify exchanges an emailed code + the otp_id for a real
// PocketBase auth token, AND provisions (idempotently) the guest
// user_org membership + drive_shares row scoped to the link's
// org+item+role.
//
// Public. Rate-limited.
//
// Security:
//
//   - The link is re-resolved here (revocation between request and
//     verify → 410).
//   - viewer links rejected (same reasoning as otp-request).
//   - Provisioning happens ONLY on a verified-code success path, and
//     ONLY in the link's org for the link's item with the link's role —
//     a verified email for one link must NOT grant access to another.
//   - Provisioning is idempotent: returning visitors / replayed
//     verifications reuse the same user_org and drive_shares row.
//   - The used OTP is deleted so the code cannot be replayed (PB's
//     standard OTP-consume pattern).
//   - Response shape mirrors the standard PB auth response so the
//     client can drop {token, record} directly into pb.authStore.
func handleShareOTPVerify(app core.App, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	shareToken := re.Request.PathValue("token")

	link, item, err := sharelink.ResolveLink(app, shareToken)
	if err != nil {
		return re.JSON(sharelink.HTTPStatus(err), map[string]string{"error": err.Error()})
	}

	role := link.GetString("role")
	if role != sharelink.RoleCommentor && role != sharelink.RoleEditor {
		return re.JSON(http.StatusBadRequest, map[string]string{
			"error": "this link does not require sign-in",
		})
	}

	var body otpVerifyBody
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	emailAddr, err := parseEmail(body.Email)
	if err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid email address"})
	}
	body.Code = strings.TrimSpace(body.Code)
	body.OTPID = strings.TrimSpace(body.OTPID)
	if body.Code == "" || body.OTPID == "" {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "code and otp_id are required"})
	}

	// Resolve the OTP. All "wrong thing" branches collapse into a
	// uniform 400 "invalid or expired code" so an attacker can't
	// distinguish "no such otp_id" from "wrong code" by status/message.
	otp, err := app.FindOTPById(body.OTPID)
	if err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}
	if otp.HasExpired(otpDuration) {
		_ = app.Delete(otp)
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}
	if !strings.EqualFold(otp.SentTo(), emailAddr) {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}
	if !otp.ValidatePassword(body.Code) {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "invalid or expired code"})
	}

	// At this point the email is proven. Provision the membership and
	// share in one transaction so a partial provision is impossible.
	itemOrg := item.GetString("org")
	linkRole := link.GetString("role")
	var liveUser *core.Record
	err = app.RunInTransaction(func(txApp core.App) error {
		// Find-or-create the user inside the tx so a concurrent request
		// can't double-create. The request endpoint already created the
		// row, but we tolerate it being absent (defensive).
		user, ferr := findOrCreateGuestUser(txApp, emailAddr)
		if ferr != nil {
			return fmt.Errorf("guest user: %w", ferr)
		}
		// The email is now proven — upgrade verified state if needed.
		if !user.Verified() {
			user.SetVerified(true)
			if serr := txApp.Save(user); serr != nil {
				return fmt.Errorf("verify user: %w", serr)
			}
		}

		// Find-or-create the org membership. If a membership already
		// exists with ANY role (e.g. the email matches a real member of
		// the org), reuse it — never downgrade an existing member to
		// guest. New rows are created with role=guest.
		userOrg, ferr := findOrCreateGuestUserOrg(txApp, user.Id, itemOrg)
		if ferr != nil {
			return fmt.Errorf("guest membership: %w", ferr)
		}

		// Find-or-create the per-item share. The unique index on
		// (item, user_org) backs the idempotency check at the DB level
		// as a safety net. If the share already exists we reuse it; we
		// do not silently upgrade its role from the link's current
		// role (the link's role is the upper bound; an explicit prior
		// share is already an explicit grant by the owner).
		if ferr := findOrCreateGuestDriveShare(txApp, item.Id, userOrg.Id, linkRole); ferr != nil {
			return fmt.Errorf("guest share: %w", ferr)
		}

		// Consume the OTP last so a transient save error above doesn't
		// leave the user out of code (they can retry within TTL).
		if derr := txApp.Delete(otp); derr != nil {
			return fmt.Errorf("consume otp: %w", derr)
		}

		liveUser = user
		return nil
	})
	if err != nil {
		return re.InternalServerError("failed to provision guest account", err)
	}

	// Re-fetch outside the transaction so PublicExport reflects the
	// committed verified state. Mirrors the pattern in demo_start.go.
	live, err := app.FindRecordById("users", liveUser.Id)
	if err != nil {
		return re.InternalServerError("failed to load guest record", err)
	}

	token, err := live.NewAuthToken()
	if err != nil {
		return re.InternalServerError("failed to mint auth token", err)
	}

	// Shape matches PocketBase's standard auth response (token + record)
	// so the client can call pb.authStore.save(token, record) directly.
	return re.JSON(http.StatusOK, map[string]any{
		"token":  token,
		"record": live.PublicExport(),
	})
}

// parseEmail normalizes and validates an email address. It returns the
// canonicalised address (trimmed, original case preserved for the local
// part) or an error.
func parseEmail(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("empty email")
	}
	addr, err := mail.ParseAddress(raw)
	if err != nil {
		return "", err
	}
	if addr.Address == "" {
		return "", errors.New("empty email")
	}
	return addr.Address, nil
}

// findOrCreateGuestUser returns the `users` row for the given email,
// creating one (verified=false, random password, name=email-prefix) if
// none exists. The email is matched case-insensitively via PocketBase's
// FindAuthRecordByEmail. Caller is responsible for any later verified
// upgrade.
func findOrCreateGuestUser(app core.App, email string) (*core.Record, error) {
	usersCol, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return nil, fmt.Errorf("users collection: %w", err)
	}

	existing, err := app.FindAuthRecordByEmail(usersCol, email)
	if err == nil && existing != nil {
		return existing, nil
	}
	// FindAuthRecordByEmail returns sql.ErrNoRows when missing; tolerate
	// that and fall through to create. Any OTHER error (transient DB
	// failure, etc.) is fatal — without this guard we'd silently
	// double-create on a flaky connection.
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "no rows") {
		return nil, fmt.Errorf("lookup user by email: %w", err)
	}

	displayName := email
	if idx := strings.IndexByte(email, '@'); idx > 0 {
		displayName = email[:idx]
	}

	password := security.RandomString(32)

	rec := core.NewRecord(usersCol)
	rec.SetEmail(email)
	rec.Set("emailVisibility", true)
	rec.Set("name", displayName)
	rec.SetVerified(false)
	rec.SetPassword(password)
	if err := app.Save(rec); err != nil {
		// Race: another request created the same email between our
		// lookup and Save. Re-fetch and return that row.
		if again, ferr := app.FindAuthRecordByEmail(usersCol, email); ferr == nil && again != nil {
			return again, nil
		}
		return nil, fmt.Errorf("create guest user: %w", err)
	}
	return rec, nil
}

// findOrCreateGuestUserOrg returns the user_org row for (user, org),
// creating one with role=guest if none exists. If a membership exists
// with ANY role we return it unchanged — a real member must not be
// silently downgraded by visiting a share link.
func findOrCreateGuestUserOrg(app core.App, userID, orgID string) (*core.Record, error) {
	existing, _ := app.FindFirstRecordByFilter(
		"user_org",
		"user = {:uid} && org = {:oid}",
		map[string]any{"uid": userID, "oid": orgID},
	)
	if existing != nil {
		return existing, nil
	}

	col, err := app.FindCollectionByNameOrId("user_org")
	if err != nil {
		return nil, fmt.Errorf("user_org collection: %w", err)
	}
	rec := core.NewRecord(col)
	rec.Set("user", userID)
	rec.Set("org", orgID)
	rec.Set("role", "guest")
	if err := app.Save(rec); err != nil {
		// Race: another concurrent verify call created the row.
		if again, ferr := app.FindFirstRecordByFilter(
			"user_org",
			"user = {:uid} && org = {:oid}",
			map[string]any{"uid": userID, "oid": orgID},
		); ferr == nil && again != nil {
			return again, nil
		}
		return nil, fmt.Errorf("create guest user_org: %w", err)
	}
	return rec, nil
}

// findOrCreateGuestDriveShare returns (or creates) a drive_shares row
// for (item, user_org). The role is set to the link's role on
// creation; an existing row is returned unchanged (do not silently
// modify a pre-existing explicit grant).
func findOrCreateGuestDriveShare(app core.App, itemID, userOrgID, role string) error {
	existing, _ := app.FindFirstRecordByFilter(
		"drive_shares",
		"item = {:item} && user_org = {:uo}",
		map[string]any{"item": itemID, "uo": userOrgID},
	)
	if existing != nil {
		return nil
	}

	col, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		return fmt.Errorf("drive_shares collection: %w", err)
	}
	rec := core.NewRecord(col)
	rec.Set("item", itemID)
	rec.Set("user_org", userOrgID)
	rec.Set("role", role)
	// created_by mirrors user_org so the guest's share is self-attributed
	// — there is no admin/owner doing the granting in this flow; the
	// link itself is the grant. Some access predicates require non-empty
	// created_by, and the row is functionally owned by the user.
	rec.Set("created_by", userOrgID)
	if err := app.Save(rec); err != nil {
		// Race: another verify concurrently created the row (unique
		// index on (item, user_org)). Tolerate.
		if again, _ := app.FindFirstRecordByFilter(
			"drive_shares",
			"item = {:item} && user_org = {:uo}",
			map[string]any{"item": itemID, "uo": userOrgID},
		); again != nil {
			return nil
		}
		return fmt.Errorf("create guest drive_share: %w", err)
	}
	return nil
}

// sendShareOTPEmail dispatches the OTP code via the configured mailer.
// The subject names the shared item so the recipient has context for
// the code in their inbox; the body contains the code only (no link,
// no other tokens) — the visitor already has the share URL open.
func sendShareOTPEmail(app core.App, toEmail, code, itemName string) error {
	if itemName == "" {
		itemName = "a shared file"
	}
	subject := fmt.Sprintf("Your code to comment on %q", itemName)
	html := fmt.Sprintf(`<div style="font-family: sans-serif; max-width: 480px;">
<p>Use this code to continue:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">%s</p>
<p style="color: #555;">The code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
</div>`, htmlEscapeOTP(code))
	text := fmt.Sprintf("Use this code to continue: %s\n\nThe code expires in 15 minutes.\n", code)

	msg := &mailer.Message{
		To:      []mailer.Recipient{{Email: toEmail}},
		Subject: subject,
		HTML:    html,
		Text:    text,
	}
	// Use the project's tinycld mailer (LogSender in dev/test, Postmark
	// in prod) instead of PocketBase's NewMailClient so this endpoint
	// matches every other outbound email site in the codebase (invite,
	// share invite, etc.) — single delivery gate, same dev/test log
	// path, same Postmark config. The app handle is unused at the call
	// site but kept on the signature so future per-app routing (e.g.
	// demo-user suppression) can be added without churn.
	_ = app
	return mailer.DefaultSender().Send(context.Background(), msg)
}

// htmlEscapeOTP escapes any html-significant characters in the code
// before interpolating it into the email body. The code alphabet is
// numeric, so in practice this is a defensive no-op; we keep it so a
// future alphabet change (e.g. alphanumeric) doesn't open an injection.
func htmlEscapeOTP(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}
