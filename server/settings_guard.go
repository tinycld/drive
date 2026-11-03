package drive

import "github.com/pocketbase/pocketbase/core"

// guardDriveSettings lets only owners and admins write drive's own rows in
// core's settings table. The table's rules let any member write; settings
// panels are admin-only in the UI only. A write that moves a row into or out
// of drive's rows counts as a write to them.
func guardDriveSettings(e *core.RecordRequestEvent) error {
	touchesDrive := e.Record.GetString("app") == driveSettingsApp
	if orig := e.Record.Original(); orig != nil && orig.GetString("app") == driveSettingsApp {
		touchesDrive = true
	}
	if !touchesDrive || e.HasSuperuserAuth() {
		return e.Next()
	}
	if e.Auth != nil {
		switch e.Auth.GetString("role") {
		case "owner", "admin":
			return e.Next()
		}
	}
	return e.ForbiddenError("only an owner or admin can change Drive settings", nil)
}
