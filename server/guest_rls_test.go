package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"tinycld.org/core/rlstest"
)

// guest_rls_test.go proves drive_items' tightened createRule against
// PocketBase's REAL rule engine: a user carrying role='guest' must NOT be able
// to create files, while a real (member/owner/admin) user still can.
//
// Background: a guest share-link visitor gets a real users record stamped
// role='guest' (see ensureGuestRole in endpoints_share_otp.go). The drive_items
// createRule was a plain authenticated predicate with NO Go-hook backstop
// (OnRecordCreate only does quota/dedup/owner-share), so a guest could create
// files. drive_items READ stays creator-or-share (unchanged) — that's
// intentionally how a guest reaches their ONE shared item.
//
// Single-org: role lives on the users auth record, so the createRule pins
// `@request.auth.role` directly rather than walking a user_org junction.
//
// Each scenario builds a FRESH TestApp (ApiScenario.Test re-triggers OnServe;
// reusing one app panics on duplicate route registration under PB v0.38.1).
//
// The rules under test are NOT restated here. They are applied by running
// drive's real pb-migrations against the test app (see rlstest), because the
// earlier version of this file did restate them — as constants with a comment
// promising they were copied verbatim — and then a later migration dropped the
// guest-exclusion clause from the shipped createRule while this suite went on
// passing against its own copy of the old rule. A test that declares the thing
// it is testing cannot fail for the reason it was written.

type driveGuestEnv struct {
	app         *tests.TestApp
	member      *core.Record
	guest       *core.Record
	memberToken string
	guestToken  string
}

func setupDriveGuestApp(t *testing.T) *driveGuestEnv {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}

	// Single-org: the role select on the users auth record IS the membership.
	users.Fields.Add(&core.SelectField{
		Name: "role", Required: false, MaxSelect: 1,
		Values: []string{"owner", "admin", "member", "guest"},
	})
	if err := app.Save(users); err != nil {
		t.Fatalf("add users.role: %v", err)
	}

	// drive_items, drive_shares and the rest come from drive's own migrations,
	// applied by applyDriveRules — collection shape and access rules alike, so
	// neither can drift from what ships.
	users.Fields.Add(&core.BoolField{Name: "disabled"})
	if err := app.Save(users); err != nil {
		t.Fatalf("add users.disabled: %v", err)
	}

	member := driveGuestUser(t, app, "member@test.local", "member")
	guest := driveGuestUser(t, app, "guest@test.local", "guest")

	memberToken, err := member.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	guestToken, err := guest.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}

	return &driveGuestEnv{
		app:         app,
		member:      member,
		guest:       guest,
		memberToken: memberToken,
		guestToken:  guestToken,
	}
}

func driveGuestUser(t *testing.T, app core.App, email, role string) *core.Record {
	t.Helper()
	col, _ := app.FindCollectionByNameOrId("users")
	r := core.NewRecord(col)
	r.SetEmail(email)
	r.Set("name", "Test")
	r.Set("role", role)
	r.SetVerified(true)
	r.SetPassword("Password123!")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

// applyDriveRules stamps drive's SHIPPED rules onto the test collections by
// running the package's own pb-migrations. Every rule assertion below is
// therefore made against what the product ships.
func applyDriveRules(t *testing.T, app core.App) {
	t.Helper()
	rlstest.Apply(t, app, rlstest.MigrationsDir(t, "../pb-migrations"))
}

// The clauses each guard is expected to contribute. Asserting on these names
// what the deny-tests assert on behaviour: when a migration restates a rule
// and silently drops a predicate, this says which one went missing and prints
// the rule as it now ships.
func TestDriveShippedRules_CarryTheirGuards(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	for _, c := range []struct{ collection, kind, clause, why string }{
		{"drive_items", "create", `@request.auth.role != "guest"`,
			"1781300000 excluded share-link guests from creating files"},
		{"drive_items", "create", `@request.auth.disabled != true`,
			"1782000000 excluded suspended users"},
		{"drive_items", "view", `@request.auth.disabled != true`,
			"1782000000 excluded suspended users from reading shared content"},
		{"drive_item_versions", "view", `@request.auth.disabled != true`,
			"versions carry restorable file content and gate blob access"},
		{"drive_share_links", "view", `@request.auth.disabled != true`,
			"a suspended user must not resolve share links"},
	} {
		t.Run(c.collection+"."+c.kind+" "+c.clause, func(t *testing.T) {
			rlstest.RequireRuleContains(t, env.app, c.collection, c.kind, c.clause)
			t.Logf("guard origin: %s", c.why)
		})
	}
}

func TestDriveGuestRLS_GuestCannotCreateItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	scenario := &tests.ApiScenario{
		Method: http.MethodPost,
		URL:    "/api/collections/drive_items/records",
		Body: strings.NewReader(`{"name":"guest-file.txt","created_by":"` +
			env.guest.Id + `"}`),
		Headers:               map[string]string{"Authorization": env.guestToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusBadRequest,
		ExpectedContent:       []string{`"message"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

func TestDriveGuestRLS_MemberCanCreateItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	scenario := &tests.ApiScenario{
		Method: http.MethodPost,
		URL:    "/api/collections/drive_items/records",
		Body: strings.NewReader(`{"name":"member-file.txt","created_by":"` +
			env.member.Id + `"}`),
		Headers:               map[string]string{"Authorization": env.memberToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"member-file.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// TestDriveGuestRLS_GuestCanViewSharedItem is the other half of the contract:
// create is tightened, but list/view stay creator-or-share so a guest still
// reaches the ONE item their share link granted. Without this, "block guests"
// could be over-applied and silently break the share-link flow.
func TestDriveGuestRLS_GuestCanViewSharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	// The member owns an item and shares it with the guest.
	itemsCol, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "shared.txt")
	item.Set("created_by", env.member.Id)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	sharesCol, err := env.app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	share := core.NewRecord(sharesCol)
	share.Set("item", item.Id)
	share.Set("user", env.guest.Id)
	share.Set("role", "commentor")
	share.Set("created_by", env.member.Id)
	if err := env.app.Save(share); err != nil {
		t.Fatal(err)
	}

	scenario := &tests.ApiScenario{
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.guestToken},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"shared.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// shareItemWith creates an item owned by the member and shares it with the
// given user at the given role, returning the item.
func shareItemWith(t *testing.T, env *driveGuestEnv, name string, user *core.Record, role string) *core.Record {
	t.Helper()
	itemsCol, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", name)
	item.Set("created_by", env.member.Id)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	sharesCol, err := env.app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	share := core.NewRecord(sharesCol)
	share.Set("item", item.Id)
	share.Set("user", user.Id)
	share.Set("role", role)
	share.Set("created_by", env.member.Id)
	if err := env.app.Save(share); err != nil {
		t.Fatal(err)
	}
	return item
}

// A commentor reads and comments; it never edits. The update rule used to say
// `role ?!= "viewer"` — "any role that is not viewer" — which admitted
// commentor the day the role was added to the schema, letting them rename or
// replace a shared item over REST PATCH (and, through the same rule, over
// WebDAV PUT-overwrite and MOVE).
func TestDriveCommentorRLS_CannotUpdateSharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)
	item := shareItemWith(t, env, "commentable.txt", env.guest, "commentor")

	scenario := &tests.ApiScenario{
		Method:                http.MethodPatch,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Body:                  strings.NewReader(`{"name":"renamed-by-commentor.txt"}`),
		Headers:               map[string]string{"Authorization": env.guestToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusNotFound,
		ExpectedContent:       []string{`"message"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
		AfterTestFunc: func(t testing.TB, app *tests.TestApp, _ *http.Response) {
			fresh, err := app.FindRecordById("drive_items", item.Id)
			if err != nil {
				t.Fatal(err)
			}
			if fresh.GetString("name") != "commentable.txt" {
				t.Fatalf("a commentor renamed the item to %q", fresh.GetString("name"))
			}
		},
	}
	scenario.Test(t)
}

// The positive control for the rule above: an editor still can. Naming the
// write-capable roles must not have narrowed the grant to owners.
func TestDriveEditorRLS_CanUpdateSharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)
	editor := driveGuestUser(t, env.app, "editor@test.local", "member")
	editorToken, err := editor.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	item := shareItemWith(t, env, "editable.txt", editor, "editor")

	scenario := &tests.ApiScenario{
		Method:                http.MethodPatch,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Body:                  strings.NewReader(`{"name":"renamed-by-editor.txt"}`),
		Headers:               map[string]string{"Authorization": editorToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"renamed-by-editor.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// And the read half: a commentor must still reach the document, or they cannot
// do the one thing the role exists for.
func TestDriveCommentorRLS_CanViewSharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)
	item := shareItemWith(t, env, "readable.txt", env.guest, "commentor")

	scenario := &tests.ApiScenario{
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.guestToken},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"readable.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// TestDriveGuestRLS_GuestCannotViewUnsharedItem is the deny half of the view
// rule: holding a guest role (or any role) grants nothing on its own — only
// creator-ship or an explicit drive_shares row does.
func TestDriveGuestRLS_GuestCannotViewUnsharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	applyDriveRules(t, env.app)

	itemsCol, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "private.txt")
	item.Set("created_by", env.member.Id)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	scenario := &tests.ApiScenario{
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.guestToken},
		ExpectedStatus:        http.StatusNotFound,
		ExpectedContent:       []string{`"message"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}
