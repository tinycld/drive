package drive

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/coreserver"
	"tinycld.org/core/mailer"
)

type shareRecipient struct {
	UserID string `json:"user_id,omitempty"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

type shareRequest struct {
	ItemID     string           `json:"item_id"`
	Recipients []shareRecipient `json:"recipients"`
	Message    string           `json:"message"`
}

func handleShare(app core.App, re *core.RequestEvent) error {
	userID := re.Auth.Id

	var req shareRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&req); err != nil {
		return re.BadRequestError("Invalid request", err)
	}

	if req.ItemID == "" || len(req.Recipients) == 0 {
		return re.BadRequestError("item_id and recipients are required", nil)
	}

	item, err := app.FindRecordById("drive_items", req.ItemID)
	if err != nil {
		return re.NotFoundError("Item not found", err)
	}

	// Single-org: created_by holds a users id directly, so this is a
	// straight comparison rather than a junction hop.
	if item.GetString("created_by") != userID {
		return re.ForbiddenError("Only the creator can share this item", nil)
	}

	senderUser, err := app.FindRecordById("users", userID)
	if err != nil {
		return re.InternalServerError("Failed to load user", err)
	}
	senderName := senderUser.GetString("name")
	if senderName == "" {
		senderName = senderUser.GetString("email")
	}

	shareCol, err := app.FindCollectionByNameOrId("drive_shares")
	if err != nil {
		return re.InternalServerError("Failed to find shares collection", err)
	}

	created := 0
	for _, r := range req.Recipients {
		role := r.Role
		if role != "editor" && role != "viewer" {
			role = "viewer"
		}

		if r.UserID != "" {
			existing, _ := app.FindFirstRecordByFilter(
				"drive_shares",
				"item = {:item} && user = {:user}",
				map[string]any{"item": req.ItemID, "user": r.UserID},
			)
			if existing == nil {
				share := core.NewRecord(shareCol)
				share.Set("item", req.ItemID)
				share.Set("user", r.UserID)
				share.Set("role", role)
				share.Set("created_by", item.GetString("created_by"))
				if err := app.Save(share); err != nil {
					app.Logger().Error("Failed to create share", "error", err)
					continue
				}
				created++
			}
		}

		if r.Email != "" {
			if r.UserID == "" {
				// External recipient: create a public share link and use /share/<token> URL
				go sendExternalShareInvite(app, senderName, r, item, req.Message, item.GetString("created_by"), userID)
			} else {
				go sendShareInvite(app, senderName, r, item.GetString("name"), req.ItemID, req.Message, userID)
			}
		}
	}

	re.Response.Header().Set("Content-Type", "application/json")
	re.Response.WriteHeader(http.StatusOK)
	return json.NewEncoder(re.Response).Encode(map[string]any{
		"shares_created": created,
	})
}

func sendShareInvite(app core.App, senderName string, r shareRecipient, itemName, itemID, message, senderUserID string) {
	link := fmt.Sprintf("%s/drive?file=%s", app.Settings().Meta.AppURL, itemID)

	greeting := "Hi"
	if r.Name != "" {
		greeting = fmt.Sprintf("Hi %s", r.Name)
	}

	html := fmt.Sprintf(`<div style="font-family: sans-serif; max-width: 500px;">
<p>%s,</p>
<p><strong>%s</strong> shared &ldquo;%s&rdquo; with you.</p>`,
		greeting, senderName, itemName)

	if message != "" {
		html += fmt.Sprintf(`<p style="color: #555; border-left: 3px solid #ddd; padding-left: 12px;">%s</p>`, message)
	}

	html += fmt.Sprintf(`<p><a href="%s" style="display: inline-block; padding: 10px 24px; background: #1a73e8; color: #fff; text-decoration: none; border-radius: 6px;">Open</a></p>
<p style="color: #888; font-size: 13px;">Or copy this link: %s</p>
</div>`, link, link)

	text := fmt.Sprintf("%s,\n\n%s shared \"%s\" with you.\n\nOpen: %s\n", greeting, senderName, itemName, link)
	if message != "" {
		text = fmt.Sprintf("%s,\n\n%s shared \"%s\" with you.\n\n\"%s\"\n\nOpen: %s\n", greeting, senderName, itemName, message, link)
	}

	msg := &mailer.Message{
		To:      []mailer.Recipient{{Name: r.Name, Email: r.Email}},
		Subject: fmt.Sprintf("%s shared \"%s\" with you", senderName, itemName),
		HTML:    html,
		Text:    text,
	}

	// Demo accounts: skip the outbound mail. The drive_shares row is already
	// created by the caller, so the recipient still appears in the share UI.
	if coreserver.IsDemoUser(app, senderUserID) {
		return
	}

	if err := mailer.DefaultSender().Send(context.Background(), msg); err != nil {
		app.Logger().Error("Failed to send share invite", "to", r.Email, "error", err)
	}
}

// sendExternalShareInvite creates a public share link and sends an email with the /share/<token> URL.
func sendExternalShareInvite(app core.App, senderName string, r shareRecipient, item *core.Record, message string, createdByUserID string, senderUserID string) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		app.Logger().Error("Failed to generate share token", "error", err)
		return
	}
	token := hex.EncodeToString(tokenBytes)

	col, err := app.FindCollectionByNameOrId("drive_share_links")
	if err != nil {
		app.Logger().Error("Failed to find drive_share_links collection", "error", err)
		return
	}

	role := r.Role
	if role != "editor" && role != "viewer" {
		role = "viewer"
	}

	record := core.NewRecord(col)
	record.Set("item", item.Id)
	record.Set("token", token)
	record.Set("created_by", createdByUserID)
	record.Set("role", role)
	record.Set("is_active", true)
	record.Set("download_count", 0)

	if err := app.Save(record); err != nil {
		app.Logger().Error("Failed to create share link for external invite", "error", err)
		return
	}

	link := fmt.Sprintf("%s/share/%s", app.Settings().Meta.AppURL, token)
	itemName := item.GetString("name")

	greeting := "Hi"
	if r.Name != "" {
		greeting = fmt.Sprintf("Hi %s", r.Name)
	}

	html := fmt.Sprintf(`<div style="font-family: sans-serif; max-width: 500px;">
<p>%s,</p>
<p><strong>%s</strong> shared &ldquo;%s&rdquo; with you.</p>`,
		greeting, senderName, itemName)

	if message != "" {
		html += fmt.Sprintf(`<p style="color: #555; border-left: 3px solid #ddd; padding-left: 12px;">%s</p>`, message)
	}

	html += fmt.Sprintf(`<p><a href="%s" style="display: inline-block; padding: 10px 24px; background: #1a73e8; color: #fff; text-decoration: none; border-radius: 6px;">Open</a></p>
<p style="color: #888; font-size: 13px;">Or copy this link: %s</p>
</div>`, link, link)

	text := fmt.Sprintf("%s,\n\n%s shared \"%s\" with you.\n\nOpen: %s\n", greeting, senderName, itemName, link)
	if message != "" {
		text = fmt.Sprintf("%s,\n\n%s shared \"%s\" with you.\n\n\"%s\"\n\nOpen: %s\n", greeting, senderName, itemName, message, link)
	}

	msg := &mailer.Message{
		To:      []mailer.Recipient{{Name: r.Name, Email: r.Email}},
		Subject: fmt.Sprintf("%s shared \"%s\" with you", senderName, itemName),
		HTML:    html,
		Text:    text,
	}

	// Demo accounts: the share-link record was created above so the URL is
	// visible in the UI; skip the outbound email so nothing leaves the box.
	if coreserver.IsDemoUser(app, senderUserID) {
		return
	}

	if err := mailer.DefaultSender().Send(context.Background(), msg); err != nil {
		app.Logger().Error("Failed to send external share invite", "to", r.Email, "error", err)
	}
}
