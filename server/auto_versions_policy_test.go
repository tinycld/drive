package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func setDriveSetting(t *testing.T, app *tests.TestApp, value string) {
	t.Helper()
	ensureSettingsCollection(t, app)
	col, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		t.Fatal(err)
	}
	rec, err := app.FindFirstRecordByFilter("settings", "app = 'drive' && key = 'auto_versions_default'")
	if err != nil {
		rec = core.NewRecord(col)
		rec.Set("app", "drive")
		rec.Set("key", "auto_versions_default")
	}
	rec.Set("value", value)
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}
}

func TestAutoVersionsOn(t *testing.T) {
	cases := []struct {
		name   string
		org    string // "" = no settings row
		item   string
		wantOn bool
	}{
		{"default off, item empty", "", "", false},
		{"org off, item on", "false", "on", true},
		{"org on, item off", "true", "off", false},
		{"org on, item empty", "true", "", true},
		{"org value not 'true' means off", "1", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := setupDriveGuestApp(t)
			ensureSettingsCollection(t, env.app)
			if c.org != "" {
				setDriveSetting(t, env.app, c.org)
			}
			item := seedFileItem(t, env.app, env.member, "a.txt", []byte("x"))
			item.Set("auto_versions", c.item)
			if err := env.app.Save(item); err != nil {
				t.Fatal(err)
			}
			if got := autoVersionsOn(env.app, item); got != c.wantOn {
				t.Fatalf("autoVersionsOn = %v, want %v", got, c.wantOn)
			}
		})
	}
}

// Read on every call: a change applies to the next checkpoint of a document
// that is already open.
func TestAutoVersionsOn_ReadsTheSettingFresh(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("x"))
	setDriveSetting(t, env.app, "true")
	if !autoVersionsOn(env.app, item) {
		t.Fatal("want on")
	}
	setDriveSetting(t, env.app, "false")
	if autoVersionsOn(env.app, item) {
		t.Fatal("want off after the change")
	}
}
