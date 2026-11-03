/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
//
// attached_to: an item that exists only as part of another item.
//
// Text stores an image inserted into a document as its own drive_items row in
// the inserter's root, and the document refers to it by
// /api/files/drive_items/<image>/<file>. Every file is served behind the
// collection's viewRule (the PocketBase fork gates unprotected files too), so
// anyone the document is shared with — and nobody the image itself was not
// shared with — saw a broken image. attached_to names the document; the
// viewRule lets whoever can view the document view the attached row.
//
// - viewRule: the 2040000002 rule, or view access to the attached document.
//   listRule is unchanged: an attached image is reached through its
//   document, never listed as a file shared with the viewer.
// - createRule: only a user who can edit the document may attach to it.
// - updateRule: attached_to is set at create and never changes, so an image
//   cannot be handed to another document's viewers.
// - no cascadeDelete: an image copied into a second document must survive
//   the first one's deletion. With the document gone, the image is again
//   visible only to its uploader and the people it is shared with.
//
// Rules are restated as literals (shipped_rules_test.go asserts them): the
// 2040000002 / 1782100000 rules with the new clauses appended. The down
// migration restates them without.

const guard = '@request.auth.id != "" && '
const enabled = '@request.auth.disabled != true'
const notGuest = '@request.auth.role != "guest"'

const isCreator = 'created_by ?= @request.auth.id'
const hasShare = 'drive_shares_via_item.user ?= @request.auth.id'
const shareCanWrite = 'drive_shares_via_item.role ?= "editor" || drive_shares_via_item.role ?= "owner"'
const canView = `${guard}${enabled} && (${isCreator} || ${hasShare})`
const canEdit = `${guard}${enabled} && (${isCreator} || (${hasShare} && (${shareCanWrite})))`
const createRule = `@request.auth.id != "" && ${notGuest} && ${enabled}`

const docIsCreator = 'attached_to.created_by ?= @request.auth.id'
const docHasShare = 'attached_to.drive_shares_via_item.user ?= @request.auth.id'
const docShareCanWrite =
    'attached_to.drive_shares_via_item.role ?= "editor" || attached_to.drive_shares_via_item.role ?= "owner"'
const canViewThroughDocument = `${guard}${enabled} && attached_to != "" && (${docIsCreator} || ${docHasShare})`
const mayAttach = `(attached_to = "" || ${docIsCreator} || (${docHasShare} && (${docShareCanWrite})))`
const attachmentUnchanged = '(@request.body.attached_to:isset = false || @request.body.attached_to = attached_to)'

migrate(
    app => {
        const items = app.findCollectionByNameOrId('drive_items')
        items.fields.addAt(
            items.fields.length,
            new Field({
                id: 'drv_items_attached_to',
                name: 'attached_to',
                type: 'relation',
                required: false,
                collectionId: items.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        items.indexes = [
            ...items.indexes,
            'CREATE INDEX `idx_drv_items_attached_to` ON `drive_items` (`attached_to`)',
        ]
        items.viewRule = `(${canView}) || (${canViewThroughDocument})`
        items.createRule = `${createRule} && ${mayAttach}`
        items.updateRule = `${canEdit} && ${attachmentUnchanged}`
        app.save(items)
    },
    app => {
        const items = app.findCollectionByNameOrId('drive_items')
        items.viewRule = canView
        items.createRule = createRule
        items.updateRule = canEdit
        items.indexes = items.indexes.filter(idx => !idx.includes('idx_drv_items_attached_to'))
        items.fields.removeById('drv_items_attached_to')
        app.save(items)
    }
)
