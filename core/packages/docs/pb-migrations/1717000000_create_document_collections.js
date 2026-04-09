/// <reference path="../../../server/pb_data/types.d.ts" />
migrate(
    app => {
        // doc_contents — stores rich text content for document-type drive_items
        const docContents = new Collection({
            id: 'pbc_doc_contents_01',
            name: 'doc_contents',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'dc_file_item',
                    name: 'file_item',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_drive_items_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'dc_content_json',
                    name: 'content_json',
                    type: 'json',
                    required: false,
                    maxSize: 5242880,
                },
                {
                    id: 'dc_content_html',
                    name: 'content_html',
                    type: 'text',
                    required: false,
                    max: 0,
                },
                {
                    id: 'dc_word_count',
                    name: 'word_count',
                    type: 'number',
                    required: false,
                    min: 0,
                },
                {
                    id: 'dc_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    id: 'dc_updated',
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: ['CREATE UNIQUE INDEX `idx_dc_file_item` ON `doc_contents` (`file_item`)'],
        })
        app.save(docContents)

        // Access rules: inherit from the parent drive_item's share rules
        const hasShareRule = 'file_item.drive_shares_via_item.user_org.user ?= @request.auth.id'
        const isOwnerOrEditor =
            'file_item.drive_shares_via_item.user_org.user ?= @request.auth.id && file_item.drive_shares_via_item.role ?!= "viewer"'

        const col = app.findCollectionByNameOrId('doc_contents')
        col.listRule = hasShareRule
        col.viewRule = hasShareRule
        col.createRule = isOwnerOrEditor
        col.updateRule = isOwnerOrEditor
        col.deleteRule = isOwnerOrEditor
        app.save(col)
    },
    app => {
        const collection = app.findCollectionByNameOrId('doc_contents')
        app.delete(collection)
    }
)
