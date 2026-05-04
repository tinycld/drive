package drive

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

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

// nextUniqueDriveItemName returns `requested` if no other drive_items row in
// (org, parent) has that name, otherwise "base (n)ext" where n is the lowest
// positive integer that yields an unused name. Probes sequentially via the
// unique-index lookup; for the common case of no collision this is one query.
//
// Bounded at 999 retries to defend against pathological input — past that we
// fall back to a timestamp-tagged name to break the loop without erroring.
func nextUniqueDriveItemName(app core.App, orgID, parentID, requested string) (string, error) {
	if requested == "" {
		return requested, nil
	}
	taken, err := nameTaken(app, orgID, parentID, requested)
	if err != nil {
		return "", err
	}
	if !taken {
		return requested, nil
	}
	base, ext := splitNameExt(requested)
	for i := 1; i <= 999; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		taken, err := nameTaken(app, orgID, parentID, candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return fmt.Sprintf("%s (%d)%s", base, time.Now().UnixNano(), ext), nil
}

func nameTaken(app core.App, orgID, parentID, name string) (bool, error) {
	existing, err := app.FindFirstRecordByFilter(
		"drive_items",
		"org = {:org} && parent = {:parent} && name = {:name}",
		map[string]any{"org": orgID, "parent": parentID, "name": name},
	)
	if err != nil {
		// PocketBase returns sql.ErrNoRows when there's no match — that means
		// the name is free. Any other error bubbles up.
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return existing != nil, nil
}
