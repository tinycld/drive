package drive

import (
	"context"
	"runtime/debug"
	"sync"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/logging"
)

var jobsLog = logging.ForPackage("drive")

// backgroundJobs runs the work a record hook moves off the request goroutine
// (text extraction, thumbnails, share notifications) and holds the app's
// terminate until that work is done.
//
// Without the hold, a job outlives the app: the terminate's finalizer closes
// the database, and the job's next query panics on the nil handle. A bare
// goroutine has no recover, so that panic ends the whole process, and in a
// test it outlives app.Cleanup() and crashes `go test`. A check on
// ConcurrentDB() inside the job cannot prevent it: it races the close.
type backgroundJobs struct {
	// ctx ends when the app terminates, so a running job stops before its
	// next storage write and a render in progress is cancelled.
	ctx    context.Context
	cancel context.CancelFunc

	// mu orders stopped with wg.Add: once stopped is set, no Add can race
	// the Wait in stop (sync.WaitGroup forbids that).
	mu      sync.Mutex
	stopped bool
	wg      sync.WaitGroup
}

// bindBackgroundJobs returns the job runner for app. Its terminate handler
// runs before the chain's finalizer, which closes the database, so every job
// has finished before the close.
func bindBackgroundJobs(app core.App) *backgroundJobs {
	ctx, cancel := context.WithCancel(context.Background())
	jobs := &backgroundJobs{ctx: ctx, cancel: cancel}
	app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		jobs.stop()
		return e.Next()
	})
	return jobs
}

// run starts fn in its own goroutine. A panic in fn is logged, not fatal.
// After the app has begun to terminate, run drops fn: the database it needs
// is about to close.
func (j *backgroundJobs) run(name string, fn func(ctx context.Context)) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.stopped {
		jobsLog.Warn("background job dropped: the app is terminating", "job", name)
		return
	}
	j.wg.Add(1)
	go func() {
		defer j.wg.Done()
		defer func() {
			if r := recover(); r != nil {
				jobsLog.Error("background job panicked",
					"job", name, "panic", r, "stack", string(debug.Stack()))
			}
		}()
		fn(j.ctx)
	}()
}

// stop refuses new jobs, ends ctx, and waits for the running ones. The wait
// has no bound, as the fork's own background file deletes have none: a job
// still running when the database closes is the crash this type prevents.
// The cancelled ctx makes the wait short, because each job stops at its next
// check.
func (j *backgroundJobs) stop() {
	j.mu.Lock()
	j.stopped = true
	j.cancel()
	j.mu.Unlock()
	j.wg.Wait()
}
