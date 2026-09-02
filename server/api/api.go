// Package api declares the HTTP payload contract of the drive package: one
// exported struct per request/response.
//
// This is the single source of truth for these shapes. The app generator
// parses this package with go/ast (it is never imported by the generator) and
// emits lib/generated/drive-api.ts for the web client; the CLI imports the
// structs directly. It is deliberately self-contained — no imports — so the
// generator needs no cross-package type resolution and a CLI import does not
// drag in the drive server's dependency chain. Constructs the generator cannot
// map faithfully (untagged exported fields, `any`, embedded fields, non-stdlib
// imports) fail generation loudly, so keep this package boring.
//
// Not covered here: the binary streams (folder download, export, share-link
// file/thumbnail) and the share-session/OTP endpoints, whose client lives in
// @tinycld/core.
package api

// SearchResultItem is one hit from GET /api/drive/search. Highlight carries
// <mark> markup from FTS.
type SearchResultItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	IsFolder    bool   `json:"is_folder"`
	MimeType    string `json:"mime_type"`
	Size        int64  `json:"size"`
	Description string `json:"description"`
	Updated     string `json:"updated"`
	Highlight   string `json:"highlight"`
}

// SearchResponse is returned by GET /api/drive/search (query params: q,
// limit, offset). Items is never null; queries under 2 characters return an
// empty result.
type SearchResponse struct {
	Items []SearchResultItem `json:"items"`
	Total int                `json:"total"`
}

// ShareRecipient is one target of a share operation. Either UserID (an
// existing user) or Email (an external invite) identifies the recipient; Role
// is "viewer" or "editor" (anything else falls back to "viewer").
type ShareRecipient struct {
	UserID string `json:"user_id,omitempty"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// ShareRequest is the body of POST /api/drive/share.
type ShareRequest struct {
	ItemID     string           `json:"item_id"`
	Recipients []ShareRecipient `json:"recipients"`
	Message    string           `json:"message,omitempty"`
}

// ShareResponse reports how many drive_shares rows POST /api/drive/share
// created (existing shares and external invites don't count).
type ShareResponse struct {
	SharesCreated int `json:"shares_created"`
}

// VersionFileResponse describes the item's current file after a version
// operation — returned by POST /api/drive/upload-version and
// POST /api/drive/versions/restore.
type VersionFileResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	File     string `json:"file"`
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type"`
}

// RestoreVersionRequest is the body of POST /api/drive/versions/restore.
type RestoreVersionRequest struct {
	Item    string `json:"item"`
	Version string `json:"version"`
}

// SnapshotVersionRequest is the body of POST /api/drive/versions/snapshot.
type SnapshotVersionRequest struct {
	Item  string `json:"item"`
	Label string `json:"label,omitempty"`
}

// SnapshotVersionResponse acknowledges a snapshot with the item's record ID.
type SnapshotVersionResponse struct {
	Item string `json:"item"`
}

// DownloadTokenRequest is the body of POST /api/drive/download-token; Item
// must be a folder.
type DownloadTokenRequest struct {
	Item string `json:"item"`
}

// ExportTokenRequest is the body of POST /api/drive/export-token. To names
// the target format — "pdf" or "svg"; empty defaults to "pdf".
type ExportTokenRequest struct {
	Item string `json:"item"`
	To   string `json:"to,omitempty"`
}

// TokenResponse is returned by POST /api/drive/download-token and
// /api/drive/export-token: a single-use, short-lived token plus the relative
// URL that consumes it.
type TokenResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

// CreateShareLinkRequest is the body of POST /api/drive/share-link. Role is
// "viewer", "commentor", or "editor" (anything else falls back to "viewer");
// ExpiresAt is an RFC 3339 timestamp, empty for no expiry.
type CreateShareLinkRequest struct {
	ItemID    string `json:"item_id"`
	Role      string `json:"role,omitempty"`
	ExpiresAt string `json:"expires_at,omitempty"`
}

// ShareLinkResponse is returned by POST /api/drive/share-link. URL is the
// absolute public /share/<token> address.
type ShareLinkResponse struct {
	ID    string `json:"id"`
	Token string `json:"token"`
	URL   string `json:"url"`
}

// ShareLinkEntry is one row of GET /api/drive/share-links.
type ShareLinkEntry struct {
	ID             string `json:"id"`
	Token          string `json:"token"`
	URL            string `json:"url"`
	Role           string `json:"role"`
	IsActive       bool   `json:"is_active"`
	ExpiresAt      string `json:"expires_at"`
	DownloadCount  int    `json:"download_count"`
	LastAccessedAt string `json:"last_accessed_at"`
	Created        string `json:"created"`
}

// ShareLinkListResponse is returned by GET /api/drive/share-links?item_id=…;
// Links is never null.
type ShareLinkListResponse struct {
	Links []ShareLinkEntry `json:"links"`
}

// ShareLinkMetadataResponse is returned by GET /api/drive/share-link/{token}:
// public metadata plus the proxy URLs for the file bytes and thumbnail.
type ShareLinkMetadataResponse struct {
	Name         string `json:"name"`
	MimeType     string `json:"mime_type"`
	Size         int64  `json:"size"`
	Category     string `json:"category"`
	FileURL      string `json:"file_url"`
	ThumbnailURL string `json:"thumbnail_url"`
	Updated      string `json:"updated"`
	OrgName      string `json:"org_name"`
	ItemID       string `json:"item_id"`
}

// SuccessResponse acknowledges a state change with no other payload
// (DELETE /api/drive/share-link/{id}).
type SuccessResponse struct {
	Success bool `json:"success"`
}

// ErrorResponse is the JSON error shape of the public share-link endpoints
// (which serve anonymous viewers and rate-limited requests).
type ErrorResponse struct {
	Error string `json:"error"`
}

// UserStorageBreakdown is one row of the optional per-user usage breakdown.
type UserStorageBreakdown struct {
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
	UserEmail string `json:"user_email"`
	DriveUsed int64  `json:"drive_used"`
}

// StorageUsageResponse is returned by GET /api/drive/storage-usage. Users is
// present only when ?breakdown=users is requested by an owner or admin.
type StorageUsageResponse struct {
	UserUsedBytes int64                  `json:"user_used_bytes"`
	OrgDriveBytes int64                  `json:"org_drive_bytes"`
	OrgMailBytes  int64                  `json:"org_mail_bytes"`
	LimitBytes    int64                  `json:"limit_bytes"`
	HasLimit      bool                   `json:"has_limit"`
	Users         []UserStorageBreakdown `json:"users,omitempty"`
}
