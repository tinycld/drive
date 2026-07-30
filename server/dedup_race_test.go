package drive

import (
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// dedup_race_test.go pins that CONCURRENT creates of the same (parent, name)
// all succeed with distinct names. The create hook's dedup was a pre-flight
// probe with the unique index as "safety net" — but two simultaneous
// "Untitled.xlsx" creates both probe before either inserts, compute the same
// free name, and the loser 400s (validation_not_unique). Two teammates
// clicking "New sheet" at the same moment is normal, not narrow — and it is
// exactly the calc e2e flake under --workers=4, where every worker's helper
// creates Untitled.xlsx in the same root.

func setupDedupRaceApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.TextField{Name: "created_by"})
	items.Fields.Add(&core.TextField{Name: "parent"})
	// The shipped unique index (1716100000_add_unique_name_index.js) — the
	// constraint the losing racer trips on.
	items.AddIndex("idx_test_unique_name", true, "parent, name", "")
	if err := app.Save(items); err != nil {
		t.Fatalf("create drive_items collection: %v", err)
	}

	// The same create hook registerShared ships.
	registerDriveItemCreateHook(app)
	return app
}

func TestConcurrentSameNameCreates_AllSucceedWithDistinctNames(t *testing.T) {
	app := setupDedupRaceApp(t)
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}

	const racers = 8
	var wg sync.WaitGroup
	errs := make([]error, racers)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rec := core.NewRecord(col)
			rec.Set("name", "Untitled.xlsx")
			rec.Set("is_folder", false)
			errs[i] = app.Save(rec)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("concurrent create %d failed: %v — the dedup must converge, not 400", i, err)
		}
	}

	records, err := app.FindRecordsByFilter("drive_items", "id != ''", "name", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != racers {
		t.Fatalf("%d records created, want %d", len(records), racers)
	}
	seen := map[string]bool{}
	for _, r := range records {
		name := r.GetString("name")
		if !strings.HasPrefix(name, "Untitled") {
			t.Errorf("unexpected name %q", name)
		}
		if seen[name] {
			t.Errorf("name %q assigned twice", name)
		}
		seen[name] = true
	}
}
