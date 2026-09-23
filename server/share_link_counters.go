package drive

import (
	"time"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/logging"
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

// countShareLinkDownload records one download of the link.
//
// The increment is computed in SQL (download_count + 1), so concurrent
// downloads serialize on the write connection instead of racing through a
// read-modify-write.
func countShareLinkDownload(app core.App, token string) error {
	_, err := app.NonconcurrentDB().NewQuery(`
		UPDATE drive_share_links
		SET download_count   = COALESCE(download_count, 0) + 1,
		    last_accessed_at = {:now}
		WHERE token = {:token}
	`).Bind(map[string]any{
		"now":   time.Now().UTC().Format(time.RFC3339),
		"token": token,
	}).Execute()
	return err
}
