/// <reference path="../../../server/pb_data/types.d.ts" />

// Renamed from 1782000000_add_thumb_index_hashes.js, which shared its
// timestamp prefix with 1782000000_exclude_disabled_from_drive.js — ordering
// between the two rested on the description text sorting a<e. The new prefix
// preserves the effective order (after 1781500000, before 1782000000).
//
// Databases that applied it under the old name see this file as new and run it
// again, so the up() is guarded to no-op when the fields already exist.

migrate(
    app => {
        const collection = app.findCollectionByNameOrId('drive_items')
        if (collection.fields.getByName('thumb_region_hash')) {
            return null
        }

        collection.fields.addAt(
            collection.fields.length,
            new Field({
                type: 'text',
                name: 'thumb_region_hash',
                max: 128,
            })
        )

        collection.fields.addAt(
            collection.fields.length,
            new Field({
                type: 'text',
                name: 'index_hash',
                max: 128,
            })
        )

        return app.save(collection)
    },
    app => {
        const collection = app.findCollectionByNameOrId('drive_items')
        collection.fields.removeByName('thumb_region_hash')
        collection.fields.removeByName('index_hash')
        return app.save(collection)
    }
)
