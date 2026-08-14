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
        {
            // `user` is the RECIPIENT of the share, and it's a relation to
            // users — so auto-detection finds it and this fires for the person
            // gaining access, which is exactly who wants to know.
            id: 'file-shared',
            label: 'A file is shared with me',
            collection: 'drive_shares',
            on: 'create',
            fields: [
                { key: 'item', label: 'File' },
                { key: 'role', label: 'Access level' },
                { key: 'created_by', label: 'Shared by' },
            ],
        },
        {
            // Compliance, not convenience: a share LINK is public to anyone
            // holding the URL, unlike drive_shares which names a user. An
            // admin rule watching this is how an organization notices
            // something being published outside it.
            //
            // created_by is the person who made the link — the only user this
            // row names, so auto-detection resolves to them and a personal
            // rule means "when I create a link". The org-scoped rule is the
            // useful one here.
            id: 'share-link-created',
            label: 'A public link is created',
            collection: 'drive_share_links',
            on: 'create',
            ownerField: 'created_by',
            fields: [
                { key: 'item', label: 'File' },
                { key: 'role', label: 'Access level' },
                { key: 'expires_at', label: 'Expires' },
                { key: 'created_by', label: 'Created by' },
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
