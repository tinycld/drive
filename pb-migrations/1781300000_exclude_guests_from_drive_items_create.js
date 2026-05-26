/// <reference path="../../../server/pb_data/types.d.ts" />
// SECURITY: exclude the 'guest' role from drive_items create.
//
// A guest share-link visitor gets a real users record + a user_org row with
// role='guest' in the owner's org. drive_items' createRule was a pure-
// membership predicate (orgMemberRule, set in 1716200001), with NO Go-hook
// backstop (the OnRecordCreate hook only enforces quota/dedup/owner-share), so
// a guest membership row let the visitor create files in the org.
//
// The role pin (`role ?!= "guest"`) shares the exact same relation-path prefix
// as the user pin, so PocketBase applies both conditions to the SAME joined
// user_org row (i.e. the CALLER's own membership must be non-guest — verified
// against the real rule engine in drive/server/guest_rls_test.go). This is NOT
// "some non-guest member exists in the org."
//
// drive_items list/view/update/delete are intentionally LEFT UNCHANGED — they
// are creator-or-share gated, which is exactly how a guest reaches their ONE
// legitimately-shared item. Only create is tightened.
//
// The down-migration restores the EXACT prior createRule (orgMemberRule from
// 1716200001).
migrate(
    app => {
        const guestExcludedRule =
            'org.user_org_via_org.user ?= @request.auth.id && ' +
            'org.user_org_via_org.role ?!= "guest"'

        const items = app.findCollectionByNameOrId('drive_items')
        items.createRule = guestExcludedRule
        app.save(items)
    },
    app => {
        const orgMemberRule = 'org.user_org_via_org.user ?= @request.auth.id'

        const items = app.findCollectionByNameOrId('drive_items')
        items.createRule = orgMemberRule
        app.save(items)
    }
)
