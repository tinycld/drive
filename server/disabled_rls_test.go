package drive

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// disabled_rls_test.go proves the OTHER half of the suspension gate.
//
// core/driveshare denies a disabled user in Go, which covers WebDAV, the
// render endpoints and realtime room admission. But PocketBase's REST API
// evaluates the drive_items collection rules INSTEAD of that Go — so
// GET /api/collections/drive_items/records would still hand a suspended user
// every file shared with them. Gating only the Go leaves that wide open and
// looks perfectly correct in every Go unit test, which is exactly why this
// file exists.

// The rule under test is not restated here — it is applied by running drive's
// real pb-migrations (see applyDriveRules in guest_rls_test.go). The sibling
// suite learned why the hard way: it kept its own copy of drive_items'
// createRule, a later migration dropped a clause from the shipped one, and the
// test that existed to catch that went on passing against its copy.
func setDriveItemsEnabledViewRule(t *testing.T, app core.App) {
	t.Helper()
	applyDriveRules(t, app)
}

// seedSharedItem creates an item owned by the member and shared with the
// given user.
func seedSharedItem(t *testing.T, env *driveGuestEnv, sharedWith *core.Record) *core.Record {
	t.Helper()
	itemsCol, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "secret.txt")
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
	share.Set("user", sharedWith.Id)
	share.Set("role", "editor")
	share.Set("created_by", env.member.Id)
	if err := env.app.Save(share); err != nil {
		t.Fatal(err)
	}
	return item
}

// disableUser re-reads the record before flipping the flag. The caller's
// *core.Record was loaded before setDriveItemsEnabledViewRule added the
// `disabled` field, and saving that stale copy silently drops the new column
// — the write appears to succeed and the flag stays false.
func disableUser(t *testing.T, app core.App, user *core.Record) {
	t.Helper()
	fresh, err := app.FindRecordById("users", user.Id)
	if err != nil {
		t.Fatalf("reload user: %v", err)
	}
	fresh.Set("disabled", true)
	if err := app.Save(fresh); err != nil {
		t.Fatalf("disable user: %v", err)
	}
	if check, err := app.FindRecordById("users", user.Id); err != nil || !check.GetBool("disabled") {
		t.Fatalf("disabled flag did not persist (err=%v)", err)
	}
}

// TestDriveDisabledRLS_EnabledShareeCanView is the positive control. Without
// it, a rule that denied everyone would pass the deny test below.
func TestDriveDisabledRLS_EnabledShareeCanView(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsEnabledViewRule(t, env.app)
	item := seedSharedItem(t, env, env.guest)

	scenario := &tests.ApiScenario{
		Name:                  "enabled sharee reads the shared item",
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.guestToken},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"secret.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// TestDriveDisabledRLS_DisabledShareeDenied is the regression guard: the share
// row is live and the token is valid, so only the disabled clause can be doing
// the denying. Neuter that clause in the shipped migration and this test must
// go red — that is what makes it a guard rather than decoration.
func TestDriveDisabledRLS_DisabledShareeDenied(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsEnabledViewRule(t, env.app)
	item := seedSharedItem(t, env, env.guest)
	disableUser(t, env.app, env.guest)

	scenario := &tests.ApiScenario{
		Name:                  "disabled sharee is refused the shared item",
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.guestToken},
		ExpectedStatus:        http.StatusNotFound,
		NotExpectedContent:    []string{"secret.txt"},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// TestDriveDisabledRLS_DisabledCreatorDenied covers the creator disjunct too:
// suspension has to outrank owning the file, not just being shared on it.
func TestDriveDisabledRLS_DisabledCreatorDenied(t *testing.T) {
	env := setupDriveGuestApp(t)
	setDriveItemsEnabledViewRule(t, env.app)

	itemsCol, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "secret.txt")
	item.Set("created_by", env.member.Id)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}
	disableUser(t, env.app, env.member)

	scenario := &tests.ApiScenario{
		Name:                  "disabled creator is refused their own item",
		Method:                http.MethodGet,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Headers:               map[string]string{"Authorization": env.memberToken},
		ExpectedStatus:        http.StatusNotFound,
		NotExpectedContent:    []string{"secret.txt"},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}
