package drive

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// A member who already holds a DERIVED row (via a group) must still get a
// DIRECT row when the creator shares with them by name; otherwise leaving
// the group silently revokes a share the creator believes they made.
func TestHandleShare_DerivedRowDoesNotBlockDirectShare(t *testing.T) {
	env := setupGroupGrantEnv(t)
	other := driveGuestUser(t, env.app, "other@test.local", "member")
	makeShareRow(t, env.app, env.item, other, env.group, "viewer", env.creator)

	env.app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/drive/share", func(re *core.RequestEvent) error {
			return handleShare(env.app, re)
		}).BindFunc(requireAuth)
		return e.Next()
	})

	router, err := apis.NewRouter(env.app)
	if err != nil {
		t.Fatalf("apis.NewRouter: %v", err)
	}
	serveEvent := new(core.ServeEvent)
	serveEvent.App = env.app
	serveEvent.Router = router
	if err := env.app.OnServe().Trigger(serveEvent); err != nil {
		t.Fatalf("OnServe.Trigger: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("BuildMux: %v", err)
	}

	body := `{"item_id":"` + env.item.Id + `","recipients":[{"user_id":"` + other.Id + `","role":"editor"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/drive/share", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", env.creatorToken)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/drive/share status = %d, body = %s", rec.Code, rec.Body.String())
	}

	direct, err := env.app.FindFirstRecordByFilter(
		"drive_shares",
		`item = {:item} && user = {:user} && group = ""`,
		map[string]any{"item": env.item.Id, "user": other.Id},
	)
	if err != nil || direct == nil {
		t.Fatalf("expected a direct drive_shares row for %s, got none (err=%v)", other.Id, err)
	}
	if got := direct.GetString("role"); got != "editor" {
		t.Fatalf("direct share role = %q, want editor", got)
	}
}
