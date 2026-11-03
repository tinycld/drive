package drive

import "github.com/pocketbase/pocketbase/core"

const (
	driveSettingsApp = "drive"
	autoVersionsKey  = "auto_versions_default"
)

// autoVersionsOn decides whether a document gets automatic versions: its own
// choice ('on'/'off') if it has one, else the org setting, which is off
// unless its value is exactly "true". Read on every call, so a change applies
// to the next checkpoint.
func autoVersionsOn(app core.App, item *core.Record) bool {
	switch item.GetString("auto_versions") {
	case "on":
		return true
	case "off":
		return false
	}
	var row struct {
		Value string `db:"value"`
	}
	err := app.DB().NewQuery(
		"SELECT value FROM settings WHERE app = {:app} AND key = {:key} LIMIT 1",
	).Bind(map[string]any{"app": driveSettingsApp, "key": autoVersionsKey}).One(&row)
	return err == nil && row.Value == "true"
}
