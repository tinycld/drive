/// <reference path="../../../server/pb_data/types.d.ts" />

// Adds the 'commentor' role to the drive_share_links.role and
// drive_shares.role select fields. A commentor can read and comment on a
// shared item but cannot edit it. Public share links default to a
// commentable read role; commentor is the explicit name for that grant.
migrate(
    app => {
        const setRoleValues = (collectionName, values) => {
            const col = app.findCollectionByNameOrId(collectionName)
            const field = col.fields.getByName('role')
            if (!field) {
                throw new Error(`role field not found on ${collectionName}`)
            }
            field.values = values
            app.save(col)
        }

        setRoleValues('drive_share_links', ['viewer', 'commentor', 'editor'])
        setRoleValues('drive_shares', ['owner', 'editor', 'commentor', 'viewer'])
    },
    app => {
        const setRoleValues = (collectionName, values) => {
            const col = app.findCollectionByNameOrId(collectionName)
            const field = col.fields.getByName('role')
            if (!field) {
                return
            }
            field.values = values
            app.save(col)
        }

        setRoleValues('drive_share_links', ['viewer', 'editor'])
        setRoleValues('drive_shares', ['owner', 'editor', 'viewer'])
    }
)
