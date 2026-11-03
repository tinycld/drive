package drive

import (
	"testing"
)

func TestAutoVersionsOn(t *testing.T) {
	cases := []struct {
		name   string
		org    any // nil = no settings row; JSON value otherwise
		item   string
		wantOn bool
	}{
		{"default off, item empty", nil, "", false},
		{"org off, item on", false, "on", true},
		{"org on, item off", true, "off", false},
		{"org on, item empty", true, "", true},
		{"a number is not on", 1, "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := setupDriveGuestApp(t)
			ensureSettingsCollection(t, env.app)
			if c.org != nil {
				setSetting(t, env.app, "drive", "auto_versions_default", c.org)
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
	setSetting(t, env.app, "drive", "auto_versions_default", true)
	if !autoVersionsOn(env.app, item) {
		t.Fatal("want on")
	}
	setSetting(t, env.app, "drive", "auto_versions_default", false)
	if autoVersionsOn(env.app, item) {
		t.Fatal("want off after the change")
	}
}
