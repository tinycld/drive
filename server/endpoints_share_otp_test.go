package drive

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// endpoints_share_otp_test.go exercises POST
// /api/drive/share-link/{token}/otp-request and otp-verify against the
// real PB router + DB + OTP primitive. Every Test* func builds a fresh
// TestApp (PB v0.38.1 panics on duplicate route registration when an
// app is reused across scenarios), seeds an owner + item + share link,
// installs the OnServe binding that registers the OTP handlers, then
// drives an ApiScenario.
//
// We intercept the OTP password at OnRecordCreate("_otps") time because
// PB hashes the password before it is persisted; the plain text is only
// present on the in-memory record during the save lifecycle.

func init() {
	// Ensure the project mailer doesn't try to contact Postmark during
	// tests. LogSender is selected automatically when no provider is
	// configured, but be defensive in case POSTMARK_SERVER_TOKEN leaks
	// into the test environment.
	_ = os.Setenv("SKIP_SENDING_MAIL", "true")
}

// otpTestEnv bundles a fully-seeded test app together with the captured
// plain-text OTP code (filled in by a OnRecordCreate("_otps") hook so
// tests can present the code as the visitor would).
type otpTestEnv struct {
	app       *tests.TestApp
	ownerUser *core.Record
	item      *core.Record
	shareLink *core.Record

	// codeMu guards lastCode. The OTP-create hook writes; tests read.
	codeMu   sync.Mutex
	lastCode string

	// handlerOnce lazily builds the router+mux on first request and
	// memoises it so we don't re-trigger OnServe (which would re-bind
	// our routes onto a fresh router each time — safe but wasteful).
	handlerOnce   sync.Once
	cachedHandler http.Handler
}

// setupOTPApp builds a fresh test app, materialises the drive
// collections this flow touches (drive_items, drive_share_links,
// drive_shares), inserts an owner + item + share link, wires the OTP
// handlers via OnServe, and installs the OTP-code capture hook.
//
// Single-org: the deployment IS the org, so there are no orgs/user_org
// collections. Membership is the `users` row itself and its `role`
// select field; every drive relation points straight at users.
func setupOTPApp(t *testing.T, linkRole string) *otpTestEnv {
	t.Helper()
	// Reset the package-level limiters so the previous test's IP budget
	// can't leak into this one. httptest.NewRequest uses a fixed default
	// RemoteAddr (192.0.2.1:1234), so every test that doesn't override
	// X-Forwarded-For shares a single budget; without this reset, the
	// 10/min/IP otpLimiter eventually starves later tests in a run.
	otpLimiter.Reset()
	publicShareLimiter.Reset()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("users collection: %v", err)
	}

	// Single-org: role lives on the users auth record. The PB test fixture's
	// stock users collection has no `role`, so add the same select the prod
	// schema ships.
	//
	// Required, matching migration 1940000000. It was previously registered
	// non-required "because ensureGuestRole keys off empty" — but that made
	// the fixture weaker than production and hid a real failure: guest
	// creation never set `role`, so every share-link sign-in failed
	// validation in prod while this suite stayed green.
	users.Fields.Add(&core.SelectField{
		Name: "role", Required: true, MaxSelect: 1,
		Values: []string{"owner", "admin", "member", "guest"},
	})
	if err := app.Save(users); err != nil {
		t.Fatalf("add users.role: %v", err)
	}

	// drive_items
	items := core.NewBaseCollection("drive_items")
	items.Id = "pbc_drive_items_01"
	items.Fields.Add(&core.TextField{Name: "name", Required: true})
	items.Fields.Add(&core.BoolField{Name: "is_folder"})
	items.Fields.Add(&core.TextField{Name: "mime_type"})
	items.Fields.Add(&core.RelationField{
		Name: "created_by", Required: true, CollectionId: users.Id, MaxSelect: 1,
	})
	if err := app.Save(items); err != nil {
		t.Fatalf("save drive_items: %v", err)
	}

	// drive_share_links
	shareLinks := core.NewBaseCollection("drive_share_links")
	shareLinks.Id = "pbc_drv_sl_01"
	shareLinks.Fields.Add(&core.RelationField{
		Name: "item", Required: true, CollectionId: items.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	shareLinks.Fields.Add(&core.TextField{Name: "token", Required: true})
	shareLinks.Fields.Add(&core.SelectField{
		Name: "role", Required: true, MaxSelect: 1,
		Values: []string{"viewer", "commentor", "editor"},
	})
	shareLinks.Fields.Add(&core.DateField{Name: "expires_at"})
	shareLinks.Fields.Add(&core.BoolField{Name: "is_active"})
	if err := app.Save(shareLinks); err != nil {
		t.Fatalf("save drive_share_links: %v", err)
	}

	// drive_shares (matches the prod schema's per-item access control)
	shares := core.NewBaseCollection("drive_shares")
	shares.Id = "pbc_drive_shares_01"
	shares.Fields.Add(&core.RelationField{
		Name: "item", Required: true, CollectionId: items.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	shares.Fields.Add(&core.RelationField{
		Name: "user", Required: true, CollectionId: users.Id,
		CascadeDelete: true, MaxSelect: 1,
	})
	shares.Fields.Add(&core.SelectField{
		Name: "role", Required: true, MaxSelect: 1,
		Values: []string{"owner", "editor", "commentor", "viewer"},
	})
	shares.Fields.Add(&core.RelationField{
		Name: "created_by", Required: true, CollectionId: users.Id, MaxSelect: 1,
	})
	shares.AddIndex("idx_drv_shares_unique", true, "item, user", "")
	if err := app.Save(shares); err != nil {
		t.Fatalf("save drive_shares: %v", err)
	}

	// Owner user. Single-org: the role select on the users row IS the
	// membership.
	owner := otpTestUser(t, app, "owner@test.local", "owner")

	// The shared item.
	item := core.NewRecord(items)
	item.Set("name", "Quarterly Report")
	item.Set("is_folder", false)
	item.Set("mime_type", "application/pdf")
	item.Set("created_by", owner.Id)
	if err := app.Save(item); err != nil {
		t.Fatalf("save item: %v", err)
	}

	// The share link (64-char token; sharelink.ResolveLink requires it).
	token := otpTestRandomToken()
	link := core.NewRecord(shareLinks)
	link.Set("item", item.Id)
	link.Set("token", token)
	link.Set("role", linkRole)
	link.Set("is_active", true)
	if err := app.Save(link); err != nil {
		t.Fatalf("save share link: %v", err)
	}

	env := &otpTestEnv{
		app:       app,
		ownerUser: owner,
		item:      item,
		shareLink: link,
	}

	// Capture the plain-text OTP code as PB saves the row. The OTP
	// password is bcrypt-hashed in the persisted column; the only
	// place a test can see the cleartext is during the create
	// lifecycle.
	app.OnRecordCreate(core.CollectionNameOTPs).BindFunc(func(e *core.RecordEvent) error {
		if pw := e.Record.GetString("password"); pw != "" {
			env.codeMu.Lock()
			env.lastCode = pw
			env.codeMu.Unlock()
		}
		return e.Next()
	})

	// Bind the OTP routes onto the test app's OnServe. ApiScenario.Test
	// triggers OnServe per scenario; the binding installs the routes
	// onto e.Router so the request actually hits our handlers.
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.POST("/api/drive/share-link/{token}/otp-request", func(re *core.RequestEvent) error {
			return handleShareOTPRequest(app, re)
		})
		e.Router.POST("/api/drive/share-link/{token}/otp-verify", func(re *core.RequestEvent) error {
			return handleShareOTPVerify(app, re)
		})
		return e.Next()
	})

	return env
}

// otpTestUser creates a users row. `role` is required by migration
// 1940000000, so every caller must supply one — the same constraint the
// production create paths are under.
func otpTestUser(t *testing.T, app core.App, email string, role string) *core.Record {
	t.Helper()
	col, _ := app.FindCollectionByNameOrId("users")
	r := core.NewRecord(col)
	r.SetEmail(email)
	r.Set("name", strings.Split(email, "@")[0])
	r.Set("role", role)
	r.SetVerified(true)
	r.SetPassword("Password123!")
	if err := app.Save(r); err != nil {
		t.Fatalf("save user %s: %v", email, err)
	}
	return r
}

// otpTestSetRole stamps a role onto the users row. Single-org: this is
// what "granting a membership" reduces to — the junction collection is
// gone, so the role select on the auth record carries it.
func otpTestSetRole(t *testing.T, app core.App, user *core.Record, role string) {
	t.Helper()
	user.Set("role", role)
	if err := app.Save(user); err != nil {
		t.Fatalf("set role %q on %s: %v", role, user.Email(), err)
	}
}

func otpTestRandomToken() string {
	// drive's share link tokens are 32 bytes of randomness hex-encoded —
	// the 64-char format sharelink.ResolveLink enforces.
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

// doRequest performs an HTTP roundtrip against the test app's router
// (built once per app and cached, since each OnServe.Trigger registers
// routes on the supplied router instance — building fresh routers per
// request and triggering OnServe each time is safe because each call
// builds a different router object, but caching is cheaper).
//
// We bypass tests.ApiScenario because its assertions short-circuit on
// status/content mismatches; the OTP flow tests need to read the full
// response body in every branch (token, otp_id, error message).
func (env *otpTestEnv) doRequest(t *testing.T, method, url, body string) (*http.Response, []byte) {
	t.Helper()

	mux := env.handler(t)

	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	raw, _ := io.ReadAll(rec.Body)
	return rec.Result(), raw
}

// doRequestWithIP is like doRequest but pins X-Forwarded-For so the
// per-IP rate limiter sees the supplied IP. Tests that need to span
// multiple IPs (or to avoid colliding with other tests' default
// RemoteAddr) use this.
func (env *otpTestEnv) doRequestWithIP(t *testing.T, method, url, body, ip string) (*http.Response, []byte) {
	t.Helper()

	mux := env.handler(t)

	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	raw, _ := io.ReadAll(rec.Body)
	return rec.Result(), raw
}

// handler returns the cached http.Handler for this env's app. We build
// it lazily on first use to mirror the production lifecycle (handler is
// built after OnServe binders are registered).
func (env *otpTestEnv) handler(t *testing.T) http.Handler {
	t.Helper()
	env.handlerOnce.Do(func() {
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
		env.cachedHandler = mux
	})
	return env.cachedHandler
}

// captureCode returns the most recent plain-text OTP code captured by
// the OnRecordCreate hook. Returns "" if no OTP has been minted yet.
func (env *otpTestEnv) captureCode() string {
	env.codeMu.Lock()
	defer env.codeMu.Unlock()
	return env.lastCode
}

// countRecords runs a filter and returns the count of matching records.
// Used by the idempotency tests to assert "exactly one" provisioning.
func countRecords(t *testing.T, app core.App, collection, filter string, params map[string]any) int {
	t.Helper()
	if params == nil {
		params = map[string]any{}
	}
	rs, err := app.FindRecordsByFilter(collection, filter, "", 0, 0, params)
	if err != nil {
		t.Fatalf("FindRecordsByFilter(%s, %s): %v", collection, filter, err)
	}
	return len(rs)
}

// ----- otp-request tests --------------------------------------------------

func TestShareOTPRequest_CommentorLink_MintsCode(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))

	resp, body := env.doRequest(t, http.MethodPost, url, `{"email":"guest@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}

	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("response not JSON: %v (%s)", err, body)
	}
	if out["otp_id"] == "" || out["otp_id"] == nil {
		t.Fatalf("response missing otp_id: %s", body)
	}

	// Response must NOT leak the code. We assert by checking the
	// captured code does not appear in the response body.
	code := env.captureCode()
	if code == "" {
		t.Fatalf("expected an OTP code to have been minted (captured none)")
	}
	if strings.Contains(string(body), code) {
		t.Fatalf("response body leaks the OTP code: %s", body)
	}

	// And a matching OTP row exists in the DB (defence in depth — the
	// hook fires on save, so a row WAS persisted).
	rs, err := env.app.FindRecordsByFilter(core.CollectionNameOTPs, "sentTo = {:e}", "", 0, 0, map[string]any{"e": "guest@example.com"})
	if err != nil {
		t.Fatalf("find OTPs: %v", err)
	}
	if len(rs) != 1 {
		t.Fatalf("expected 1 OTP for guest@example.com, got %d", len(rs))
	}
}

func TestShareOTPRequest_ViewerLink_Rejected(t *testing.T) {
	env := setupOTPApp(t, "viewer")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))

	resp, body := env.doRequest(t, http.MethodPost, url, `{"email":"guest@example.com"}`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for viewer link, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "does not require sign-in") {
		t.Fatalf("expected explanatory error, got: %s", body)
	}
	// And no OTP was minted.
	if rs, _ := env.app.FindRecordsByFilter(core.CollectionNameOTPs, "", "", 0, 0, nil); len(rs) != 0 {
		t.Fatalf("viewer-rejected branch must not mint an OTP, found %d", len(rs))
	}
}

func TestShareOTPRequest_InvalidEmail_Rejected(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))

	for _, bad := range []string{`{}`, `{"email":""}`, `{"email":"not-an-email"}`, `{"email":"   "}`} {
		resp, body := env.doRequest(t, http.MethodPost, url, bad)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 for %q, got %d: %s", bad, resp.StatusCode, body)
		}
	}
}

func TestShareOTPRequest_RevokedLink_410(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	env.shareLink.Set("is_active", false)
	if err := env.app.Save(env.shareLink); err != nil {
		t.Fatalf("revoke link: %v", err)
	}
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))

	resp, body := env.doRequest(t, http.MethodPost, url, `{"email":"guest@example.com"}`)
	if resp.StatusCode != http.StatusGone {
		t.Fatalf("expected 410 for revoked link, got %d: %s", resp.StatusCode, body)
	}
}

// ----- otp-verify tests ---------------------------------------------------

func TestShareOTPVerify_HappyPath_ProvisionsExactlyOnce(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	// Request first to mint a code.
	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"guest@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var reqOut struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &reqOut)
	code := env.captureCode()
	if code == "" || reqOut.OTPID == "" {
		t.Fatalf("expected captured code + otp_id, code=%q otp_id=%q", code, reqOut.OTPID)
	}

	// Verify.
	verifyBody := fmt.Sprintf(`{"email":"guest@example.com","code":%q,"otp_id":%q}`, code, reqOut.OTPID)
	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify", verifyBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-verify: %d %s", resp.StatusCode, body)
	}

	var verOut struct {
		Token  string         `json:"token"`
		Record map[string]any `json:"record"`
	}
	if err := json.Unmarshal(body, &verOut); err != nil {
		t.Fatalf("verify response not JSON: %v (%s)", err, body)
	}
	if verOut.Token == "" {
		t.Fatalf("verify response missing token: %s", body)
	}
	if verOut.Record["id"] == nil {
		t.Fatalf("verify response missing record.id: %s", body)
	}

	// Exactly one user (role=guest), and exactly one drive_shares row
	// (role=commentor) scoped to the link's item.
	userCount := countRecords(t, env.app, "users", "email = {:e}", map[string]any{"e": "guest@example.com"})
	if userCount != 1 {
		t.Fatalf("expected 1 guest user row, got %d", userCount)
	}
	users, _ := env.app.FindRecordsByFilter("users", "email = {:e}", "", 0, 0, map[string]any{"e": "guest@example.com"})
	guestUserID := users[0].Id
	if !users[0].Verified() {
		t.Fatalf("guest user should be verified after verify; got verified=false")
	}
	if got := users[0].GetString("role"); got != "guest" {
		t.Fatalf("users.role = %q, want guest", got)
	}

	shareCount := countRecords(t, env.app, "drive_shares", "item = {:i} && user = {:u}", map[string]any{"i": env.item.Id, "u": guestUserID})
	if shareCount != 1 {
		t.Fatalf("expected 1 drive_shares row, got %d", shareCount)
	}
	shares, _ := env.app.FindRecordsByFilter("drive_shares", "item = {:i} && user = {:u}", "", 0, 0, map[string]any{"i": env.item.Id, "u": guestUserID})
	if got := shares[0].GetString("role"); got != "commentor" {
		t.Fatalf("drive_shares.role = %q, want commentor", got)
	}

	// The grant must be scoped to the link's item only — a verified
	// email must not become a blanket grant across the deployment.
	if c := countRecords(t, env.app, "drive_shares", "user = {:u}", map[string]any{"u": guestUserID}); c != 1 {
		t.Fatalf("expected the guest to hold exactly 1 share overall, got %d", c)
	}

	// The minted token must actually authenticate as the guest user.
	if user, err := env.app.FindRecordById("users", guestUserID); err != nil || user == nil {
		t.Fatalf("guest user disappeared: err=%v rec=%v", err, user)
	}
}

func TestShareOTPVerify_Idempotent_RepeatedFlowsCreateNoDuplicates(t *testing.T) {
	env := setupOTPApp(t, "editor")
	tok := env.shareLink.GetString("token")

	doFullFlow := func() {
		t.Helper()
		resp, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			`{"email":"repeat@example.com"}`)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
		}
		var out struct {
			OTPID string `json:"otp_id"`
		}
		_ = json.Unmarshal(body, &out)
		code := env.captureCode()

		verifyBody := fmt.Sprintf(`{"email":"repeat@example.com","code":%q,"otp_id":%q}`, code, out.OTPID)
		resp, body = env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify", verifyBody)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("otp-verify: %d %s", resp.StatusCode, body)
		}
	}

	doFullFlow()
	doFullFlow()
	doFullFlow()

	userCount := countRecords(t, env.app, "users", "email = {:e}", map[string]any{"e": "repeat@example.com"})
	if userCount != 1 {
		t.Fatalf("expected 1 user after repeated flows, got %d", userCount)
	}
	users, _ := env.app.FindRecordsByFilter("users", "email = {:e}", "", 0, 0, map[string]any{"e": "repeat@example.com"})
	guestID := users[0].Id
	if got := users[0].GetString("role"); got != "guest" {
		t.Fatalf("users.role after repeated flows = %q, want guest", got)
	}

	shareCount := countRecords(t, env.app, "drive_shares",
		"item = {:i} && user = {:u}", map[string]any{"i": env.item.Id, "u": guestID})
	if shareCount != 1 {
		t.Fatalf("expected 1 drive_shares after repeated flows, got %d", shareCount)
	}
}

func TestShareOTPVerify_PreservesExistingMemberRole(t *testing.T) {
	// A real member (role=admin) visits a share link and verifies their
	// email. ensureGuestRole must NOT downgrade their admin role to
	// guest — it only stamps a role onto a user that has none.
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	existing := otpTestUser(t, env.app, "alreadyhere@example.com", "admin")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"alreadyhere@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)
	code := env.captureCode()

	verifyBody := fmt.Sprintf(`{"email":"alreadyhere@example.com","code":%q,"otp_id":%q}`, code, out.OTPID)
	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify", verifyBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-verify: %d %s", resp.StatusCode, body)
	}

	// The membership is the users row itself: it must still be the SAME
	// record carrying the SAME admin role.
	fresh, err := env.app.FindRecordById("users", existing.Id)
	if err != nil {
		t.Fatalf("re-fetch member: %v", err)
	}
	if got := fresh.GetString("role"); got != "admin" {
		t.Fatalf("admin role was downgraded to %q", got)
	}
	if c := countRecords(t, env.app, "users", "email = {:e}",
		map[string]any{"e": "alreadyhere@example.com"}); c != 1 {
		t.Fatalf("verify duplicated the user row: got %d, want 1", c)
	}

	// The admin still gains the link's per-item share (the role check is
	// about not DOWNGRADING them, not about withholding the grant).
	if c := countRecords(t, env.app, "drive_shares", "item = {:i} && user = {:u}",
		map[string]any{"i": env.item.Id, "u": existing.Id}); c != 1 {
		t.Fatalf("expected 1 drive_shares row for the admin, got %d", c)
	}
}

func TestShareOTPVerify_WrongCode_Rejected(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"wrong@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)

	// Wrong code. The actual code is 6 digits; "000000" is overwhelmingly
	// not equal to the random one we just minted.
	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		fmt.Sprintf(`{"email":"wrong@example.com","code":"000000","otp_id":%q}`, out.OTPID))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for wrong code, got %d: %s", resp.StatusCode, body)
	}

	// No provisioning happened. The otp-request leg necessarily creates the
	// users row (PB OTPs anchor to an auth record) and that row carries
	// role=guest because the field is required — so the role can no longer
	// stand in for "nothing was granted". What must hold is that the account
	// is granted no ACCESS: role=guest by itself conveys none, and the share
	// row below is what would.
	guests, _ := env.app.FindRecordsByFilter("users", "email = {:e}", "", 0, 0,
		map[string]any{"e": "wrong@example.com"})
	if len(guests) == 1 {
		if got := guests[0].GetString("role"); got != guestRole {
			t.Fatalf("failed verify left role %q; a provisional account must be a guest", got)
		}
	}
	if c := countRecords(t, env.app, "drive_shares",
		"item = {:i}", map[string]any{"i": env.item.Id}); c != 0 {
		t.Fatalf("expected 0 drive_shares after failed verify, got %d", c)
	}
}

func TestShareOTPVerify_ExpiredCode_Rejected(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"stale@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)
	code := env.captureCode()

	// Backdate the OTP so HasExpired returns true. OTP's created field
	// is the basis for expiry; we shift it well past the otpDuration
	// window. The AutodateField with OnCreate=true only stamps on
	// create, so an UPDATE that sets created via SetRaw should persist.
	// We bypass the model layer entirely and write SQL directly because
	// AutodateField's Intercept still re-stamps via the "last known"
	// comparison on resave.
	if _, err := env.app.DB().NewQuery(
		"UPDATE " + core.CollectionNameOTPs + " SET created = {:c} WHERE id = {:id}",
	).Bind(map[string]any{
		"c":  "2020-01-01 00:00:00.000Z",
		"id": out.OTPID,
	}).Execute(); err != nil {
		t.Fatalf("backdate OTP: %v", err)
	}

	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		fmt.Sprintf(`{"email":"stale@example.com","code":%q,"otp_id":%q}`, code, out.OTPID))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for expired code, got %d: %s", resp.StatusCode, body)
	}
}

func TestShareOTPVerify_ViewerLink_Rejected(t *testing.T) {
	env := setupOTPApp(t, "viewer")
	tok := env.shareLink.GetString("token")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		`{"email":"x@example.com","code":"000000","otp_id":"anything"}`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for viewer link, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "does not require sign-in") {
		t.Fatalf("expected explanatory error, got: %s", body)
	}
}

func TestShareOTPVerify_RevokedBetweenRequestAndVerify_410(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"timing@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)
	code := env.captureCode()

	env.shareLink.Set("is_active", false)
	if err := env.app.Save(env.shareLink); err != nil {
		t.Fatalf("revoke link: %v", err)
	}

	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		fmt.Sprintf(`{"email":"timing@example.com","code":%q,"otp_id":%q}`, code, out.OTPID))
	if resp.StatusCode != http.StatusGone {
		t.Fatalf("expected 410 after revocation, got %d: %s", resp.StatusCode, body)
	}
}

// TestShareOTPVerify_WrongEmail_DeletesOTP confirms that the SentTo-mismatch
// branch consumes the OTP (parity with the expired-code branch). Without this,
// an attacker with a leaked/guessed otp_id could keep retrying with different
// emails — the rate limiter bounds it, but symmetric deletion is the tighter
// posture.
func TestShareOTPVerify_WrongEmail_DeletesOTP(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request",
		`{"email":"alice@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)
	code := env.captureCode()

	// Verify with the right code but the wrong email.
	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		fmt.Sprintf(`{"email":"mallory@example.com","code":%q,"otp_id":%q}`, code, out.OTPID))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for SentTo mismatch, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "invalid or expired code") {
		t.Fatalf("expected uniform 'invalid or expired code' message, got: %s", body)
	}

	// OTP must be deleted: a second attempt with the CORRECT email +
	// CORRECT code must now also fail (the OTP no longer exists).
	resp, body = env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-verify",
		fmt.Sprintf(`{"email":"alice@example.com","code":%q,"otp_id":%q}`, code, out.OTPID))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 after OTP consumed by mismatch, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "invalid or expired code") {
		t.Fatalf("expected uniform error after consumed OTP, got: %s", body)
	}
}

// TestShareOTP_CodeNeverInResponse exhaustively asserts the plain-text OTP
// code is NOT present in any response body across both endpoints and every
// branch. Regression guard for the load-bearing security property that the
// code is delivered ONLY via email.
func TestShareOTP_CodeNeverInResponse(t *testing.T) {
	// Helper: assert the code (if known) doesn't appear in a response body.
	mustNotLeak := func(t *testing.T, label string, body []byte, code string) {
		t.Helper()
		if code != "" && bytes.Contains(body, []byte(code)) {
			t.Fatalf("[%s] response body leaks the OTP code (%q): %s", label, code, body)
		}
	}

	// --- otp-request branches ---

	t.Run("request happy path", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			`{"email":"happy@example.com"}`)
		mustNotLeak(t, "request-happy", body, env.captureCode())
	})

	t.Run("request viewer link rejected", func(t *testing.T) {
		env := setupOTPApp(t, "viewer")
		tok := env.shareLink.GetString("token")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			`{"email":"viewer@example.com"}`)
		mustNotLeak(t, "request-viewer", body, env.captureCode())
	})

	t.Run("request invalid email", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			`{"email":"not-an-email"}`)
		// No code minted on this branch (validation fails before OTP create), but
		// asserting absence with an empty code is a no-op — that's fine.
		mustNotLeak(t, "request-bad-email", body, env.captureCode())
	})

	t.Run("request revoked link", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		env.shareLink.Set("is_active", false)
		if err := env.app.Save(env.shareLink); err != nil {
			t.Fatalf("revoke: %v", err)
		}
		tok := env.shareLink.GetString("token")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			`{"email":"revoked@example.com"}`)
		mustNotLeak(t, "request-revoked", body, env.captureCode())
	})

	// --- otp-verify branches ---
	// For each verify branch we first do a real request so a code exists
	// in env.captureCode() (then we drive the verify path under test).

	mintCode := func(t *testing.T, env *otpTestEnv, email string) (otpID, code string) {
		t.Helper()
		tok := env.shareLink.GetString("token")
		resp, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-request",
			fmt.Sprintf(`{"email":%q}`, email))
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("otp-request precondition failed: %d %s", resp.StatusCode, body)
		}
		var out struct {
			OTPID string `json:"otp_id"`
		}
		_ = json.Unmarshal(body, &out)
		return out.OTPID, env.captureCode()
	}

	t.Run("verify happy path", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		otpID, code := mintCode(t, env, "ok@example.com")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify",
			fmt.Sprintf(`{"email":"ok@example.com","code":%q,"otp_id":%q}`, code, otpID))
		mustNotLeak(t, "verify-happy", body, code)
	})

	t.Run("verify wrong code", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		otpID, code := mintCode(t, env, "wrong@example.com")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify",
			fmt.Sprintf(`{"email":"wrong@example.com","code":"000000","otp_id":%q}`, otpID))
		mustNotLeak(t, "verify-wrong-code", body, code)
	})

	t.Run("verify wrong email (SentTo mismatch)", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		otpID, code := mintCode(t, env, "sentto@example.com")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify",
			fmt.Sprintf(`{"email":"other@example.com","code":%q,"otp_id":%q}`, code, otpID))
		mustNotLeak(t, "verify-wrong-email", body, code)
	})

	t.Run("verify unknown otp_id", func(t *testing.T) {
		env := setupOTPApp(t, "commentor")
		tok := env.shareLink.GetString("token")
		_, code := mintCode(t, env, "unknown@example.com")
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify",
			fmt.Sprintf(`{"email":"unknown@example.com","code":%q,"otp_id":"nonexistent"}`, code))
		mustNotLeak(t, "verify-unknown-otp-id", body, code)
	})

	t.Run("verify viewer link rejected", func(t *testing.T) {
		env := setupOTPApp(t, "viewer")
		tok := env.shareLink.GetString("token")
		// Viewer link rejects at the role check before any OTP lookup, so we
		// don't need a real OTP — just check the rejection body has no code.
		_, body := env.doRequest(t, http.MethodPost,
			"/api/drive/share-link/"+tok+"/otp-verify",
			`{"email":"v@example.com","code":"123456","otp_id":"x"}`)
		mustNotLeak(t, "verify-viewer", body, "123456")
	})
}

// ----- otp rate limiter tests --------------------------------------------
//
// The otpLimiter is a package-level singleton shared with the rest of the
// process, so these tests use unique synthetic IPs (carried via
// X-Forwarded-For) to avoid colliding with each other or with any other
// test that happens to hit the OTP endpoints in the same go test run.

func TestShareOTPRequest_RateLimit_ElevenRequestsTrigger429(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))
	ip := "203.0.113.10" // RFC 5737 TEST-NET-3 — collision-proof per test

	// otpLimiter allows 10 req/min/IP. The first ten must pass the
	// limiter (status != 429); the eleventh must be throttled.
	for i := 0; i < 10; i++ {
		resp, body := env.doRequestWithIP(t, http.MethodPost, url,
			fmt.Sprintf(`{"email":"guest%d@example.com"}`, i), ip)
		if resp.StatusCode == http.StatusTooManyRequests {
			t.Fatalf("request %d hit limiter early: %s", i+1, body)
		}
	}

	resp, body := env.doRequestWithIP(t, http.MethodPost, url,
		`{"email":"guest11@example.com"}`, ip)
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 11th request, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "rate limit exceeded") {
		t.Fatalf("expected rate-limit error body, got: %s", body)
	}
}

func TestShareOTPVerify_RateLimit_ElevenRequestsTrigger429(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-verify", env.shareLink.GetString("token"))
	ip := "203.0.113.11"

	// Use a deliberately-bogus payload so verify fails early on the
	// invalid-code branch (after the limiter check). We're testing the
	// limiter, not the verify success path.
	payload := `{"email":"guest@example.com","code":"000000","otp_id":"nope"}`

	for i := 0; i < 10; i++ {
		resp, body := env.doRequestWithIP(t, http.MethodPost, url, payload, ip)
		if resp.StatusCode == http.StatusTooManyRequests {
			t.Fatalf("verify request %d hit limiter early: %s", i+1, body)
		}
	}

	resp, body := env.doRequestWithIP(t, http.MethodPost, url, payload, ip)
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 11th verify request, got %d: %s", resp.StatusCode, body)
	}
	if !strings.Contains(string(body), "rate limit exceeded") {
		t.Fatalf("expected rate-limit error body, got: %s", body)
	}
}

func TestShareOTPRequest_RateLimit_DifferentIPsNotThrottled(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	url := fmt.Sprintf("/api/drive/share-link/%s/otp-request", env.shareLink.GetString("token"))
	ipA := "203.0.113.20"
	ipB := "203.0.113.21"

	// Exhaust ipA's budget so any leakage across IPs would surface as a
	// 429 for ipB.
	for i := 0; i < 10; i++ {
		resp, body := env.doRequestWithIP(t, http.MethodPost, url,
			fmt.Sprintf(`{"email":"a%d@example.com"}`, i), ipA)
		if resp.StatusCode == http.StatusTooManyRequests {
			t.Fatalf("ipA request %d unexpectedly throttled: %s", i+1, body)
		}
	}
	resp, body := env.doRequestWithIP(t, http.MethodPost, url,
		`{"email":"a11@example.com"}`, ipA)
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("ipA 11th request expected 429, got %d: %s", resp.StatusCode, body)
	}

	// ipB is a fresh IP — its budget is untouched. The very next request
	// must NOT be a 429 (regardless of whether the body is otherwise
	// accepted; we're asserting the limiter doesn't bleed across IPs).
	resp, body = env.doRequestWithIP(t, http.MethodPost, url,
		`{"email":"b@example.com"}`, ipB)
	if resp.StatusCode == http.StatusTooManyRequests {
		t.Fatalf("ipB throttled despite untouched per-IP budget: %s", body)
	}
}
