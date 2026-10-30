package drive

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
	"tinycld.org/core/realtime"
)

// callHandler runs a drive handler with auth and renders a returned
// router.ApiError's status the way the router would.
func callHandler(app core.App, auth *core.Record, req *http.Request, handler func(core.App, *core.RequestEvent) error) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	re := &core.RequestEvent{App: app}
	re.Request = req
	re.Response = rec
	re.Auth = auth
	if err := handler(app, re); err != nil {
		var apiErr *router.ApiError
		if errors.As(err, &apiErr) {
			rec.Code = apiErr.Status
		} else {
			rec.Code = http.StatusInternalServerError
		}
	}
	return rec
}

func uploadVersionRequest(t *testing.T, itemID string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField("item", itemID); err != nil {
		t.Fatal(err)
	}
	part, err := w.CreateFormFile("file", "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/drive/upload-version", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func assertFileBytes(t *testing.T, app core.App, itemID, want string) {
	t.Helper()
	item, err := app.FindRecordById("drive_items", itemID)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := readFileContent(app, item)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != want {
		t.Fatalf("stored bytes = %q, want %q", got, want)
	}
}

// openWithFinalSave holds itemID open in a room whose final save writes
// content, standing in for a text/calc editor. It returns the name of the
// blob that save wrote, empty until the room closes.
func openWithFinalSave(t *testing.T, app core.App, itemID string, content []byte) (savedName func() string) {
	t.Helper()
	var name string
	kind := "guard-test-" + t.Name()
	realtime.RegisterRoomKindWith(kind, realtime.RoomKindOptions{
		Authorize: func(*core.Record, string) error { return nil },
		OnEmpty: func(id string) {
			item, err := app.FindRecordById("drive_items", id)
			if err != nil {
				t.Error(err)
				return
			}
			f, err := filesystem.NewFileFromBytes(content, item.GetString("name"))
			if err != nil {
				t.Error(err)
				return
			}
			item.Set("file", f)
			item.Set("size", len(content))
			if err := app.Save(item); err != nil {
				t.Error(err)
				return
			}
			name = item.GetString("file")
		},
	})
	t.Cleanup(realtime.JoinItemForTest(kind, itemID))
	return func() string { return name }
}

// latestVersionBytes reads the newest version of itemID with source.
func latestVersionBytes(t *testing.T, app core.App, itemID, source string) string {
	t.Helper()
	versions, err := app.FindRecordsByFilter("drive_item_versions",
		"item = {:item} && source = {:source}", "-created", 1, 0,
		dbx.Params{"item": itemID, "source": source})
	if err != nil || len(versions) == 0 {
		t.Fatalf("no %s version: %v", source, err)
	}
	reader, err := readFileContent(app, versions[0])
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return string(got)
}

// An upload over an open item closes its room; the room's final save is
// archived as the upload's version, and the upload replaces it.
func TestUploadVersion_ReplacesTheFileWhileOpen(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	rec := callHandler(env.app, env.member, uploadVersionRequest(t, item.Id, []byte("v2")), handleUploadVersion)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	assertFileBytes(t, env.app, item.Id, "v2")
	if got := latestVersionBytes(t, env.app, item.Id, "upload"); got != "edited" {
		t.Fatalf("archived version = %q, want the room's final save", got)
	}
}

func TestUploadVersion_WritesWhenClosed(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))

	rec := callHandler(env.app, env.member, uploadVersionRequest(t, item.Id, []byte("v2")), handleUploadVersion)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	assertFileBytes(t, env.app, item.Id, "v2")
}

// A restore over an open item closes its room; the room's final save is
// kept as the hidden version an undo returns to.
func TestRestoreVersion_ReplacesTheFileWhileOpen(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	version, err := snapshotCurrentFile(env.app, item, env.member.Id, "user", "v1")
	if err != nil {
		t.Fatal(err)
	}
	rec := callHandler(env.app, env.member, uploadVersionRequest(t, item.Id, []byte("v2")), handleUploadVersion)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload v2: status = %d", rec.Code)
	}
	openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	req := httptest.NewRequest(http.MethodPost, "/api/drive/versions/restore",
		strings.NewReader(`{"item":"`+item.Id+`","version":"`+version.Id+`"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = callHandler(env.app, env.member, req, handleRestoreVersion)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	assertFileBytes(t, env.app, item.Id, "v1")
	// The replaced state stays in the visible history (source "auto").
	if got := latestVersionBytes(t, env.app, item.Id, "auto"); got != "edited" {
		t.Fatalf("replaced-state version = %q, want the room's final save", got)
	}
}

// A REST update that replaces the file of an open item closes its room and
// then wins. The request saves a record loaded before the room's final
// save; PocketBase reads the stored file name at save time, so that save's
// blob is deleted, not left behind.
func TestRESTFileUpdate_ReplacesTheFileWhileOpen(t *testing.T) {
	env := setupDriveGuestApp(t)
	env.app.OnRecordUpdateRequest("drive_items").BindFunc(guardFileUpdateRequest)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	savedName := openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, err := w.CreateFormFile("file", "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("v2")); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	(&tests.ApiScenario{
		Method:                http.MethodPatch,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Body:                  &body,
		Headers:               map[string]string{"Authorization": env.memberToken, "Content-Type": w.FormDataContentType()},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"id":"` + item.Id + `"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}).Test(t)

	assertFileBytes(t, env.app, item.Id, "v2")
	if savedName() == "" {
		t.Fatal("the room's final save did not run")
	}
	fsys, err := env.app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer fsys.Close()
	if exists, _ := fsys.Exists(item.BaseFilesPath() + "/" + savedName()); exists {
		t.Fatal("the final save's blob was left behind")
	}
}

// A rename does not touch the file, so it does not close the room.
func TestRESTRename_LeavesTheRoomOpen(t *testing.T) {
	env := setupDriveGuestApp(t)
	env.app.OnRecordUpdateRequest("drive_items").BindFunc(guardFileUpdateRequest)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	savedName := openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	(&tests.ApiScenario{
		Method:                http.MethodPatch,
		URL:                   "/api/collections/drive_items/records/" + item.Id,
		Body:                  strings.NewReader(`{"name":"renamed.txt"}`),
		Headers:               map[string]string{"Authorization": env.memberToken, "Content-Type": "application/json"},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"renamed.txt"`},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}).Test(t)

	if savedName() != "" {
		t.Fatal("a rename closed the room")
	}
}

func TestWebDAVGuardWrite_ClosesTheRoomThenWrites(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	savedName := openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	savedBeforeWrite := ""
	err := driveWebDAVHooks.GuardWrite(env.app, item, func() error { savedBeforeWrite = savedName(); return nil })

	if err != nil {
		t.Fatal(err)
	}
	if savedBeforeWrite == "" {
		t.Fatal("the write ran before the room's final save")
	}
}
