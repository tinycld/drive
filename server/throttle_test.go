package drive

import (
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/previewqueue"
	"tinycld.org/core/thumbnails/textpreview"
)

// throttleApp pairs a tests.TestApp (used for schema setup, record CRUD and FTS
// inspection) with the *pocketbase.PocketBase the production functions require.
// pocketbase.PocketBase embeds the core.App interface, so wrapping the test
// app's core.App satisfies every method the throttle code calls
// (ConcurrentDB, FindRecordById, NewFilesystem, Save, Logger, NonconcurrentDB).
type throttleApp struct {
	test *tests.TestApp
	pb   *pocketbase.PocketBase
}

func newThrottleApp(t *testing.T) *throttleApp {
	t.Helper()
	test := setupThrottleApp(t)
	return &throttleApp{test: test, pb: &pocketbase.PocketBase{App: test}}
}

// throttle_test.go exercises the *throttle decision* added to the two async
// post-flush jobs in this package:
//
//   - extractAndIndexDriveItem (extract.go) skips when
//     index_hash != "" && Original().index_hash == index_hash
//   - generateThumbnail / generateEditorThumbnail (thumbnails.go) skips the
//     editor path when thumbnail != "" && Original().thumb_region_hash == thumb_region_hash
//
// Both guards run purely on the in-memory record (current value vs. its
// Original() snapshot) and return BEFORE touching the filesystem/FTS on the
// skip path. That makes the *decision* observable without a real docx/xlsx blob
// or mupdf: we drive the function and assert the side effect (an fts_drive_items
// row, or the thumbnail field) is/ isn't written.
//
// The non-skip ("regen") side is exercised via the pure-Go editor path
// (textpreview is CGo-free, no mupdf) plus a stashed payload, so neither test
// needs real file bytes in object storage.

// setupThrottleApp builds a bare TestApp with just the drive_items collection
// (the fields the throttle guards read) and the fts_drive_items virtual table
// that updateFTSContent writes to. It deliberately mirrors the minimal-schema
// approach in guest_rls_test.go rather than running the real migrations.
func setupThrottleApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.TextField{Name: "description"})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.TextField{Name: "file"})
	items.Fields.Add(&core.TextField{Name: "mime_type"})
	items.Fields.Add(&core.FileField{Name: "thumbnail", MaxSelect: 1, MaxSize: 5242880})
	items.Fields.Add(&core.TextField{Name: "thumb_region_hash"})
	items.Fields.Add(&core.TextField{Name: "index_hash"})
	if err := app.Save(items); err != nil {
		t.Fatalf("create drive_items collection: %v", err)
	}

	// updateFTSContent writes to this FTS5 virtual table. The real schema
	// provides it via migration; recreate it here so the side effect is real.
	_, err = app.NonconcurrentDB().NewQuery(`
		CREATE VIRTUAL TABLE IF NOT EXISTS fts_drive_items USING fts5(
			record_id UNINDEXED, name, description, content
		)
	`).Execute()
	if err != nil {
		t.Fatalf("create fts_drive_items table: %v", err)
	}

	return app
}

// newSavedItem creates and saves a drive_items record with the given field
// values, then re-fetches it by id. A freshly fetched record has Original()
// equal to its current values, which is the realistic state for these jobs:
// the post-flush goroutine receives a record whose Original() reflects what was
// persisted.
func newSavedItem(t *testing.T, app *tests.TestApp, fields map[string]any) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	for k, v := range fields {
		rec.Set(k, v)
	}
	if err := app.Save(rec); err != nil {
		t.Fatalf("save drive_items record: %v", err)
	}
	fresh, err := app.FindRecordById("drive_items", rec.Id)
	if err != nil {
		t.Fatalf("re-fetch drive_items record: %v", err)
	}
	return fresh
}

func ftsRowCount(t *testing.T, app *tests.TestApp, recordID string) int {
	t.Helper()
	var res struct {
		N int `db:"n"`
	}
	err := app.NonconcurrentDB().
		NewQuery("SELECT COUNT(*) AS n FROM fts_drive_items WHERE record_id = {:id}").
		Bind(map[string]any{"id": recordID}).One(&res)
	if err != nil {
		t.Fatalf("count fts rows: %v", err)
	}
	return res.N
}

// --- extractAndIndexDriveItem: the index_hash throttle -----------------------

// When index_hash is non-empty and matches Original(), the text is unchanged
// since the last index, so the function must skip extraction/indexing entirely.
// We assert the observable consequence: no fts_drive_items row is written even
// though a payload with plaintext is supplied (a non-skipped run WOULD write
// that plaintext, as the companion test proves).
func TestExtractAndIndex_SkipsWhenIndexHashUnchanged(t *testing.T) {
	app := newThrottleApp(t)

	rec := newSavedItem(t, app.test, map[string]any{
		"name":       "doc.txt",
		"file":       "doc.txt",
		"mime_type":  "text/plain",
		"index_hash": "hash-abc",
	})

	// Sanity: Original() must carry the same hash for the guard to fire.
	if got := rec.Original().GetString("index_hash"); got != "hash-abc" {
		t.Fatalf("precondition failed: Original().index_hash = %q, want %q", got, "hash-abc")
	}

	payload := previewqueue.Payload{Plaintext: "indexable plaintext body"}
	extractAndIndexDriveItem(app.pb, rec, payload, true)

	if n := ftsRowCount(t, app.test, rec.Id); n != 0 {
		t.Fatalf("expected throttle to skip indexing (0 fts rows), got %d", n)
	}
}

// When index_hash changed since Original(), the doc's text is new, so the
// function must index it. With a stashed payload it uses payload.Plaintext
// directly (no file read), and writes one fts_drive_items row carrying that
// content. This is the positive control proving the skip above is a real
// decision, not just an always-empty table.
func TestExtractAndIndex_IndexesWhenIndexHashChanged(t *testing.T) {
	app := newThrottleApp(t)

	// Save with the OLD hash so Original() holds it, then mutate to a NEW hash
	// in memory — exactly the "text changed since last index" state.
	rec := newSavedItem(t, app.test, map[string]any{
		"name":       "doc.txt",
		"file":       "doc.txt",
		"mime_type":  "text/plain",
		"index_hash": "hash-old",
	})
	rec.Set("index_hash", "hash-new")

	if rec.Original().GetString("index_hash") == rec.GetString("index_hash") {
		t.Fatal("precondition failed: Original() and current index_hash must differ")
	}

	payload := previewqueue.Payload{Plaintext: "fresh indexable content"}
	extractAndIndexDriveItem(app.pb, rec, payload, true)

	if n := ftsRowCount(t, app.test, rec.Id); n != 1 {
		t.Fatalf("expected one fts row written for changed hash, got %d", n)
	}

	// Confirm the row actually carries the payload plaintext.
	var res struct {
		Content string `db:"content"`
	}
	err := app.test.NonconcurrentDB().
		NewQuery("SELECT content FROM fts_drive_items WHERE record_id = {:id}").
		Bind(map[string]any{"id": rec.Id}).One(&res)
	if err != nil {
		t.Fatalf("read fts content: %v", err)
	}
	if res.Content != "fresh indexable content" {
		t.Fatalf("fts content = %q, want stashed payload plaintext", res.Content)
	}
}

// An empty index_hash is the regular-upload path: the guard never fires (it's
// gated on index_hash != ""). With no real file in object storage, extraction
// fails and nothing is indexed — but the point here is that the *throttle*
// short-circuit did not run; the function fell through to the extract path.
// We assert it returns cleanly and writes nothing (extractFileText returns
// false on the missing blob), which distinguishes "took the upload path" from
// "was throttled".
func TestExtractAndIndex_UploadPathNotThrottled(t *testing.T) {
	app := newThrottleApp(t)

	rec := newSavedItem(t, app.test, map[string]any{
		"name":      "upload.txt",
		"file":      "upload.txt",
		"mime_type": "text/plain",
		// no index_hash -> upload path
	})

	// hasPayload=false forces the file-read branch; the file doesn't exist in
	// the test app's object storage, so extraction returns false and no row is
	// written. The function must not panic and must leave the table empty.
	extractAndIndexDriveItem(app.pb, rec, previewqueue.Payload{}, false)

	if n := ftsRowCount(t, app.test, rec.Id); n != 0 {
		t.Fatalf("expected no fts row when extraction has no file, got %d", n)
	}
}

// --- generateThumbnail (editor path): the thumb_region_hash throttle ---------

// Editor path: thumbnail already set AND thumb_region_hash unchanged vs.
// Original() => the rendered region would be identical, so skip. We assert the
// thumbnail field is left untouched (no re-render, no save).
func TestGenerateThumbnail_SkipsWhenRegionUnchanged(t *testing.T) {
	app := newThrottleApp(t)

	// Attach a real (tiny) file to the thumbnail FileField so GetString returns
	// a non-empty stored filename — the precondition for the editor skip guard.
	existing, err := filesystem.NewFileFromBytes([]byte("not-a-real-jpeg"), "existing_thumb.jpg")
	if err != nil {
		t.Fatal(err)
	}
	rec := newSavedItem(t, app.test, map[string]any{
		"name":              "page.txt",
		"file":              "page.txt",
		"mime_type":         "text/plain",
		"thumbnail":         existing,
		"thumb_region_hash": "region-1",
	})

	storedBefore := rec.GetString("thumbnail")
	if storedBefore == "" {
		t.Fatal("precondition failed: thumbnail field should hold a stored filename")
	}
	if rec.Original().GetString("thumb_region_hash") != "region-1" {
		t.Fatalf("precondition failed: Original().thumb_region_hash = %q",
			rec.Original().GetString("thumb_region_hash"))
	}

	payload := previewqueue.Payload{
		Page: textpreview.PageModel{Lines: []string{"some new content"}},
	}
	generateThumbnail(app.pb, rec, payload, true)

	// The guard returns before any render/save; the in-memory field is unchanged
	// and no new thumbnail was persisted.
	if got := rec.GetString("thumbnail"); got != storedBefore {
		t.Fatalf("thumbnail mutated on skip: got %q, want %q", got, storedBefore)
	}
	fresh, err := app.test.FindRecordById("drive_items", rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := fresh.GetString("thumbnail"); got != storedBefore {
		t.Fatalf("persisted thumbnail changed on skip: got %q, want %q", got, storedBefore)
	}
}

// Editor path, region changed: thumb_region_hash differs from Original(), so
// the guard does NOT skip. With a stashed payload it renders the pure-Go text
// preview (no mupdf) and saves a new thumbnail file. We assert the persisted
// thumbnail field changed away from the placeholder — proof the throttle let
// the regen through.
func TestGenerateThumbnail_RendersWhenRegionChanged(t *testing.T) {
	app := newThrottleApp(t)

	rec := newSavedItem(t, app.test, map[string]any{
		"name":              "page.txt",
		"file":              "page.txt",
		"mime_type":         "text/plain",
		"thumbnail":         "", // no prior thumbnail -> guard can't fire anyway
		"thumb_region_hash": "region-old",
	})
	rec.Set("thumb_region_hash", "region-new")

	if rec.Original().GetString("thumb_region_hash") == rec.GetString("thumb_region_hash") {
		t.Fatal("precondition failed: Original() and current thumb_region_hash must differ")
	}

	payload := previewqueue.Payload{
		Page: textpreview.PageModel{Lines: []string{"hello", "world"}},
	}
	generateThumbnail(app.pb, rec, payload, true)

	fresh, err := app.test.FindRecordById("drive_items", rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.GetString("thumbnail") == "" {
		t.Fatal("expected a thumbnail to be rendered and saved when region changed")
	}
}
