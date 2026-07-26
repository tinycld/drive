/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// A disabled user must not reach shared drive content.
//
// core/driveshare gates every Go path (WebDAV, the render endpoints, realtime
// room admission), but PocketBase's own REST API evaluates these collection
// rules INSTEAD of that Go — so a plain
// GET /api/collections/drive_items/records would still hand a disabled user
// every file shared with them. Gating only the Go leaves that hole wide open,
// and it looks correct in every Go unit test.
//
// `@request.auth.disabled != true` (rather than `= false`) so a record written
// before the field existed — where the value is absent rather than false —
// still passes. Appended to the existing predicates from 1716200001 rather
// than restated, so the creator/share logic stays defined in one place.
migrate(
    app => {
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

        const ownShareRecipient = 'user = @request.auth.id'
        const isItemCreator = 'item.created_by ?= @request.auth.id'

        const sharesCol = app.findCollectionByNameOrId('drive_shares')
        sharesCol.listRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        sharesCol.viewRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        sharesCol.createRule = `${enabled} && ${isItemCreator}`
        sharesCol.updateRule = `${enabled} && ${isItemCreator}`
        sharesCol.deleteRule = `${enabled} && (${ownShareRecipient} || ${isItemCreator})`
        app.save(sharesCol)

        const ownRecordRule = 'user = @request.auth.id'
        const stateCol = app.findCollectionByNameOrId('drive_item_state')
        stateCol.listRule = `${enabled} && ${ownRecordRule}`
        stateCol.viewRule = `${enabled} && ${ownRecordRule}`
        stateCol.createRule = `${enabled} && ${ownRecordRule} && (${isItemCreator} || item.drive_shares_via_item.user ?= @request.auth.id)`
        stateCol.updateRule = `${enabled} && ${ownRecordRule}`
        stateCol.deleteRule = `${enabled} && ${ownRecordRule}`
        app.save(stateCol)
    },
    app => {
        // Restore 1716200001's rules verbatim (no disabled clause).
        const isCreator = 'created_by ?= @request.auth.id'
        const hasShare = 'drive_shares_via_item.user ?= @request.auth.id'
        const canView = `${isCreator} || ${hasShare}`
        const canEdit = `${isCreator} || (${hasShare} && drive_shares_via_item.role ?!= "viewer")`

        const itemsCol = app.findCollectionByNameOrId('drive_items')
        itemsCol.listRule = canView
        itemsCol.viewRule = canView
        itemsCol.createRule = '@request.auth.id != ""'
        itemsCol.updateRule = canEdit
        itemsCol.deleteRule = isCreator
        app.save(itemsCol)

        const ownShareRecipient = 'user = @request.auth.id'
        const isItemCreator = 'item.created_by ?= @request.auth.id'

        const sharesCol = app.findCollectionByNameOrId('drive_shares')
        sharesCol.listRule = `${ownShareRecipient} || ${isItemCreator}`
        sharesCol.viewRule = `${ownShareRecipient} || ${isItemCreator}`
        sharesCol.createRule = isItemCreator
        sharesCol.updateRule = isItemCreator
        sharesCol.deleteRule = `${ownShareRecipient} || ${isItemCreator}`
        app.save(sharesCol)

        const ownRecordRule = 'user = @request.auth.id'
        const stateCol = app.findCollectionByNameOrId('drive_item_state')
        stateCol.listRule = ownRecordRule
        stateCol.viewRule = ownRecordRule
        stateCol.createRule = `${ownRecordRule} && (${isItemCreator} || item.drive_shares_via_item.user ?= @request.auth.id)`
        stateCol.updateRule = ownRecordRule
        stateCol.deleteRule = ownRecordRule
        app.save(stateCol)
    }
)
