package drive

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// maxRenameAttempts caps the rename probe loop. 1000 contiguous numbered
// candidates in the same folder is far past any realistic UI flow; if we hit
// it we fail loud rather than guess a timestamp suffix.
const maxRenameAttempts = 1000

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

// chooseUniqueDriveItemName returns `requested` if no other drive_items row in
// (org, parent) has that name, otherwise "base (n)ext" where n is the lowest
// positive integer that yields an unused name. One indexed lookup per probe
// against the unique (org, parent, name) index; usually one, occasionally a
// few more on real collisions.
//
// The unique index is still the ultimate safety net for the narrow race where
// another transaction commits a colliding name between our probe and our
// INSERT — that case surfaces as a save error to the caller.
func chooseUniqueDriveItemName(app core.App, orgID, parentID, requested string) (string, error) {
	if requested == "" {
		return requested, nil
	}
	taken, err := driveItemNameTaken(app, orgID, parentID, requested)
	if err != nil {
		return "", err
	}
	if !taken {
		return requested, nil
	}
	base, ext := splitNameExt(requested)
	for i := 1; i <= maxRenameAttempts; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		taken, err := driveItemNameTaken(app, orgID, parentID, candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not find a free name for %q in this folder after %d attempts", requested, maxRenameAttempts)
}

func driveItemNameTaken(app core.App, orgID, parentID, name string) (bool, error) {
	_, err := app.FindFirstRecordByFilter(
		"drive_items",
		"org = {:org} && parent = {:parent} && name = {:name}",
		map[string]any{"org": orgID, "parent": parentID, "name": name},
	)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return false, err
}
