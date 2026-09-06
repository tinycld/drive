package drive

import (
	"testing"

	"tinycld.org/core/oauth"
)

// Every route the drive CLI drives must resolve to a scope. An unclassified
// route 403s for OAuth callers only — sessions still work — so the CLI's fake
// server never notices; this is the test that does.
func TestOAuthClassifiesCLIRoutes(t *testing.T) {
	oauth.RegisterPackage(oauthPackage())

	for _, r := range []struct{ method, path, scope string }{
		{"GET", "/api/drive/search", scopeRead},
		{"POST", "/api/drive/download-token", scopeRead},
		{"POST", "/api/drive/export-token", scopeRead},
		{"GET", "/api/drive/storage-usage", scopeRead},
		{"POST", "/api/drive/upload-version", scopeWrite},
		{"POST", "/api/drive/share", scopeWrite},
		{"POST", "/api/drive/share-link", scopeWrite},
		{"GET", "/api/drive/share-links", scopeRead},
		{"DELETE", "/api/drive/share-link/abc123", scopeWrite},
		{"POST", "/api/drive/versions/restore", scopeWrite},
		{"POST", "/api/drive/versions/snapshot", scopeWrite},
		{"GET", "/api/collections/drive_items/records", scopeRead},
		{"POST", "/api/collections/drive_items/records", scopeWrite},
		{"GET", "/api/collections/drive_item_versions/records", scopeRead},
		{"POST", "/api/collections/drive_item_versions/records", scopeWrite},
		// `drive get` fetches the stored content.
		{"GET", "/api/files/drive_items/rec123/report_ab12cd34ef.pdf", scopeRead},
	} {
		rule := oauth.ScopeForRoute(r.method, r.path)
		if len(rule) == 0 {
			t.Errorf("%s %s is default-denied for OAuth callers", r.method, r.path)
			continue
		}
		if !rule.SatisfiedBy([]string{r.scope}) {
			t.Errorf("%s %s: %q must admit it (got %v)", r.method, r.path, r.scope, rule)
		}
	}
}

// Read must not carry write: a token consented to read-only file access that
// could still upload or share would make the consent screen a lie.
func TestOAuthReadScopeDoesNotWrite(t *testing.T) {
	oauth.RegisterPackage(oauthPackage())

	for _, r := range []struct{ method, path string }{
		{"POST", "/api/drive/upload-version"},
		{"POST", "/api/drive/share"},
		{"DELETE", "/api/drive/share-link/abc123"},
		{"POST", "/api/collections/drive_items/records"},
	} {
		if oauth.ScopeForRoute(r.method, r.path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("%s %s: drive:read alone must not admit a write", r.method, r.path)
		}
	}
	// The bare family prefix is a different route and must not ride along.
	if got := oauth.ScopeForRoute("DELETE", "/api/drive/share-link/"); len(got) != 0 {
		t.Errorf("DELETE /api/drive/share-link/ must stay default-denied, got %v", got)
	}
}

// The search source's scopes must be scopes this package actually registers,
// or the federated search would admit a scope no grant can carry.
func TestSearchSourceScopesAreRegistered(t *testing.T) {
	oauth.RegisterPackage(oauthPackage())
	registered := oauth.PackageScopes("drive")
	for _, s := range searchSource().Scopes {
		if !oauth.HasScope(registered, s) {
			t.Errorf("search source names scope %q, which drive does not register (%v)", s, registered)
		}
	}
}
