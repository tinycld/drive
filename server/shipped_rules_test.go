package drive

import (
	"testing"

	"tinycld.org/core/rlstest"
)

// The drive_shares rules are asserted as literals so an edit that weakens a
// clause fails here, not in production. Grant rows (group set, user empty)
// are client-written; derived rows (both set) are core's and must be
// untouchable through the API.
func TestDriveSharesShippedRules(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	cases := []struct{ kind, clause string }{
		// A grant row's user is "", which an anonymous request's NULL
		// @request.auth.id matches; every rule must require a login.
		{"list", rlstest.AuthGuard},
		{"view", rlstest.AuthGuard},
		{"create", rlstest.AuthGuard},
		{"update", rlstest.AuthGuard},
		{"delete", rlstest.AuthGuard},
		{"list", `@request.auth.disabled != true`},
		{"view", `@request.auth.disabled != true`},
		{"create", `item.created_by ?= @request.auth.id`},
		{"create", `(user = "" || group = "")`},
		{"create", `(user != "" || group != "")`},
		{"create", `(group = "" || role != "owner")`},
		{"update", `(user = "" || group = "")`},
		{"update", `(group = "" || @request.body.role:isset = false || @request.body.role != "owner")`},
		{"update", `(@request.body.item:isset = false || @request.body.item = item)`},
		{"update", `(@request.body.user:isset = false || @request.body.user = user)`},
		{"update", `(@request.body.group:isset = false || @request.body.group = group)`},
		{"delete", `(user = "" || group = "")`},
	}
	for _, c := range cases {
		rlstest.RequireRuleContains(t, env.app, "drive_shares", c.kind, c.clause)
	}
}

// The rules on drive's other collections that reach drive_shares.user through
// the back-relation. Each must require a login, for the same reason as above.
func TestDriveGrantReachingRules_RequireLogin(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	for _, c := range []struct{ collection, kind string }{
		{"drive_items", "list"},
		{"drive_items", "view"},
		{"drive_items", "update"},
		{"drive_item_versions", "list"},
		{"drive_item_versions", "view"},
		{"drive_item_versions", "create"},
		{"drive_item_versions", "update"},
		{"drive_item_versions", "delete"},
		{"drive_share_links", "list"},
		{"drive_share_links", "view"},
		{"drive_item_state", "create"},
	} {
		rlstest.RequireRuleContains(t, env.app, c.collection, c.kind, rlstest.AuthGuard)
	}
}
