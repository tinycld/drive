package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// guest_rls_test.go proves drive_items' tightened createRule against
// PocketBase's REAL rule engine: a role='guest' member of an org must NOT be
// able to create files, while a real (member/owner/admin) member still can.
//
// Background: a guest share-link visitor gets a real users record + a user_org
// row with role='guest' in the owner's org. The drive_items createRule was a
// pure-membership predicate (`org.user_org_via_org.user ?= @request.auth.id`)
// with NO Go-hook backstop (OnRecordCreate only does quota/dedup/owner-share),
// so a guest membership row would let the visitor create files in the org.
// drive_items READ stays creator-or-share (unchanged) — that's intentionally
// how a guest reaches their ONE shared item.
//
// The createRule's role pin shares the same relation-path prefix as the user
// pin, so PB applies both to the SAME joined user_org row (validated here and
// in core/server/coreserver/guest_rls_test.go).
//
// Each scenario builds a FRESH TestApp (ApiScenario.Test re-triggers OnServe;
// reusing one app panics on duplicate route registration under PB v0.38.1).

// driveItemsGuestCreateRule mirrors the 1716200002 migration verbatim.
const driveItemsGuestCreateRule = `org.user_org_via_org.user ?= @request.auth.id && ` +
	`org.user_org_via_org.role ?!= "guest"`

type driveGuestEnv struct {
	app         *tests.TestApp
	org         *core.Record
	memberUO    *core.Record
	guestUO     *core.Record
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

	orgs := core.NewBaseCollection("orgs")
	orgs.Id = "pbc_orgs_00001"
	orgs.Fields.Add(&core.TextField{Name: "name", Required: true})
	orgs.Fields.Add(&core.TextField{Name: "slug", Required: true})
	if err := app.Save(orgs); err != nil {
		t.Fatal(err)
	}

	userOrg := core.NewBaseCollection("user_org")
	userOrg.Id = "pbc_user_org_01"
	userOrg.Fields.Add(&core.RelationField{
		Name: "org", Required: true, CollectionId: orgs.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	userOrg.Fields.Add(&core.RelationField{
		Name: "user", Required: true, CollectionId: users.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	userOrg.Fields.Add(&core.SelectField{
		Name: "role", Required: true, MaxSelect: 1,
		Values: []string{"owner", "admin", "member", "guest"},
	})
	if err := app.Save(userOrg); err != nil {
		t.Fatal(err)
	}

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.RelationField{
		Name: "org", Required: true, CollectionId: orgs.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.RelationField{
		Name: "created_by", Required: true, CollectionId: userOrg.Id, MaxSelect: 1,
	})
	if err := app.Save(items); err != nil {
		t.Fatal(err)
	}

	org := core.NewRecord(orgs)
	org.Set("name", "Acme")
	org.Set("slug", "acme")
	if err := app.Save(org); err != nil {
		t.Fatal(err)
	}

	member := driveGuestUser(t, app, "member@test.local")
	guest := driveGuestUser(t, app, "guest@test.local")
	memberUO := driveGuestMembership(t, app, member, org, "member")
	guestUO := driveGuestMembership(t, app, guest, org, "guest")

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
		org:         org,
		memberUO:    memberUO,
		guestUO:     guestUO,
		memberToken: memberToken,
		guestToken:  guestToken,
	}
}

func driveGuestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	col, _ := app.FindCollectionByNameOrId("users")
	r := core.NewRecord(col)
	r.SetEmail(email)
	r.Set("name", "Test")
	r.SetVerified(true)
	r.SetPassword("Password123!")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

func driveGuestMembership(t *testing.T, app core.App, user, org *core.Record, role string) *core.Record {
	t.Helper()
	col, _ := app.FindCollectionByNameOrId("user_org")
	r := core.NewRecord(col)
	r.Set("user", user.Id)
	r.Set("org", org.Id)
	r.Set("role", role)
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

func TestDriveGuestRLS_GuestCannotCreateItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsCreateRule(t, env.app)

	scenario := &tests.ApiScenario{
		Method: http.MethodPost,
		URL:    "/api/collections/drive_items/records",
		Body: strings.NewReader(`{"org":"` + env.org.Id +
			`","name":"guest-file.txt","created_by":"` + env.guestUO.Id + `"}`),
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
		Body: strings.NewReader(`{"org":"` + env.org.Id +
			`","name":"member-file.txt","created_by":"` + env.memberUO.Id + `"}`),
		Headers:               map[string]string{"Authorization": env.memberToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"member-file.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}
