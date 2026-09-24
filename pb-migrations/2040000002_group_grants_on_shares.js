/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
//
// Group grants on drive_shares.
//
// A row is one of three kinds, told apart by two fields:
//   direct  — user set, group empty  (every row before this migration)
//   grant   — user empty, group set  (client-written: "share with this group")
//   derived — both set               (core Go expands a grant into one row per
//                                     member; server-owned, never client-written)
// Every other collection's rules test `drive_shares_via_item.user`, so a
// derived row grants access exactly like a direct one and a grant row (no
// user) never matches. Nothing outside this collection changes. See
// core/server/groups. Numbered above core's 2040000000_create_groups.js
// because the merged install directory is filename-sorted.
//
// Rules are restated verbatim from 1782000000 with the new clauses appended,
// never read back off the collection (shipped_rules_test.go asserts literals).
migrate(
    app => {
        const shares = app.findCollectionByNameOrId('drive_shares')

        shares.fields.getById('drv_shares_user').required = false

        shares.fields.addAt(
            shares.fields.length,
            new Field({
                id: 'drv_shares_group',
                name: 'group',
                type: 'relation',
                required: false,
                collectionId: 'pbc_groups_01',
                cascadeDelete: true,
                maxSelect: 1,
            })
        )

        shares.indexes = [
            ...shares.indexes.filter(idx => !idx.includes('idx_drv_shares_unique')),
            'CREATE UNIQUE INDEX `idx_drv_shares_unique` ON `drive_shares` (`item`, `user`, `group`)',
            'CREATE INDEX `idx_drv_shares_group` ON `drive_shares` (`group`)',
        ]

        const enabled = '@request.auth.disabled != true'
        const ownShareRecipient = 'user = @request.auth.id'
        const isItemCreator = 'item.created_by ?= @request.auth.id'
        // A client writes direct rows and grants; derived rows (both set) are
        // core's. A grant never carries owner: driveshare.CheckDelete treats an
        // owner share as delete rights, and ownership stays personal.
        const notDerived = '(user = "" || group = "")'
        // user is optional now, so without this a row naming nobody would
        // save: it grants nothing but sits in every share list as a ghost.
        const namesSomeone = '(user != "" || group != "")'
        const groupNeverOwnerOnCreate = '(group = "" || role != "owner")'
        // On update a bare field is the STORED value, so the owner check must
        // read the body.
        const groupNeverOwnerOnUpdate =
            '(group = "" || @request.body.role:isset = false || @request.body.role != "owner")'
        const pinItem = '(@request.body.item:isset = false || @request.body.item = item)'
        const pinUser = '(@request.body.user:isset = false || @request.body.user = user)'
        const pinGroup = '(@request.body.group:isset = false || @request.body.group = group)'

        shares.listRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.viewRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.createRule = `${enabled} && ${isItemCreator} && ${notDerived} && ${namesSomeone} && ${groupNeverOwnerOnCreate}`
        shares.updateRule = `${enabled} && ${isItemCreator} && ${notDerived} && ${groupNeverOwnerOnUpdate} && ${pinItem} && ${pinUser} && ${pinGroup}`
        shares.deleteRule = `${enabled} && ${notDerived} && (${ownShareRecipient} || ${isItemCreator})`

        app.save(shares)
    },
    app => {
        const shares = app.findCollectionByNameOrId('drive_shares')

        app.db().newQuery('DELETE FROM drive_shares WHERE `group` != ""').execute()

        shares.fields.removeById('drv_shares_group')
        shares.fields.getById('drv_shares_user').required = true
        shares.indexes = [
            ...shares.indexes.filter(
                idx => !idx.includes('idx_drv_shares_unique') && !idx.includes('idx_drv_shares_group')
            ),
            'CREATE UNIQUE INDEX `idx_drv_shares_unique` ON `drive_shares` (`item`, `user`)',
        ]

        const enabled = '@request.auth.disabled != true'
        const ownShareRecipient = 'user = @request.auth.id'
        const isItemCreator = 'item.created_by ?= @request.auth.id'
        shares.listRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.viewRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.createRule = `${enabled} && ${isItemCreator}`
        shares.updateRule = `${enabled} && ${isItemCreator}`
        shares.deleteRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        app.save(shares)
    }
)
