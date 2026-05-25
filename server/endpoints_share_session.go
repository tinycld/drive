package drive

import (
	"encoding/json"
	"net/http"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/sharelink"
)

// handleCreateShareSession mints (or resumes) an anonymous share session
// for a public share link. The client calls this when an anonymous
// visitor opens /share/{token}; the returned session_token is the bearer
// credential for every subsequent anon action (render, comments, edit).
//
// The visitor's stable identity (anon_id) is supplied by the client from
// a long-lived cookie; if absent/invalid we mint a fresh one. The
// display name ("Anon <Animal>") is derived deterministically from the
// anon_id, so the same visitor always renders the same name everywhere.
//
// Public + rate-limited (reuses the share-link IP limiter).
func handleCreateShareSession(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	shareToken := re.Request.PathValue("token")

	link, item, err := sharelink.ResolveLink(app, shareToken)
	if err != nil {
		return re.JSON(sharelink.HTTPStatus(err), map[string]string{"error": err.Error()})
	}

	var body struct {
		AnonID string `json:"anon_id"`
	}
	// Body is optional; ignore decode errors (empty body is fine).
	_ = json.NewDecoder(re.Request.Body).Decode(&body)

	anonID := body.AnonID
	if !sharelink.IsValidAnonID(anonID) {
		anonID = sharelink.NewAnonID()
	}
	displayName := sharelink.DisplayName(anonID)
	role := link.GetString("role")

	claims := sharelink.Claims{
		ShareToken:  shareToken,
		AnonID:      anonID,
		DisplayName: displayName,
		Role:        role,
		ItemID:      item.Id,
	}
	sessionToken, err := sharelink.MintSession(app, claims)
	if err != nil {
		return re.InternalServerError("failed to mint session", err)
	}

	orgName := ""
	if org, err := app.FindRecordById("orgs", item.GetString("org")); err == nil {
		orgName = org.GetString("name")
	}

	return re.JSON(http.StatusOK, map[string]any{
		"session_token": sessionToken,
		"anon_id":       anonID,
		"display_name":  displayName,
		"role":          role,
		"item_id":       item.Id,
		"name":          item.GetString("name"),
		"mime_type":     item.GetString("mime_type"),
		"org_name":      orgName,
	})
}
