package drive

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"tinycld.org/core/driveshare"
	"tinycld.org/core/realtime"
)

// The stable file endpoints.
//
// A drive item's blob is stored under a new random name on every write, and
// a document open in an editor is written every few seconds, so a
// `/api/files/drive_items/<id>/<name>` URL is correct only until the next
// save: a reader that built it from a cached row 404s, and a bookmarked one
// dies or serves a 30-day cached copy. These endpoints take the record id
// only, flush any live editor room so the bytes are the ones the editor
// shows, and serve the current blob with no caching.
//
// Auth is the signed-in user (SDK requests) or a PocketBase file token in
// `?token=` for the paths that cannot carry a header: a browser anchor
// download, `window.open`, and the native file downloader. The token is the
// same one `/api/files` accepts, so the client already has it.

// handleItemFile serves GET /api/drive/items/{id}/file.
func handleItemFile(app core.App, re *core.RequestEvent) error {
	user, err := fileRequestUser(app, re)
	if err != nil {
		return err
	}
	item, err := app.FindRecordById("drive_items", re.Request.PathValue("id"))
	if err != nil {
		return re.NotFoundError("item not found", nil)
	}
	if err := driveshare.CheckReadItem(app, user.Id, item); err != nil {
		return re.NotFoundError("item not found", nil)
	}
	if item.GetBool("is_folder") {
		return re.BadRequestError("item is a folder", nil)
	}

	item, err = flushItemForRead(app, re, item)
	if err != nil {
		return err
	}
	return serveRecordFile(app, re, item, item.GetString("name"))
}

// handleVersionFile serves GET /api/drive/versions/{id}/file. A version is
// immutable, so there is no room to flush; the item's name is the download
// name, as the version row has none of its own.
func handleVersionFile(app core.App, re *core.RequestEvent) error {
	user, err := fileRequestUser(app, re)
	if err != nil {
		return err
	}
	version, err := app.FindRecordById("drive_item_versions", re.Request.PathValue("id"))
	if err != nil {
		return re.NotFoundError("version not found", nil)
	}
	item, err := app.FindRecordById("drive_items", version.GetString("item"))
	if err != nil {
		return re.NotFoundError("version not found", nil)
	}
	if err := driveshare.CheckReadItem(app, user.Id, item); err != nil {
		return re.NotFoundError("version not found", nil)
	}
	return serveRecordFile(app, re, version, item.GetString("name"))
}

// fileRequestUser is the caller: the request's auth record, or the user a
// `?token=` PocketBase file token names.
func fileRequestUser(app core.App, re *core.RequestEvent) (*core.Record, error) {
	if re.Auth != nil {
		return re.Auth, nil
	}
	token := re.Request.URL.Query().Get("token")
	if token == "" {
		return nil, re.UnauthorizedError("Authentication required", nil)
	}
	user, err := app.FindAuthRecordByToken(token, core.TokenTypeFile)
	if err != nil {
		return nil, re.UnauthorizedError("invalid or expired token", nil)
	}
	return user, nil
}

// flushItemForRead brings a room-backed item's file current and returns the
// record as stored afterwards. A flush the server cannot run is an error the
// reader must see — a stale file is not served as if it were current.
func flushItemForRead(app core.App, re *core.RequestEvent, item *core.Record) (*core.Record, error) {
	if err := realtime.FlushItem(item.Id); err != nil {
		switch {
		case errors.Is(err, realtime.ErrReadOnly):
			return nil, router.NewApiError(http.StatusConflict,
				"the server is read-only; the latest edits cannot be saved yet", nil)
		case errors.Is(err, realtime.ErrStopping):
			return nil, router.NewApiError(http.StatusServiceUnavailable,
				"the server is restarting; try again in a moment", nil)
		}
		app.Logger().Warn("drive: flush before file read failed", "itemID", item.Id, "err", err)
		return nil, re.InternalServerError("failed to save the latest edits", nil)
	}
	fresh, err := app.FindRecordById(item.Collection().Name, item.Id)
	if err != nil {
		return nil, re.NotFoundError("item not found", nil)
	}
	return fresh, nil
}

// serveRecordFile streams a record's `file` blob. Serve (not io.Copy) so Range
// works; `?inline=1` opens in the browser, anything else downloads. no-store:
// the URL is stable across saves, so nothing between here and the user may
// keep a copy.
func serveRecordFile(app core.App, re *core.RequestEvent, record *core.Record, name string) error {
	filename := record.GetString("file")
	if filename == "" {
		return re.NotFoundError("file not found", nil)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		return re.InternalServerError("failed to read file", nil)
	}
	defer fsys.Close()

	mimeType := record.GetString("mime_type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	disposition := "attachment"
	if re.Request.URL.Query().Get("inline") == "1" {
		disposition = "inline"
	}
	h := re.Response.Header()
	h.Set("Content-Type", mimeType)
	h.Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, sanitizeFilename(name)))
	h.Set("Cache-Control", "no-store")
	return fsys.Serve(re.Response, re.Request, record.BaseFilesPath()+"/"+filename, name)
}
