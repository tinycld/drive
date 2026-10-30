package drive

import (
	"context"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// search_trash_test.go proves FTS search leaves out what the caller trashed,
// and the contents of a folder they trashed. Trash is per-user state on
// drive_item_state, so another user's search still finds the same items.

func addSearchItem(t *testing.T, app *tests.TestApp, name, parentID string, userIDs ...string) *core.Record {
	t.Helper()
	items, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(items)
	item.Set("name", name)
	item.Set("parent", parentID)
	if err := app.Save(item); err != nil {
		t.Fatal(err)
	}
	syncDriveItemToFTS(app, item, "create")

	shares, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	for _, userID := range userIDs {
		share := core.NewRecord(shares)
		share.Set("item", item.Id)
		share.Set("user", userID)
		share.Set("role", "editor")
		if err := app.Save(share); err != nil {
			t.Fatal(err)
		}
	}
	return item
}

func trashForUser(t *testing.T, app *tests.TestApp, itemID, userID string) {
	t.Helper()
	states, err := app.FindCollectionByNameOrId("drive_item_state")
	if err != nil {
		t.Fatal(err)
	}
	state := core.NewRecord(states)
	state.Set("item", itemID)
	state.Set("user", userID)
	state.Set("trashed_at", time.Now().UTC())
	if err := app.Save(state); err != nil {
		t.Fatal(err)
	}
}

func searchNames(t *testing.T, app *tests.TestApp, userID, q string) map[string]bool {
	t.Helper()
	resp, err := searchDriveItems(context.Background(), app, userID, q, "", 25, 0)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if resp.Total != len(resp.Items) {
		t.Fatalf("total %d does not match %d items", resp.Total, len(resp.Items))
	}
	names := map[string]bool{}
	for _, item := range resp.Items {
		names[item.Name] = true
	}
	return names
}

func TestSearchDriveItems_LeavesOutTrash(t *testing.T) {
	app, sharee := setupSearchApp(t)

	usersCol, _ := app.FindCollectionByNameOrId("users")
	other := core.NewRecord(usersCol)
	other.SetEmail("other@test.local")
	other.SetPassword("Password123!")
	if err := app.Save(other); err != nil {
		t.Fatal(err)
	}

	folder := addSearchItem(t, app, "budget folder", "", sharee.Id, other.Id)
	child := addSearchItem(t, app, "budget child", folder.Id, sharee.Id, other.Id)
	addSearchItem(t, app, "budget grandchild", child.Id, sharee.Id, other.Id)
	file := addSearchItem(t, app, "budget file", "", sharee.Id, other.Id)
	addSearchItem(t, app, "budget kept", "", sharee.Id, other.Id)

	trashForUser(t, app, folder.Id, sharee.Id)
	trashForUser(t, app, file.Id, sharee.Id)

	got := searchNames(t, app, sharee.Id, "budget")
	if len(got) != 1 || !got["budget kept"] {
		t.Fatalf("sharee found %v, want only the item that is not in the trash", got)
	}

	if got := searchNames(t, app, other.Id, "budget"); len(got) != 5 {
		t.Fatalf("other user found %v, want all 5 items: trash is per-user", got)
	}
}
