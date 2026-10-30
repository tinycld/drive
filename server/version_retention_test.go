package drive

import (
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

var pruneNow = time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)

func daysAgo(d float64) time.Time {
	return pruneNow.Add(-time.Duration(d * float64(24*time.Hour)))
}

func row(id, source string, created time.Time, editors ...string) versionRow {
	return versionRow{ID: id, Source: source, Created: created, Editors: editors}
}

func sortedIDs(ids []string) []string {
	out := append([]string(nil), ids...)
	sort.Strings(out)
	return out
}

func TestPrune_KeepsAllAutoUnder7Days(t *testing.T) {
	rows := []versionRow{
		row("a", "auto", daysAgo(0.1)),
		row("b", "auto", daysAgo(0.2)),
		row("c", "auto", daysAgo(6.9)),
	}
	deleted, _ := planPrune(rows, pruneNow)
	if len(deleted) != 0 {
		t.Fatalf("deleted = %v, want none", deleted)
	}
}

func TestPrune_KeepsNewestPerDayFrom7To90(t *testing.T) {
	day := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	rows := []versionRow{
		row("new", "auto", day.Add(18*time.Hour)),
		row("mid", "auto", day.Add(12*time.Hour)),
		row("old", "auto", day.Add(6*time.Hour)),
		row("other-day", "auto", day.Add(-6*time.Hour)),
	}
	deleted, _ := planPrune(rows, pruneNow)
	if got := sortedIDs(deleted); !reflect.DeepEqual(got, []string{"mid", "old"}) {
		t.Fatalf("deleted = %v, want [mid old]", got)
	}
}

func TestPrune_KeepsNewestPerWeekOver90(t *testing.T) {
	// 2026-06-29 is a Monday; Thursday of the same ISO week is 2026-07-02.
	monday := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	thursday := time.Date(2026, 7, 2, 10, 0, 0, 0, time.UTC)
	rows := []versionRow{
		row("thu", "auto", thursday),
		row("mon", "auto", monday),
	}
	deleted, _ := planPrune(rows, pruneNow)
	if !reflect.DeepEqual(deleted, []string{"mon"}) {
		t.Fatalf("deleted = %v, want [mon]", deleted)
	}
}

func TestPrune_NeverDeletesLabeledUploadOrUser(t *testing.T) {
	labeled := row("labeled", "auto", daysAgo(200))
	labeled.Label = "Approved"
	rows := []versionRow{
		row("auto-keep", "auto", daysAgo(199)),
		labeled,
		row("upload", "upload", daysAgo(400)),
		row("user", "user", daysAgo(400)),
	}
	deleted, _ := planPrune(rows, pruneNow)
	if len(deleted) != 0 {
		t.Fatalf("deleted = %v, want none", deleted)
	}
}

func TestPrune_DeletesSystemAfter30Days(t *testing.T) {
	rows := []versionRow{
		row("sys-new", "system", daysAgo(29)),
		row("sys-old", "system", daysAgo(31)),
	}
	deleted, _ := planPrune(rows, pruneNow)
	if !reflect.DeepEqual(deleted, []string{"sys-old"}) {
		t.Fatalf("deleted = %v, want [sys-old]", deleted)
	}
}

func TestPrune_MergesEditorsIntoNextNewerSurvivor(t *testing.T) {
	day := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	rows := []versionRow{
		row("saved", "user", day.Add(30*time.Hour), "carol"),
		row("keep", "auto", day.Add(20*time.Hour), "alice"),
		row("drop", "auto", day.Add(10*time.Hour), "bob", "alice"),
	}
	rows[2].ShareEditors = []string{"Anon Otter"}
	deleted, merges := planPrune(rows, pruneNow)
	if !reflect.DeepEqual(deleted, []string{"drop"}) {
		t.Fatalf("deleted = %v", deleted)
	}
	want := map[string]editorMerge{"keep": {Editors: []string{"alice", "bob"}, ShareEditors: []string{"Anon Otter"}}}
	if !reflect.DeepEqual(merges, want) {
		t.Fatalf("merges = %+v, want %+v", merges, want)
	}
}

// Editors go to the nearest newer survivor, never to an older one or to a
// hidden system row.
func TestPrune_MergesIntoNearestNewerSurvivorOnly(t *testing.T) {
	day := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	rows := []versionRow{
		row("sys", "system", day.Add(40*time.Hour)),
		row("keep", "auto", day.Add(20*time.Hour), "alice"),
		row("drop", "auto", day.Add(10*time.Hour), "bob"),
		row("older", "upload", day.Add(-48*time.Hour), "dave"),
	}
	_, merges := planPrune(rows, pruneNow)
	want := map[string]editorMerge{"keep": {Editors: []string{"alice", "bob"}}}
	if !reflect.DeepEqual(merges, want) {
		t.Fatalf("merges = %+v, want %+v", merges, want)
	}
}

func setCreated(t *testing.T, app core.App, rec *core.Record, at time.Time) {
	t.Helper()
	dt, err := types.ParseDateTime(at)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.DB().NewQuery("UPDATE drive_item_versions SET created = {:c} WHERE id = {:id}").
		Bind(map[string]any{"c": dt.String(), "id": rec.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
}

func TestPruneVersions_DeletesRowsAndMergesInDB(t *testing.T) {
	env := setupDriveGuestApp(t)
	item := seedFileItem(t, env.app, env.member, "a.txt", []byte("hello"))
	day := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)

	drop, err := snapshotCurrentFile(env.app, item, snapshotOpts{UserID: env.member.Id, Source: "auto"})
	if err != nil {
		t.Fatal(err)
	}
	drop.Set("editors", []string{env.guest.Id})
	if err := env.app.Save(drop); err != nil {
		t.Fatal(err)
	}
	keep, err := snapshotCurrentFile(env.app, item, snapshotOpts{UserID: env.member.Id, Source: "auto"})
	if err != nil {
		t.Fatal(err)
	}
	setCreated(t, env.app, drop, day.Add(10*time.Hour))
	setCreated(t, env.app, keep, day.Add(20*time.Hour))

	if err := pruneVersions(env.app, pruneNow); err != nil {
		t.Fatal(err)
	}

	if _, err := env.app.FindRecordById("drive_item_versions", drop.Id); err == nil {
		t.Fatal("pruned version still exists")
	}
	kept, err := env.app.FindRecordById("drive_item_versions", keep.Id)
	if err != nil {
		t.Fatal(err)
	}
	if eds := kept.GetStringSlice("editors"); !reflect.DeepEqual(eds, []string{env.guest.Id}) {
		t.Fatalf("kept editors = %v", eds)
	}
}
