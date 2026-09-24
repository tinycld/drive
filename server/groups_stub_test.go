package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// stubGroupsCollection creates the core `groups` collection with the id that
// 2040000002 names as the relation target. The fixtures are bare test apps
// that apply only drive's migrations, so core's collection has to exist
// before the relation field can be saved.
func stubGroupsCollection(t testing.TB, app core.App) {
	t.Helper()
	if _, err := app.FindCollectionByNameOrId("groups"); err == nil {
		return
	}
	groups := core.NewBaseCollection("groups")
	groups.Id = "pbc_groups_01"
	groups.Fields.Add(&core.TextField{Name: "name", Required: true})
	if err := app.Save(groups); err != nil {
		t.Fatalf("stub groups collection: %v", err)
	}
}

func driveGroup(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("groups")
	if err != nil {
		t.Fatalf("find groups: %v", err)
	}
	g := core.NewRecord(col)
	g.Set("name", name)
	if err := app.Save(g); err != nil {
		t.Fatalf("save group: %v", err)
	}
	return g
}
