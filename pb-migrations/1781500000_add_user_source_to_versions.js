/// <reference path="../../../server/pb_data/types.d.ts" />

// Adds 'user' to drive_item_versions.source. The handleSnapshotVersion
// endpoint (POST /api/drive/versions/snapshot, backing calc/text "Save
// version") passes source="user" for labeled, user-initiated snapshots,
// but the original schema only allowed 'upload' (file replacement) and
// 'system' (hidden snapshot-before-restore). Without 'user' the insert
// fails validation with "Invalid value user" and the UI sees a 500.
//
// useVersionHistory already filters out 'system' versions, so 'user'
// versions surface in the history list alongside 'upload' versions
// exactly as intended.
migrate(
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        const field = col.fields.getByName('source')
        if (!field) {
            throw new Error('source field not found on drive_item_versions')
        }
        field.values = ['upload', 'system', 'user']
        app.save(col)
    },
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        const field = col.fields.getByName('source')
        if (!field) {
            return
        }
        field.values = ['upload', 'system']
        app.save(col)
    }
)
