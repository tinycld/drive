package drive

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The three row kinds on drive_shares, through the API:
//   - direct  (user set, group empty): unchanged behaviour (covered elsewhere)
//   - grant   (group set, user empty): the item creator may create, re-role
//     and delete one; never with the owner role
//   - derived (both set): core writes these; nobody may create, update or
//     delete one through the API
// A derived row grants access exactly like a direct one, and a grant row
// (no user) must never lift anybody.
//
// One ApiScenario per Test func with a fresh env: ApiScenario.Test
// re-triggers OnServe, and a second scenario on the same app panics on
// duplicate route registration.

// Fixture: creator owns an item; viewer holds a direct viewer share; a group
// "keepers" exists.
type groupGrantEnv struct {
	*driveGuestEnv
	creator, viewer           *core.Record
	creatorToken, viewerToken string
	item                      *core.Record
	group                     *core.Record
}

func setupGroupGrantEnv(t *testing.T) *groupGrantEnv {
	t.Helper()
	base := setupDriveGuestApp(t)
	applyDriveRules(t, base.app)
	creator := driveGuestUser(t, base.app, "creator@test.local", "member")
	viewer := driveGuestUser(t, base.app, "viewer@test.local", "member")

	itemsCol, err := base.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "plans.txt")
	item.Set("created_by", creator.Id)
	if err := base.app.Save(item); err != nil {
		t.Fatal(err)
	}

	makeShareRow(t, base.app, item, viewer, nil, "viewer", creator)
	group := driveGroup(t, base.app, "keepers")
	creatorToken, err := creator.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	viewerToken, err := viewer.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return &groupGrantEnv{
		driveGuestEnv: base,
		creator:       creator,
		viewer:        viewer,
		creatorToken:  creatorToken,
		viewerToken:   viewerToken,
		item:          item,
		group:         group,
	}
}

// makeShareRow writes a drive_shares row in superuser context. A nil user
// makes a grant, a nil group a direct share, and both set a derived row the
// way core's groups service writes one.
func makeShareRow(t *testing.T, app core.App, item, user, group *core.Record, role string, creator *core.Record) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(col)
	r.Set("item", item.Id)
	if user != nil {
		r.Set("user", user.Id)
	}
	if group != nil {
		r.Set("group", group.Id)
	}
	r.Set("role", role)
	r.Set("created_by", creator.Id)
	if err := app.Save(r); err != nil {
		t.Fatalf("save drive_shares row: %v", err)
	}
	return r
}

type shareReq struct {
	method  string
	url     string
	token   string
	body    string
	want    int
	content []string
	after   func(t testing.TB, app *tests.TestApp)
}

func (r shareReq) run(t *testing.T, env *groupGrantEnv) {
	t.Helper()
	expected := r.content
	var notExpected []string
	if r.want >= 400 {
		if len(expected) == 0 {
			expected = []string{`"message"`}
		}
		// A refusal must come from the rule, not from a malformed body the
		// test happened to send.
		notExpected = []string{`"validation_`}
	}
	headers := map[string]string{"Authorization": r.token}
	var body io.Reader
	if r.body != "" {
		headers["Content-Type"] = "application/json"
		body = strings.NewReader(r.body)
	}
	var after func(testing.TB, *tests.TestApp, *http.Response)
	if r.after != nil {
		after = func(t testing.TB, app *tests.TestApp, _ *http.Response) { r.after(t, app) }
	}
	scenario := &tests.ApiScenario{
		Name:                  r.method + " " + r.url,
		Method:                r.method,
		URL:                   r.url,
		Body:                  body,
		Headers:               headers,
		ExpectedStatus:        r.want,
		ExpectedContent:       expected,
		NotExpectedContent:    notExpected,
		TestAppFactory:        func(testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
		AfterTestFunc:         after,
	}
	scenario.Test(t)
}

const sharesURL = "/api/collections/drive_shares/records"

func requireStoredRole(t testing.TB, app core.App, shareID, want string) {
	t.Helper()
	fresh, err := app.FindRecordById("drive_shares", shareID)
	if err != nil {
		t.Fatalf("re-read share: %v", err)
	}
	if got := fresh.GetString("role"); got != want {
		t.Fatalf("share role = %q, want %q", got, want)
	}
}

func TestGroupGrants_CreatorCreatesViewerGrant(t *testing.T) {
	env := setupGroupGrantEnv(t)
	shareReq{
		method:  http.MethodPost,
		url:     sharesURL,
		token:   env.creatorToken,
		body:    `{"item":"` + env.item.Id + `","group":"` + env.group.Id + `","role":"viewer","created_by":"` + env.creator.Id + `"}`,
		want:    http.StatusOK,
		content: []string{`"group":"` + env.group.Id + `"`, `"user":""`},
	}.run(t, env)
}

// Ownership stays personal: driveshare treats an owner share as delete
// rights, which a whole group must never inherit.
func TestGroupGrants_CreatorCannotGrantOwner(t *testing.T) {
	env := setupGroupGrantEnv(t)
	shareReq{
		method: http.MethodPost,
		url:    sharesURL,
		token:  env.creatorToken,
		body:   `{"item":"` + env.item.Id + `","group":"` + env.group.Id + `","role":"owner","created_by":"` + env.creator.Id + `"}`,
		want:   http.StatusBadRequest,
	}.run(t, env)
}

func TestGroupGrants_NobodyCreatesDerivedRowViaAPI(t *testing.T) {
	env := setupGroupGrantEnv(t)
	outsider := driveGuestUser(t, env.app, "outsider@test.local", "member")
	shareReq{
		method: http.MethodPost,
		url:    sharesURL,
		token:  env.creatorToken,
		body:   `{"item":"` + env.item.Id + `","group":"` + env.group.Id + `","user":"` + outsider.Id + `","role":"viewer","created_by":"` + env.creator.Id + `"}`,
		want:   http.StatusBadRequest,
	}.run(t, env)
}

func TestGroupGrants_ViewerCannotCreateGrant(t *testing.T) {
	env := setupGroupGrantEnv(t)
	shareReq{
		method: http.MethodPost,
		url:    sharesURL,
		token:  env.viewerToken,
		body:   `{"item":"` + env.item.Id + `","group":"` + env.group.Id + `","role":"viewer","created_by":"` + env.viewer.Id + `"}`,
		want:   http.StatusBadRequest,
	}.run(t, env)
}

// On update PocketBase reads bare field names off the STORED row, so a bare
// `role != "owner"` would check the old role and let this PATCH through.
func TestGroupGrants_CreatorCannotPromoteGrantToOwner(t *testing.T) {
	env := setupGroupGrantEnv(t)
	grant := makeShareRow(t, env.app, env.item, nil, env.group, "viewer", env.creator)
	shareReq{
		method: http.MethodPatch,
		url:    sharesURL + "/" + grant.Id,
		token:  env.creatorToken,
		body:   `{"role":"owner"}`,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			requireStoredRole(t, app, grant.Id, "viewer")
		},
	}.run(t, env)
}

// The positive control for the test above: a fix that refused every update
// to a grant would pass that one for the wrong reason.
func TestGroupGrants_CreatorMayReroleGrantToEditor(t *testing.T) {
	env := setupGroupGrantEnv(t)
	grant := makeShareRow(t, env.app, env.item, nil, env.group, "viewer", env.creator)
	shareReq{
		method:  http.MethodPatch,
		url:     sharesURL + "/" + grant.Id,
		token:   env.creatorToken,
		body:    `{"role":"editor"}`,
		want:    http.StatusOK,
		content: []string{`"role":"editor"`},
		after: func(t testing.TB, app *tests.TestApp) {
			requireStoredRole(t, app, grant.Id, "editor")
		},
	}.run(t, env)
}

// Re-pointing a grant at another group would leave core's derived rows for
// the old group's members in place, so the group is pinned.
func TestGroupGrants_CreatorCannotRepointGrant(t *testing.T) {
	env := setupGroupGrantEnv(t)
	grant := makeShareRow(t, env.app, env.item, nil, env.group, "viewer", env.creator)
	other := driveGroup(t, env.app, "others")
	shareReq{
		method: http.MethodPatch,
		url:    sharesURL + "/" + grant.Id,
		token:  env.creatorToken,
		body:   `{"group":"` + other.Id + `"}`,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			fresh, err := app.FindRecordById("drive_shares", grant.Id)
			if err != nil {
				t.Fatalf("re-read grant: %v", err)
			}
			if got := fresh.GetString("group"); got != env.group.Id {
				t.Fatalf("grant group = %q, want %q", got, env.group.Id)
			}
		},
	}.run(t, env)
}

// derivedEnv seeds a derived row for a third user, written as core would.
func derivedEnv(t *testing.T) (*groupGrantEnv, *core.Record, string, *core.Record) {
	t.Helper()
	env := setupGroupGrantEnv(t)
	member := driveGuestUser(t, env.app, "member2@test.local", "member")
	token, err := member.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	derived := makeShareRow(t, env.app, env.item, member, env.group, "viewer", env.creator)
	return env, member, token, derived
}

func requireRowExists(t testing.TB, app core.App, id string) {
	t.Helper()
	if _, err := app.FindRecordById("drive_shares", id); err != nil {
		t.Fatalf("derived row was deleted: %v", err)
	}
}

func TestGroupGrants_DerivedRowGrantsItsUserRead(t *testing.T) {
	env, _, token, _ := derivedEnv(t)
	shareReq{
		method:  http.MethodGet,
		url:     "/api/collections/drive_items/records/" + env.item.Id,
		token:   token,
		want:    http.StatusOK,
		content: []string{`"name":"plans.txt"`},
	}.run(t, env)
}

func TestGroupGrants_CreatorCannotUpdateDerivedRow(t *testing.T) {
	env, _, _, derived := derivedEnv(t)
	shareReq{
		method: http.MethodPatch,
		url:    sharesURL + "/" + derived.Id,
		token:  env.creatorToken,
		body:   `{"role":"editor"}`,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			requireStoredRole(t, app, derived.Id, "viewer")
		},
	}.run(t, env)
}

func TestGroupGrants_CreatorCannotDeleteDerivedRow(t *testing.T) {
	env, _, _, derived := derivedEnv(t)
	shareReq{
		method: http.MethodDelete,
		url:    sharesURL + "/" + derived.Id,
		token:  env.creatorToken,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			requireRowExists(t, app, derived.Id)
		},
	}.run(t, env)
}

// A recipient may drop a direct share, but a derived row follows group
// membership; deleting it would be undone (or silently lost) by core.
func TestGroupGrants_RecipientCannotDeleteOwnDerivedRow(t *testing.T) {
	env, _, token, derived := derivedEnv(t)
	shareReq{
		method: http.MethodDelete,
		url:    sharesURL + "/" + derived.Id,
		token:  token,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			requireRowExists(t, app, derived.Id)
		},
	}.run(t, env)
}

// Correlation guard: the drive_items update rule is
// `drive_shares_via_item.user ?= auth && (drive_shares_via_item.role ?= ...)`.
// If the rule engine matched the role clause against ANY share row on the
// item, an editor grant (user "") would lift a viewer to editor.
func TestGroupGrants_EditorGrantDoesNotLiftAViewer(t *testing.T) {
	env := setupGroupGrantEnv(t)
	makeShareRow(t, env.app, env.item, nil, env.group, "editor", env.creator)
	shareReq{
		method: http.MethodPatch,
		url:    "/api/collections/drive_items/records/" + env.item.Id,
		token:  env.viewerToken,
		body:   `{"name":"renamed-by-viewer.txt"}`,
		want:   http.StatusNotFound,
		after: func(t testing.TB, app *tests.TestApp) {
			fresh, err := app.FindRecordById("drive_items", env.item.Id)
			if err != nil {
				t.Fatal(err)
			}
			if got := fresh.GetString("name"); got != "plans.txt" {
				t.Fatalf("a viewer renamed the item to %q", got)
			}
		},
	}.run(t, env)
}

// The same guard one relation further out: drive_item_versions reaches the
// shares through `item.drive_shares_via_item`.
func TestGroupGrants_EditorGrantDoesNotLiftAViewerOnVersions(t *testing.T) {
	env := setupGroupGrantEnv(t)
	makeShareRow(t, env.app, env.item, nil, env.group, "editor", env.creator)
	shareReq{
		method: http.MethodPost,
		url:    "/api/collections/drive_item_versions/records",
		token:  env.viewerToken,
		body:   `{"item":"` + env.item.Id + `","version_number":1,"source":"user","created_by":"` + env.viewer.Id + `"}`,
		want:   http.StatusBadRequest,
	}.run(t, env)
}
