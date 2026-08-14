import type { AutomationDefinitions } from '@tinycld/core/lib/automation/types'
import type { DriveSchema } from './types'

// No package Go for automation. Both triggers name their owner column
// explicitly (neither collection has a user/owner/author relation for the
// engine's auto-detection to find), and move-to-folder is a record-op the
// engine executes generically — which also means it inherits the pkgaccess
// check that native handlers have to make for themselves.
const automation = {
    triggers: [
        {
            id: 'file-added',
            label: 'A file is added',
            collection: 'drive_items',
            on: 'create',
            ownerField: 'created_by',
            fields: [
                'name',
                { key: 'mime_type', label: 'Type' },
                'size',
                { key: 'is_folder', label: 'Is a folder' },
                { key: 'parent', label: 'Folder' },
            ],
        },
        {
            // Deliberately cross-cutting: drive owns comment_mentions for doc,
            // sheet AND file comments, so this one trigger covers mentions in
            // all three. That is why text and calc contribute no mention
            // trigger of their own.
            id: 'mentioned-in-comment',
            label: "I'm mentioned in a comment",
            collection: 'comment_mentions',
            on: 'create',
            ownerField: 'mentioned_user',
            fields: [
                { key: 'drive_item', label: 'Document' },
                { key: 'target_collection', label: 'Comment type' },
            ],
        },
    ],
    actions: [
        {
            id: 'move-to-folder',
            label: 'Move to folder',
            kind: 'record-op',
            collection: 'drive_items',
            op: {
                type: 'update',
                // Only ever the record that fired the trigger — the engine
                // rejects any other target for update/delete.
                target: 'trigger-record',
                set: { parent: { param: 'parent' } },
            },
            // Naming the real column is what gives this a folder picker: the
            // catalog resolves relationTarget from the column's RelationField
            // (drive_items, displayed by name). A param that only declared
            // `type: 'relation'` would render an empty, unusable menu.
            params: [{ key: 'parent', field: 'parent', label: 'Destination folder' }],
        },
    ],
} satisfies AutomationDefinitions<DriveSchema>

export default automation
