package drive

import (
	"github.com/pocketbase/pocketbase/core"
)

// The read/write/delete predicates that used to live here now come from
// core's driveshare package, which is the single definition shared with
// text and calc. See tinycld.org/core/driveshare.

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
