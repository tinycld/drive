package drive

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"tinycld.org/core/driveshare"
	"tinycld.org/core/logging"
	"tinycld.org/core/versionhooks"
)

var versionLog = logging.ForPackage("drive")

// loadVersionForRead resolves a version and its item for a caller with
// read access. A caller without access gets the same 404 as a missing
// version, so the endpoint does not reveal which ids exist.
func loadVersionForRead(app core.App, re *core.RequestEvent, versionID string) (*core.Record, *core.Record, error) {
	version, err := app.FindRecordById("drive_item_versions", versionID)
	if err != nil {
		return nil, nil, re.NotFoundError("version not found", nil)
	}
	item, err := app.FindRecordById("drive_items", version.GetString("item"))
	if err != nil {
		return nil, nil, re.NotFoundError("version not found", nil)
	}
	if err := driveshare.CheckReadItem(app, re.Auth.Id, item); err != nil {
		return nil, nil, re.NotFoundError("version not found", nil)
	}
	return item, version, nil
}

// writeVersionHTML sends rendered version HTML. no-cache, not immutable:
// URL-mode images inside carry short-lived file tokens.
func writeVersionHTML(re *core.RequestEvent, html string) error {
	re.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
	re.Response.Header().Set("Cache-Control", "private, no-cache")
	re.Response.WriteHeader(http.StatusOK)
	_, err := re.Response.Write([]byte(html))
	return err
}

// handleVersionRender serves a read-only preview of one version through
// its item type's versionhooks Render.
func handleVersionRender(app core.App, re *core.RequestEvent) error {
	item, version, err := loadVersionForRead(app, re, re.Request.PathValue("id"))
	if err != nil {
		return err
	}
	hook := versionhooks.For(item.GetString("mime_type"))
	if hook.Render == nil {
		return re.NotFoundError("no preview for this file type", nil)
	}
	if version.GetString("file") == "" {
		return router.NewApiError(http.StatusUnprocessableEntity, "this version has no file", nil)
	}
	html, err := hook.Render(re.Request.Context(), app, item, version, re.Auth.Id)
	if err != nil {
		versionLog.WarnContext(re.Request.Context(), "version render failed",
			"itemID", item.Id, "versionID", version.Id, "err", err)
		return re.InternalServerError("could not render this version", nil)
	}
	return writeVersionHTML(re, html)
}
