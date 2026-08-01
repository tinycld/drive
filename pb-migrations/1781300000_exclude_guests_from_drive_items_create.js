/// <reference path="../../../server/pb_data/types.d.ts" />
// SECURITY: exclude the 'guest' role from drive_items create.
//
// A guest share-link visitor gets a real users record with role='guest'.
// drive_items' createRule was a plain authenticated predicate (set in
// 1716200001), with NO Go-hook backstop (the OnRecordCreate hook only enforces
// quota/dedup/owner-share), so a guest could create files. This pins the
// caller's own role to non-guest via `@request.auth.role`.
//
// drive_items list/view/update/delete are intentionally LEFT UNCHANGED — they
// are creator-or-share gated, which is exactly how a guest reaches their ONE
// legitimately-shared item. Only create is tightened.
//
// The down-migration restores the prior createRule (plain authenticated, from
// 1716200001).
migrate(
    app => {
        const guestExcludedRule = '@request.auth.id != "" && @request.auth.role != "guest"'

        const items = app.findCollectionByNameOrId('drive_items')
        items.createRule = guestExcludedRule
        app.save(items)
    },
    app => {
        const authedRule = '@request.auth.id != ""'

        const items = app.findCollectionByNameOrId('drive_items')
        items.createRule = authedRule
        app.save(items)
    }
)
