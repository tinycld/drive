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
// derived row grants access exactly like a direct one. See core/server/groups.
// Numbered above core's 2040000000_create_groups.js because the merged install
// directory is filename-sorted.
//
// WHY EVERY RULE THAT READS drive_shares.user NOW REQUIRES A LOGIN.
// A grant row stores user "". For a request with no login, PocketBase
// resolves @request.auth.id to NULL and rewrites `x = NULL` as
// `(x = '' OR x IS NULL)` — so `drive_shares_via_item.user ?= @request.auth.id`
// MATCHES a grant row, and a caller with no token gets the grant's role: list
// and rename the item, read and write its versions, list the shares, delete
// the grant. `@request.auth.disabled != true` does not stop it (NULL is not
// true either). So this migration conjoins `@request.auth.id != ""` with every
// rule that reaches drive_shares.user — drive_shares itself, and drive_items,
// drive_item_versions, drive_share_links and drive_item_state through the
// back-relation. rlstest.RequireAuthGuardOnGrantRules fails the build if a
// later rule forgets it.
//
// Rules are restated as literals, never read back off the collection
// (shipped_rules_test.go asserts them): drive_shares from 1782000000 with the
// new clauses appended, the other collections from their latest setters
// (1782100000, and 1782000000 for drive_item_state) with the login guard in
// front. The down migration restates the same literals without the guard.
// The rules on drive's other collections that reach drive_shares.user, as
// 1782100000 (and 1782000000 for drive_item_state) left them, with `guard`
// in front. Up passes the login guard; down passes '' to restore them exactly.
function grantReachingRules(guard) {
    const enabled = '@request.auth.disabled != true'

    const isCreator = 'created_by ?= @request.auth.id'
    const hasShare = 'drive_shares_via_item.user ?= @request.auth.id'
    const shareCanWrite = 'drive_shares_via_item.role ?= "editor" || drive_shares_via_item.role ?= "owner"'
    const canView = `${guard}${enabled} && (${isCreator} || ${hasShare})`
    const canEdit = `${guard}${enabled} && (${isCreator} || (${hasShare} && (${shareCanWrite})))`

    const verIsItemCreator = 'item.created_by ?= @request.auth.id'
    const verHasShare = 'item.drive_shares_via_item.user ?= @request.auth.id'
    const verCanWrite = 'item.drive_shares_via_item.role ?= "editor" || item.drive_shares_via_item.role ?= "owner"'
    const verIsOwner = 'item.drive_shares_via_item.role ?= "owner"'
    const verCanView = `${guard}${enabled} && (${verIsItemCreator} || ${verHasShare})`
    const verCanWriteRule = `${guard}${enabled} && (${verIsItemCreator} || (${verHasShare} && (${verCanWrite})))`
    const linkIsOwnerRule = `${guard}${enabled} && (${verIsItemCreator} || (${verHasShare} && ${verIsOwner}))`

    return {
        drive_items: { listRule: canView, viewRule: canView, updateRule: canEdit },
        drive_item_versions: {
            listRule: verCanView,
            viewRule: verCanView,
            createRule: verCanWriteRule,
            updateRule: verCanWriteRule,
            deleteRule: linkIsOwnerRule,
        },
        drive_share_links: {
            listRule: linkIsOwnerRule,
            viewRule: linkIsOwnerRule,
            createRule: linkIsOwnerRule,
            updateRule: linkIsOwnerRule,
            deleteRule: linkIsOwnerRule,
        },
        drive_item_state: {
            createRule: `${guard}${enabled} && user = @request.auth.id && (${verIsItemCreator} || ${verHasShare})`,
        },
    }
}

function applyRules(app, byCollection) {
    for (const [name, rules] of Object.entries(byCollection)) {
        const col = app.findCollectionByNameOrId(name)
        for (const [kind, rule] of Object.entries(rules)) {
            col[kind] = rule
        }
        app.save(col)
    }
}

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

        // A grant row's user is "", which an anonymous request's NULL
        // @request.auth.id matches; see the header.
        const authed = '@request.auth.id != ""'
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

        shares.listRule = `${authed} && ${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.viewRule = `${authed} && ${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        shares.createRule = `${authed} && ${enabled} && ${isItemCreator} && ${notDerived} && ${namesSomeone} && ${groupNeverOwnerOnCreate}`
        shares.updateRule = `${authed} && ${enabled} && ${isItemCreator} && ${notDerived} && ${groupNeverOwnerOnUpdate} && ${pinItem} && ${pinUser} && ${pinGroup}`
        shares.deleteRule = `${authed} && ${enabled} && ${notDerived} && (${ownShareRecipient} || ${isItemCreator})`

        app.save(shares)

        applyRules(app, grantReachingRules(`${authed} && `))
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

        applyRules(app, grantReachingRules(''))
    }
)
