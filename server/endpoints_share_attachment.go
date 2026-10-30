package drive

import (
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/ratelimit"
	"tinycld.org/core/sharelink"
	"tinycld.org/packages/drive/api"
)

// shareAttachmentLimiter is apart from publicShareLimiter: a shared
// document's images load on every render and would use up the allowance the
// other public share endpoints rely on.
var shareAttachmentLimiter = ratelimit.New(600, time.Minute)

// handleShareAttachment serves an item attached to a share link's document
// (an image inserted into it) to an anonymous share visitor. The visitor has
// no file token, so the share session is the credential, and it reaches only
// rows whose attached_to is the shared document. VerifyAndResolve re-checks
// the link, so revoking it cuts the images off at once.
func handleShareAttachment(app core.App, re *core.RequestEvent) error {
	if !shareAttachmentLimiter.AllowOrLog(getClientIP(re.Request), "drive.share.attachment") {
		return re.JSON(http.StatusTooManyRequests, api.ErrorResponse{Error: "rate limit exceeded"})
	}

	_, _, doc, err := sharelink.VerifyAndResolve(app, re.Request.URL.Query().Get("session"))
	if err != nil {
		return re.JSON(sharelink.HTTPStatus(err), api.ErrorResponse{Error: err.Error()})
	}

	item, err := app.FindRecordById("drive_items", re.Request.PathValue("id"))
	if err != nil || item.GetString("attached_to") != doc.Id {
		return re.NotFoundError("attachment not found", nil)
	}
	// A document's images load on every render. A short private cache spares
	// the requests; an image is rarely replaced, and then only for 5 minutes.
	return serveRecordFile(app, re, item, item.GetString("name"), "private, max-age=300")
}
