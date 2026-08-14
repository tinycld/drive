package drive

import (
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"tinycld.org/core/rlstest"
)

// automation_test.go pins drive's owner resolver: a file added to a shared
// folder belongs to everyone who can reach that FOLDER, not just whoever
// uploaded it.
//
// Built on the real migrations rather than hand-declared collections, because
// the resolver's answer is only correct relative to drive's actual
// creator/share schema — the same reason calc and text build theirs this way.

type fileAddedEnv struct {
	app      *tests.TestApp
	owner    *core.Record
	sharee   *core.Record
	outsider *core.Record
	folder   *core.Record
}

func setupFileAddedApp(t *testing.T) *fileAddedEnv {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	// driveshare reads users.disabled; core's users schema isn't carried by
	// this module, so the column has to exist before the resolver runs.
	users.Fields.Add(&core.BoolField{Name: "disabled"})
	if err := app.Save(users); err != nil {
		t.Fatalf("add users.disabled: %v", err)
	}

	rlstest.Apply(t, app, rlstest.MigrationsDir(t, "../pb-migrations"))

	owner := fileAddedUser(t, app, "owner@test.local")
	sharee := fileAddedUser(t, app, "sharee@test.local")
	outsider := fileAddedUser(t, app, "outsider@test.local")

	items, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	folder := core.NewRecord(items)
	folder.Set("name", "Team")
	folder.Set("is_folder", true)
	folder.Set("created_by", owner.Id)
	if err := app.Save(folder); err != nil {
		t.Fatal(err)
	}

	shares, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		t.Fatal(err)
	}
	share := core.NewRecord(shares)
	share.Set("item", folder.Id)
	share.Set("user", sharee.Id)
	share.Set("role", "editor")
	share.Set("created_by", owner.Id)
	if err := app.Save(share); err != nil {
		t.Fatal(err)
	}

	return &fileAddedEnv{app: app, owner: owner, sharee: sharee, outsider: outsider, folder: folder}
}

func fileAddedUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	u := core.NewRecord(col)
	u.SetEmail(email)
	// Set explicitly rather than left for PocketBase to fill, which uses
	// "users" + a random 5-digit suffix and collides across a suite run.
	// Sanitized because the username field rejects @ and . as invalid format.
	u.Set("username", "u_"+strings.NewReplacer("@", "_", ".", "_").Replace(email))
	u.Set("name", "Test")
	u.SetVerified(true)
	u.SetPassword("Password123!")
	if err := app.Save(u); err != nil {
		t.Fatal(err)
	}
	return u
}

// newFile returns an UNSAVED drive_items record — the resolver runs against
// the record the create hook carries, and saving it is not needed to resolve.
func (e *fileAddedEnv) newFile(parentID, creatorID string) *core.Record {
	items, _ := e.app.FindCollectionByNameOrId("drive_items")
	rec := core.NewRecord(items)
	rec.Set("name", "report.pdf")
	rec.Set("parent", parentID)
	rec.Set("created_by", creatorID)
	return rec
}

// The point of the resolver. A colleague drops a file in the owner's shared
// folder; without this the owner's personal rule never fires, because
// created_by is the colleague.
func TestFileAddedOwnerResolver_ResolvesFolderParticipants(t *testing.T) {
	env := setupFileAddedApp(t)

	owners := fileAddedOwnerResolver(env.app, env.newFile(env.folder.Id, env.sharee.Id))

	if !slices.Contains(owners, env.owner.Id) {
		t.Errorf("folder owner %s missing from %v — their rule would never fire", env.owner.Id, owners)
	}
	if !slices.Contains(owners, env.sharee.Id) {
		t.Errorf("sharee %s missing from %v", env.sharee.Id, owners)
	}
}

// An owner resolver that over-reports fires OTHER users' personal rules on an
// item they cannot see.
func TestFileAddedOwnerResolver_ExcludesNonParticipants(t *testing.T) {
	env := setupFileAddedApp(t)

	owners := fileAddedOwnerResolver(env.app, env.newFile(env.folder.Id, env.owner.Id))

	if slices.Contains(owners, env.outsider.Id) {
		t.Errorf("outsider %s must not be in %v", env.outsider.Id, owners)
	}
}

// A root-level file has no folder to derive an audience from, so it falls back
// to its creator — what the ownerField-only behavior did.
func TestFileAddedOwnerResolver_RootFileFallsBackToCreator(t *testing.T) {
	env := setupFileAddedApp(t)

	owners := fileAddedOwnerResolver(env.app, env.newFile("", env.owner.Id))

	if len(owners) != 1 || owners[0] != env.owner.Id {
		t.Errorf("owners = %v, want just the creator %s", owners, env.owner.Id)
	}
}

// Malformed data resolves nil rather than erroring, so org-scoped rules keep
// firing when no personal owner can be determined — the contract mail
// documents and every package's resolver follows.
func TestFileAddedOwnerResolver_MalformedRecordsResolveNil(t *testing.T) {
	env := setupFileAddedApp(t)

	if got := fileAddedOwnerResolver(env.app, nil); got != nil {
		t.Errorf("nil record resolved %v, want nil", got)
	}
	if got := fileAddedOwnerResolver(env.app, env.newFile("", "")); got != nil {
		t.Errorf("record with no parent and no creator resolved %v, want nil", got)
	}
	if got := fileAddedOwnerResolver(env.app, env.newFile("nonexistent_folder", "")); len(got) != 0 {
		t.Errorf("record naming an absent parent resolved %v, want empty", got)
	}
}
