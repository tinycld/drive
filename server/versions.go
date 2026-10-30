package drive

import (
	"io"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"tinycld.org/core/editcheckpoint"
)

// snapshotCurrentFile creates a version record from the current file on a drive_items record.
// Skips silently if the item has no file attached (returns nil, nil).
// Version number assignment is done inside a transaction to prevent races.
// Returns the created version record on success so callers can fire post-snapshot hooks.
// snapshotOpts says who a version belongs to and why it exists. Editors are
// the people who edited since the previous version.
type snapshotOpts struct {
	UserID  string
	Source  string
	Label   string
	Editors editcheckpoint.Editors
}

func snapshotCurrentFile(app core.App, itemRecord *core.Record, opts snapshotOpts) (*core.Record, error) {
	filename := itemRecord.GetString("file")
	if filename == "" {
		return nil, nil
	}

	reader, err := readFileContent(app, itemRecord)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	f, err := filesystem.NewFileFromBytes(data, filename)
	if err != nil {
		return nil, err
	}

	collection, err := app.FindCollectionByNameOrId("drive_item_versions")
	if err != nil {
		return nil, err
	}

	var created *core.Record
	err = app.RunInTransaction(func(txApp core.App) error {
		var result struct {
			Max int `db:"max_ver"`
		}
		err := txApp.DB().
			NewQuery("SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM drive_item_versions WHERE item = {:item}").
			Bind(map[string]any{"item": itemRecord.Id}).
			One(&result)
		if err != nil {
			result.Max = 0
		}

		record := core.NewRecord(collection)
		record.Set("item", itemRecord.Id)
		record.Set("version_number", result.Max+1)
		record.Set("file", f)
		record.Set("size", itemRecord.GetInt("size"))
		record.Set("mime_type", itemRecord.GetString("mime_type"))
		record.Set("source", opts.Source)
		record.Set("label", opts.Label)
		record.Set("created_by", opts.UserID)
		if len(opts.Editors.UserIDs) > 0 {
			record.Set("editors", opts.Editors.UserIDs)
		}
		if len(opts.Editors.ShareNames) > 0 {
			record.Set("share_editors", opts.Editors.ShareNames)
		}

		if err := txApp.Save(record); err != nil {
			return err
		}
		created = record
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}
