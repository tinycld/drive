package drive

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"tinycld.org/core/sharequota"
)

func TestClaimShareLinkDownload_UnlimitedNeverRefuses(t *testing.T) {
	app, token := setupCounterTestApp(t)

	for i := 0; i < 50; i++ {
		ok, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{})
		if err != nil {
			t.Fatalf("claim %d: %v", i, err)
		}
		if !ok {
			t.Fatalf("claim %d refused with no ceiling set", i)
		}
	}
}

func TestClaimShareLinkDownload_RefusesAtTheLifetimeCeiling(t *testing.T) {
	app, token := setupCounterTestApp(t)
	limits := sharequota.ShareLimits{Lifetime: 3}

	for i := 1; i <= 3; i++ {
		ok, err := claimShareLinkDownload(app, token, limits)
		if err != nil || !ok {
			t.Fatalf("download %d should be allowed: ok=%v err=%v", i, ok, err)
		}
	}

	ok, err := claimShareLinkDownload(app, token, limits)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if ok {
		t.Error("the fourth download was allowed past a ceiling of 3")
	}

	// A refusal must not charge. Otherwise a refused link keeps climbing and
	// the counter stops meaning what it says.
	if got := countFor(t, app, token); got != 3 {
		t.Errorf("download_count = %d after a refusal, want 3", got)
	}
}

func TestClaimShareLinkDownload_RefusesAtTheDailyCeiling(t *testing.T) {
	app, token := setupCounterTestApp(t)
	limits := sharequota.ShareLimits{PerDay: 2}

	for i := 1; i <= 2; i++ {
		if ok, err := claimShareLinkDownload(app, token, limits); err != nil || !ok {
			t.Fatalf("download %d should be allowed: ok=%v err=%v", i, ok, err)
		}
	}

	if ok, _ := claimShareLinkDownload(app, token, limits); ok {
		t.Error("the third download was allowed past a daily ceiling of 2")
	}
}

// The window resets by comparing the stored day to today, so a link whose
// counter belongs to an earlier day starts over without anything having run
// at midnight.
func TestClaimShareLinkDownload_DailyCounterResetsOnANewDay(t *testing.T) {
	app, token := setupCounterTestApp(t)
	limits := sharequota.ShareLimits{PerDay: 2}

	for i := 1; i <= 2; i++ {
		if ok, err := claimShareLinkDownload(app, token, limits); err != nil || !ok {
			t.Fatalf("download %d: ok=%v err=%v", i, ok, err)
		}
	}
	if ok, _ := claimShareLinkDownload(app, token, limits); ok {
		t.Fatal("precondition: the link should be at its daily ceiling")
	}

	// Backdate the window, standing in for the clock reaching tomorrow.
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	if _, err := app.NonconcurrentDB().NewQuery(`
		UPDATE drive_share_links SET download_day = {:day} WHERE token = {:token}
	`).Bind(map[string]any{"day": yesterday, "token": token}).Execute(); err != nil {
		t.Fatalf("backdate: %v", err)
	}

	ok, err := claimShareLinkDownload(app, token, limits)
	if err != nil {
		t.Fatalf("claim after rollover: %v", err)
	}
	if !ok {
		t.Error("a new day must start the window over")
	}

	// The lifetime counter keeps climbing across the boundary; only the
	// window resets.
	if got := countFor(t, app, token); got != 3 {
		t.Errorf("download_count = %d, want 3 — the lifetime count must not reset", got)
	}
}

// The two ceilings are independent: whichever is reached first refuses.
func TestClaimShareLinkDownload_DailyCeilingBitesBeforeLifetime(t *testing.T) {
	app, token := setupCounterTestApp(t)
	limits := sharequota.ShareLimits{Lifetime: 100, PerDay: 1}

	if ok, err := claimShareLinkDownload(app, token, limits); err != nil || !ok {
		t.Fatalf("first download: ok=%v err=%v", ok, err)
	}
	if ok, _ := claimShareLinkDownload(app, token, limits); ok {
		t.Error("the daily ceiling of 1 should refuse the second download")
	}
}

// The whole reason check and charge are one statement: concurrent downloads
// must not all pass a check that each of them sees as under the ceiling.
func TestClaimShareLinkDownload_ConcurrentClaimsCannotOvershoot(t *testing.T) {
	app, token := setupCounterTestApp(t)
	const ceiling = 5
	limits := sharequota.ShareLimits{Lifetime: ceiling}

	const attempts = 40
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0

	wg.Add(attempts)
	for i := 0; i < attempts; i++ {
		go func() {
			defer wg.Done()
			ok, err := claimShareLinkDownload(app, token, limits)
			if err != nil {
				return
			}
			if ok {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if allowed != ceiling {
		t.Errorf("%d downloads were allowed past a ceiling of %d", allowed, ceiling)
	}
	if got := countFor(t, app, token); got != ceiling {
		t.Errorf("download_count = %d, want %d", got, ceiling)
	}
}

func TestShareLinkDownloadCounts_ReportsTodaysTally(t *testing.T) {
	app, token := setupCounterTestApp(t)

	for i := 0; i < 3; i++ {
		if _, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil {
			t.Fatal(err)
		}
	}

	lifetime, day, err := shareLinkDownloadCounts(app, token)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if lifetime != 3 || day != 3 {
		t.Errorf("counts = (%d, %d), want (3, 3)", lifetime, day)
	}
}

// A counter left over from an earlier day must read as zero for today, or a
// refusal would name the wrong ceiling.
func TestShareLinkDownloadCounts_StaleDayReadsAsZeroToday(t *testing.T) {
	app, token := setupCounterTestApp(t)

	if _, err := claimShareLinkDownload(app, token, sharequota.ShareLimits{}); err != nil {
		t.Fatal(err)
	}
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	if _, err := app.NonconcurrentDB().NewQuery(`
		UPDATE drive_share_links SET download_day = {:day} WHERE token = {:token}
	`).Bind(map[string]any{"day": yesterday, "token": token}).Execute(); err != nil {
		t.Fatal(err)
	}

	lifetime, day, err := shareLinkDownloadCounts(app, token)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if lifetime != 1 {
		t.Errorf("lifetime = %d, want 1", lifetime)
	}
	if day != 0 {
		t.Errorf("today = %d, want 0 — the stored counter belongs to another day", day)
	}
}

func TestSecondsUntilUTCMidnight(t *testing.T) {
	// Just after midnight: nearly a whole day to wait.
	early := time.Date(2026, 3, 1, 0, 0, 30, 0, time.UTC)
	if got := secondsUntilUTCMidnight(early); got != 86370 {
		t.Errorf("just after midnight = %d, want 86370", got)
	}

	// Just before: a few seconds.
	late := time.Date(2026, 3, 1, 23, 59, 50, 0, time.UTC)
	if got := secondsUntilUTCMidnight(late); got != 10 {
		t.Errorf("just before midnight = %d, want 10", got)
	}

	// Never zero — a Retry-After of 0 invites an immediate retry that would
	// only be refused again.
	exact := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	if got := secondsUntilUTCMidnight(exact); got <= 0 {
		t.Errorf("at midnight = %d, want a positive delay", got)
	}
}

// Range support means one scrub is many requests for one download. Only a
// request that starts a transfer is charged, or a seeked video would drain a
// link in seconds.
func TestIsChargeableRange_Drive(t *testing.T) {
	req := func(rangeHeader string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/f", nil)
		if rangeHeader != "" {
			r.Header.Set("Range", rangeHeader)
		}
		return r
	}

	for _, v := range []string{"", "bytes=0-", "bytes=0-1023"} {
		if !isChargeableRange(req(v)) {
			t.Errorf("Range %q starts a transfer and must be charged", v)
		}
	}
	for _, v := range []string{"bytes=1024-2047", "bytes=500000-", "bytes=-500"} {
		if isChargeableRange(req(v)) {
			t.Errorf("Range %q is a continuation and must not be charged", v)
		}
	}
}
