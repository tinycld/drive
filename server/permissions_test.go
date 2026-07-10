package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// TestCheckReadPermission encodes the drive_items view rule (migration
// 1716200001) that every Go path bypassing PocketBase's rule engine must
// honor: the item's creator and drive_shares holders may read, any other
// org member may NOT. The deny case is the regression guard for the
// WebDAV cross-tenant read hole — org membership alone used to be enough
// to read every file in the org over /drive/<orgSlug>/.
func TestCheckReadPermission(t *testing.T) {
	env := setupOTPApp(t, "viewer")

	grantee := otpTestUser(t, env.app, "grantee@test.local")
	granteeUO := otpTestMembership(t, env.app, grantee, env.org, "member")

	other := otpTestUser(t, env.app, "other@test.local")
	otherUO := otpTestMembership(t, env.app, other, env.org, "member")

	sharesCol, err := env.app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	share := core.NewRecord(sharesCol)
	share.Set("item", env.item.Id)
	share.Set("user_org", granteeUO.Id)
	share.Set("role", "viewer")
	share.Set("created_by", env.ownerUO.Id)
	if err := env.app.Save(share); err != nil {
		t.Fatalf("save share: %v", err)
	}

	// setupOTPApp creates the item without an owner drive_shares row, so
	// this passes only via the created_by branch.
	if err := checkReadPermission(env.app, env.ownerUO.Id, env.item); err != nil {
		t.Errorf("creator: got %v, want nil", err)
	}

	if err := checkReadPermission(env.app, granteeUO.Id, env.item); err != nil {
		t.Errorf("share grantee: got %v, want nil", err)
	}

	if err := checkReadPermission(env.app, otherUO.Id, env.item); err == nil {
		t.Error("org member without share: got nil, want permission error")
	}
}
