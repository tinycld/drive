package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// search_disabled_test.go proves FTS search denies a suspended account.
//
// Every other drive read path refuses a disabled user: the collection rules
// cover REST (migration 1782000000) and driveshare.ResolveRoleForItem covers
// WebDAV, downloads and realtime. Search is neither — it is raw SQL behind
// requireAuth, so it answered with names, sizes and content highlights of
// everything shared with the user for as long as their token lived.
//
// The check belongs in searchDriveItems rather than the HTTP handler so the
// $drive.search JS binding is covered by the same code, which is the reason
// the two share this function at all.

// setupSearchApp builds the minimal schema searchDriveItems reads: users with
// a `disabled` flag, drive_items, drive_shares, and the FTS virtual table.
func setupSearchApp(t *testing.T) (*tests.TestApp, *core.Record) {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	users.Fields.Add(&core.BoolField{Name: "disabled"})
	if err := app.Save(users); err != nil {
		t.Fatal(err)
	}

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.TextField{Name: "description"})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.TextField{Name: "mime_type"})
	items.Fields.Add(&core.NumberField{Name: "size"})
	items.Fields.Add(&core.RelationField{
		Name: "created_by", CollectionId: users.Id, MaxSelect: 1,
	})
	items.Fields.Add(&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	if err := app.Save(items); err != nil {
		t.Fatal(err)
	}

	shares := core.NewBaseCollection("drive_shares")
	shares.Fields.Add(&core.RelationField{
		Name: "item", Required: true, CollectionId: items.Id, MaxSelect: 1,
	})
	shares.Fields.Add(&core.RelationField{
		Name: "user", Required: true, CollectionId: users.Id, MaxSelect: 1,
	})
	shares.Fields.Add(&core.SelectField{
		Name: "role", MaxSelect: 1, Values: []string{"owner", "editor", "viewer"},
	})
	if err := app.Save(shares); err != nil {
		t.Fatal(err)
	}

	if _, err := app.NonconcurrentDB().NewQuery(`
		CREATE VIRTUAL TABLE IF NOT EXISTS fts_drive_items USING fts5(
			record_id UNINDEXED, name, description, content
		)
	`).Execute(); err != nil {
		t.Fatalf("create fts_drive_items table: %v", err)
	}

	usersCol, _ := app.FindCollectionByNameOrId("users")
	sharee := core.NewRecord(usersCol)
	sharee.SetEmail("sharee@test.local")
	sharee.SetPassword("Password123!")
	if err := app.Save(sharee); err != nil {
		t.Fatal(err)
	}

	item := core.NewRecord(items)
	item.Set("name", "quarterly-secrets.txt")
	if err := app.Save(item); err != nil {
		t.Fatal(err)
	}
	syncDriveItemToFTS(app, item, "create")

	share := core.NewRecord(shares)
	share.Set("item", item.Id)
	share.Set("user", sharee.Id)
	share.Set("role", "viewer")
	if err := app.Save(share); err != nil {
		t.Fatal(err)
	}

	return app, sharee
}

func TestSearchDriveItems_EnabledShareeFindsItem(t *testing.T) {
	app, sharee := setupSearchApp(t)

	resp, err := searchDriveItems(app, sharee.Id, "quarterly", 25, 0)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Items) != 1 || resp.Total != 1 {
		t.Fatalf("enabled sharee got %d items (total %d), want 1", len(resp.Items), resp.Total)
	}
}

func TestSearchDriveItems_DisabledShareeGetsNothing(t *testing.T) {
	app, sharee := setupSearchApp(t)

	fresh, err := app.FindRecordById("users", sharee.Id)
	if err != nil {
		t.Fatal(err)
	}
	fresh.Set("disabled", true)
	if err := app.Save(fresh); err != nil {
		t.Fatal(err)
	}

	resp, err := searchDriveItems(app, sharee.Id, "quarterly", 25, 0)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Items) != 0 || resp.Total != 0 {
		t.Fatalf("disabled sharee got %d items (total %d), want 0 — search leaks "+
			"names and content highlights past suspension", len(resp.Items), resp.Total)
	}
}
