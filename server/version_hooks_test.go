package drive

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// resetVersionHooks clears the package-level registry between tests so
// state from one test cannot leak into another.
func resetVersionHooks() {
	versionHooksMu.Lock()
	defer versionHooksMu.Unlock()
	versionHooks = map[string]VersionHook{}
}

func TestRegisterVersionHook_StoresAndRetrieves(t *testing.T) {
	resetVersionHooks()
	defer resetVersionHooks()

	snapshotCalled := false
	restoreCalled := false

	hook := VersionHook{
		OnSnapshot: func(app core.App, item *core.Record, version *core.Record) error {
			snapshotCalled = true
			return nil
		},
		OnRestore: func(app core.App, item *core.Record, version *core.Record) error {
			restoreCalled = true
			return errors.New("restore-marker")
		},
	}

	RegisterVersionHook("text", hook)

	got := VersionHookFor("text")
	if got.OnSnapshot == nil {
		t.Fatalf("expected OnSnapshot to be set, got nil")
	}
	if got.OnRestore == nil {
		t.Fatalf("expected OnRestore to be set, got nil")
	}

	if err := got.OnSnapshot(nil, nil, nil); err != nil {
		t.Fatalf("OnSnapshot returned err: %v", err)
	}
	if !snapshotCalled {
		t.Errorf("expected snapshot hook to be invoked")
	}

	err := got.OnRestore(nil, nil, nil)
	if err == nil || err.Error() != "restore-marker" {
		t.Errorf("expected OnRestore to return restore-marker, got %v", err)
	}
	if !restoreCalled {
		t.Errorf("expected restore hook to be invoked")
	}
}

func TestRegisterVersionHook_ReplacesOnRereg(t *testing.T) {
	resetVersionHooks()
	defer resetVersionHooks()

	firstCalled := false
	secondCalled := false

	RegisterVersionHook("text", VersionHook{
		OnSnapshot: func(app core.App, item *core.Record, version *core.Record) error {
			firstCalled = true
			return nil
		},
	})

	RegisterVersionHook("text", VersionHook{
		OnSnapshot: func(app core.App, item *core.Record, version *core.Record) error {
			secondCalled = true
			return nil
		},
	})

	got := VersionHookFor("text")
	if got.OnSnapshot == nil {
		t.Fatalf("expected OnSnapshot to be set after replacement")
	}
	if err := got.OnSnapshot(nil, nil, nil); err != nil {
		t.Fatalf("OnSnapshot returned err: %v", err)
	}
	if firstCalled {
		t.Errorf("first hook should have been replaced and not invoked")
	}
	if !secondCalled {
		t.Errorf("second (replacement) hook should have been invoked")
	}

	// The replacement also cleared the OnRestore field — the second
	// registration's struct only set OnSnapshot, so OnRestore must be nil.
	if got.OnRestore != nil {
		t.Errorf("expected OnRestore to be nil after replacement with hook lacking OnRestore")
	}
}

func TestVersionHookFor_ReturnsZeroValueWhenMissing(t *testing.T) {
	resetVersionHooks()
	defer resetVersionHooks()

	got := VersionHookFor("does-not-exist")
	if got.OnSnapshot != nil {
		t.Errorf("expected OnSnapshot to be nil for unknown itemType, got non-nil")
	}
	if got.OnRestore != nil {
		t.Errorf("expected OnRestore to be nil for unknown itemType, got non-nil")
	}
}
