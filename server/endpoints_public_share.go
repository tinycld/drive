package drive

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/driveshare"
	"tinycld.org/core/ratelimit"
	"tinycld.org/packages/drive/api"
)

// The limiter itself now lives in tinycld.org/core/ratelimit — promoted from
// here when cards' public boards needed the same thing and a second copy in a
// second member was the alternative. Its caveats (in-memory, per-process, does
// not hold across instances) are documented there.

var publicShareLimiter = ratelimit.New(60, time.Minute)

// otpLimiter is a stricter per-IP limiter used by the share-link OTP
// request and verify endpoints. The OTP code is 6 digits (~10^6 keyspace);
// at the share-wide 60/min this leaves ~900 brute-force guesses per
// 15-min OTP TTL from a single IP, which is uncomfortably high. 10/min/IP
// gives ~150 guesses per TTL — still generous for legitimate humans
// (request + a handful of code attempts) but materially tightens the
// brute-force surface.
var otpLimiter = ratelimit.New(10, time.Minute)

func getClientIP(r *http.Request) string {
	return ratelimit.ClientIP(r)
}

// findShareLinkByToken loads and validates a share link record.
// Returns the share link record and the associated drive_items record.
func findShareLinkByToken(app core.App, token string) (*core.Record, *core.Record, int, string) {
	if len(token) != 64 {
		return nil, nil, http.StatusNotFound, "invalid token"
	}

	link, err := app.FindFirstRecordByFilter(
		"drive_share_links",
		"token = {:token}",
		map[string]any{"token": token},
	)
	if err != nil || link == nil {
		return nil, nil, http.StatusNotFound, "share link not found"
	}

	if !link.GetBool("is_active") {
		return nil, nil, http.StatusGone, "this share link has been revoked"
	}

	expiresAt := link.GetDateTime("expires_at")
	if !expiresAt.IsZero() && expiresAt.Time().Before(time.Now()) {
		return nil, nil, http.StatusGone, "this share link has expired"
	}

	itemID := link.GetString("item")
	item, err := app.FindRecordById("drive_items", itemID)
	if err != nil {
		return nil, nil, http.StatusNotFound, "file not found"
	}

	return link, item, 0, ""
}

func categorizeFromMime(mimeType string) string {
	switch {
	case mimeType == "application/pdf":
		return "pdf"
	case len(mimeType) > 6 && mimeType[:6] == "image/":
		return "image"
	case len(mimeType) > 6 && mimeType[:6] == "video/":
		return "video"
	case len(mimeType) > 6 && mimeType[:6] == "audio/":
		return "audio"
	default:
		return "unknown"
	}
}

// handleGetShareLinkMetadata returns JSON metadata for a public share link.
func handleGetShareLinkMetadata(app core.App, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.Allow(ip) {
		return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{Error: "rate limit exceeded"})
	}

	token := re.Request.PathValue("token")
	link, item, statusCode, errMsg := findShareLinkByToken(app, token)
	if link == nil {
		return re.JSON(statusCode, api.ErrorResponse{Error: errMsg})
	}

	// Update last_accessed_at
	link.Set("last_accessed_at", time.Now().UTC().Format(time.RFC3339))
	_ = app.Save(link)

	// Build proxy URLs
	baseURL := fmt.Sprintf("%s/api/drive/share-link/%s", app.Settings().Meta.AppURL, token)

	// Single-org: the deployment IS the org, so its display name comes from
	// app settings rather than an orgs row, and there is no slug to deep-link
	// through — in-app links are bare /drive.
	response := api.ShareLinkMetadataResponse{
		Name:         item.GetString("name"),
		MimeType:     item.GetString("mime_type"),
		Size:         int64(item.GetInt("size")),
		Category:     categorizeFromMime(item.GetString("mime_type")),
		FileURL:      baseURL + "/file",
		ThumbnailURL: baseURL + "/thumbnail",
		Updated:      item.GetString("updated"),
		OrgName:      app.Settings().Meta.AppName,
		ItemID:       item.Id,
	}

	return re.JSON(http.StatusOK, response)
}

// handleGetShareLinkFile streams the file content for a public share link.
func handleGetShareLinkFile(app core.App, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.Allow(ip) {
		return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{Error: "rate limit exceeded"})
	}

	token := re.Request.PathValue("token")
	link, item, statusCode, errMsg := findShareLinkByToken(app, token)
	if link == nil {
		return re.JSON(statusCode, api.ErrorResponse{Error: errMsg})
	}

	// Increment download_count
	link.Set("download_count", link.GetInt("download_count")+1)
	link.Set("last_accessed_at", time.Now().UTC().Format(time.RFC3339))
	_ = app.Save(link)

	reader, err := readFileContent(app, item)
	if err != nil {
		return re.JSON(http.StatusInternalServerError, api.ErrorResponse{Error: "failed to read file"})
	}
	defer reader.Close()

	mimeType := item.GetString("mime_type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	re.Response.Header().Set("Content-Type", mimeType)

	inline := re.Request.URL.Query().Get("inline") == "1"
	disposition := "attachment"
	if inline {
		disposition = "inline"
	}
	re.Response.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, item.GetString("name")))

	_, err = io.Copy(re.Response, reader)
	return err
}

// handleGetShareLinkThumbnail streams the thumbnail for a public share link.
func handleGetShareLinkThumbnail(app core.App, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.Allow(ip) {
		return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{Error: "rate limit exceeded"})
	}

	token := re.Request.PathValue("token")
	link, item, statusCode, errMsg := findShareLinkByToken(app, token)
	if link == nil {
		return re.JSON(statusCode, api.ErrorResponse{Error: errMsg})
	}

	thumbnail := item.GetString("thumbnail")
	if thumbnail == "" {
		return re.JSON(http.StatusNotFound, api.ErrorResponse{Error: "no thumbnail available"})
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return re.JSON(http.StatusInternalServerError, api.ErrorResponse{Error: "filesystem error"})
	}
	defer fsys.Close()

	key := item.BaseFilesPath() + "/" + thumbnail
	reader, err := fsys.GetReader(key)
	if err != nil {
		return re.JSON(http.StatusNotFound, api.ErrorResponse{Error: "thumbnail not found"})
	}
	defer reader.Close()

	re.Response.Header().Set("Content-Type", "image/jpeg")
	re.Response.Header().Set("Cache-Control", "public, max-age=3600")
	_, err = io.Copy(re.Response, reader)
	return err
}

// handleCreateShareLink creates a new public share link for a drive item.
func handleCreateShareLink(app core.App, re *core.RequestEvent) error {
	var body api.CreateShareLinkRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}

	if body.ItemID == "" {
		return re.BadRequestError("item_id is required", nil)
	}

	item, userID, err := resolveItemAndUser(app, re, body.ItemID, false)
	if err != nil {
		return err
	}

	// Verify caller is owner
	if err := driveshare.CheckDelete(app, userID, item.Id); err != nil {
		return re.ForbiddenError("only the owner can create share links", nil)
	}

	// Generate 64-char hex token (32 bytes of entropy)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return re.InternalServerError("failed to generate token", err)
	}
	token := hex.EncodeToString(tokenBytes)

	role := body.Role
	if role != "editor" && role != "viewer" && role != "commentor" {
		role = "viewer"
	}

	col, err := app.FindCollectionByNameOrId("drive_share_links")
	if err != nil {
		return re.InternalServerError("collection not found", err)
	}

	record := core.NewRecord(col)
	record.Set("item", item.Id)
	record.Set("token", token)
	record.Set("created_by", userID)
	record.Set("role", role)
	record.Set("is_active", true)
	record.Set("download_count", 0)

	if body.ExpiresAt != "" {
		record.Set("expires_at", body.ExpiresAt)
	}

	if err := app.Save(record); err != nil {
		return re.InternalServerError("failed to create share link", err)
	}

	shareURL := fmt.Sprintf("%s/share/%s", app.Settings().Meta.AppURL, token)

	return re.JSON(http.StatusOK, api.ShareLinkResponse{
		ID:    record.Id,
		Token: token,
		URL:   shareURL,
	})
}

// handleDeleteShareLink revokes a share link by setting is_active to false.
func handleDeleteShareLink(app core.App, re *core.RequestEvent) error {
	linkID := re.Request.PathValue("id")
	if linkID == "" {
		return re.BadRequestError("missing share link id", nil)
	}

	link, err := app.FindRecordById("drive_share_links", linkID)
	if err != nil {
		return re.NotFoundError("share link not found", nil)
	}

	// Verify caller owns the item
	itemID := link.GetString("item")
	_, userID, err := resolveItemAndUser(app, re, itemID, false)
	if err != nil {
		return err
	}
	if err := driveshare.CheckDelete(app, userID, itemID); err != nil {
		return re.ForbiddenError("only the owner can revoke share links", nil)
	}

	link.Set("is_active", false)
	if err := app.Save(link); err != nil {
		return re.InternalServerError("failed to revoke share link", err)
	}

	return re.JSON(http.StatusOK, api.SuccessResponse{Success: true})
}

// handleListShareLinks returns all share links for a given item.
func handleListShareLinks(app core.App, re *core.RequestEvent) error {
	itemID := re.Request.URL.Query().Get("item_id")
	if itemID == "" {
		return re.BadRequestError("item_id query parameter is required", nil)
	}

	_, userID, err := resolveItemAndUser(app, re, itemID, false)
	if err != nil {
		return err
	}
	if err := driveshare.CheckDelete(app, userID, itemID); err != nil {
		return re.ForbiddenError("only the owner can view share links", nil)
	}

	links, err := app.FindRecordsByFilter(
		"drive_share_links",
		"item = {:item}",
		"-created", 0, 0,
		map[string]any{"item": itemID},
	)
	if err != nil {
		return re.InternalServerError("failed to load share links", err)
	}

	result := make([]api.ShareLinkEntry, 0, len(links))
	for _, l := range links {
		shareURL := fmt.Sprintf("%s/share/%s", app.Settings().Meta.AppURL, l.GetString("token"))
		result = append(result, api.ShareLinkEntry{
			ID:             l.Id,
			Token:          l.GetString("token"),
			URL:            shareURL,
			Role:           l.GetString("role"),
			IsActive:       l.GetBool("is_active"),
			ExpiresAt:      l.GetString("expires_at"),
			DownloadCount:  l.GetInt("download_count"),
			LastAccessedAt: l.GetString("last_accessed_at"),
			Created:        l.GetString("created"),
		})
	}

	return re.JSON(http.StatusOK, api.ShareLinkListResponse{Links: result})
}
