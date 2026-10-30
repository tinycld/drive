package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// editorWithVersion shares a new item with an editor and makes one labeled
// version of it.
func editorWithVersion(t *testing.T, env *driveGuestEnv) (string, *core.Record) {
	t.Helper()
	editor := driveGuestUser(t, env.app, "editor@test.local", "member")
	token, err := editor.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	// shareItemWith makes an item without a file; a version needs one.
	item := seedFileItemFor(t, env, shareItemWith(t, env, "versioned.txt", editor, "editor"))
	v, err := snapshotCurrentFile(env.app, item, env.member.Id, "user", "Approved")
	if err != nil || v == nil {
		t.Fatalf("snapshot: %v", err)
	}
	return token, v
}

func patchVersion(t *testing.T, env *driveGuestEnv, token string, v *core.Record, body string, status int) {
	t.Helper()
	scenario := &tests.ApiScenario{
		Method:                http.MethodPatch,
		URL:                   "/api/collections/drive_item_versions/records/" + v.Id,
		Body:                  strings.NewReader(body),
		Headers:               map[string]string{"Authorization": token, "Content-Type": "application/json"},
		ExpectedStatus:        status,
		ExpectedContent:       []string{`"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
	scenario.Test(t)
}

// An editor renames a version; that is the one field the history screen
// writes.
func TestVersionRules_EditorCanRename(t *testing.T) {
	env := setupDriveGuestApp(t)
	token, v := editorWithVersion(t, env)
	patchVersion(t, env, token, v, `{"label":"Reviewed"}`, http.StatusOK)
}

// Changing source would let retention delete a version that only an owner
// may delete; editors and the rest are history and are server-written.
func TestVersionRules_EditorCannotChangeOtherFields(t *testing.T) {
	for name, body := range map[string]string{
		"source":        `{"source":"system"}`,
		"editors":       `{"editors":[]}`,
		"share_editors": `{"share_editors":["Forged"]}`,
		"created_by":    `{"created_by":""}`,
	} {
		t.Run(name, func(t *testing.T) {
			env := setupDriveGuestApp(t)
			token, v := editorWithVersion(t, env)
			patchVersion(t, env, token, v, body, http.StatusNotFound)
			fresh, err := env.app.FindRecordById("drive_item_versions", v.Id)
			if err != nil {
				t.Fatal(err)
			}
			if fresh.GetString("source") != "user" {
				t.Fatalf("source changed to %q", fresh.GetString("source"))
			}
		})
	}
}

// A REST create keeps its share guards (group_grants_rls_test.go) but cannot
// make an automatic or hidden version, or name editors.
func TestVersionRules_RestCreateCannotForgeHistory(t *testing.T) {
	for name, extra := range map[string]string{
		"auto source":   `"source":"auto"`,
		"system source": `"source":"system"`,
		"editors":       `"source":"user","editors":[]`,
	} {
		t.Run(name, func(t *testing.T) {
			env := setupDriveGuestApp(t)
			editor := driveGuestUser(t, env.app, "editor@test.local", "member")
			token, err := editor.NewAuthToken()
			if err != nil {
				t.Fatal(err)
			}
			item := seedFileItemFor(t, env, shareItemWith(t, env, "versioned.txt", editor, "editor"))
			scenario := &tests.ApiScenario{
				Method: http.MethodPost,
				URL:    "/api/collections/drive_item_versions/records",
				Body: strings.NewReader(`{"item":"` + item.Id + `","version_number":9,"created_by":"` +
					editor.Id + `",` + extra + `}`),
				Headers:               map[string]string{"Authorization": token, "Content-Type": "application/json"},
				ExpectedStatus:        http.StatusBadRequest,
				ExpectedContent:       []string{`"`},
				TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
				DisableTestAppCleanup: true,
			}
			scenario.Test(t)
		})
	}
}

func seedFileItemFor(t *testing.T, env *driveGuestEnv, item *core.Record) *core.Record {
	t.Helper()
	f, err := filesystem.NewFileFromBytes([]byte("hello"), item.GetString("name"))
	if err != nil {
		t.Fatal(err)
	}
	item.Set("file", f)
	item.Set("size", 5)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}
	return item
}
