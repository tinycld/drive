package drive

import (
	"errors"
	"fmt"
	"strings"
	"time"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// splitNameExt splits a filename into base + extension using the rightmost dot
// as the separator. A leading dot (".env") or no dot returns the original name
// as the base with no extension — same convention as the client-side
// deduplicateName helper in lib/deduplicate-name.ts so renames look the same
// regardless of which side decides them.
func splitNameExt(name string) (base, ext string) {
	idx := strings.LastIndex(name, ".")
	if idx <= 0 {
		return name, ""
	}
	return name[:idx], name[idx:]
}

// isDriveItemNameConflict reports whether err is the unique-constraint failure
// raised when (org, parent, name) collides on drive_items. PocketBase wraps
// the normalized validation.Errors in errors.Join (via *errors.joinError) by
// the time it reaches our hook, so we use errors.As to dig it out rather than
// a direct type assertion. Also matches the raw SQLite error string as a
// fallback for paths that bypass the normalizer.
func isDriveItemNameConflict(err error) bool {
	if err == nil {
		return false
	}
	var verrs validation.Errors
	if errors.As(err, &verrs) {
		e, ok := verrs["name"]
		if !ok {
			return false
		}
		if v, ok := e.(validation.Error); ok && v.Code() == "validation_not_unique" {
			return true
		}
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "unique constraint failed")
}

// saveWithUniqueDriveItemName retries the record save with sequentially
// numbered names ("base (1)ext", "base (2)ext", …) until the unique
// (org, parent, name) index accepts one. Uses SaveNoValidate so the retries
// don't re-fire the create hook — the DB is the authority on collisions.
//
// Returns (true, nil) if a renamed save succeeded, (false, originalErr) if
// the attempts exhausted, or (false, err) on any non-conflict error.
func saveWithUniqueDriveItemName(app core.App, record *core.Record) (bool, error) {
	requested := record.GetString("name")
	base, ext := splitNameExt(requested)
	for i := 1; i <= 999; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		record.Set("name", candidate)
		err := app.SaveNoValidate(record)
		if err == nil {
			return true, nil
		}
		if !isDriveItemNameConflict(err) {
			return false, err
		}
	}
	// Pathological folder — 999 collisions in a row. Use a timestamp suffix to
	// break the loop instead of erroring; collisions on this are effectively
	// impossible.
	record.Set("name", fmt.Sprintf("%s (%d)%s", base, time.Now().UnixNano(), ext))
	if err := app.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}
