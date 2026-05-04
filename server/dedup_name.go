package drive

import (
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
// raised when (org, parent, name) collides on drive_items. Matches both the
// raw SQLite error string ("unique constraint failed") and PocketBase's
// normalized validation.Errors form, which surfaces as
// {"name": validation_not_unique}.
func isDriveItemNameConflict(err error) bool {
	if err == nil {
		return false
	}
	if verrs, ok := err.(validation.Errors); ok {
		if e, ok := verrs["name"]; ok {
			if v, ok := e.(validation.Error); ok && v.Code() == "validation_not_unique" {
				return true
			}
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
