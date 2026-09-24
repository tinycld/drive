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
