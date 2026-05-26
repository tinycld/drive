/// <reference path="../../../server/pb_data/types.d.ts" />

// drive_preview_comments is retired: it backed the anonymous static-HTML
// share preview rail, which was superseded by Views 3/4/5 (anon read-only +
// guest commenter/editor mount the real calc/text editor directly via the
// share-editor registry). With the rail gone, the collection has no
// consumers and only carries dead data.
//
// The down-migration is intentionally a NO-OP. If a rollback is ever
// needed, restore by reverting BOTH this migration and 1781200000 (the
// creation), which puts the schema back exactly. Recreating the schema
// inline here would duplicate ~80 lines of field definitions that are
// already source-controlled in 1781200000 — duplicating them invites
// drift on any future change.
migrate(
    app => {
        const collection = app.findCollectionByNameOrId('drive_preview_comments')
        app.delete(collection)
    },
    _app => {
        // No-op. See header.
    }
)
