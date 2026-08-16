/// <reference path="../../../server/pb_data/types.d.ts" />
migrate(
    app => {
        // Shared table for @mention rows across every package's
        // comments collection (calc_comments, text_comments, ...). One
        // row per (commentRecord, mentionedUser). The Go notify hook
        // (in @tinycld/core/server/notify) observes inserts and fires
        // NotifyUser; clients never read this collection directly —
        // they read notifications. Hence listRule/viewRule = null
        // (system-only).
        //
        // CREATE OR ADAPT, not create. The table is shared, and since
        // core's 1985000003 the workspace that reaches this file may
        // already have it: a deployment that ran drive-less (core
        // created the generalized table) and installed drive later.
        // On that path this file arrives AFTER core's, so it cannot
        // simply create — it adds what only drive contributes: the
        // drive_item relation and drive's branch of the createRule.
        // On a fresh assembly WITH drive this file sorts first
        // (1781... < 1985...) and creates the original shape; core's
        // generalization then adds target_collection / target_record
        // and relaxes drive_item, exactly as it always has.
        //
        // comment_collection / comment_record are stored as plain text
        // rather than a polymorphic relation because PB doesn't model
        // polymorphism. The Go hook validates `comment_collection`
        // against an allowlist before notifying so an attacker who
        // manages to insert a row with a bogus collection name is
        // silently dropped on the server.
        //
        // drive_item is denormalized onto every mention row so the
        // createRule can authorize without crossing a polymorphic
        // join — the same drive_shares_via_item rule used by every
        // comments table flows through here. It lives in this file
        // (not core's) because the rule parser requires the referenced
        // collections to exist when the rule is saved — which is also
        // why the ADAPT branch appends rather than sets: the rule may
        // already carry other packages' branches, and setting it would
        // silently drop them.
        const driveBranch =
            '@request.auth.id != "" && drive_item.drive_shares_via_item.user ?= @request.auth.id'

        let existing = null
        try {
            existing = app.findCollectionByNameOrId('comment_mentions')
        } catch {
            // Absent — this workspace reaches drive first; create the
            // original shape and let core's generalization adapt it.
        }

        if (existing) {
            if (!existing.fields.getByName('drive_item')) {
                existing.fields.add(
                    new Field({
                        id: 'cm_drive_item',
                        name: 'drive_item',
                        type: 'relation',
                        // Not required: the table already holds (or may
                        // hold) other packages' rows, which carry no
                        // drive item — the same end state 1985000002
                        // leaves on a drive-first deployment.
                        required: false,
                        collectionId: 'pbc_drive_items_01',
                        cascadeDelete: true,
                        maxSelect: 1,
                    })
                )
            }
            const current = existing.createRule || ''
            if (current.indexOf('drive_shares_via_item') === -1) {
                existing.createRule =
                    current === '' ? driveBranch : '(' + current + ') || (' + driveBranch + ')'
            }
            app.save(existing)
            return
        }

        const commentMentions = new Collection({
            id: 'pbc_comment_mentions_01',
            name: 'comment_mentions',
            type: 'base',
            system: false,
            fields: [
                {
                    id: 'cm_comment_collection',
                    name: 'comment_collection',
                    type: 'text',
                    required: true,
                    max: 64,
                },
                {
                    id: 'cm_comment_record',
                    name: 'comment_record',
                    type: 'text',
                    required: true,
                    max: 32,
                },
                {
                    id: 'cm_drive_item',
                    name: 'drive_item',
                    type: 'relation',
                    required: true,
                    collectionId: 'pbc_drive_items_01',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'cm_mentioned_user',
                    name: 'mentioned_user',
                    type: 'relation',
                    required: true,
                    collectionId: '_pb_users_auth_',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    id: 'cm_created',
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
            ],
            // Clients can insert when they have share access to the
            // parent drive_item — same gate as the comments tables.
            // The collection is otherwise opaque from the client side:
            // list/view/update/delete are nulled (system-only).
            listRule: null,
            viewRule: null,
            createRule: driveBranch,
            updateRule: null,
            deleteRule: null,
            indexes: [
                'CREATE INDEX `idx_comment_mentions_target` ON `comment_mentions` (`comment_collection`, `comment_record`)',
                'CREATE INDEX `idx_comment_mentions_user` ON `comment_mentions` (`mentioned_user`, `created` DESC)',
            ],
        })
        app.save(commentMentions)
    },
    app => {
        // The down mirrors the up's two paths. A table this migration merely
        // ADAPTED keeps existing without drive's contributions; one it created
        // is deleted outright. Distinguishing by who-created is not stored, so
        // the safe reading is: remove drive's field and branch, then delete
        // only if nothing else ever claimed the table (no other branches).
        let mentions
        try {
            mentions = app.findCollectionByNameOrId('comment_mentions')
        } catch {
            return
        }
        const current = mentions.createRule || ''
        const others = current
            .split('||')
            .map(part => part.trim())
            .filter(part => part !== '' && part.indexOf('drive_shares_via_item') === -1)
        if (others.length === 0) {
            app.delete(mentions)
            return
        }
        mentions.createRule = others.join(' || ')
        const driveItem = mentions.fields.getByName('drive_item')
        if (driveItem) mentions.fields.removeById(driveItem.id)
        app.save(mentions)
    }
)
