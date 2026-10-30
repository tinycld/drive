package drive

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/background"
	"tinycld.org/core/previewqueue"
	"tinycld.org/core/readonly"
	"tinycld.org/core/readonly/readonlytest"
	"tinycld.org/core/thumbnails/textpreview"
	"tinycld.org/packages/drive/api"
)

// A panic in the share-notification job must be logged through the drive
// logger, not end the process. A nil share record makes notifyDriveShare
// panic on its first field read.
func TestBackgroundJobs_RecoversAndLogsNotifyPanic(t *testing.T) {
	logs := readonlytest.CaptureLogs(t)
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	background.For(app, "drive").Run("drive share notification", func(ctx context.Context) {
		notifyDriveShare(ctx, app, nil)
	})
	app.Cleanup()

	r, ok := readonlytest.Find(logs(), "background job panicked")
	if !ok {
		t.Fatal("the panic was not logged")
	}
	if r.Attrs["pkg"] != "drive" || r.Attrs["job"] != "drive share notification" {
		t.Fatalf("the log must name drive and the job, got %v", r.Attrs)
	}
}

// The shipped hooks, then a cleanup straight after the save that starts their
// jobs. Before the jobs were tracked, they outlived the cleanup and read the
// database handle while it was cleared: `go test -race` reported that, and a
// query on the nil handle panicked. The cleanup now returns only after the
// jobs have finished, so a save afterwards cannot reach a job.
func TestBackgroundJobHooks_CleanupWaitsForItemJobs(t *testing.T) {
	t.Cleanup(previewqueue.ResetForTest)
	logs := readonlytest.CaptureLogs(t)
	app := setupThrottleApp(t)
	registerBackgroundJobHooks(app)

	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Id = "bgjobsitem00001"
	rec.Set("name", "page.txt")
	rec.Set("file", "page.txt")
	rec.Set("mime_type", "text/plain")
	rec.Set("thumb_region_hash", "region-1")
	previewqueue.Stash(rec.Id, previewqueue.Payload{
		Page: textpreview.PageModel{Lines: []string{"hello"}},
	})
	if err := app.Save(rec); err != nil {
		t.Fatalf("save drive_items record: %v", err)
	}

	app.Cleanup()
	if _, ok := readonlytest.Find(logs(), "background job panicked"); ok {
		t.Fatal("a job ran against the closed database")
	}
}

// shareNotifyFixture is a share of creator's item with recipient. The share
// row is not saved: notifyDriveShare reads only its fields, and a save would
// need drive's whole schema.
type shareNotifyFixture struct {
	app       *tests.TestApp
	recipient *core.Record
	share     *core.Record
}

func setupShareNotifyFixture(t *testing.T) *shareNotifyFixture {
	t.Helper()
	app := setupThrottleApp(t)

	notifications := core.NewBaseCollection("notifications")
	notifications.Fields.Add(
		&core.TextField{Name: "user"},
		&core.TextField{Name: "type"},
		&core.TextField{Name: "package"},
		&core.TextField{Name: "title"},
		&core.TextField{Name: "body"},
		&core.TextField{Name: "url"},
		&core.JSONField{Name: "metadata"},
		&core.BoolField{Name: "read"},
		&core.BoolField{Name: "dismissed"},
	)
	if err := app.Save(notifications); err != nil {
		t.Fatalf("create notifications collection: %v", err)
	}

	creator := driveGuestUser(t, app, "creator@test.local", "member")
	recipient := driveGuestUser(t, app, "recipient@test.local", "member")

	itemsCol, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	item := core.NewRecord(itemsCol)
	item.Set("name", "plans.txt")
	if err := app.Save(item); err != nil {
		t.Fatalf("save drive_items record: %v", err)
	}

	shares := core.NewBaseCollection("drive_shares")
	shares.Fields.Add(
		&core.TextField{Name: "item"},
		&core.TextField{Name: "user"},
		&core.TextField{Name: "created_by"},
	)
	share := core.NewRecord(shares)
	share.Id = "bgjobsshare0001"
	share.Set("item", item.Id)
	share.Set("user", recipient.Id)
	share.Set("created_by", creator.Id)
	return &shareNotifyFixture{app: app, recipient: recipient, share: share}
}

func (f *shareNotifyFixture) notified(t *testing.T) bool {
	t.Helper()
	rows, err := f.app.FindRecordsByFilter("notifications",
		"user = {:user} && type = 'drive_file_shared'", "", 0, 0,
		map[string]any{"user": f.recipient.Id})
	if err != nil {
		t.Fatalf("read notifications: %v", err)
	}
	return len(rows) > 0
}

// tailWriter is a background write that follows a request already accepted.
// run performs it under ctx; written reports whether its row landed.
type tailWriter struct {
	app     core.App
	run     func(ctx context.Context)
	written func(t *testing.T) bool
	dropMsg string
	attrKey string
	attrVal string
}

// tailWriters builds each drive background write against a fresh app. The
// item rows are saved with their old hashes, then changed in memory, so the
// text index and thumbnail jobs take their write path.
var tailWriters = map[string]func(t *testing.T) tailWriter{
	"share notification": func(t *testing.T) tailWriter {
		f := setupShareNotifyFixture(t)
		return tailWriter{
			app:     f.app,
			run:     func(ctx context.Context) { notifyDriveShareWhenWritable(ctx, f.app, f.share) },
			written: f.notified,
			dropMsg: shareNotifyDroppedMsg,
			attrKey: "shareID",
			attrVal: f.share.Id,
		}
	},
	"external share invite": func(t *testing.T) tailWriter {
		app := setupThrottleApp(t)
		links := core.NewBaseCollection("drive_share_links")
		links.Fields.Add(
			&core.TextField{Name: "item"},
			&core.TextField{Name: "token"},
			&core.TextField{Name: "created_by"},
			&core.TextField{Name: "role"},
			&core.BoolField{Name: "is_active"},
			&core.NumberField{Name: "download_count"},
		)
		if err := app.Save(links); err != nil {
			t.Fatalf("create drive_share_links collection: %v", err)
		}
		item := newSavedItem(t, app, map[string]any{"name": "plans.txt"})
		recipient := api.ShareRecipient{Email: "guest@example.com", Role: "viewer"}
		return tailWriter{
			app: app,
			run: func(ctx context.Context) {
				sendExternalShareInviteWhenWritable(ctx, app, "Sender", recipient, item, "", "", "")
			},
			written: func(t *testing.T) bool {
				rows, err := app.FindRecordsByFilter("drive_share_links", "item = {:item}", "", 0, 0,
					map[string]any{"item": item.Id})
				if err != nil {
					t.Fatalf("read drive_share_links: %v", err)
				}
				return len(rows) > 0
			},
			dropMsg: externalInviteDroppedMsg,
			attrKey: "itemID",
			attrVal: item.Id,
		}
	},
	"text index": func(t *testing.T) tailWriter {
		app := setupThrottleApp(t)
		rec := newSavedItem(t, app, map[string]any{
			"name":       "doc.txt",
			"file":       "doc.txt",
			"mime_type":  "text/plain",
			"index_hash": "hash-old",
		})
		rec.Set("index_hash", "hash-new")
		payload := previewqueue.Payload{Plaintext: "fresh indexable content"}
		return tailWriter{
			app:     app,
			run:     func(ctx context.Context) { extractAndIndexDriveItem(ctx, app, rec, payload, true) },
			written: func(t *testing.T) bool { return ftsRowCount(t, app, rec.Id) > 0 },
			dropMsg: ftsIndexDroppedMsg,
			attrKey: "itemID",
			attrVal: rec.Id,
		}
	},
	"thumbnail": func(t *testing.T) tailWriter {
		app := setupThrottleApp(t)
		rec := newSavedItem(t, app, map[string]any{
			"name":              "page.txt",
			"file":              "page.txt",
			"mime_type":         "text/plain",
			"thumb_region_hash": "region-old",
		})
		rec.Set("thumb_region_hash", "region-new")
		payload := previewqueue.Payload{Page: textpreview.PageModel{Lines: []string{"hello"}}}
		return tailWriter{
			app: app,
			run: func(ctx context.Context) { generateThumbnail(ctx, app, rec, payload, true) },
			written: func(t *testing.T) bool {
				fresh, err := app.FindRecordById("drive_items", rec.Id)
				if err != nil {
					t.Fatalf("read drive_items record: %v", err)
				}
				return fresh.GetString("thumbnail") != ""
			},
			dropMsg: thumbnailDroppedMsg,
			attrKey: "itemID",
			attrVal: rec.Id,
		}
	},
}

// A row written just before the server went read-only must not have its
// background write land while the mode is on: the write is lost if the next
// build rolls back. Each write waits, and lands once the mode ends.
func TestTailWrites_WaitForReadOnlyToEnd(t *testing.T) {
	for name, build := range tailWriters {
		t.Run(name, func(t *testing.T) {
			w := build(t)
			readonly.Enter(w.app)
			t.Cleanup(func() { readonly.Leave(w.app) })

			probe, waiting := readonlytest.WaitProbe(t)
			done := make(chan struct{})
			go func() {
				defer close(done)
				w.run(probe)
			}()
			select {
			case <-waiting:
			case <-done:
				t.Fatal("the write ran without waiting for read-only mode to end")
			case <-time.After(5 * time.Second):
				t.Fatal("the write never reached the read-only wait")
			}
			if w.written(t) {
				t.Fatal("the write landed while read-only")
			}

			readonly.Leave(w.app)
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("the write did not finish after read-only mode ended")
			}
			if !w.written(t) {
				t.Fatal("expected the write after read-only mode ended")
			}
		})
	}
}

// cancelProbe is a context that closes waiting the first time its Done is
// read, and that the test cancels. readonly.WhenWritable reads Done only to
// wait, and the writers here do not read it before their wait, so the close
// means the writer is waiting. The jobs check ctx.Err before slow steps, so a
// ctx ended before the wait would skip the write without reaching it.
type cancelProbe struct {
	context.Context
	once    sync.Once
	waiting chan struct{}
}

func (p *cancelProbe) Done() <-chan struct{} {
	p.once.Do(func() { close(p.waiting) })
	return p.Context.Done()
}

func newCancelProbe(t *testing.T) (*cancelProbe, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return &cancelProbe{Context: ctx, waiting: make(chan struct{})}, cancel
}

// When the wait ends (TailWait, or the app terminating) with the server still
// read-only, the write is dropped and the drop is logged with what it lost.
func TestTailWrites_DroppedAndLoggedWhenTheWaitEnds(t *testing.T) {
	for name, build := range tailWriters {
		t.Run(name, func(t *testing.T) {
			w := build(t)
			logs := readonlytest.CaptureLogs(t)
			readonly.Enter(w.app)
			t.Cleanup(func() { readonly.Leave(w.app) })

			probe, cancel := newCancelProbe(t)
			done := make(chan struct{})
			go func() {
				defer close(done)
				w.run(probe)
			}()
			select {
			case <-probe.waiting:
			case <-done:
				t.Fatal("the write returned without waiting for read-only mode to end")
			case <-time.After(5 * time.Second):
				t.Fatal("the write never reached the read-only wait")
			}
			cancel()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("the write kept waiting after its context ended")
			}

			if w.written(t) {
				t.Fatal("the write landed while read-only")
			}
			r, ok := readonlytest.Find(logs(), w.dropMsg)
			if !ok {
				t.Fatalf("no %q log for the dropped write", w.dropMsg)
			}
			if r.Level != slog.LevelWarn {
				t.Fatalf("want Warn for a dropped write, got %v", r.Level)
			}
			if r.Attrs[w.attrKey] != w.attrVal || !strings.Contains(r.Attrs["pkg"], "drive") {
				t.Fatalf("the log must name drive and %s %q, got %v", w.attrKey, w.attrVal, r.Attrs)
			}
		})
	}
}
