package drive

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/readonly"
	"tinycld.org/core/readonly/readonlytest"
	"tinycld.org/core/sharequota"
)

// setupCounterTestApp builds just the columns the counter statements touch.
func setupCounterTestApp(t *testing.T) (*tests.TestApp, string) {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	links := core.NewBaseCollection("drive_share_links")
	links.Fields.Add(&core.TextField{Name: "token", Required: true})
	links.Fields.Add(&core.NumberField{Name: "download_count", OnlyInt: true})
	links.Fields.Add(&core.TextField{Name: "last_accessed_at"})
	links.Fields.Add(&core.NumberField{Name: "day_download_count", OnlyInt: true})
	links.Fields.Add(&core.TextField{Name: "download_day", Max: 10})
	if err := app.Save(links); err != nil {
		t.Fatalf("save drive_share_links: %v", err)
	}

	const token = "tok_counters"
	rec := core.NewRecord(links)
	rec.Set("token", token)
	rec.Set("download_count", 0)
	if err := app.Save(rec); err != nil {
		t.Fatalf("seed link: %v", err)
	}

	return app, token
}

func countFor(t *testing.T, app *tests.TestApp, token string) int {
	t.Helper()
	rec, err := app.FindFirstRecordByData("drive_share_links", "token", token)
	if err != nil {
		t.Fatalf("reload link: %v", err)
	}
	return rec.GetInt("download_count")
}

func TestClaimShareLinkDownload_Increments(t *testing.T) {
	app, token := setupCounterTestApp(t)

	for i := 1; i <= 3; i++ {
		if ok, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil || !ok {
			t.Fatalf("claim %d: ok=%v err=%v", i, ok, err)
		}
	}

	if got := countFor(t, app, token); got != 3 {
		t.Errorf("download_count = %d, want 3", got)
	}
}

// The bug this pins: the old code loaded the record, added one in Go, and
// saved the whole row back. Concurrent downloads both read N and both wrote
// N+1, so downloads went missing under exactly the parallel fetching that
// abuse looks like.
func TestClaimShareLinkDownload_ConcurrentDownloadsAllCount(t *testing.T) {
	app, token := setupCounterTestApp(t)

	const n = 20
	var wg sync.WaitGroup
	errs := make(chan error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			if _, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent count: %v", err)
	}

	if got := countFor(t, app, token); got != n {
		t.Errorf("download_count = %d, want %d — increments were lost to a race", got, n)
	}
}

// The nastier half of the same bug: the metadata handler stamped
// last_accessed_at by saving the whole record, so a metadata request that had
// loaded the row before a download could write back the download_count it read
// and undo the download. A visitor could hold the count down indefinitely.
func TestTouchShareLink_DoesNotClobberTheDownloadCount(t *testing.T) {
	app, token := setupCounterTestApp(t)

	if _, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil {
		t.Fatalf("seed a download: %v", err)
	}

	// Stand in for a metadata request that loaded the row when the count was
	// still 0 and only writes its timestamp afterwards.
	if err := touchShareLink(app, token); err != nil {
		t.Fatalf("touch: %v", err)
	}

	if got := countFor(t, app, token); got != 1 {
		t.Errorf("download_count = %d, want 1 — the access stamp clobbered it", got)
	}
}

func TestTouchShareLink_StampsAccessTime(t *testing.T) {
	app, token := setupCounterTestApp(t)

	if err := touchShareLink(app, token); err != nil {
		t.Fatalf("touch: %v", err)
	}

	rec, err := app.FindFirstRecordByData("drive_share_links", "token", token)
	if err != nil {
		t.Fatal(err)
	}
	if rec.GetString("last_accessed_at") == "" {
		t.Error("last_accessed_at is empty, want a timestamp")
	}
}

// Neither statement may touch a link it was not given.
func TestShareLinkCounters_OnlyAffectTheNamedToken(t *testing.T) {
	app, token := setupCounterTestApp(t)

	links, err := app.FindCollectionByNameOrId("drive_share_links")
	if err != nil {
		t.Fatal(err)
	}
	other := core.NewRecord(links)
	other.Set("token", "tok_other")
	other.Set("download_count", 0)
	if err := app.Save(other); err != nil {
		t.Fatalf("seed second link: %v", err)
	}

	if _, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil {
		t.Fatal(err)
	}

	if got := countFor(t, app, "tok_other"); got != 0 {
		t.Errorf("the other link's download_count = %d, want 0", got)
	}
}

const readOnlyShareContent = "shared file body"

// setupShareLinkGetApp builds a share link to a stored file, for the public
// GET handlers.
func setupShareLinkGetApp(t *testing.T) (*tests.TestApp, *core.Record) {
	t.Helper()
	publicShareLimiter.Reset()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(
		&core.TextField{Name: "name"},
		&core.TextField{Name: "mime_type"},
		&core.FileField{Name: "file", MaxSelect: 1, MaxSize: 1 << 20},
	)
	if err := app.Save(items); err != nil {
		t.Fatalf("save drive_items: %v", err)
	}
	file, err := filesystem.NewFileFromBytes([]byte(readOnlyShareContent), "notes.txt")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(items)
	item.Set("name", "notes.txt")
	item.Set("mime_type", "text/plain")
	item.Set("file", file)
	if err := app.Save(item); err != nil {
		t.Fatalf("save drive_items record: %v", err)
	}

	links := core.NewBaseCollection("drive_share_links")
	links.Fields.Add(
		&core.TextField{Name: "item"},
		&core.TextField{Name: "token"},
		&core.BoolField{Name: "is_active"},
		&core.DateField{Name: "expires_at"},
		&core.NumberField{Name: "download_count", OnlyInt: true},
		&core.TextField{Name: "last_accessed_at"},
		&core.NumberField{Name: "day_download_count", OnlyInt: true},
		&core.TextField{Name: "download_day", Max: 10},
	)
	if err := app.Save(links); err != nil {
		t.Fatalf("save drive_share_links: %v", err)
	}
	link := core.NewRecord(links)
	link.Set("item", item.Id)
	link.Set("token", strings.Repeat("a", 64))
	link.Set("is_active", true)
	link.Set("download_count", 0)
	if err := app.Save(link); err != nil {
		t.Fatalf("seed link: %v", err)
	}
	return app, link
}

func serveShareLinkGet(t *testing.T, app core.App, token string, handler func(core.App, *core.RequestEvent) error) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/drive/share-link/"+token, nil)
	req.SetPathValue("token", token)
	rec := httptest.NewRecorder()
	re := &core.RequestEvent{App: app}
	re.Request = req
	re.Response = rec
	if err := handler(app, re); err != nil {
		t.Fatalf("handler: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	return rec
}

func reloadLink(t *testing.T, app core.App, id string) *core.Record {
	t.Helper()
	link, err := app.FindRecordById("drive_share_links", id)
	if err != nil {
		t.Fatalf("reload link: %v", err)
	}
	return link
}

// Read-only mode lets a GET through, so the public share handlers must not
// write while it is on, and must not block on it either: the visitor still
// gets the file, the access is not stamped, and the download is not charged.
// Once the mode ends, both writes happen again.
func TestShareLinkGets_SkipTheirWritesWhileReadOnly(t *testing.T) {
	app, link := setupShareLinkGetApp(t)
	token := link.GetString("token")
	logs := readonlytest.CaptureLogs(t)
	readonly.Enter(app)
	t.Cleanup(func() { readonly.Leave(app) })

	serveShareLinkGet(t, app, token, handleGetShareLinkMetadata)
	rec := serveShareLinkGet(t, app, token, handleGetShareLinkFile)
	if rec.Body.String() != readOnlyShareContent {
		t.Fatalf("body = %q, want the shared file", rec.Body.String())
	}

	got := reloadLink(t, app, link.Id)
	if got.GetString("last_accessed_at") != "" || got.GetInt("download_count") != 0 {
		t.Fatalf("the link was written while read-only: last_accessed_at=%q download_count=%d",
			got.GetString("last_accessed_at"), got.GetInt("download_count"))
	}
	r, ok := readonlytest.Find(logs(), "share link download served uncharged: the server is read-only")
	if !ok {
		t.Fatal("no log for the uncharged download")
	}
	if r.Level != slog.LevelInfo || r.Attrs["linkID"] != link.Id {
		t.Fatalf("want an Info log naming the link, got %v %v", r.Level, r.Attrs)
	}

	readonly.Leave(app)
	serveShareLinkGet(t, app, token, handleGetShareLinkMetadata)
	serveShareLinkGet(t, app, token, handleGetShareLinkFile)

	got = reloadLink(t, app, link.Id)
	if got.GetString("last_accessed_at") == "" {
		t.Fatal("the access was not stamped after read-only mode ended")
	}
	if got.GetInt("download_count") != 1 {
		t.Fatalf("download_count = %d after read-only mode ended, want 1", got.GetInt("download_count"))
	}
}
