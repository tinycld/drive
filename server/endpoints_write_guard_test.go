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

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
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

func TestUploadVersion_RefusedWhileOpen(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	leave := realtime.JoinItemForTest("guard-test-"+t.Name(), item.Id)
	defer leave()

	rec := callHandler(env.app, env.member, uploadVersionRequest(t, item.Id, []byte("v2")), handleUploadVersion)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	assertFileBytes(t, env.app, item.Id, "v1")
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

func TestRestoreVersion_RefusedWhileOpen(t *testing.T) {
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
	leave := realtime.JoinItemForTest("guard-test-"+t.Name(), item.Id)
	defer leave()

	req := httptest.NewRequest(http.MethodPost, "/api/drive/versions/restore",
		strings.NewReader(`{"item":"`+item.Id+`","version":"`+version.Id+`"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = callHandler(env.app, env.member, req, handleRestoreVersion)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	assertFileBytes(t, env.app, item.Id, "v2")
}

// A REST update that replaces the file is refused while the item is open; a
// rename does not touch the file and passes.
func TestRESTFileUpdate_RefusedWhileOpen_RenameAllowed(t *testing.T) {
	env := setupDriveGuestApp(t)
	env.app.OnRecordUpdateRequest("drive_items").BindFunc(guardFileUpdateRequest)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	leave := realtime.JoinItemForTest("guard-test-"+t.Name(), item.Id)
	defer leave()

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
		ExpectedStatus:        http.StatusConflict,
		ExpectedContent:       []string{"open in an editor"},
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}).Test(t)
	assertFileBytes(t, env.app, item.Id, "v1")

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
}

func TestWebDAVGuardWrite_UsesWriteItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	leave := realtime.JoinItemForTest("guard-test-"+t.Name(), item.Id)

	ran := false
	err := driveWebDAVHooks.GuardWrite(env.app, item, func() error { ran = true; return nil })
	if !errors.Is(err, realtime.ErrItemOpen) || ran {
		t.Fatalf("open item: err = %v, ran = %v; want ErrItemOpen and no write", err, ran)
	}
	leave()
}
