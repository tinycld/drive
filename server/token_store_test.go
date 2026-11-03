package drive

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/tests"
)

func newTokenTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

// A download URL minted by one app must not work on another app's endpoint.
func TestDownloadTokenIsPerApp(t *testing.T) {
	a, b := newTokenTestApp(t), newTokenTestApp(t)
	token, err := downloadTokens(a).issue(downloadToken{folderID: "folder-1"}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := downloadTokens(b).redeem(token); ok {
		t.Fatal("app B redeemed app A's download token")
	}
	got, ok := downloadTokens(a).redeem(token)
	if !ok || got.folderID != "folder-1" {
		t.Fatalf("app A could not redeem its own token: %+v %v", got, ok)
	}
	if _, ok := downloadTokens(a).redeem(token); ok {
		t.Fatal("a token worked twice")
	}
}

func TestExpiredTokenIsRefusedAndSwept(t *testing.T) {
	app := newTokenTestApp(t)
	store := exportTokens(app)
	old, err := store.issue(exportToken{itemID: "item-1"}, -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.issue(exportToken{itemID: "item-2"}, time.Minute); err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	_, kept := store.entries[old]
	store.mu.Unlock()
	if kept {
		t.Fatal("issuing a token did not sweep the expired one")
	}
	if _, ok := store.redeem(old); ok {
		t.Fatal("an expired token was redeemed")
	}
}

func TestPublicShareLimiterIsPerApp(t *testing.T) {
	a, b := newTokenTestApp(t), newTokenTestApp(t)
	for publicShareLimiter.For(a).Allow("203.0.113.20") {
	}
	if !publicShareLimiter.For(b).Allow("203.0.113.20") {
		t.Fatal("app B's share budget was spent by app A")
	}
}
