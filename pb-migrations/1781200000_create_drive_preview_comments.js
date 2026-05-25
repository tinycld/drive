/// <reference path="../../../server/pb_data/types.d.ts" />

// drive_preview_comments stores comments created on the read-only HTML
// preview of a shared document (calc/text) by anonymous share-link
// visitors AND logged-in org members.
//
// Why a new collection (not calc_comments / text_comments):
//   - The preview is a static HTML render, not the live Y.Doc, so it has
//     no Tiptap mark ids or cell CRDT identity to anchor against. We
//     anchor by element (cell ref) or text offset+quote instead.
//   - Authors may be anonymous (no user_org), which the existing
//     comments tables can't represent (author is a required relation).
//
// All access is mediated by the drive server's share-comment endpoints,
// which authorize via a signed share session (anon) or PB auth (org
// member). Direct client CRUD is therefore disabled (all rules null) —
// the endpoints read/write with the privileged app instance.
//
// Built in two phases (mirrors calc_comments): the collection is saved
// first WITHOUT the self-referential parent_comment relation, then that
// relation is added — PB rejects a relation whose target collection
// doesn't exist yet, and a self-relation can't reference itself at create
// time.
migrate(
    app => {
        const previewComments = new Collection({
            id: 'pbc_drive_preview_comments_01',
            name: 'drive_preview_comments',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'dpc_drive_item',
                    name: 'drive_item',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_drive_items_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    // 'calc_cell' | 'text_range'
                    id: 'dpc_anchor_kind',
                    name: 'anchor_kind',
                    type: 'select',
                    required: true,
                    values: ['calc_cell', 'text_range'],
                    maxSelect: 1,
                },
                {
                    // JSON anchor: calc {sheet_id,row,col}; text {start,end}.
                    id: 'dpc_anchor',
                    name: 'anchor',
                    type: 'json',
                    required: false,
                    maxSize: 2000,
                },
                {
                    // Snapshot of anchored text for orphan display / re-find.
                    id: 'dpc_quoted_text',
                    name: 'quoted_text',
                    type: 'text',
                    required: false,
                    max: 280,
                },
                {
                    id: 'dpc_body',
                    name: 'body',
                    type: 'text',
                    required: true,
                    min: 1,
                    max: 4000,
                },
                {
                    id: 'dpc_resolved_at',
                    name: 'resolved_at',
                    type: 'date',
                    required: false,
                },
                {
                    // Set when a logged-in org member authors the comment.
                    id: 'dpc_author_user_org',
                    name: 'author_user_org',
                    type: 'relation',
                    required: false,
                    collectionId: 'pbc_user_org_01',
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                {
                    // Set for anonymous authors (the long-lived anon id).
                    id: 'dpc_author_anon_id',
                    name: 'author_anon_id',
                    type: 'text',
                    required: false,
                    max: 64,
                },
                {
                    // Snapshot of the display name at author time (real
                    // name or "Anon <Animal>"). Persists even if the user
                    // is later deleted, mirroring calc/text comments.
                    id: 'dpc_author_name',
                    name: 'author_name',
                    type: 'text',
                    required: true,
                    max: 200,
                },
                {
                    id: 'dpc_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    id: 'dpc_updated',
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            // All CRUD goes through the drive share-comment endpoints,
            // which authorize via share session or PB auth. Direct client
            // access is disabled.
            listRule: null,
            viewRule: null,
            createRule: null,
            updateRule: null,
            deleteRule: null,
            indexes: [
                'CREATE INDEX `idx_dpc_item` ON `drive_preview_comments` (`drive_item`)',
                'CREATE INDEX `idx_dpc_unresolved` ON `drive_preview_comments` (`drive_item`, `resolved_at`)',
            ],
        })
        app.save(previewComments)

        // Phase 2: add the self-referencing parent_comment relation now
        // that the collection exists. Cascade on the target: deleting a
        // root removes its replies.
        const withParent = app.findCollectionByNameOrId('drive_preview_comments')
        withParent.fields.add(
            new Field({
                id: 'dpc_parent_comment',
                name: 'parent_comment',
                type: 'relation',
                required: false,
                collectionId: 'pbc_drive_preview_comments_01',
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        withParent.indexes = [
            'CREATE INDEX `idx_dpc_item` ON `drive_preview_comments` (`drive_item`)',
            'CREATE INDEX `idx_dpc_unresolved` ON `drive_preview_comments` (`drive_item`, `resolved_at`)',
            'CREATE INDEX `idx_dpc_parent` ON `drive_preview_comments` (`parent_comment`)',
        ]
        app.save(withParent)
    },
    app => {
        const collection = app.findCollectionByNameOrId('drive_preview_comments')
        app.delete(collection)
    }
)
