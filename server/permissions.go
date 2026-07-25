package drive

import (
	"os"

	"github.com/pocketbase/pocketbase/core"
)

// checkReadPermission verifies the user may view the item: its creator or
// the holder of any drive_shares row, mirroring the drive_items view rule
// from migration 1716200001 (created_by == auth.id || has-share).
// Go code paths that bypass PocketBase's rule engine (WebDAV, custom
// endpoints) must apply this per item.
func checkReadPermission(app core.App, userID string, item *core.Record) error {
	if item.GetString("created_by") == userID {
		return nil
	}
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user = {:user}",
		"", 1, 0,
		map[string]any{"item": item.Id, "user": userID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// checkWritePermission verifies the user has editor or owner role on the item via drive_shares.
func checkWritePermission(app core.App, userID, itemID string) error {
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user = {:user} && role != 'viewer'",
		"", 1, 0,
		map[string]any{"item": itemID, "user": userID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// checkDeletePermission verifies the user has owner role on the item via drive_shares.
func checkDeletePermission(app core.App, userID, itemID string) error {
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user = {:user} && role = 'owner'",
		"", 1, 0,
		map[string]any{"item": itemID, "user": userID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// createOwnerShare creates an owner share record for a newly created item.
// Takes core.App so it can be called from inside a hook with e.App (the
// transactional handle) as well as from regular code.
func createOwnerShare(app core.App, itemID, userID string) error {
	collection, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("item", itemID)
	record.Set("user", userID)
	record.Set("role", "owner")
	record.Set("created_by", userID)
	return app.Save(record)
}
