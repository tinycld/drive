package drive

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/versionhooks"
)

func registerFakeHook(t *testing.T, itemType string, hook versionhooks.Hook) {
	t.Helper()
	versionhooks.Register(itemType, hook)
	t.Cleanup(func() { versionhooks.Register(itemType, versionhooks.Hook{}) })
}

// seedTypedVersion makes an item whose mime_type is the hook key, plus one
// version of it. Version hooks are keyed by the item's MIME type.
func seedTypedVersion(t *testing.T, env *driveGuestEnv, mimeType string, content []byte) (*core.Record, *core.Record) {
	t.Helper()
	item := seedFileItem(t, env.app, env.member, "doc.bin", content)
	item.Set("mime_type", mimeType)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}
	v, err := snapshotCurrentFile(env.app, item, snapshotOpts{UserID: env.member.Id, Source: "user", Label: "first"})
	if err != nil || v == nil {
		t.Fatalf("snapshot: %v", err)
	}
	return item, v
}

func TestVersionRender_UsesTypeHook(t *testing.T) {
	env := setupDriveGuestApp(t)
	typ := "application/x-notepad-" + t.Name()
	registerFakeHook(t, typ, versionhooks.Hook{
		Render: func(_ context.Context, _ core.App, _, v *core.Record, user string) (string, error) {
			return "<p>" + v.GetString("label") + ":" + user + "</p>", nil
		},
	})
	_, v := seedTypedVersion(t, env, typ, []byte("hello"))

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/render", v.Id, "", handleVersionRender)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "<p>first:"+env.member.Id+"</p>" {
		t.Fatalf("body = %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "private, no-cache" {
		t.Fatalf("Cache-Control = %q", cc)
	}
}

func TestVersionRender_NoAccessIsNotFound(t *testing.T) {
	env := setupDriveGuestApp(t)
	typ := "application/x-notepad-" + t.Name()
	registerFakeHook(t, typ, versionhooks.Hook{
		Render: func(context.Context, core.App, *core.Record, *core.Record, string) (string, error) {
			return "<p>secret</p>", nil
		},
	})
	_, v := seedTypedVersion(t, env, typ, []byte("hello"))

	rec := getFile(env.app, env.guest, "/api/drive/versions/"+v.Id+"/render", v.Id, "", handleVersionRender)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestVersionRender_TypeWithoutHookIsNotFound(t *testing.T) {
	env := setupDriveGuestApp(t)
	_, v := seedTypedVersion(t, env, "application/x-plain-"+t.Name(), []byte("hello"))

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/render", v.Id, "", handleVersionRender)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestVersionRender_EmptyFile(t *testing.T) {
	env := setupDriveGuestApp(t)
	typ := "application/x-notepad-" + t.Name()
	registerFakeHook(t, typ, versionhooks.Hook{
		Render: func(context.Context, core.App, *core.Record, *core.Record, string) (string, error) {
			return "", errors.New("empty")
		},
	})
	_, v := seedTypedVersion(t, env, typ, []byte("hello"))
	v.Set("file", nil)
	if err := env.app.Save(v); err != nil {
		t.Fatal(err)
	}

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/render", v.Id, "", handleVersionRender)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestVersionRender_RendererErrorIsServerError(t *testing.T) {
	env := setupDriveGuestApp(t)
	typ := "application/x-notepad-" + t.Name()
	registerFakeHook(t, typ, versionhooks.Hook{
		Render: func(context.Context, core.App, *core.Record, *core.Record, string) (string, error) {
			return "", errors.New("broken docx")
		},
	})
	_, v := seedTypedVersion(t, env, typ, []byte("hello"))

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/render", v.Id, "", handleVersionRender)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
}

// Regression: drive dispatched hooks by a drive_items "type" field that
// does not exist, so no package hook ever ran on a snapshot.
func TestSnapshotEndpoint_RunsHookForItemMimeType(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	var called int
	registerFakeHook(t, mime, versionhooks.Hook{
		OnSnapshot: func(core.App, *core.Record, *core.Record) error {
			called++
			return nil
		},
	})
	item := seedFileItem(t, env.app, env.member, "doc.bin", []byte("hello"))
	item.Set("mime_type", mime)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	rec := postJSON(env.app, env.member, map[string]string{"item": item.Id, "label": "x"}, handleSnapshotVersion)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if called != 1 {
		t.Fatalf("OnSnapshot called %d times, want 1", called)
	}
}
