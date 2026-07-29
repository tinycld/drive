package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/rlstest"
	"tinycld.org/core/webdav"
)

// Tripwire for host/tenant drift inside this package, mirroring
// coreserver/composition_parity_test.go one level down: Register (single-org
// app) may bind more than RegisterTenant (multi-org tenant) ONLY where the
// map below records the divergence with a reason. Adding a registration to
// one entry point without deciding whether the other gets it fails here with
// the offending hook name. See multi-org/docs/FINDING-tenant-composition-gap.md
// for what silent divergence cost.
func TestTenantCompositionMatchesHostMinusRecordedExceptions(t *testing.T) {
	host := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	Register(host)

	tenant := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	RegisterTenant(tenant)

	rlstest.AssertCompositionDiff(t,
		rlstest.HookHandlerCounts(t, host),
		rlstest.HookHandlerCounts(t, tenant),
		map[string]int{
			// webdav.Register's route mount. A tenant mounts /dav/drive
			// itself from the materialized manifest `webdav` block
			// (coreserver.RegisterTenant), so the feature-side mount is
			// host-only — mounting both would double-bind the routes.
			"OnServe": 1,
		})
}

// The tenant's WebDAV mount is materialized from JSON, so its Source carries
// no Go closures — RegisterTenant must hand drive's hooks to core's registry
// (webdav.RegisterSourceHooks) for the mount to adopt, or a tenant-served
// overwrite skips the version snapshot (R7). Core's webdav suite proves the
// adoption side; this pins drive's wiring of it.
func TestRegisterTenant_RegistersWebDAVHooksForMaterializedMount(t *testing.T) {
	tenant := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	RegisterTenant(tenant)

	hooks, ok := webdav.RegisteredSourceHooks(tenant, "drive")
	if !ok {
		t.Fatal("RegisterTenant registered no webdav hooks for slug \"drive\"")
	}
	if hooks.BeforeOverwrite == nil {
		t.Fatal("registered hooks carry no BeforeOverwrite — the version snapshot would be skipped in a tenant")
	}
}
