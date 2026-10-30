package drive

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
	"tinycld.org/core/realtime"
)

// seedFileItem creates a drive_items record owned by creator with content
// stored as its file blob.
func seedFileItem(t *testing.T, app core.App, creator *core.Record, name string, content []byte) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatalf("drive_items: %v", err)
	}
	f, err := filesystem.NewFileFromBytes(content, name)
	if err != nil {
		t.Fatalf("NewFileFromBytes: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", name)
	rec.Set("is_folder", false)
	rec.Set("mime_type", "text/plain")
	rec.Set("created_by", creator.Id)
	rec.Set("file", f)
	rec.Set("size", len(content))
	if err := app.Save(rec); err != nil {
		t.Fatalf("save drive_items: %v", err)
	}
	return rec
}

// registerFlushingKind registers a room kind whose flush rewrites itemID's
// blob with content, standing in for a text/calc save. The kind name is
// unique per test because the realtime registry is process-wide, and the
// flush ignores every other id so it is inert for the other tests' items.
func registerFlushingKind(t *testing.T, app core.App, itemID string, content []byte, flushed *int) {
	t.Helper()
	realtime.RegisterRoomKindWith("file-test-"+t.Name(), realtime.RoomKindOptions{
		Authorize: func(*core.Record, string) error { return nil },
		ForceFlush: func(id string) error {
			if id != itemID {
				return nil
			}
			*flushed++
			item, err := app.FindRecordById("drive_items", id)
			if err != nil {
				return err
			}
			f, err := filesystem.NewFileFromBytes(content, item.GetString("name"))
			if err != nil {
				return err
			}
			item.Set("file", f)
			item.Set("size", len(content))
			return app.Save(item)
		},
	})
}

func getFile(app core.App, auth *core.Record, path, id, query string, handler func(core.App, *core.RequestEvent) error) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path+query, nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()
	re := &core.RequestEvent{App: app}
	re.Request = req
	re.Response = rec
	re.Auth = auth
	if err := handler(app, re); err != nil {
		// Handlers return router.ApiError values; render their status the
		// way the router would so assertions can read rec.Code.
		var apiErr *router.ApiError
		if errors.As(err, &apiErr) {
			rec.Code = apiErr.Status
		} else {
			rec.Code = http.StatusInternalServerError
		}
	}
	return rec
}

// The item endpoint flushes the live room first, then serves the blob that
// flush wrote, with no-store so the stable URL is never cached.
func TestItemFile_FlushesThenServesTheCurrentBlob(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("stale"))
	var flushed int
	registerFlushingKind(t, env.app, item.Id, []byte("fresh"), &flushed)

	rec := getFile(env.app, env.member, "/api/drive/items/"+item.Id+"/file", item.Id, "", handleItemFile)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if flushed != 1 {
		t.Fatalf("flushed %d times, want 1", flushed)
	}
	if rec.Body.String() != "fresh" {
		t.Fatalf("body = %q, want the flushed bytes", rec.Body.String())
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", cc)
	}
	if cd := rec.Header().Get("Content-Disposition"); cd != `attachment; filename="notes.txt"` {
		t.Fatalf("Content-Disposition = %q", cd)
	}
}

// A `?token=` PocketBase file token is the credential for a request that
// cannot carry a header; a request with neither is refused, and a user
// without access to the item is told it does not exist.
func TestItemFile_AuthByFileTokenAndAccessCheck(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("bytes"))

	if rec := getFile(env.app, nil, "/api/drive/items/"+item.Id+"/file", item.Id, "", handleItemFile); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no auth: status = %d, want 401", rec.Code)
	}

	fileToken, err := env.member.NewFileToken()
	if err != nil {
		t.Fatal(err)
	}
	rec := getFile(env.app, nil, "/api/drive/items/"+item.Id+"/file", item.Id, "?token="+fileToken, handleItemFile)
	if rec.Code != http.StatusOK || rec.Body.String() != "bytes" {
		t.Fatalf("file token: status = %d body = %q", rec.Code, rec.Body.String())
	}

	if rec := getFile(env.app, env.guest, "/api/drive/items/"+item.Id+"/file", item.Id, "", handleItemFile); rec.Code != http.StatusNotFound {
		t.Fatalf("no access: status = %d, want 404", rec.Code)
	}
}

// A version is immutable, so the version endpoint serves its blob under the
// item's name without a flush, and applies the item's access check.
func TestVersionFile_ServesTheVersionBlob(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("current"))
	version, err := snapshotCurrentFile(env.app, item, snapshotOpts{UserID: env.member.Id, Source: "user", Label: "v1"})
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	var flushed int
	registerFlushingKind(t, env.app, item.Id, []byte("fresh"), &flushed)

	rec := getFile(env.app, env.member, "/api/drive/versions/"+version.Id+"/file", version.Id, "", handleVersionFile)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "current" {
		t.Fatalf("body = %q, want the version's bytes", rec.Body.String())
	}
	if flushed != 0 {
		t.Fatal("a version read must not flush the live room")
	}
	if cd := rec.Header().Get("Content-Disposition"); cd != `attachment; filename="notes.txt"` {
		t.Fatalf("Content-Disposition = %q", cd)
	}

	if rec := getFile(env.app, env.guest, "/api/drive/versions/"+version.Id+"/file", version.Id, "", handleVersionFile); rec.Code != http.StatusNotFound {
		t.Fatalf("no access: status = %d, want 404", rec.Code)
	}
}

// A snapshot flushes the live room first, so the version holds the edits
// the editor shows rather than the last debounced save.
func TestSnapshotVersion_FlushesTheLiveRoomFirst(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("stale"))
	var flushed int
	registerFlushingKind(t, env.app, item.Id, []byte("fresh"), &flushed)

	req := httptest.NewRequest(http.MethodPost, "/api/drive/versions/snapshot",
		strings.NewReader(`{"item":"`+item.Id+`","label":"before"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	re := &core.RequestEvent{App: env.app}
	re.Request = req
	re.Response = rec
	re.Auth = env.member
	if err := handleSnapshotVersion(env.app, re); err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if flushed != 1 {
		t.Fatalf("flushed %d times, want 1", flushed)
	}
	versions, err := env.app.FindRecordsByFilter("drive_item_versions", "item = {:item}", "", 0, 0, map[string]any{"item": item.Id})
	if err != nil || len(versions) != 1 {
		t.Fatalf("versions = %d, err = %v", len(versions), err)
	}
	reader, err := readFileContent(env.app, versions[0])
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	body := make([]byte, 16)
	n, _ := reader.Read(body)
	if string(body[:n]) != "fresh" {
		t.Fatalf("version bytes = %q, want the flushed bytes", body[:n])
	}
}
