/// <reference path="../../../server/pb_data/types.d.ts" />

migrate(
    app => {
        const collection = app.findCollectionByNameOrId('drive_items')

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
