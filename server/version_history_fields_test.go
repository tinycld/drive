package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func TestVersionFields_AutoSourceWithEditors(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("x"))

	col, err := env.app.FindCollectionByNameOrId("drive_item_versions")
	if err != nil {
		t.Fatal(err)
	}
	f, err := filesystem.NewFileFromBytes([]byte("x"), "a.txt")
	if err != nil {
		t.Fatal(err)
	}
	v := core.NewRecord(col)
	v.Set("item", item.Id)
	v.Set("version_number", 1)
	v.Set("file", f)
	v.Set("source", "auto")
	v.Set("created_by", env.member.Id)
	v.Set("editors", []string{env.member.Id, env.guest.Id})
	v.Set("share_editors", []string{"Anon Otter"})
	if err := env.app.Save(v); err != nil {
		t.Fatalf("save auto version: %v", err)
	}

	got, err := env.app.FindRecordById("drive_item_versions", v.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.GetStringSlice("editors")) != 2 {
		t.Fatalf("editors = %v", got.GetStringSlice("editors"))
	}
	var names []string
	if err := got.UnmarshalJSONField("share_editors", &names); err != nil || len(names) != 1 {
		t.Fatalf("share_editors = %v, %v", names, err)
	}
}
