package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

// settingsGuardEnv gives the drive fixture core's settings table with the
// member-writable rule it ships with, and binds the guard the way Register
// does.
func settingsGuardEnv(t *testing.T) (*driveGuestEnv, string, string) {
	t.Helper()
	env := setupDriveGuestApp(t)
	ensureSettingsCollection(t, env.app)
	col, err := env.app.FindCollectionByNameOrId("settings")
	if err != nil {
		t.Fatal(err)
	}
	rule := `@request.auth.id != ""`
	col.ListRule, col.ViewRule = types.Pointer(rule), types.Pointer(rule)
	col.CreateRule, col.UpdateRule, col.DeleteRule = types.Pointer(rule), types.Pointer(rule), types.Pointer(rule)
	if err := env.app.Save(col); err != nil {
		t.Fatal(err)
	}
	env.app.OnRecordCreateRequest("settings").BindFunc(guardDriveSettings)
	env.app.OnRecordUpdateRequest("settings").BindFunc(guardDriveSettings)
	env.app.OnRecordDeleteRequest("settings").BindFunc(guardDriveSettings)

	admin := driveGuestUser(t, env.app, "admin@test.local", "admin")
	adminToken, err := admin.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return env, env.memberToken, adminToken
}

func settingsRequest(t *testing.T, env *driveGuestEnv, method, url, token, body string, status int) {
	t.Helper()
	(&tests.ApiScenario{
		Method:                method,
		URL:                   url,
		Body:                  strings.NewReader(body),
		Headers:               map[string]string{"Authorization": token, "Content-Type": "application/json"},
		ExpectedStatus:        status,
		ExpectedContent:       []string{`"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}).Test(t)
}

const driveSettingBody = `{"app":"drive","key":"auto_versions_default","value":"true"}`

func TestDriveSettings_MemberCannotWrite(t *testing.T) {
	env, member, _ := settingsGuardEnv(t)
	settingsRequest(t, env, http.MethodPost, "/api/collections/settings/records", member, driveSettingBody, http.StatusForbidden)
	if _, err := env.app.FindFirstRecordByFilter("settings", "app = 'drive'"); err == nil {
		t.Fatal("a member created a drive settings row")
	}
}

func TestDriveSettings_AdminCanWrite(t *testing.T) {
	env, _, admin := settingsGuardEnv(t)
	settingsRequest(t, env, http.MethodPost, "/api/collections/settings/records", admin, driveSettingBody, http.StatusOK)
}

func TestDriveSettings_MemberCannotMoveRowIntoDrive(t *testing.T) {
	env, member, _ := settingsGuardEnv(t)
	col, _ := env.app.FindCollectionByNameOrId("settings")
	row := core.NewRecord(col)
	row.Set("app", "other")
	row.Set("key", "k")
	row.Set("value", "v")
	if err := env.app.Save(row); err != nil {
		t.Fatal(err)
	}
	settingsRequest(t, env, http.MethodPatch, "/api/collections/settings/records/"+row.Id, member, `{"app":"drive"}`, http.StatusForbidden)
}

func TestDriveSettings_OtherAppsUnaffected(t *testing.T) {
	env, member, _ := settingsGuardEnv(t)
	settingsRequest(t, env, http.MethodPost, "/api/collections/settings/records", member,
		`{"app":"other","key":"k","value":"v"}`, http.StatusOK)
}
