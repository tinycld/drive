/// <reference path="../../../server/pb_data/types.d.ts" />

// drive_preview_comments is retired: it backed the anonymous static-HTML
// share preview rail, which was superseded by Views 3/4/5 (anon read-only +
// guest commenter/editor mount the real calc/text editor directly via the
// share-editor registry). With the rail gone, the collection has no
// consumers and only carries dead data.
//
// The down-migration THROWS rather than recreating the schema (~80 lines
// of field definitions that are already source-controlled in 1781200000 —
// duplicating them invites drift on any future change). An operator who
// genuinely needs to roll back this drop should:
//
//   1. Run `pocketbase migrate down 2` (revert BOTH this migration AND the
//      1781200000 creation), then
//   2. Manually delete the 1781400000 migration file from disk, then
//   3. Boot, which re-applies 1781200000 from scratch and rebuilds the
//      empty collection.
//
// Failing loudly here prevents the silent data-loss footgun where a routine
// `migrate down 1` would drop the table again with no recovery path.
migrate(
    app => {
        const collection = app.findCollectionByNameOrId('drive_preview_comments')
        app.delete(collection)
    },
    _app => {
        throw new Error(
            'drive_preview_comments was dropped by migration 1781400000. ' +
                'This down-migration is intentionally not implemented to ' +
                'prevent silent data loss. To roll back, see the header of ' +
                'pb-migrations/1781400000_drop_drive_preview_comments.js.'
        )
    }
)
