package drive

import (
	"context"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/versionhooks"
)

// recordDiffHook registers a Diff hook that writes the ids it was given.
func recordDiffHook(t *testing.T, app core.App, mime string) {
	t.Helper()
	registerFakeHook(t, app, mime, versionhooks.Hook{
		Diff: func(_ context.Context, _ core.App, _, from, to *core.Record, _ string) (string, error) {
			fromID := "none"
			if from != nil {
				fromID = from.Id
			}
			return fromID + ">" + to.Id, nil
		},
	})
}

func mimeItem(t *testing.T, env *driveGuestEnv, mime, name string) *core.Record {
	t.Helper()
	item := seedFileItem(t, env.app, env.member, name, []byte("hello"))
	item.Set("mime_type", mime)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}
	return item
}

func snap(t *testing.T, env *driveGuestEnv, item *core.Record, source string) *core.Record {
	t.Helper()
	v, err := snapshotCurrentFile(env.app, item, snapshotOpts{UserID: env.member.Id, Source: source})
	if err != nil || v == nil {
		t.Fatalf("snapshot: %v", err)
	}
	return v
}

func TestVersionDiff_DefaultsToPreviousVisibleVersion(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v1 := snap(t, env, item, "user")
	snap(t, env, item, "system")
	v3 := snap(t, env, item, "auto")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v3.Id+"/diff", v3.Id, "", handleVersionDiff)
	if rec.Code != http.StatusOK || rec.Body.String() != v1.Id+">"+v3.Id {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestVersionDiff_ExplicitFrom(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v1 := snap(t, env, item, "user")
	snap(t, env, item, "user")
	v3 := snap(t, env, item, "user")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v3.Id+"/diff", v3.Id, "?from="+v1.Id, handleVersionDiff)
	if rec.Code != http.StatusOK || rec.Body.String() != v1.Id+">"+v3.Id {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestVersionDiff_FromOtherItemIsBadRequest(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	other := mimeItem(t, env, mime, "other.bin")
	foreign := snap(t, env, other, "user")
	v := snap(t, env, item, "user")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/diff", v.Id, "?from="+foreign.Id, handleVersionDiff)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestVersionDiff_FirstVersionAllInserted(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v := snap(t, env, item, "upload")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/diff", v.Id, "", handleVersionDiff)
	if rec.Code != http.StatusOK || rec.Body.String() != "none>"+v.Id {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestVersionDiff_NoHookIsNotFound(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := mimeItem(t, env, "application/x-plain-"+t.Name(), "doc.bin")
	v := snap(t, env, item, "user")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/diff", v.Id, "", handleVersionDiff)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestVersionDiff_NoAccessIsNotFound(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v := snap(t, env, item, "user")

	rec := getFile(env.app, env.guest, "/api/drive/versions/"+v.Id+"/diff", v.Id, "", handleVersionDiff)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// against=current compares the version with the document as it is now:
// the live room is flushed first, then the item itself is the newer side.
func TestVersionDiff_AgainstCurrentFlushesAndUsesTheItem(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v := snap(t, env, item, "user")
	var flushed int
	registerFlushingKind(t, env.app, item.Id, []byte("live edits"), &flushed)

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/diff", v.Id, "?against=current", handleVersionDiff)
	if rec.Code != http.StatusOK || rec.Body.String() != v.Id+">"+item.Id {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
	if flushed != 1 {
		t.Fatalf("flushed %d times, want 1", flushed)
	}
}

func TestVersionDiff_AgainstAndFromTogetherIsBadRequest(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	recordDiffHook(t, env.app, mime)
	item := mimeItem(t, env, mime, "doc.bin")
	v := snap(t, env, item, "user")

	rec := getFile(env.app, env.member, "/api/drive/versions/"+v.Id+"/diff", v.Id, "?against=current&from="+v.Id, handleVersionDiff)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
