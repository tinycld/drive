package drive

import "tinycld.org/core/oauth"

// Drive's OAuth scopes. The documents text and calc edit are drive_items, so
// a token that does anything useful with those packages holds drive:read too.
const (
	scopeRead  = "drive:read"
	scopeWrite = "drive:write"
)

// oauthPackage declares what an OAuth token may reach in drive. Registered
// from registerShared; the catalog, the consent screen and the CLI's login
// request are all derived from it. A route or collection missing here is
// default-denied for OAuth callers only — sessions still work — so the CLI's
// surface is pinned in oauth_scopes_test.go.
func oauthPackage() oauth.Package {
	rw := oauth.Access{Read: []string{scopeRead}, Write: []string{scopeWrite}}
	return oauth.Package{
		Slug: "drive",
		Scopes: []oauth.Scope{
			{ID: scopeRead, Label: "Read your files"},
			{ID: scopeWrite, Label: "Create and modify your files"},
		},
		Collections: map[string]oauth.Access{
			"drive_items":         rw,
			"drive_shares":        rw,
			"drive_item_state":    rw,
			"drive_item_versions": rw,
		},
		Endpoints: map[string][]string{
			"GET /api/drive/search":             {scopeRead},
			"POST /api/drive/download-token":    {scopeRead},
			"POST /api/drive/export-token":      {scopeRead},
			"GET /api/drive/storage-usage":      {scopeRead},
			"POST /api/drive/upload-version":    {scopeWrite},
			"POST /api/drive/share":             {scopeWrite},
			"POST /api/drive/share-link":        {scopeWrite},
			"GET /api/drive/share-links":        {scopeRead},
			"POST /api/drive/versions/restore":  {scopeWrite},
			"POST /api/drive/versions/snapshot": {scopeWrite},
		},
		EndpointPrefixes: []oauth.EndpointPrefix{
			// Revoking a link carries the link id in the path.
			{Method: "DELETE", Prefix: "/api/drive/share-link/", Scopes: []string{scopeWrite}},
		},
	}
}
