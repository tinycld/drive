package drive

import (
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// getUserOrgForOrg finds the user_org record linking this user to the given org.
func getUserOrgForOrg(app *pocketbase.PocketBase, userID, orgID string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		"user_org",
		"user = {:user} && org = {:org}",
		"", 1, 0,
		map[string]any{"user": userID, "org": orgID},
	)
	if err != nil || len(records) == 0 {
		return nil, os.ErrPermission
	}
	return records[0], nil
}

// checkReadPermission verifies the user may view the item: its creator or
// the holder of any drive_shares row, mirroring the drive_items view rule
// from migration 1716200001 (created_by.user == auth.id || has-share).
// Go code paths that bypass PocketBase's rule engine (WebDAV, custom
// endpoints) must apply this per item — org membership alone is not enough.
func checkReadPermission(app core.App, userOrgID string, item *core.Record) error {
	if item.GetString("created_by") == userOrgID {
		return nil
	}
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user_org = {:userOrg}",
		"", 1, 0,
		map[string]any{"item": item.Id, "userOrg": userOrgID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// checkWritePermission verifies the user has editor or owner role on the item via drive_shares.
func checkWritePermission(app *pocketbase.PocketBase, userOrgID, itemID string) error {
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user_org = {:userOrg} && role != 'viewer'",
		"", 1, 0,
		map[string]any{"item": itemID, "userOrg": userOrgID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// checkDeletePermission verifies the user has owner role on the item via drive_shares.
func checkDeletePermission(app *pocketbase.PocketBase, userOrgID, itemID string) error {
	records, err := app.FindRecordsByFilter(
		"drive_shares",
		"item = {:item} && user_org = {:userOrg} && role = 'owner'",
		"", 1, 0,
		map[string]any{"item": itemID, "userOrg": userOrgID},
	)
	if err != nil || len(records) == 0 {
		return os.ErrPermission
	}
	return nil
}

// createOwnerShare creates an owner share record for a newly created item.
// Takes core.App so it can be called from inside a hook with e.App (the
// transactional handle) as well as from regular code with a *pocketbase.PocketBase.
func createOwnerShare(app core.App, itemID, userOrgID string) error {
	collection, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("item", itemID)
	record.Set("user_org", userOrgID)
	record.Set("role", "owner")
	record.Set("created_by", userOrgID)
	return app.Save(record)
}
