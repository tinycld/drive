/// <reference path="../../../server/pb_data/types.d.ts" />

// Automatic versions are opt-in. Empty follows the org setting
// (settings: app 'drive', key 'auto_versions_default'); 'on' and 'off' are a
// document's own choice.
migrate(
    app => {
        const col = app.findCollectionByNameOrId('drive_items')
        col.fields.add(
            new Field({
                id: 'drv_items_auto_versions',
                name: 'auto_versions',
                type: 'select',
                required: false,
                maxSelect: 1,
                values: ['on', 'off'],
            })
        )
        app.save(col)
    },
    app => {
        const col = app.findCollectionByNameOrId('drive_items')
        col.fields.removeById('drv_items_auto_versions')
        app.save(col)
    }
)
