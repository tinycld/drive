package drive

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/previewqueue"
	"tinycld.org/core/thumbnails/textpreview"
)

// lockedBuffer lets a job goroutine write log lines while the test reads them.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// captureLogs sends the default slog output, which logging.ForPackage
// loggers follow, to a buffer for the rest of the test.
func captureLogs(t *testing.T) *lockedBuffer {
	t.Helper()
	out := &lockedBuffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return out
}

func newJobsTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })
	return app
}

// A panic in the share-notification job must be logged through the drive
// logger, not end the process. A nil share record makes notifyDriveShare
// panic on its first field read.
func TestBackgroundJobs_RecoversAndLogsNotifyPanic(t *testing.T) {
	logs := captureLogs(t)
	app := newJobsTestApp(t)
	jobs := bindBackgroundJobs(app)

	jobs.run("drive share notification", func(context.Context) {
		notifyDriveShare(app, nil)
	})
	app.Cleanup()

	got := logs.String()
	for _, want := range []string{
		`"msg":"background job panicked"`,
		`"pkg":"drive"`,
		`"job":"drive share notification"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("log output is missing %s:\n%s", want, got)
		}
	}
}

// The terminate must hold until a running job finishes, so the job still has
// an open database. The job's ctx ends first, which tells it to stop.
func TestBackgroundJobs_TerminateWaitsForRunningJob(t *testing.T) {
	app := newJobsTestApp(t)
	jobs := bindBackgroundJobs(app)

	started := make(chan struct{})
	sawCancel := make(chan struct{})
	release := make(chan struct{})
	dbOpenAtEnd := false
	jobs.run("blocking", func(ctx context.Context) {
		close(started)
		<-ctx.Done()
		close(sawCancel)
		<-release
		dbOpenAtEnd = app.ConcurrentDB() != nil
	})
	<-started

	cleaned := make(chan struct{})
	go func() {
		app.Cleanup()
		close(cleaned)
	}()

	select {
	case <-sawCancel:
	case <-time.After(10 * time.Second):
		t.Fatal("the terminate did not cancel the job's context")
	}
	select {
	case <-cleaned:
		t.Fatal("the terminate finished while a job was still running")
	case <-time.After(50 * time.Millisecond):
	}

	close(release)
	select {
	case <-cleaned:
	case <-time.After(10 * time.Second):
		t.Fatal("the terminate did not finish after the job returned")
	}
	if !dbOpenAtEnd {
		t.Fatal("the database closed before the job finished")
	}
}

// A job handed over after the terminate began would run against a closing
// database, so it is dropped and logged.
func TestBackgroundJobs_DropsJobAfterTerminate(t *testing.T) {
	logs := captureLogs(t)
	app := newJobsTestApp(t)
	jobs := bindBackgroundJobs(app)
	app.Cleanup()

	ran := false
	jobs.run("late", func(context.Context) { ran = true })

	if ran {
		t.Fatal("a job started after the terminate")
	}
	if !strings.Contains(logs.String(), `"msg":"background job dropped: the app is terminating"`) {
		t.Fatalf("the dropped job was not logged:\n%s", logs.String())
	}
}

// The shipped hooks, then a cleanup straight after the save that starts their
// jobs. Before the jobs were tracked, they outlived the cleanup and read the
// database handle while it was cleared: `go test -race` reported that, and a
// query on the nil handle panicked. The cleanup now returns only after the
// jobs have finished, so a save afterwards cannot reach a job.
func TestBackgroundJobHooks_CleanupWaitsForItemJobs(t *testing.T) {
	t.Cleanup(previewqueue.ResetForTest)
	logs := captureLogs(t)
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
	if strings.Contains(logs.String(), "background job panicked") {
		t.Fatalf("a job ran against the closed database:\n%s", logs.String())
	}
}
