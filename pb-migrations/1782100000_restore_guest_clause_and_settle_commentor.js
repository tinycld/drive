/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Three corrections to drive's access rules, in one migration because they
// touch overlapping rules and landing them separately would leave the tree
// contradicting itself in between.
//
// 1. RESTORE THE GUEST-CREATE EXCLUSION.
//    1781300000 added `@request.auth.role != "guest"` to drive_items.createRule
//    as an explicit security fix: a share-link visitor gets a real users record
//    stamped role='guest', and drive_items create has no Go-hook backstop, so
//    without the clause a guest can create files. 1782000000 then RESTATED
//    createRule to add the disabled clause and, in restating it, dropped the
//    guest one. Every database created since reopens the hole.
//
//    1782000000 is not edited: it has shipped to real databases, and a migration
//    already applied does not run again. The correction has to be a new one.
//
// 2. STOP OVER-GRANTING TO COMMENTOR.
//    A commentor reads and comments; it never edits. The `role ?!= "viewer"`
//    idiom asks the wrong question — it admits every role that is not viewer,
//    so commentor (added by 1781100000) silently gained UPDATE, and with it
//    rename/replace over REST PATCH and WebDAV PUT-overwrite and MOVE. Naming
//    the roles that may write says what is meant and does not re-open itself
//    the next time a role is added.
//
// 3. EXTEND THE DISABLED CLAUSE TO THE COLLECTIONS 1782000000 MISSED.
//    drive_item_versions holds restorable file CONTENT and its viewRule gates
//    blob access; drive_share_links resolves a share to its item. A suspended
//    user reaching either still reaches the data. Versions additionally never
//    honoured `created_by`, so an item's own creator could not see its history
//    unless they also held a share row.
//
// `@request.auth.disabled != true` (not `= false`) so a record written before
// the field existed — value absent rather than false — still passes.
migrate(
    app => {
        const enabled = '@request.auth.disabled != true'
        const notGuest = '@request.auth.role != "guest"'

        const isCreator = 'created_by ?= @request.auth.id'
        const hasShare = 'drive_shares_via_item.user ?= @request.auth.id'
        // The roles that may WRITE, named explicitly. Replaces
        // `role ?!= "viewer"`, which admitted commentor.
        const shareCanWrite =
            'drive_shares_via_item.role ?= "editor" || drive_shares_via_item.role ?= "owner"'

        const canView = `${enabled} && (${isCreator} || ${hasShare})`
        const canEdit = `${enabled} && (${isCreator} || (${hasShare} && (${shareCanWrite})))`

        const itemsCol = app.findCollectionByNameOrId('drive_items')
        itemsCol.listRule = canView
        itemsCol.viewRule = canView
        itemsCol.createRule = `@request.auth.id != "" && ${notGuest} && ${enabled}`
        itemsCol.updateRule = canEdit
        itemsCol.deleteRule = `${enabled} && ${isCreator}`
        app.save(itemsCol)

        // Versions: same three corrections, one level of indirection out
        // through `item`.
        const verIsItemCreator = 'item.created_by ?= @request.auth.id'
        const verHasShare = 'item.drive_shares_via_item.user ?= @request.auth.id'
        const verCanWrite =
            'item.drive_shares_via_item.role ?= "editor" || item.drive_shares_via_item.role ?= "owner"'
        const verIsOwner = 'item.drive_shares_via_item.role ?= "owner"'

        const versionsCol = app.findCollectionByNameOrId('drive_item_versions')
        versionsCol.listRule = `${enabled} && (${verIsItemCreator} || ${verHasShare})`
        versionsCol.viewRule = `${enabled} && (${verIsItemCreator} || ${verHasShare})`
        versionsCol.createRule = `${enabled} && (${verIsItemCreator} || (${verHasShare} && (${verCanWrite})))`
        versionsCol.updateRule = `${enabled} && (${verIsItemCreator} || (${verHasShare} && (${verCanWrite})))`
        versionsCol.deleteRule = `${enabled} && (${verIsItemCreator} || (${verHasShare} && ${verIsOwner}))`
        app.save(versionsCol)

        // Share links stay owner-only — a commentor or editor must not mint
        // public links — but a suspended owner must not resolve them either.
        const linkIsOwner = `${verIsItemCreator} || (${verHasShare} && ${verIsOwner})`
        const linksCol = app.findCollectionByNameOrId('drive_share_links')
        linksCol.listRule = `${enabled} && (${linkIsOwner})`
        linksCol.viewRule = `${enabled} && (${linkIsOwner})`
        linksCol.createRule = `${enabled} && (${linkIsOwner})`
        linksCol.updateRule = `${enabled} && (${linkIsOwner})`
        linksCol.deleteRule = `${enabled} && (${linkIsOwner})`
        app.save(linksCol)
    },
    app => {
        // Down: restore 1782000000's drive_items rules and the original
        // versions / share-links rules verbatim, holes included. A down
        // migration reproduces the previous state; it is not the place to
        // keep a fix.
        const enabled = '@request.auth.disabled != true'
        const isCreator = 'created_by ?= @request.auth.id'
        const hasShare = 'drive_shares_via_item.user ?= @request.auth.id'
        const canView = `${enabled} && (${isCreator} || ${hasShare})`
        const canEdit = `${enabled} && (${isCreator} || (${hasShare} && drive_shares_via_item.role ?!= "viewer"))`

        const itemsCol = app.findCollectionByNameOrId('drive_items')
        itemsCol.listRule = canView
        itemsCol.viewRule = canView
        itemsCol.createRule = `@request.auth.id != "" && ${enabled}`
        itemsCol.updateRule = canEdit
        itemsCol.deleteRule = `${enabled} && ${isCreator}`
        app.save(itemsCol)

        const hasShareRule = 'item.drive_shares_via_item.user ?= @request.auth.id'
        const isOwnerOrEditor =
            'item.drive_shares_via_item.user ?= @request.auth.id && item.drive_shares_via_item.role ?!= "viewer"'
        const isOwner =
            'item.drive_shares_via_item.user ?= @request.auth.id && item.drive_shares_via_item.role ?= "owner"'

        const versionsCol = app.findCollectionByNameOrId('drive_item_versions')
        versionsCol.listRule = hasShareRule
        versionsCol.viewRule = hasShareRule
        versionsCol.createRule = isOwnerOrEditor
        versionsCol.updateRule = isOwnerOrEditor
        versionsCol.deleteRule = isOwner
        app.save(versionsCol)

        const linksCol = app.findCollectionByNameOrId('drive_share_links')
        linksCol.listRule = isOwner
        linksCol.viewRule = isOwner
        linksCol.createRule = isOwner
        linksCol.updateRule = isOwner
        linksCol.deleteRule = isOwner
        app.save(linksCol)
    }
)
