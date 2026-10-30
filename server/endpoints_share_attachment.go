package drive

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/sharelink"
	"tinycld.org/packages/drive/api"
)

// handleShareAttachment serves an item attached to a share link's document
// (an image inserted into it) to an anonymous share visitor. The visitor has
// no file token, so the share session is the credential, and it reaches only
// rows whose attached_to is the shared document. VerifyAndResolve re-checks
// the link, so revoking it cuts the images off at once.
func handleShareAttachment(app core.App, re *core.RequestEvent) error {
	if !publicShareLimiter.AllowOrLog(getClientIP(re.Request), "drive.share.attachment") {
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
	return serveRecordFile(app, re, item, item.GetString("name"))
}
