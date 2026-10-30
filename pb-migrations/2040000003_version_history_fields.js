/// <reference path="../../../server/pb_data/types.d.ts" />

// Version history:
//   - source 'auto': server checkpoints after an idle period or when the
//     last editor leaves; thinned by the retention job.
//   - editors / share_editors: who edited since the previous version, so
//     the history list can show it without walking the document.
migrate(
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        const source = col.fields.getByName('source')
        if (!source) throw new Error('source field not found on drive_item_versions')
        source.values = ['upload', 'system', 'user', 'auto']

        col.fields.add(
            new Field({
                id: 'drv_ver_editors',
                name: 'editors',
                type: 'relation',
                required: false,
                collectionId: '_pb_users_auth_',
                cascadeDelete: false,
                maxSelect: 999,
            })
        )
        col.fields.add(
            new Field({
                id: 'drv_ver_share_editors',
                name: 'share_editors',
                type: 'json',
                required: false,
                maxSize: 10 * 1024,
            })
        )
        app.save(col)
    },
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        col.fields.removeById('drv_ver_editors')
        col.fields.removeById('drv_ver_share_editors')
        const source = col.fields.getByName('source')
        if (source) source.values = ['upload', 'system', 'user']
        app.save(col)
    }
)
