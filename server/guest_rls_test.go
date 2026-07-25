package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
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

// The rules below are copied verbatim from the migrations that ship them, so a
// migration edit that isn't mirrored here surfaces as a failing assertion
// rather than a test that quietly validates a string only this file believes in.

// driveItemsGuestCreateRule mirrors 1781300000_exclude_guests_from_drive_items_create.js.
const driveItemsGuestCreateRule = `@request.auth.id != "" && @request.auth.role != "guest"`

// driveItemsViewRule mirrors the canView rule in 1716200001_creator_access_rules.js.
const driveItemsViewRule = `created_by ?= @request.auth.id || drive_shares_via_item.user ?= @request.auth.id`

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

	items := core.NewBaseCollection("drive_items")
	items.Id = "pbc_drive_items_01"
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.RelationField{
		Name: "created_by", Required: true, CollectionId: users.Id, MaxSelect: 1,
	})
	if err := app.Save(items); err != nil {
		t.Fatal(err)
	}

	// drive_shares backs the `drive_shares_via_item` back-relation the view
	// rule walks; without the collection the rule can't even be parsed.
	shares := core.NewBaseCollection("drive_shares")
	shares.Id = "pbc_drive_shares_01"
	shares.Fields.Add(&core.RelationField{
		Name: "item", Required: true, CollectionId: items.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	shares.Fields.Add(&core.RelationField{
		Name: "user", Required: true, CollectionId: users.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	shares.Fields.Add(&core.SelectField{
		Name: "role", Required: true, MaxSelect: 1,
		Values: []string{"owner", "editor", "commentor", "viewer"},
	})
	shares.Fields.Add(&core.RelationField{
		Name: "created_by", Required: true, CollectionId: users.Id, MaxSelect: 1,
	})
	shares.AddIndex("idx_drv_shares_unique", true, "item, user", "")
	if err := app.Save(shares); err != nil {
		t.Fatal(err)
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

func setDriveItemsCreateRule(t *testing.T, app core.App) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rule := driveItemsGuestCreateRule
	col.CreateRule = &rule
	if err := app.Save(col); err != nil {
		t.Fatalf("set drive_items createRule: %v", err)
	}
}

func setDriveItemsViewRule(t *testing.T, app core.App) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rule := driveItemsViewRule
	col.ListRule = &rule
	col.ViewRule = &rule
	if err := app.Save(col); err != nil {
		t.Fatalf("set drive_items view rules: %v", err)
	}
}

func TestDriveGuestRLS_GuestCannotCreateItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsCreateRule(t, env.app)

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
	setDriveItemsCreateRule(t, env.app)

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
	setDriveItemsViewRule(t, env.app)

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

// TestDriveGuestRLS_GuestCannotViewUnsharedItem is the deny half of the view
// rule: holding a guest role (or any role) grants nothing on its own — only
// creator-ship or an explicit drive_shares row does.
func TestDriveGuestRLS_GuestCannotViewUnsharedItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsViewRule(t, env.app)

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
