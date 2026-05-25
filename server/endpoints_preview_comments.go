package drive

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"tinycld.org/core/sharelink"
)

const previewCommentsCollection = "drive_preview_comments"

// commentPrincipal is the resolved identity acting on a preview comment:
// either an anonymous share-session visitor or a logged-in org member.
// Exactly one of (anonID, userOrgID) is set.
type commentPrincipal struct {
	item      *core.Record
	anonID    string // set for anonymous share-session visitors
	userOrgID string // set for logged-in org members
	name      string // display name snapshot
	canEdit   bool   // editor role (unused for comments, kept for parity)
	canCmt    bool   // may create comments
}

// resolvePreviewCommentPrincipal authorizes a preview-comment request.
// A logged-in caller (re.Auth != nil) is authorized via their org share
// on the item. An anonymous caller must supply a valid share session via
// the `session` query param (or X-Share-Session header). The item is
// taken from the share link / the {itemId} path for the auth path.
func resolvePreviewCommentPrincipal(app *pocketbase.PocketBase, re *core.RequestEvent, itemID string) (*commentPrincipal, error) {
	// Logged-in org member path.
	if re.Auth != nil {
		item, userOrgID, err := resolveItemAndUserOrg(app, re, itemID, false)
		if err != nil {
			return nil, err
		}
		name := displayNameForUserOrg(app, userOrgID)
		return &commentPrincipal{
			item:      item,
			userOrgID: userOrgID,
			name:      name,
			canEdit:   true,
			canCmt:    true,
		}, nil
	}

	// Anonymous share-session path.
	sessionToken := re.Request.URL.Query().Get("session")
	if sessionToken == "" {
		sessionToken = re.Request.Header.Get("X-Share-Session")
	}
	if sessionToken == "" {
		return nil, re.UnauthorizedError("authentication or share session required", nil)
	}
	claims, _, item, err := sharelink.VerifyAndResolve(app, sessionToken)
	if err != nil {
		// Return a real (non-nil) API error so the caller's `if err !=
		// nil` actually trips. router.NewApiError renders the status +
		// message; using re.JSON here would write a body AND return nil,
		// letting the handler fall through to a nil-principal panic.
		return nil, router.NewApiError(sharelink.HTTPStatus(err), err.Error(), nil)
	}
	if itemID != "" && itemID != item.Id {
		return nil, re.ForbiddenError("session does not match item", nil)
	}
	return &commentPrincipal{
		item:    item,
		anonID:  claims.AnonID,
		name:    claims.DisplayName,
		canEdit: claims.CanEdit(),
		canCmt:  claims.CanComment(),
	}, nil
}

// displayNameForUserOrg resolves a human name for a logged-in commenter,
// falling back through user.name → user.username → email.
func displayNameForUserOrg(app *pocketbase.PocketBase, userOrgID string) string {
	uo, err := app.FindRecordById("user_org", userOrgID)
	if err != nil {
		return "Member"
	}
	user, err := app.FindRecordById("users", uo.GetString("user"))
	if err != nil {
		return "Member"
	}
	if n := user.GetString("name"); n != "" {
		return n
	}
	if u := user.GetString("username"); u != "" {
		return u
	}
	if e := user.GetString("email"); e != "" {
		return e
	}
	return "Member"
}

// commentJSON is the wire shape returned to clients.
func commentToJSON(r *core.Record) map[string]any {
	var anchor any
	if raw := r.GetString("anchor"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &anchor)
	}
	return map[string]any{
		"id":              r.Id,
		"drive_item":      r.GetString("drive_item"),
		"anchor_kind":     r.GetString("anchor_kind"),
		"anchor":          anchor,
		"quoted_text":     r.GetString("quoted_text"),
		"parent_comment":  r.GetString("parent_comment"),
		"body":            r.GetString("body"),
		"resolved_at":     r.GetString("resolved_at"),
		"author_user_org": r.GetString("author_user_org"),
		"author_anon_id":  r.GetString("author_anon_id"),
		"author_name":     r.GetString("author_name"),
		"created":         r.GetString("created"),
		"updated":         r.GetString("updated"),
	}
}

// handleListPreviewComments returns all comments for the item referenced
// by the share link {token} (anon) or the authenticated caller.
func handleListPreviewComments(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	principal, err := resolvePreviewCommentPrincipal(app, re, re.Request.URL.Query().Get("item"))
	if err != nil {
		return err
	}

	rows, err := app.FindRecordsByFilter(
		previewCommentsCollection,
		"drive_item = {:item}",
		"created", 0, 0,
		map[string]any{"item": principal.item.Id},
	)
	if err != nil {
		return re.InternalServerError("failed to load comments", err)
	}

	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, commentToJSON(r))
	}
	return re.JSON(http.StatusOK, map[string]any{"comments": out})
}

// handleCreatePreviewComment creates a comment (or reply) on a preview.
func handleCreatePreviewComment(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	var body struct {
		Item       string          `json:"item"`
		AnchorKind string          `json:"anchor_kind"`
		Anchor     json.RawMessage `json:"anchor"`
		QuotedText string          `json:"quoted_text"`
		Parent     string          `json:"parent_comment"`
		Body       string          `json:"body"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}

	principal, err := resolvePreviewCommentPrincipal(app, re, body.Item)
	if err != nil {
		return err
	}
	if !principal.canCmt {
		return re.ForbiddenError("this link does not allow commenting", nil)
	}
	if body.Body == "" {
		return re.BadRequestError("comment body required", nil)
	}
	if body.AnchorKind != "calc_cell" && body.AnchorKind != "text_range" {
		return re.BadRequestError("invalid anchor_kind", nil)
	}
	if !anchorMatchesKind(body.AnchorKind, body.Anchor) {
		return re.BadRequestError("anchor shape does not match anchor_kind", nil)
	}

	col, err := app.FindCollectionByNameOrId(previewCommentsCollection)
	if err != nil {
		return re.InternalServerError("collection not found", err)
	}

	rec := core.NewRecord(col)
	rec.Set("drive_item", principal.item.Id)
	rec.Set("anchor_kind", body.AnchorKind)
	if len(body.Anchor) > 0 {
		rec.Set("anchor", string(body.Anchor))
	}
	if body.QuotedText != "" {
		rec.Set("quoted_text", body.QuotedText)
	}
	if body.Parent != "" {
		// Validate the parent belongs to the same item.
		parent, err := app.FindRecordById(previewCommentsCollection, body.Parent)
		if err != nil || parent.GetString("drive_item") != principal.item.Id {
			return re.BadRequestError("invalid parent_comment", nil)
		}
		rec.Set("parent_comment", body.Parent)
	}
	rec.Set("body", body.Body)
	rec.Set("author_name", principal.name)
	if principal.userOrgID != "" {
		rec.Set("author_user_org", principal.userOrgID)
	}
	if principal.anonID != "" {
		rec.Set("author_anon_id", principal.anonID)
	}

	if err := app.Save(rec); err != nil {
		return re.InternalServerError("failed to save comment", err)
	}
	return re.JSON(http.StatusOK, commentToJSON(rec))
}

// handleUpdatePreviewComment edits or resolves/reopens a comment the
// caller owns. Ownership = matching anon_id or user_org.
func handleUpdatePreviewComment(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	commentID := re.Request.PathValue("id")
	rec, err := app.FindRecordById(previewCommentsCollection, commentID)
	if err != nil {
		return re.NotFoundError("comment not found", nil)
	}

	principal, err := resolvePreviewCommentPrincipal(app, re, rec.GetString("drive_item"))
	if err != nil {
		return err
	}
	if !ownsComment(principal, rec) {
		return re.ForbiddenError("not your comment", nil)
	}

	var body struct {
		Body     *string `json:"body"`
		Resolved *bool   `json:"resolved"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}

	if body.Body != nil {
		if *body.Body == "" {
			return re.BadRequestError("comment body cannot be empty", nil)
		}
		rec.Set("body", *body.Body)
	}
	if body.Resolved != nil {
		if *body.Resolved {
			rec.Set("resolved_at", time.Now().UTC().Format(time.RFC3339))
		} else {
			rec.Set("resolved_at", "")
		}
	}

	if err := app.Save(rec); err != nil {
		return re.InternalServerError("failed to update comment", err)
	}
	return re.JSON(http.StatusOK, commentToJSON(rec))
}

// handleDeletePreviewComment deletes a comment the caller owns.
func handleDeletePreviewComment(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	ip := getClientIP(re.Request)
	if !publicShareLimiter.allow(ip) {
		return re.JSON(http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
	}

	commentID := re.Request.PathValue("id")
	rec, err := app.FindRecordById(previewCommentsCollection, commentID)
	if err != nil {
		return re.NotFoundError("comment not found", nil)
	}

	principal, err := resolvePreviewCommentPrincipal(app, re, rec.GetString("drive_item"))
	if err != nil {
		return err
	}
	if !ownsComment(principal, rec) {
		return re.ForbiddenError("not your comment", nil)
	}

	if err := app.Delete(rec); err != nil {
		return re.InternalServerError("failed to delete comment", err)
	}
	return re.JSON(http.StatusOK, map[string]any{"success": true})
}

// anchorMatchesKind validates that a client-supplied anchor JSON has the
// shape its anchor_kind requires: calc_cell needs a non-empty `col`
// string + a numeric `row`; text_range needs numeric `start`/`end` with
// start < end. Rejecting mismatched anchors at the boundary keeps the
// stored data well-formed so client-side grouping can't silently orphan
// a comment over a malformed anchor.
func anchorMatchesKind(kind string, raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var a map[string]any
	if err := json.Unmarshal(raw, &a); err != nil {
		return false
	}
	switch kind {
	case "calc_cell":
		col, okCol := a["col"].(string)
		_, okRow := a["row"].(float64) // JSON numbers decode to float64
		return okCol && col != "" && okRow
	case "text_range":
		start, okStart := a["start"].(float64)
		end, okEnd := a["end"].(float64)
		return okStart && okEnd && start < end
	default:
		return false
	}
}

// ownsComment reports whether the principal authored the comment.
func ownsComment(p *commentPrincipal, rec *core.Record) bool {
	if p.userOrgID != "" && rec.GetString("author_user_org") == p.userOrgID {
		return true
	}
	if p.anonID != "" && rec.GetString("author_anon_id") == p.anonID {
		return true
	}
	return false
}
