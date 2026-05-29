package drive

import (
	"sync"

	"github.com/pocketbase/pocketbase/core"
)

// VersionHook lets a per-itemType package extend drive's generic
// snapshot/restore with custom behavior. Hooks fire after the drive-
// owned file blob has been written/restored, so the hook implementation
// can attach package-specific data (e.g. text writes Yjs state into
// drive_item_versions.yjs_state alongside the docx blob).
//
// Hooks are best-effort — drive logs failures but does not roll back
// the version row. A failure means the package-specific data wasn't
// captured (or wasn't applied), but the docx blob round-trip still
// works as before.
type VersionHook struct {
	// OnSnapshot fires after the drive_item_versions row has been
	// created and the file blob copied. The package can read the live
	// state (e.g. an in-memory Y.Doc) and write metadata back to the
	// version row.
	OnSnapshot func(app core.App, item *core.Record, version *core.Record) error

	// OnRestore fires after the drive_item file has been replaced from
	// the version's blob. The package can read the version's
	// package-specific fields (e.g. yjs_state) and apply them to the
	// live state.
	OnRestore func(app core.App, item *core.Record, version *core.Record) error
}

var (
	versionHooksMu sync.RWMutex
	versionHooks   = map[string]VersionHook{}
)

// RegisterVersionHook records a hook for the given drive_items.type.
// Idempotent — re-registering replaces. Called from a package's
// Register() during process bootstrap.
func RegisterVersionHook(itemType string, hook VersionHook) {
	versionHooksMu.Lock()
	defer versionHooksMu.Unlock()
	versionHooks[itemType] = hook
}

// VersionHookFor returns the registered hook for itemType, or a
// zero-value VersionHook (both fields nil) if none.
func VersionHookFor(itemType string) VersionHook {
	versionHooksMu.RLock()
	defer versionHooksMu.RUnlock()
	return versionHooks[itemType]
}
