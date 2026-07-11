package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// move_cycle_test.go guards the server-side acyclicity check for drive folder
// moves. Cycle prevention was client-only (dnd.ts); a direct PATCH of `parent`
// could form a cycle and hang the recursive download/buildPath walkers.

func setupCycleApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	items := core.NewBaseCollection("drive_items")
	items.Id = "pbc_drive_items_01"
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	if err := app.Save(items); err != nil {
		t.Fatalf("create drive_items collection: %v", err)
	}

	// The self-referencing `parent` relation can only be added after the
	// collection exists (mirrors the real 1716000000 migration's two-step
	// create).
	items.Fields.Add(&core.RelationField{
		Name: "parent", CollectionId: items.Id, MaxSelect: 1,
	})
	if err := app.Save(items); err != nil {
		t.Fatalf("add parent field: %v", err)
	}
	return app
}

// makeFolder creates a folder with the given parent (empty for root) and
// returns its id.
func makeFolder(t *testing.T, app *tests.TestApp, name, parentID string) string {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", name)
	rec.Set("is_folder", true)
	if parentID != "" {
		rec.Set("parent", parentID)
	}
	if err := app.Save(rec); err != nil {
		t.Fatalf("save folder %q: %v", name, err)
	}
	return rec.Id
}

// setParentDirect writes `parent` straight to the DB, bypassing any hook, to
// fabricate a pre-existing cycle the acyclicity check must survive.
func setParentDirect(t *testing.T, app *tests.TestApp, id, parentID string) {
	t.Helper()
	if _, err := app.NonconcurrentDB().NewQuery(
		"UPDATE drive_items SET parent = {:p} WHERE id = {:id}",
	).Bind(map[string]any{"p": parentID, "id": id}).Execute(); err != nil {
		t.Fatalf("direct parent update: %v", err)
	}
}

func TestMoveWouldCreateCycle(t *testing.T) {
	app := setupCycleApp(t)

	// Tree: a -> b -> c (c is a descendant of a).
	a := makeFolder(t, app, "a", "")
	b := makeFolder(t, app, "b", a)
	c := makeFolder(t, app, "c", b)
	sibling := makeFolder(t, app, "sibling", "")

	cases := []struct {
		label     string
		moved     string
		newParent string
		want      bool
	}{
		{"move a into its own descendant c → cycle", a, c, true},
		{"move a into its direct child b → cycle", a, b, true},
		{"move a into itself → cycle", a, a, true},
		{"move c under sibling → legal", c, sibling, false},
		{"move a under sibling → legal", a, sibling, false},
		{"move to root → legal", a, "", false},
	}

	for _, tc := range cases {
		t.Run(tc.label, func(t *testing.T) {
			got, err := moveWouldCreateCycle(app, tc.moved, tc.newParent)
			if err != nil {
				t.Fatalf("moveWouldCreateCycle: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// TestMoveWouldCreateCycle_PreExistingCycleTerminates proves the check itself
// can't hang on an already-cyclic ancestor chain that doesn't involve the
// moved item — the visited-set/depth cap makes it return cleanly.
func TestMoveWouldCreateCycle_PreExistingCycleTerminates(t *testing.T) {
	app := setupCycleApp(t)

	// Build x -> y, then close the loop directly: x.parent = y, y.parent = x.
	x := makeFolder(t, app, "x", "")
	y := makeFolder(t, app, "y", x)
	setParentDirect(t, app, x, y)

	// z is unrelated to the x/y loop; walking x's cyclic ancestry must
	// terminate and report no cycle (the move doesn't create one).
	z := makeFolder(t, app, "z", "")

	done := make(chan struct{})
	var got bool
	var err error
	go func() {
		got, err = moveWouldCreateCycle(app, z, x)
		close(done)
	}()

	<-done
	if err != nil {
		t.Fatalf("moveWouldCreateCycle: %v", err)
	}
	if got {
		t.Errorf("got true, want false — move of z under x doesn't create a cycle")
	}
}
