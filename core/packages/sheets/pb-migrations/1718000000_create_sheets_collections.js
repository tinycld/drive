/// <reference path="../../../server/pb_data/types.d.ts" />
migrate(
    app => {
        // 1. sheets_workbooks — links a drive_item to Yjs data
        const workbooks = new Collection({
            id: 'pbc_sheets_wb_01',
            name: 'sheets_workbooks',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'sht_wb_drive_item',
                    name: 'drive_item',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_drive_items_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'sht_wb_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    id: 'sht_wb_updated',
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: [
                'CREATE UNIQUE INDEX `idx_sht_wb_drive_item` ON `sheets_workbooks` (`drive_item`)',
            ],
        })
        app.save(workbooks)

        // 2. sheets_snapshots — periodic Y.Doc state snapshots
        const snapshots = new Collection({
            id: 'pbc_sheets_snap_01',
            name: 'sheets_snapshots',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'sht_snap_workbook',
                    name: 'workbook',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_sheets_wb_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'sht_snap_state',
                    name: 'state',
                    type: 'text',
                    required: true,
                },
                {
                    id: 'sht_snap_update_count',
                    name: 'update_count',
                    type: 'number',
                    required: true,
                    min: 0,
                },
                {
                    id: 'sht_snap_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    id: 'sht_snap_updated',
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: [
                'CREATE INDEX `idx_sht_snap_workbook` ON `sheets_snapshots` (`workbook`)',
                'CREATE INDEX `idx_sht_snap_wb_created` ON `sheets_snapshots` (`workbook`, `created` DESC)',
            ],
        })
        app.save(snapshots)

        // 3. sheets_updates — incremental Yjs updates
        const updates = new Collection({
            id: 'pbc_sheets_upd_01',
            name: 'sheets_updates',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'sht_upd_workbook',
                    name: 'workbook',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_sheets_wb_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'sht_upd_data',
                    name: 'data',
                    type: 'text',
                    required: true,
                },
                {
                    id: 'sht_upd_user_org',
                    name: 'user_org',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_user_org_01',
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                {
                    id: 'sht_upd_seq',
                    name: 'seq',
                    type: 'number',
                    required: true,
                    min: 0,
                },
                {
                    id: 'sht_upd_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    id: 'sht_upd_updated',
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: [
                'CREATE INDEX `idx_sht_upd_workbook` ON `sheets_updates` (`workbook`)',
                'CREATE INDEX `idx_sht_upd_wb_seq` ON `sheets_updates` (`workbook`, `seq`)',
                'CREATE INDEX `idx_sht_upd_user_org` ON `sheets_updates` (`user_org`)',
            ],
        })
        app.save(updates)

        // Access rules: inherit from drive_items via drive_shares
        const hasShareOnItem =
            'workbook.drive_item.drive_shares_via_item.user_org.user ?= @request.auth.id'
        const isEditorOrOwner =
            'workbook.drive_item.drive_shares_via_item.user_org.user ?= @request.auth.id && workbook.drive_item.drive_shares_via_item.role ?!= "viewer"'
        const isItemOwner =
            'workbook.drive_item.drive_shares_via_item.user_org.user ?= @request.auth.id && workbook.drive_item.drive_shares_via_item.role ?= "owner"'

        // sheets_workbooks: access through drive_item shares
        const wbHasShare = 'drive_item.drive_shares_via_item.user_org.user ?= @request.auth.id'
        const wbIsEditor =
            'drive_item.drive_shares_via_item.user_org.user ?= @request.auth.id && drive_item.drive_shares_via_item.role ?!= "viewer"'

        const wbCol = app.findCollectionByNameOrId('sheets_workbooks')
        wbCol.listRule = wbHasShare
        wbCol.viewRule = wbHasShare
        wbCol.createRule = wbIsEditor
        wbCol.updateRule = wbIsEditor
        wbCol.deleteRule = wbIsEditor
        app.save(wbCol)

        // sheets_snapshots
        const snapCol = app.findCollectionByNameOrId('sheets_snapshots')
        snapCol.listRule = hasShareOnItem
        snapCol.viewRule = hasShareOnItem
        snapCol.createRule = isEditorOrOwner
        snapCol.updateRule = isEditorOrOwner
        snapCol.deleteRule = isItemOwner
        app.save(snapCol)

        // sheets_updates
        const updCol = app.findCollectionByNameOrId('sheets_updates')
        updCol.listRule = hasShareOnItem
        updCol.viewRule = hasShareOnItem
        updCol.createRule = isEditorOrOwner
        updCol.updateRule = null
        updCol.deleteRule = isItemOwner
        app.save(updCol)
    },
    app => {
        const collections = ['sheets_updates', 'sheets_snapshots', 'sheets_workbooks']
        for (const name of collections) {
            const collection = app.findCollectionByNameOrId(name)
            app.delete(collection)
        }
    }
)
