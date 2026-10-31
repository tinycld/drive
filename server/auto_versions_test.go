package drive

import (
	"context"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/editcheckpoint"
	"tinycld.org/core/realtime"
	"tinycld.org/core/versionhooks"
)

func versionsOf(t *testing.T, app core.App, itemID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("drive_item_versions", "item = {:item}", "-version_number", 0, 0,
		dbx.Params{"item": itemID})
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestCheckpoint_CreatesAutoVersionOwnedByItemOwner(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))
	turnAutoVersionsOn(t, env.app, item)

	handleEditCheckpoint(env.app)(context.Background(), item.Id, editcheckpoint.Editors{
		UserIDs:    []string{env.guest.Id},
		ShareNames: []string{"Anon Otter"},
	}, editcheckpoint.ReasonIdle)

	rows := versionsOf(t, env.app, item.Id)
	if len(rows) != 1 {
		t.Fatalf("versions = %d, want 1", len(rows))
	}
	v := rows[0]
	if v.GetString("source") != "auto" || v.GetString("created_by") != env.member.Id {
		t.Fatalf("source=%q created_by=%q", v.GetString("source"), v.GetString("created_by"))
	}
	if eds := v.GetStringSlice("editors"); len(eds) != 1 || eds[0] != env.guest.Id {
		t.Fatalf("editors = %v", eds)
	}
	var names []string
	if err := v.UnmarshalJSONField("share_editors", &names); err != nil || len(names) != 1 || names[0] != "Anon Otter" {
		t.Fatalf("share_editors = %v, %v", names, err)
	}
}

func TestCheckpoint_SkipsWhenOverQuota(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))
	turnAutoVersionsOn(t, env.app, item)
	ensureSettingsCollection(t, env.app)
	setSetting(t, env.app, "core", "storage_limit_bytes", 6)

	handleEditCheckpoint(env.app)(context.Background(), item.Id, editcheckpoint.Editors{
		UserIDs: []string{env.member.Id},
	}, editcheckpoint.ReasonIdle)

	if rows := versionsOf(t, env.app, item.Id); len(rows) != 0 {
		t.Fatalf("versions = %d, want 0 while over quota", len(rows))
	}
}

func TestCheckpoint_SkipsWhenFlushRefused(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))
	turnAutoVersionsOn(t, env.app, item)
	realtime.RegisterRoomKindWith("refuse-"+t.Name(), realtime.RoomKindOptions{
		Authorize: func(*core.Record, string) error { return nil },
		ForceFlush: func(id string) error {
			if id == item.Id {
				return realtime.ErrReadOnly
			}
			return nil
		},
	})

	handleEditCheckpoint(env.app)(context.Background(), item.Id, editcheckpoint.Editors{
		UserIDs: []string{env.member.Id},
	}, editcheckpoint.ReasonIdle)

	if rows := versionsOf(t, env.app, item.Id); len(rows) != 0 {
		t.Fatalf("versions = %d, want 0 when the flush is refused", len(rows))
	}
}

func TestCheckpoint_RunsOnSnapshotHook(t *testing.T) {
	env := setupDriveGuestApp(t)
	mime := "application/x-notepad-" + t.Name()
	var called int
	registerFakeHook(t, mime, versionhooks.Hook{
		OnSnapshot: func(core.App, *core.Record, *core.Record) error {
			called++
			return nil
		},
	})
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))
	turnAutoVersionsOn(t, env.app, item)
	item.Set("mime_type", mime)
	if err := env.app.Save(item); err != nil {
		t.Fatal(err)
	}

	handleEditCheckpoint(env.app)(context.Background(), item.Id, editcheckpoint.Editors{
		UserIDs: []string{env.member.Id},
	}, editcheckpoint.ReasonRoomEmpty)

	if called != 1 {
		t.Fatalf("OnSnapshot called %d times, want 1", called)
	}
}

func TestSnapshotOpts_StoresEditors(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))

	v, err := snapshotCurrentFile(env.app, item, snapshotOpts{
		UserID:  env.member.Id,
		Source:  "user",
		Label:   "Saved",
		Editors: editcheckpoint.Editors{UserIDs: []string{env.guest.Id}},
	})
	if err != nil || v == nil {
		t.Fatalf("snapshot: %v", err)
	}
	if eds := v.GetStringSlice("editors"); len(eds) != 1 || eds[0] != env.guest.Id {
		t.Fatalf("editors = %v", eds)
	}
}

// setSetting writes a settings row with a JSON value of its real type.
func setSetting(t *testing.T, app core.App, appName, key string, value any) {
	t.Helper()
	ensureSettingsCollection(t, app)
	col, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		t.Fatal(err)
	}
	rec, err := app.FindFirstRecordByFilter("settings", "app = {:app} && key = {:key}",
		dbx.Params{"app": appName, "key": key})
	if err != nil {
		rec = core.NewRecord(col)
		rec.Set("app", appName)
		rec.Set("key", key)
	}
	rec.Set("value", value)
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}
}

// ensureSettingsCollection adds the core settings table the storage limit
// is read from; the drive test app is built from drive's migrations only.
func ensureSettingsCollection(t *testing.T, app core.App) {
	t.Helper()
	if _, err := app.FindCollectionByNameOrId("settings"); err == nil {
		return
	}
	settings := core.NewBaseCollection("settings")
	// value is JSON, as in core's shipped table: a JSON true reads back as
	// the text "true", a JSON string "true" does not.
	settings.Fields.Add(&core.TextField{Name: "app"}, &core.TextField{Name: "key"}, &core.JSONField{Name: "value"})
	if err := app.Save(settings); err != nil {
		t.Fatalf("create settings collection: %v", err)
	}
}

func TestCheckpoint_SkipsWhenAutoVersionsOff(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))

	handleEditCheckpoint(env.app)(context.Background(), item.Id, editcheckpoint.Editors{
		UserIDs: []string{env.member.Id},
	}, editcheckpoint.ReasonIdle)

	if rows := versionsOf(t, env.app, item.Id); len(rows) != 0 {
		t.Fatalf("versions = %d, want 0 with automatic versions off", len(rows))
	}
}

// turnAutoVersionsOn gives an item its own 'on', so a checkpoint test does not
// depend on the org setting.
func turnAutoVersionsOn(t *testing.T, app core.App, item *core.Record) {
	t.Helper()
	item.Set("auto_versions", "on")
	if err := app.Save(item); err != nil {
		t.Fatal(err)
	}
}
