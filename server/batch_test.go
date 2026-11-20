package drive

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func driveEnableBatch(t *testing.T, app core.App) {
	t.Helper()
	settings := app.Settings()
	settings.Batch.Enabled = true
	settings.Batch.MaxRequests = 50
	settings.Batch.Timeout = 3
	if err := app.Save(settings); err != nil {
		t.Fatalf("enable batch: %v", err)
	}
}

func driveBatchScenario(env *driveGuestEnv, body string, status int, content ...string) *tests.ApiScenario {
	return &tests.ApiScenario{
		Method:                http.MethodPost,
		URL:                   "/api/batch",
		Body:                  strings.NewReader(body),
		Headers:               map[string]string{"Authorization": env.memberToken, "Content-Type": "application/json"},
		ExpectedStatus:        status,
		ExpectedContent:       content,
		TestAppFactory:        func(_ testing.TB) *tests.TestApp { return env.app },
		DisableTestAppCleanup: true,
	}
}

// Closing the editors and dropping their parked documents cannot be rolled
// back, so a batch must not replace a file.
func TestBatch_RefusesAFileReplacement(t *testing.T) {
	env := setupDriveGuestApp(t)
	driveEnableBatch(t, env.app)
	env.app.OnRecordUpdateRequest("drive_items").BindFunc(guardFileUpdateRequest)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	savedName := openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	body := fmt.Sprintf(`{"requests":[{"method":"PATCH","url":"/api/collections/drive_items/records/%s","body":{"file":""}}]}`, item.Id)
	driveBatchScenario(env, body, http.StatusBadRequest, msgNoFileReplacementInBatch).Test(t)

	if savedName() != "" {
		t.Fatal("the refused batch closed the editor room")
	}
	assertFileBytes(t, env.app, item.Id, "v1")
}

// A rename does not touch the file, so a batch may do it.
func TestBatch_AllowsARename(t *testing.T) {
	env := setupDriveGuestApp(t)
	driveEnableBatch(t, env.app)
	env.app.OnRecordUpdateRequest("drive_items").BindFunc(guardFileUpdateRequest)
	item := seedFileItem(t, env.app, env.member, "notes.txt", []byte("v1"))
	savedName := openWithFinalSave(t, env.app, item.Id, []byte("edited"))

	body := fmt.Sprintf(`{"requests":[{"method":"PATCH","url":"/api/collections/drive_items/records/%s","body":{"name":"renamed.txt"}}]}`, item.Id)
	driveBatchScenario(env, body, http.StatusOK, `"name":"renamed.txt"`).Test(t)

	if savedName() != "" {
		t.Fatal("a rename closed the room")
	}
}

// A create inside a transaction must not wait for the parent's create lock:
// an ordinary create can hold that lock while it waits for the write
// connection the transaction holds.
func TestCreateInATransactionDoesNotTakeTheCreateLock(t *testing.T) {
	env := setupDriveGuestApp(t)
	registerDriveItemCreateHook(env.app)
	col, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}

	mu := createLockFor("")
	mu.Lock()
	defer mu.Unlock()

	done := make(chan error, 1)
	go func() {
		done <- env.app.RunInTransaction(func(tx core.App) error {
			folder := core.NewRecord(col)
			folder.Set("name", "in a transaction")
			folder.Set("is_folder", true)
			folder.Set("created_by", env.member.Id)
			return tx.Save(folder)
		})
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("create in a transaction: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the create waited for the create lock inside a transaction")
	}
}
