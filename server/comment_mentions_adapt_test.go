package drive

// The ADAPT half of pb-migrations/1781000000's create-or-adapt.
//
// Since core's 1985000003 owns creating the shared `comment_mentions` table,
// a deployment can run drive-less and install drive LATER — drive's file then
// arrives after core's and must adapt the existing table (add drive_item,
// append drive's createRule branch) instead of colliding on a create. The
// create half is exercised by every other suite in this package, which
// replays ../pb-migrations against an empty database; this one stages core's
// migrations FIRST, the order only the install-drive-later path produces.
//
// Core is the one sibling a feature package may depend on, so reaching into
// ../../tinycld here is allowed — and staging just the mentions files (not
// core's whole directory) mirrors cards' suite: tests.NewTestApp already
// ships a users collection, and replaying all of core collides with it.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tinycld.org/core/rlstest"
)

func coreMentionsDir(t *testing.T) string {
	t.Helper()
	src := rlstest.MigrationsDir(t, "../../tinycld/core/server/pb_migrations")
	dir := t.TempDir()
	for _, name := range []string{
		"1985000002_generalize_comment_mentions_target.js",
		"1985000003_create_comment_mentions_if_absent.js",
	} {
		body, err := os.ReadFile(filepath.Join(src, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), body, 0o644); err != nil {
			t.Fatalf("stage %s: %v", name, err)
		}
	}
	return dir
}

func TestCommentMentionsAdapt_DriveJoinsACoreCreatedTable(t *testing.T) {
	app := rlstest.NewApp(t)

	// Core first — the drive-added-later order.
	rlstest.Apply(t, app, coreMentionsDir(t))

	// Another package's branch is already on the rule; drive must append,
	// not set. Synthetic and parse-safe against core collections alone.
	const priorBranch = `(target_collection = "synthetic_pkg" && @request.auth.id != "")`
	mentions, err := app.FindCollectionByNameOrId("comment_mentions")
	if err != nil {
		t.Fatalf("find core-created comment_mentions: %v", err)
	}
	prior := priorBranch
	mentions.CreateRule = &prior
	if err := app.Save(mentions); err != nil {
		t.Fatalf("plant prior branch: %v", err)
	}

	// Drive arrives. Its create-or-adapt must take the adapt path.
	rlstest.Apply(t, app, rlstest.MigrationsDir(t, "../pb-migrations"))

	mentions, err = app.FindCollectionByNameOrId("comment_mentions")
	if err != nil {
		t.Fatalf("re-find comment_mentions: %v", err)
	}

	di := mentions.Fields.GetByName("drive_item")
	if di == nil {
		t.Fatal("adapt did not add drive_item — drive's own inserts would break")
	}
	if r, ok := di.(interface{ IsRequired() bool }); ok && r.IsRequired() {
		// Required would reject every other package's rows, which carry no
		// drive item — the same end state 1985000002 leaves on a
		// drive-first deployment.
		t.Error("adapt added drive_item as required")
	}

	if mentions.CreateRule == nil {
		t.Fatal("createRule is nil — the table would be superuser-only")
	}
	rule := *mentions.CreateRule
	for _, want := range []string{
		`target_collection = "synthetic_pkg"`, // the pre-existing branch
		"drive_shares_via_item",               // drive's branch
	} {
		if !strings.Contains(rule, want) {
			t.Errorf("createRule lost %q.\nrule = %s", want, rule)
		}
	}
}
