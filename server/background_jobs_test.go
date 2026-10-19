package drive

import (
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/background"
	"tinycld.org/core/previewqueue"
	"tinycld.org/core/readonly"
	"tinycld.org/core/readonly/readonlytest"
	"tinycld.org/core/thumbnails/textpreview"
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

// A share written just before the server went read-only must not notify
// while the mode is on: the row is lost if the next build rolls back. It
// waits, and notifies once the mode ends.
func TestShareNotify_WaitsForReadOnlyToEnd(t *testing.T) {
	f := setupShareNotifyFixture(t)
	readonly.Enter()
	t.Cleanup(readonly.Leave)

	probe, waiting := readonlytest.WaitProbe(t)
	done := make(chan struct{})
	go func() {
		defer close(done)
		notifyDriveShareWhenWritable(probe, f.app, f.share)
	}()
	select {
	case <-waiting:
	case <-done:
		t.Fatal("the share notification was written without waiting for read-only mode to end")
	case <-time.After(5 * time.Second):
		t.Fatal("the share notification never reached the read-only wait")
	}
	if f.notified(t) {
		t.Fatal("a share notification was written while read-only")
	}

	readonly.Leave()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the share notification was not written after read-only mode ended")
	}
	if !f.notified(t) {
		t.Fatal("expected the share notification after read-only mode ended")
	}
}

func TestShareNotify_DroppedAndLoggedWhenReadOnlyOutlastsTheWait(t *testing.T) {
	f := setupShareNotifyFixture(t)
	logs := readonlytest.CaptureLogs(t)
	readonly.Enter()
	t.Cleanup(readonly.Leave)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	notifyDriveShareWhenWritable(ctx, f.app, f.share)

	if f.notified(t) {
		t.Fatal("a share notification was written while read-only")
	}
	r, ok := readonlytest.Find(logs(), shareNotifyDroppedMsg)
	if !ok {
		t.Fatalf("no %q log for the dropped notification", shareNotifyDroppedMsg)
	}
	if r.Level != slog.LevelWarn {
		t.Fatalf("want Warn for a dropped share notification, got %v", r.Level)
	}
	if r.Attrs["shareID"] != f.share.Id || !strings.Contains(r.Attrs["pkg"], "drive") {
		t.Fatalf("the log must name drive and the share, got %v", r.Attrs)
	}
}
