package drive

import (
	"github.com/pocketbase/pocketbase/core"
)

// maxFolderDepth bounds every parent-chain walk (the acyclicity check and the
// recursive download CTE). It caps how deep a legitimate tree can nest and
// doubles as the termination guard against a pre-existing cycle: a walk that
// hasn't reached the root after this many hops is treated as corrupt and stops
// rather than spinning forever.
//
// core/webdav enforces the same bound for the paths it serves; this copy covers
// drive's own endpoints (folder download, path building).
const maxFolderDepth = 256

// moveWouldCreateCycle reports whether reparenting movedID under newParentID
// would introduce a cycle — i.e. movedID is newParentID itself, or an ancestor
// of newParentID. It walks the new parent's ancestor chain upward via the
// `parent` column, guarded by a visited-set AND a depth cap so a PRE-EXISTING
// cycle in the data can't hang the check itself.
//
// A move to the root (empty newParentID) can never create a cycle.
//
// This backs the OnRecordUpdate hook, which is the authoritative guard for
// every write path — the API, the UI's drag-and-drop, and a direct PATCH.
// (core/webdav applies its own equivalent check to MOVE requests before they
// reach the record layer.)
func moveWouldCreateCycle(app core.App, movedID, newParentID string) (bool, error) {
	if newParentID == "" || movedID == "" {
		return false, nil
	}
	if newParentID == movedID {
		return true, nil
	}

	seen := map[string]bool{}
	id := newParentID
	for depth := 0; id != "" && depth < maxFolderDepth; depth++ {
		if id == movedID {
			return true, nil
		}
		if seen[id] {
			// Already-cyclic ancestor chain (not involving movedID): stop
			// walking. The move isn't what creates the cycle, so don't block
			// it on that basis — bail out cleanly instead of looping.
			return false, nil
		}
		seen[id] = true

		rec, err := app.FindRecordById("drive_items", id)
		if err != nil {
			// A dangling parent pointer terminates the chain; no cycle.
			return false, nil
		}
		id = rec.GetString("parent")
	}
	return false, nil
}
