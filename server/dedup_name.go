package drive

import (
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"strings"
	"sync"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// createLocks serializes create-with-dedup per parent folder. The dedup is a
// probe-then-insert: two concurrent creates of the same name both probe
// before either inserts, compute the same "free" name, and the loser trips
// the unique (parent, name) index with a 400 the client can't distinguish
// from a real validation error. Two teammates clicking "New sheet" at the
// same moment is a normal event, not a narrow race — the calc e2e suite hits
// it on most parallel runs. Sharded by parent hash (bounded memory, no
// cleanup); in-process locking suffices because a deployment is one process
// per org, standalone and tenant alike.
var createLocks [64]sync.Mutex

func createLockFor(parentID string) *sync.Mutex {
	h := fnv.New32a()
	_, _ = h.Write([]byte(parentID))
	return &createLocks[h.Sum32()%uint32(len(createLocks))]
}

// registerDriveItemCreateHook binds the drive_items create hook, which owns
// two concerns the API path can't do alone:
//   - auto-rename on (parent, name) unique-index collisions, so clients can
//     POST "report.pdf" without first listing the folder
//   - owner drive_shares insert, in the same transaction as the item, so no
//     drive_item ever exists without an owner share
//
// Probe + insert run under the parent's create lock so concurrent same-name
// creates converge on distinct names; the unique index stays as the backstop
// for writes that bypass this process entirely.
func registerDriveItemCreateHook(app core.App) {
	app.OnRecordCreate("drive_items").BindFunc(func(e *core.RecordEvent) error {
		// The client-supplied `size` is untrusted: a forged `size=0` would
		// under-report in handleStorageUsage AND slip past core/quota, whose
		// hook reads this same field. Recompute it from the actual uploaded
		// blob — mirroring the WebDAV and version-upload paths, which both
		// derive size from the stored bytes (filesystem.File.Size) rather than
		// the request field. reconcileDriveItemSize leaves fileless creates
		// (folders, blank items) with their as-declared size.
		//
		// This hook is bound before core/quota's (drive registers first), so the
		// corrected size is what the ceiling is checked against.
		reconcileDriveItemSize(e.Record)

		mu := createLockFor(e.Record.GetString("parent"))
		mu.Lock()
		defer mu.Unlock()

		userID := e.Record.GetString("created_by")
		unique, err := chooseUniqueDriveItemName(e.App, e.Record.GetString("parent"), e.Record.GetString("name"))
		if err != nil {
			return fmt.Errorf("dedup drive_item name: %w", err)
		}
		if unique != e.Record.GetString("name") {
			e.Record.Set("name", unique)
		}
		if err := e.Next(); err != nil {
			return err
		}
		if userID == "" {
			return nil
		}
		return createOwnerShare(e.App, e.Record.Id, userID)
	})
}

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
// (parent) has that name, otherwise "base (n)ext" where n is the lowest
// positive integer that yields an unused name. One indexed lookup per probe
// against the unique (parent, name) index; usually one, occasionally a
// few more on real collisions.
//
// The unique index is still the ultimate safety net for the narrow race where
// another transaction commits a colliding name between our probe and our
// INSERT — that case surfaces as a save error to the caller.
func chooseUniqueDriveItemName(app core.App, parentID, requested string) (string, error) {
	if requested == "" {
		return requested, nil
	}
	taken, err := driveItemNameTaken(app, parentID, requested)
	if err != nil {
		return "", err
	}
	if !taken {
		return requested, nil
	}
	base, ext := splitNameExt(requested)
	for i := 1; i <= maxRenameAttempts; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		taken, err := driveItemNameTaken(app, parentID, candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not find a free name for %q in this folder after %d attempts", requested, maxRenameAttempts)
}

// driveItemNameTaken probes the (parent, name) unique index directly via
// dbx rather than going through FindFirstRecordByFilter. PocketBase's filter
// expression layer json-marshals empty-string parameters and produces a stored
// SQL value of `'""'` rather than `”`, so a probe with parentID == "" never
// matches root-level rows whose parent is the empty string. Issuing the query
// directly with dbx parameter binding sidesteps that substitution path.
func driveItemNameTaken(app core.App, parentID, name string) (bool, error) {
	return driveItemNameTakenDB(app.DB(), parentID, name)
}

func driveItemNameTakenDB(db dbx.Builder, parentID, name string) (bool, error) {
	var id string
	err := db.
		Select("id").
		From("drive_items").
		Where(dbx.HashExp{"parent": parentID, "name": name}).
		Limit(1).
		Row(&id)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return false, err
}
