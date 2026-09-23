/// <reference path="../../../server/pb_data/types.d.ts" />

// The resetting half of the per-link download ceiling.
//
// download_count (shipped in 1716400000) already counts a link's downloads for
// its whole life and serves as the lifetime counter, so this adds only the
// daily window: a counter, and the day that counter belongs to.
//
// A counter plus its day, rather than deriving today's total from access
// timestamps: the check is one integer comparison on a row the request is
// already loading, and the reset is implicit — a new day makes the stored day
// stale, so the counter reads as zero without a sweeper, a cron, or anything
// running at midnight. Deriving it instead would mean keeping one row per
// access, which is an access log, and an access log is deliberately not what
// this is.
//
// The day is text ('YYYY-MM-DD'), not a date field: a date carries a
// time-of-day this value does not have, and a bare string compares for
// equality with no timezone interpretation at read time. UTC, because every
// other timestamp this collection writes is UTC and because a deployment's
// local zone is an ambient property that can change under it.
//
// Existing rows get NULL, which reads as 0 and as a stale day key — so the
// first download after this lands resets the window cleanly. No backfill.
migrate(
    app => {
        const collection = app.findCollectionByNameOrId('drive_share_links')

        collection.fields.addAt(
            collection.fields.length,
            new Field({
                type: 'number',
                name: 'day_download_count',
                min: 0,
                onlyInt: true,
            })
        )

        collection.fields.addAt(
            collection.fields.length,
            new Field({
                type: 'text',
                name: 'download_day',
                max: 10,
            })
        )

        return app.save(collection)
    },
    app => {
        const collection = app.findCollectionByNameOrId('drive_share_links')
        collection.fields.removeByName('day_download_count')
        collection.fields.removeByName('download_day')
        return app.save(collection)
    }
)
