/// <reference path="../../../server/pb_data/types.d.ts" />

// Version history:
//   - source 'auto': server checkpoints after an idle period or when the
//     last editor leaves; thinned by the retention job.
//   - editors / share_editors: who edited since the previous version, so
//     the history list can show it without walking the document.
// Every drive_item_versions field except `label`.
const DRIVE_OWNED_VERSION_FIELDS = [
    'item',
    'version_number',
    'file',
    'size',
    'mime_type',
    'source',
    'created_by',
    'editors',
    'share_editors',
]

const UPDATE_GUARD = DRIVE_OWNED_VERSION_FIELDS.map(f => `@request.body.${f}:isset = false`).join(
    ' && '
)
const CREATE_GUARD =
    '@request.body.editors:isset = false && @request.body.share_editors:isset = false && ' +
    '(@request.body.source = "user" || @request.body.source = "upload")'

const withoutSuffix = (rule, suffix) => (rule?.endsWith(suffix) ? rule.slice(0, -suffix.length) : rule)

migrate(
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        const source = col.fields.getByName('source')
        if (!source) throw new Error('source field not found on drive_item_versions')
        source.values = ['upload', 'system', 'user', 'auto']

        col.fields.add(
            new Field({
                id: 'drv_ver_editors',
                name: 'editors',
                type: 'relation',
                required: false,
                collectionId: '_pb_users_auth_',
                cascadeDelete: false,
                maxSelect: 999,
            })
        )
        col.fields.add(
            new Field({
                id: 'drv_ver_share_editors',
                name: 'share_editors',
                type: 'json',
                required: false,
                maxSize: 10 * 1024,
            })
        )
        // The history screen writes one field, `label`. Every other field is
        // history the server writes: changing `source` would let retention
        // delete a version that only an owner may delete, and `editors` would
        // let an editor rewrite who changed the document. A REST create keeps
        // its share guards but cannot make an automatic or hidden version, or
        // name editors.
        col.updateRule = `${col.updateRule} && ${UPDATE_GUARD}`
        col.createRule = `${col.createRule} && ${CREATE_GUARD}`

        app.save(col)
    },
    app => {
        const col = app.findCollectionByNameOrId('drive_item_versions')
        col.fields.removeById('drv_ver_editors')
        col.fields.removeById('drv_ver_share_editors')
        const source = col.fields.getByName('source')
        if (source) source.values = ['upload', 'system', 'user']
        col.updateRule = withoutSuffix(col.updateRule, ` && ${UPDATE_GUARD}`)
        col.createRule = withoutSuffix(col.createRule, ` && ${CREATE_GUARD}`)
        app.save(col)
    }
)
