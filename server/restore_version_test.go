package drive

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/pocketbase/dbx"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
)

// postJSON drives a JSON POST handler and renders a returned ApiError's
// status the way the router would.
func postJSON(app core.App, auth *core.Record, body any, handler func(core.App, *core.RequestEvent) error) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(b))
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

func TestRestore_AddsRestoredFromVersion(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("one"))
	v1, err := snapshotCurrentFile(env.app, item, env.member.Id, "user", "Initial draft")
	if err != nil {
		t.Fatal(err)
	}

	rec := postJSON(env.app, env.member, map[string]string{"item": item.Id, "version": v1.Id}, handleRestoreVersion)
	if rec.Code != http.StatusOK {
		t.Fatalf("restore status = %d: %s", rec.Code, rec.Body.String())
	}

	rows, err := env.app.FindRecordsByFilter("drive_item_versions",
		"item = {:item} && source = 'user'", "-version_number", 1, 0,
		dbx.Params{"item": item.Id})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows = %v, %v", rows, err)
	}
	if got := rows[0].GetString("label"); got != "Restored from Initial draft" {
		t.Fatalf("label = %q", got)
	}
	if rows[0].Id == v1.Id {
		t.Fatal("expected a new version, got the restored one")
	}
}

func TestRestoredFromLabel(t *testing.T) {
	col := core.NewBaseCollection("drive_item_versions")
	col.Fields.Add(&core.TextField{Name: "label"}, &core.NumberField{Name: "version_number"})

	numbered := core.NewRecord(col)
	numbered.Set("version_number", 7)
	if got := restoredFromLabel(numbered); got != "Restored from Version 7" {
		t.Fatalf("label = %q", got)
	}

	long := core.NewRecord(col)
	long.Set("label", strings.Repeat("é", 500))
	got := restoredFromLabel(long)
	if n := utf8.RuneCountInString(got); n != 500 {
		t.Fatalf("rune count = %d, want 500", n)
	}
	if !utf8.ValidString(got) {
		t.Fatal("label is not valid UTF-8")
	}
}

// The state a restore replaces must stay in the visible history: edits
// since the last version exist nowhere else.
func TestRestore_KeepsReplacedStateVisible(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("one"))
	v1, err := snapshotCurrentFile(env.app, item, env.member.Id, "user", "Initial draft")
	if err != nil {
		t.Fatal(err)
	}
	item.Set("file", mustFile(t, []byte("unsaved two"), "a.txt"))
	item.Set("size", len("unsaved two"))
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	rec := postJSON(env.app, env.member, map[string]string{"item": item.Id, "version": v1.Id}, handleRestoreVersion)
	if rec.Code != http.StatusOK {
		t.Fatalf("restore status = %d: %s", rec.Code, rec.Body.String())
	}

	hidden, err := env.app.FindRecordsByFilter("drive_item_versions",
		"item = {:item} && source = 'system'", "", 0, 0, dbx.Params{"item": item.Id})
	if err != nil || len(hidden) != 0 {
		t.Fatalf("hidden versions = %d, %v; want none", len(hidden), err)
	}
	before, err := env.app.FindRecordsByFilter("drive_item_versions",
		"item = {:item} && source = 'auto'", "", 0, 0, dbx.Params{"item": item.Id})
	if err != nil || len(before) != 1 {
		t.Fatalf("auto versions = %d, %v; want the replaced state", len(before), err)
	}
	if got := before[0].GetInt("size"); got != len("unsaved two") {
		t.Fatalf("replaced-state version size = %d", got)
	}
}

func mustFile(t *testing.T, b []byte, name string) *filesystem.File {
	t.Helper()
	f, err := filesystem.NewFileFromBytes(b, name)
	if err != nil {
		t.Fatal(err)
	}
	return f
}
