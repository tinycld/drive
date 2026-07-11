package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// storage_size_test.go guards the storage-quota bypass fix: the create hook
// must derive drive_items.size from the actual uploaded blob, not the
// client-supplied `size` field. A forged small/zero `size` accompanying real
// bytes previously slipped past the quota check and under-reported usage.

func setupSizeApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.NumberField{Name: "size"})
	items.Fields.Add(&core.FileField{Name: "file", MaxSelect: 1, MaxSize: 104857600})
	if err := app.Save(items); err != nil {
		t.Fatalf("create drive_items collection: %v", err)
	}
	return app
}

func newSizeItem(t *testing.T, app *tests.TestApp) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	return core.NewRecord(col)
}

// TestReconcileDriveItemSize_UsesBlobNotForgedClientValue proves a forged
// small `size` is replaced by the true byte length of the staged upload.
func TestReconcileDriveItemSize_UsesBlobNotForgedClientValue(t *testing.T) {
	app := setupSizeApp(t)

	rec := newSizeItem(t, app)
	rec.Set("name", "forged.bin")

	blob := make([]byte, 4096)
	f, err := filesystem.NewFileFromBytes(blob, "forged.bin")
	if err != nil {
		t.Fatalf("NewFileFromBytes: %v", err)
	}
	rec.Set("file", f)

	// The attacker forges a tiny size to dodge the quota check.
	rec.Set("size", 1)

	reconcileDriveItemSize(rec)

	if got := rec.GetInt("size"); got != len(blob) {
		t.Fatalf("reconciled size = %d, want %d (true blob length)", got, len(blob))
	}

	// The persisted record must carry the true size too.
	if err := app.Save(rec); err != nil {
		t.Fatalf("save: %v", err)
	}
	fresh, err := app.FindRecordById("drive_items", rec.Id)
	if err != nil {
		t.Fatalf("re-fetch: %v", err)
	}
	if got := fresh.GetInt("size"); got != len(blob) {
		t.Fatalf("persisted size = %d, want %d", got, len(blob))
	}
}

// TestReconcileDriveItemSize_NoFileLeavesSizeUntouched proves fileless creates
// (folders, blank items) keep their declared size — reconcile is a no-op.
func TestReconcileDriveItemSize_NoFileLeavesSizeUntouched(t *testing.T) {
	app := setupSizeApp(t)

	rec := newSizeItem(t, app)
	rec.Set("name", "folder")
	rec.Set("size", 0)

	reconcileDriveItemSize(rec)

	if got := rec.GetInt("size"); got != 0 {
		t.Fatalf("fileless size = %d, want 0", got)
	}
}
