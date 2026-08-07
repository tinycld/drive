package drive

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// storage_limits_test.go covers the per-user storage quota gate. The quota is a
// security control, not just an accounting one: it is the only thing standing
// between one user and exhausting the whole deployment's disk. The paths that
// matter are the ones where a mistake silently ADMITS a write — an unlimited
// fallback on a DB error, usage that misses a table, or an off-by-one at the
// boundary.

// setupQuotaApp builds the three collections the quota SQL reads: the settings
// row holding the limit, drive_items, and drive_item_versions. Versions are
// included because they are the half of usage most easily forgotten — a user
// who cannot exceed quota with items alone can still do it by piling up
// versions of one item.
func setupQuotaApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(func() { app.Cleanup() })

	settings := core.NewBaseCollection("settings")
	settings.Fields.Add(&core.TextField{Name: "app"})
	settings.Fields.Add(&core.TextField{Name: "key"})
	settings.Fields.Add(&core.TextField{Name: "value"})
	if err := app.Save(settings); err != nil {
		t.Fatalf("create settings collection: %v", err)
	}

	items := core.NewBaseCollection("drive_items")
	items.Fields.Add(&core.TextField{Name: "name"})
	items.Fields.Add(&core.NumberField{Name: "size"})
	items.Fields.Add(&core.TextField{Name: "created_by"})
	if err := app.Save(items); err != nil {
		t.Fatalf("create drive_items collection: %v", err)
	}

	versions := core.NewBaseCollection("drive_item_versions")
	versions.Fields.Add(&core.TextField{Name: "item"})
	versions.Fields.Add(&core.NumberField{Name: "size"})
	versions.Fields.Add(&core.TextField{Name: "created_by"})
	if err := app.Save(versions); err != nil {
		t.Fatalf("create drive_item_versions collection: %v", err)
	}

	return app
}

func setStorageLimit(t *testing.T, app *tests.TestApp, value string) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("app", "core")
	rec.Set("key", "storage_limit_bytes")
	rec.Set("value", value)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save storage limit: %v", err)
	}
}

func addItem(t *testing.T, app *tests.TestApp, userID string, size int) string {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", "f.bin")
	rec.Set("size", size)
	rec.Set("created_by", userID)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save drive item: %v", err)
	}
	return rec.Id
}

func addVersion(t *testing.T, app *tests.TestApp, itemID, userID string, size int) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_item_versions")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("item", itemID)
	rec.Set("size", size)
	rec.Set("created_by", userID)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save version: %v", err)
	}
}

// TestGetStorageLimitBytes_MissingSettingIsUnlimited pins the documented
// default. A deployment that never configured a limit must not have every
// upload rejected.
func TestGetStorageLimitBytes_MissingSettingIsUnlimited(t *testing.T) {
	app := setupQuotaApp(t)

	if got := getStorageLimitBytes(app); got != 0 {
		t.Fatalf("limit with no settings row = %d, want 0 (unlimited)", got)
	}
}

// TestGetStorageLimitBytes_ReadsConfiguredValue proves the setting is actually
// consulted — a quota that silently reads 0 forever is indistinguishable from
// having no quota at all.
func TestGetStorageLimitBytes_ReadsConfiguredValue(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "5000")

	if got := getStorageLimitBytes(app); got != 5000 {
		t.Fatalf("limit = %d, want 5000", got)
	}
}

// TestGetStorageLimitBytes_NonNumericValueIsUnlimited documents the behavior of
// a corrupt setting. CAST(value AS INTEGER) yields 0 for garbage, so the gate
// opens rather than closes. This test exists to make that failure-open choice
// explicit and reviewable rather than accidental.
func TestGetStorageLimitBytes_NonNumericValueIsUnlimited(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "not-a-number")

	if got := getStorageLimitBytes(app); got != 0 {
		t.Fatalf("limit for non-numeric setting = %d, want 0", got)
	}
}

// TestGetUserStorageUsed_CountsItemsAndVersions is the core accounting check:
// usage must span both tables. Counting items only would let a user store
// unbounded bytes as versions.
func TestGetUserStorageUsed_CountsItemsAndVersions(t *testing.T) {
	app := setupQuotaApp(t)

	itemID := addItem(t, app, "user_a", 1000)
	addVersion(t, app, itemID, "user_a", 250)
	addVersion(t, app, itemID, "user_a", 750)

	used, err := getUserStorageUsed(app, "user_a")
	if err != nil {
		t.Fatalf("getUserStorageUsed: %v", err)
	}
	if used != 2000 {
		t.Fatalf("used = %d, want 2000 (1000 item + 1000 versions)", used)
	}
}

// TestGetUserStorageUsed_IsScopedToTheUser guards against a missing WHERE:
// one user's bytes must never count against another's quota.
func TestGetUserStorageUsed_IsScopedToTheUser(t *testing.T) {
	app := setupQuotaApp(t)

	itemA := addItem(t, app, "user_a", 100)
	addVersion(t, app, itemA, "user_a", 100)
	itemB := addItem(t, app, "user_b", 9999)
	addVersion(t, app, itemB, "user_b", 9999)

	used, err := getUserStorageUsed(app, "user_a")
	if err != nil {
		t.Fatalf("getUserStorageUsed: %v", err)
	}
	if used != 200 {
		t.Fatalf("used for user_a = %d, want 200 (user_b must not count)", used)
	}
}

// TestGetUserStorageUsed_NoRowsIsZero covers the COALESCE arms. Without them
// SUM over no rows returns NULL and the scan fails, which would turn a brand
// new user's first upload into an error.
func TestGetUserStorageUsed_NoRowsIsZero(t *testing.T) {
	app := setupQuotaApp(t)

	used, err := getUserStorageUsed(app, "nobody")
	if err != nil {
		t.Fatalf("getUserStorageUsed: %v", err)
	}
	if used != 0 {
		t.Fatalf("used = %d, want 0", used)
	}
}

// TestCheckUserStorageQuota_UnlimitedAllowsAnything pins the short-circuit: an
// unlimited deployment must not pay for a usage query, and must never reject.
func TestCheckUserStorageQuota_UnlimitedAllowsAnything(t *testing.T) {
	app := setupQuotaApp(t)
	addItem(t, app, "user_a", 1<<30)

	if err := checkUserStorageQuota(app, "user_a", 1<<40); err != nil {
		t.Fatalf("unlimited quota rejected a write: %v", err)
	}
}

// TestCheckUserStorageQuota_RejectsWriteThatExceedsLimit is the control working
// as intended.
func TestCheckUserStorageQuota_RejectsWriteThatExceedsLimit(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "1000")
	addItem(t, app, "user_a", 900)

	err := checkUserStorageQuota(app, "user_a", 200)
	if err == nil {
		t.Fatal("expected quota rejection for 900 + 200 > 1000")
	}

	var limitErr *errStorageLimitExceeded
	if !errors.As(err, &limitErr) {
		t.Fatalf("error type = %T, want *errStorageLimitExceeded", err)
	}
}

// TestCheckUserStorageQuota_BoundaryExactlyAtLimitIsAllowed pins the comparison
// as `>` and not `>=`. An off-by-one here rejects a write that exactly fills the
// quota, which users experience as the last few bytes being unusable.
func TestCheckUserStorageQuota_BoundaryExactlyAtLimitIsAllowed(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "1000")
	addItem(t, app, "user_a", 900)

	if err := checkUserStorageQuota(app, "user_a", 100); err != nil {
		t.Fatalf("write landing exactly on the limit was rejected: %v", err)
	}
}

// TestCheckUserStorageQuota_OneByteOverLimitIsRejected is the other half of the
// boundary — together these two pin the exact comparison operator.
func TestCheckUserStorageQuota_OneByteOverLimitIsRejected(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "1000")
	addItem(t, app, "user_a", 900)

	if err := checkUserStorageQuota(app, "user_a", 101); err == nil {
		t.Fatal("expected rejection for a write one byte over the limit")
	}
}

// TestCheckUserStorageQuota_VersionBytesCountTowardTheLimit is the quota-bypass
// regression this pairs with storage_size_test.go: versions are real bytes on
// disk and must be charged. Here items alone (500) are under the 1000 limit and
// only the versions push the user over.
func TestCheckUserStorageQuota_VersionBytesCountTowardTheLimit(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "1000")

	itemID := addItem(t, app, "user_a", 500)
	addVersion(t, app, itemID, "user_a", 450)

	if err := checkUserStorageQuota(app, "user_a", 100); err == nil {
		t.Fatal("expected rejection: 500 items + 450 versions + 100 > 1000")
	}
}

// TestCheckUserStorageQuotaWebDAV_WrapsAsPermissionError pins the errors.Is
// contract the WebDAV wrapper exists to provide, so callers can tell a quota
// refusal apart from an IO failure.
func TestCheckUserStorageQuotaWebDAV_WrapsAsPermissionError(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "100")
	addItem(t, app, "user_a", 100)

	err := checkUserStorageQuotaWebDAV(app, "user_a", 50)
	if err == nil {
		t.Fatal("expected a quota error")
	}
	if !errors.Is(err, os.ErrPermission) {
		t.Fatalf("errors.Is(err, os.ErrPermission) = false for %v", err)
	}

	// The human-readable detail must survive the wrap — it is what lands in
	// the WebDAV logger for ops debugging.
	if !strings.Contains(err.Error(), "storage limit exceeded") {
		t.Fatalf("wrapped error lost its message: %q", err.Error())
	}
}

// TestCheckUserStorageQuotaWebDAV_AllowsWriteWithinQuota proves the wrapper is
// transparent on the success path.
func TestCheckUserStorageQuotaWebDAV_AllowsWriteWithinQuota(t *testing.T) {
	app := setupQuotaApp(t)
	setStorageLimit(t, app, "1000")
	addItem(t, app, "user_a", 100)

	if err := checkUserStorageQuotaWebDAV(app, "user_a", 100); err != nil {
		t.Fatalf("write within quota was rejected: %v", err)
	}
}

// TestFormatBytesHuman covers the unit ladder used in the user-facing quota
// message. A wrong unit here misleads a user about how much room they have.
func TestFormatBytesHuman(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1023, "1023 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1024 * 1024, "1.0 MB"},
		{1024 * 1024 * 1024, "1.0 GB"},
		{1024 * 1024 * 1024 * 1024, "1.0 TB"},
	}
	for _, c := range cases {
		if got := formatBytesHuman(c.in); got != c.want {
			t.Errorf("formatBytesHuman(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestGetUsersStorageBreakdown_PerUserTotals covers the admin breakdown query.
// It must attribute bytes to the right user and include users with no files at
// all, otherwise the admin storage screen quietly omits people.
func TestGetUsersStorageBreakdown_PerUserTotals(t *testing.T) {
	app := setupQuotaApp(t)

	// `users` is a built-in auth collection in the PocketBase test app; reuse
	// it rather than defining a second one.
	usersCol, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	mk := func(name string) string {
		rec := core.NewRecord(usersCol)
		rec.Set("name", name)
		rec.Set("email", name+"@example.com")
		rec.Set("password", "TestPass1234!")
		if err := app.Save(rec); err != nil {
			t.Fatalf("save user: %v", err)
		}
		return rec.Id
	}

	heavy := mk("heavy")
	empty := mk("empty")

	itemID := addItem(t, app, heavy, 700)
	addVersion(t, app, itemID, heavy, 300)

	rows, err := getUsersStorageBreakdown(app)
	if err != nil {
		t.Fatalf("getUsersStorageBreakdown: %v", err)
	}

	byID := map[string]int64{}
	for _, r := range rows {
		id, _ := r["user_id"].(string)
		switch v := r["drive_used"].(type) {
		case int64:
			byID[id] = v
		case int:
			byID[id] = int64(v)
		}
	}

	if byID[heavy] != 1000 {
		t.Errorf("heavy user drive_used = %d, want 1000", byID[heavy])
	}
	if _, ok := byID[empty]; !ok {
		t.Error("user with no files missing from breakdown; the LEFT JOIN must keep them")
	}
	if byID[empty] != 0 {
		t.Errorf("empty user drive_used = %d, want 0", byID[empty])
	}
}
