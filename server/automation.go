package drive

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/automation"
	"tinycld.org/core/driveshare"
)

// registerAutomation installs drive's owner resolver and the move-to-folder
// destination authorizer. Called from registerShared before hooks load.
func registerAutomation() {
	automation.RegisterOwnerResolver("drive:file-added", fileAddedOwnerResolver)
	automation.RegisterRelationAuthorizer("drive:move-to-folder", "parent", moveDestinationAuthorizer)
}

// moveDestinationAuthorizer answers the which-record question for
// drive:move-to-folder's `parent` param: the destination must be a folder the
// RULE OWNER can write into.
//
// The engine's floor has already proven the owner can VIEW the destination,
// which is not enough: a viewer-role share makes a folder visible but not
// writable, and the engine's superuser Save would otherwise file records into
// it anyway (the calendar rollout shipped exactly this bug shape — rule
// events created on a calendar their owner could only view).
// driveshare.CheckWrite is the same authority every interactive move goes
// through; a local copy of the role rules would drift from it.
//
// The folder-cycle backstop is NOT re-checked here — the OnRecordUpdate hook
// on drive_items fires for engine writes too and stays authoritative.
func moveDestinationAuthorizer(app core.App, req automation.ActionRequest, destID string) error {
	dest, err := app.FindRecordById("drive_items", destID)
	if err != nil {
		return fmt.Errorf("destination folder %s: %w", destID, err)
	}
	if !dest.GetBool("is_folder") {
		return fmt.Errorf("destination %s is a file, not a folder", destID)
	}
	return driveshare.CheckWrite(app, req.OwnerID, destID)
}

// fileAddedOwnerResolver maps a new drive_items row to the users a file
// landing there belongs to: everyone who can reach the folder it landed in.
//
// drive_items.created_by is a relation to users, so ownerField alone would
// scope a personal rule to whoever uploaded the file — firing "when I add a
// file" rather than the rule people actually want, "when someone adds a file
// to my folder". On a shared folder that is the difference between a rule that
// works and one that never fires: the owner is precisely the person who did
// NOT do the uploading.
//
// This mirrors what calc and text already do for comment-added, and for the
// same reason. Those packages resolve participants of the item a comment is
// ON; drive resolves participants of the PARENT, because the triggering row is
// the new item itself and a brand-new file's own share list is empty — who
// should hear about it is who can see where it went.
//
// A root-level file (no parent) falls back to its creator. There is no folder
// to derive an audience from, and the creator is the only user with a claim to
// it, which is also what the previous ownerField-only behavior did.
//
// Participants come from core (driveshare.ParticipantIDs) rather than being
// derived here — the creator/share/suspension rules that decide who can open
// an item are drive's own authorization code, and an owner resolver that
// over-reports fires OTHER users' personal rules on an item they cannot see.
//
// Returns nil (never an error) on absent or malformed data so org-scoped rules
// still fire when no personal owner can be determined.
func fileAddedOwnerResolver(app core.App, record *core.Record) []string {
	if record == nil {
		return nil
	}
	parentID := record.GetString("parent")
	if parentID == "" {
		if creator := record.GetString("created_by"); creator != "" {
			return []string{creator}
		}
		return nil
	}
	return driveshare.ParticipantIDs(app, parentID)
}
