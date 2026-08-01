package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/driveshare"
)

// The predicates themselves live in core/driveshare and are unit-tested
// there against synthetic collections. These tests run them against
// drive's REAL migrated schema, so they catch a drift between the shipped
// migration and the shape core expects (field names, relation targets)
// that a synthetic fixture cannot.

// TestCheckReadPermission encodes the drive_items view rule (currently
// restated by migration 1782100000) that every Go path bypassing
// PocketBase's rule engine must
// honor: the item's creator and drive_shares holders may read, any other
// authenticated user may NOT. The deny case is the regression guard for
// the WebDAV cross-user read hole — merely being a member of the
// deployment must never be enough to read another user's files.
func TestCheckReadPermission(t *testing.T) {
	env := setupOTPApp(t, "viewer")

	grantee := otpTestUser(t, env.app, "grantee@test.local", "member")
	other := otpTestUser(t, env.app, "other@test.local", "member")

	sharesCol, err := env.app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	share := core.NewRecord(sharesCol)
	share.Set("item", env.item.Id)
	share.Set("user", grantee.Id)
	share.Set("role", "viewer")
	share.Set("created_by", env.ownerUser.Id)
	if err := env.app.Save(share); err != nil {
		t.Fatalf("save share: %v", err)
	}

	// setupOTPApp creates the item without an owner drive_shares row, so
	// this passes only via the created_by branch.
	if err := driveshare.CheckReadItem(env.app, env.ownerUser.Id, env.item); err != nil {
		t.Errorf("creator: got %v, want nil", err)
	}

	if err := driveshare.CheckReadItem(env.app, grantee.Id, env.item); err != nil {
		t.Errorf("share grantee: got %v, want nil", err)
	}

	if err := driveshare.CheckReadItem(env.app, other.Id, env.item); err == nil {
		t.Error("member without share: got nil, want permission error")
	}
}

// TestCheckWriteAndDeletePermission pins the role ladder the WebDAV and
// custom-endpoint paths enforce by hand: viewer may not write, editor
// may write but not delete, owner may do both. The item's creator may do
// both without any drive_shares row — the `created_by ?= @request.auth.id`
// disjunct that the drive_items update and delete rules carry, and that
// the REST API has always honored.
func TestCheckWriteAndDeletePermission(t *testing.T) {
	env := setupOTPApp(t, "viewer")

	sharesCol, err := env.app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	grant := func(email, role string) string {
		t.Helper()
		u := otpTestUser(t, env.app, email, "member")
		share := core.NewRecord(sharesCol)
		share.Set("item", env.item.Id)
		share.Set("user", u.Id)
		share.Set("role", role)
		share.Set("created_by", env.ownerUser.Id)
		if err := env.app.Save(share); err != nil {
			t.Fatalf("save %s share: %v", role, err)
		}
		return u.Id
	}

	viewerID := grant("viewer@test.local", "viewer")
	editorID := grant("editor@test.local", "editor")
	ownerID := grant("shareowner@test.local", "owner")
	unsharedID := otpTestUser(t, env.app, "unshared@test.local", "member").Id

	cases := []struct {
		label              string
		userID             string
		wantWrite, wantDel bool
	}{
		{"viewer", viewerID, false, false},
		{"editor", editorID, true, false},
		{"owner", ownerID, true, true},
		{"no share", unsharedID, false, false},
		// setupOTPApp creates the item with no owner share row, so this
		// case passes only via the created_by branch.
		{"creator (no share row)", env.ownerUser.Id, true, true},
	}

	for _, tc := range cases {
		t.Run(tc.label, func(t *testing.T) {
			gotWrite := driveshare.CheckWrite(env.app, tc.userID, env.item.Id) == nil
			if gotWrite != tc.wantWrite {
				t.Errorf("CheckWrite allowed=%v, want %v", gotWrite, tc.wantWrite)
			}
			gotDel := driveshare.CheckDelete(env.app, tc.userID, env.item.Id) == nil
			if gotDel != tc.wantDel {
				t.Errorf("CheckDelete allowed=%v, want %v", gotDel, tc.wantDel)
			}
		})
	}
}

// TestCreateOwnerShare proves the hook-side grant lands as an owner
// drive_shares row for the creating user — the row every later
// write/delete check depends on.
func TestCreateOwnerShare(t *testing.T) {
	env := setupOTPApp(t, "viewer")

	if err := createOwnerShare(env.app, env.item.Id, env.ownerUser.Id); err != nil {
		t.Fatalf("createOwnerShare: %v", err)
	}

	rec, err := env.app.FindFirstRecordByFilter("drive_shares",
		"item = {:i} && user = {:u}",
		map[string]any{"i": env.item.Id, "u": env.ownerUser.Id})
	if err != nil {
		t.Fatalf("owner share not found: %v", err)
	}
	if got := rec.GetString("role"); got != "owner" {
		t.Errorf("role = %q, want owner", got)
	}
	if err := driveshare.CheckDelete(env.app, env.ownerUser.Id, env.item.Id); err != nil {
		t.Errorf("owner share should grant delete: %v", err)
	}
}
