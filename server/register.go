package drive

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/routine"
	"tinycld.org/core/audit"
	"tinycld.org/core/coreserver"
	"tinycld.org/core/driveshare"
	"tinycld.org/core/notify"
	"tinycld.org/core/offboard"
	"tinycld.org/core/previewqueue"
	"tinycld.org/core/quota"
	"tinycld.org/core/search"
	"tinycld.org/core/versionhooks"
	"tinycld.org/core/webdav"
	"tinycld.org/packages/drive/api"
)

// Register composes the drive server — the package's single entry point,
// called by the generator's package_extensions.go in BOTH the single-org app
// and a multi-org tenant. The WebDAV mount runs in both: a per-org tenant
// build links exactly the org's features, so the artifact is the gate, and
// the self-mounted Source carries driveWebDAVHooks directly — the old
// materialized-mount hook bridge (webdav.RegisterSourceHooks) is gone with
// the mechanism that needed it.
func Register(app *pocketbase.PocketBase) {
	registerShared(app)
	if _, err := webdav.Register(app, []webdav.Source{webDAVSource}, coreserver.WebDAVHostBindings()); err != nil {
		app.Logger().Error("drive: WebDAV registration failed", "error", err)
	}
}

// registerShared is the single source of truth for what BOTH compositions run.
func registerShared(app *pocketbase.PocketBase) {
	// Reassignable authorship FKs surfaced to the account-offboarding
	// transaction. All point at users with cascadeDelete:false, so without
	// reassignment an account with any drive content can't be deleted.
	for _, ref := range []offboard.ReassignableRef{
		{Collection: "drive_items", Field: "created_by"},
		{Collection: "drive_shares", Field: "created_by"},
		{Collection: "drive_item_versions", Field: "created_by"},
		{Collection: "drive_share_links", Field: "created_by"},
	} {
		offboard.RegisterReassignable(ref)
	}

	// Audit logging for drive collections. Single-org: audit rows carry no org,
	// so only drive_items customizes anything (its display label).
	audit.RegisterCollection(app, "drive_items", &audit.CollectionConfig{
		ExtractLabel: audit.LabelFromField("name"),
	})
	audit.RegisterCollection(app, "drive_item_state", &audit.CollectionConfig{})
	audit.RegisterCollection(app, "drive_shares", &audit.CollectionConfig{})

	registerDriveItemCreateHook(app)

	// Reject reparenting that would create a folder cycle. Move-cycle
	// prevention is otherwise client-only (dnd.ts), so a direct PATCH of
	// `parent` — e.g. making A a child of its own descendant — could form a
	// cycle. A cyclic tree then makes the recursive download CTE and buildPath
	// loop (see the guards there). This DB-level check is the authoritative
	// backstop: it fires for every update path, not just the drag UI, and only
	// does work when `parent` actually changes.
	app.OnRecordUpdate("drive_items").BindFunc(func(e *core.RecordEvent) error {
		newParent := e.Record.GetString("parent")
		if newParent != e.Record.Original().GetString("parent") {
			cyclic, err := moveWouldCreateCycle(e.App, e.Record.Id, newParent)
			if err != nil {
				return fmt.Errorf("check drive_item move cycle: %w", err)
			}
			if cyclic {
				return router.NewApiError(http.StatusUnprocessableEntity,
					"cannot move a folder into itself or one of its descendants", nil)
			}
		}
		return e.Next()
	})

	// FTS sync hooks for drive_items
	app.OnRecordAfterCreateSuccess("drive_items").BindFunc(func(e *core.RecordEvent) error {
		syncDriveItemToFTS(app, e.Record, "create")
		rec := e.Record
		payload, has := previewqueue.Take(rec.Id)
		routine.FireAndForget(func() { extractAndIndexDriveItem(app, rec, payload, has) })
		routine.FireAndForget(func() { generateThumbnail(app, rec, payload, has) })
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("drive_items").BindFunc(func(e *core.RecordEvent) error {
		syncDriveItemToFTS(app, e.Record, "update")
		rec := e.Record
		payload, has := previewqueue.Take(rec.Id)
		routine.FireAndForget(func() { extractAndIndexDriveItem(app, rec, payload, has) })
		routine.FireAndForget(func() { generateThumbnail(app, rec, payload, has) })
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess("drive_items").BindFunc(func(e *core.RecordEvent) error {
		syncDriveItemToFTS(app, e.Record, "delete")
		return e.Next()
	})

	// Notify recipient when a drive item is shared with them
	app.OnRecordAfterCreateSuccess("drive_shares").BindFunc(func(e *core.RecordEvent) error {
		go notifyDriveShare(app, e.Record)
		return e.Next()
	})

	// Storage ceilings: declare the collections, core binds the enforcement.
	quota.RegisterSources(quotaSources...)

	// Drive's contribution to the federated GET /api/search.
	search.RegisterSources(searchSource())

	// $drive.* JS binding for TS hooks that need Go-backed drive logic.
	registerJSVMBinding(app)

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Search API endpoint
		e.Router.GET("/api/drive/search", func(re *core.RequestEvent) error {
			return handleDriveSearch(app, re)
		}).BindFunc(requireAuth)

		// Share endpoint (creates shares + sends invite emails)
		e.Router.POST("/api/drive/share", func(re *core.RequestEvent) error {
			return handleShare(app, re)
		}).BindFunc(requireAuth)

		// Version history endpoints
		e.Router.POST("/api/drive/upload-version", func(re *core.RequestEvent) error {
			return handleUploadVersion(app, re)
		}).BindFunc(requireAuth)

		e.Router.POST("/api/drive/versions/restore", func(re *core.RequestEvent) error {
			return handleRestoreVersion(app, re)
		}).BindFunc(requireAuth)

		e.Router.POST("/api/drive/versions/snapshot", func(re *core.RequestEvent) error {
			return handleSnapshotVersion(app, re)
		}).BindFunc(requireAuth)

		// Public share link endpoints (no auth required)
		e.Router.GET("/api/drive/share-link/{token}", func(re *core.RequestEvent) error {
			return handleGetShareLinkMetadata(app, re)
		})

		e.Router.GET("/api/drive/share-link/{token}/file", func(re *core.RequestEvent) error {
			return handleGetShareLinkFile(app, re)
		})

		e.Router.GET("/api/drive/share-link/{token}/thumbnail", func(re *core.RequestEvent) error {
			return handleGetShareLinkThumbnail(app, re)
		})

		// Mint/resume an anonymous share session for a public link. The
		// returned session token is the bearer credential for anon
		// render/comment/edit actions.
		e.Router.POST("/api/drive/share-link/{token}/session", func(re *core.RequestEvent) error {
			return handleCreateShareSession(app, re)
		})

		// Email-verified guest provisioning for commentor/editor share
		// links. otp-request mints a single-use code and emails it; the
		// guest user + drive_shares row are created only at
		// otp-verify, after the recipient proves they control the email.
		// viewer links don't need this — they grant anonymous read.
		e.Router.POST("/api/drive/share-link/{token}/otp-request", func(re *core.RequestEvent) error {
			return handleShareOTPRequest(app, re)
		})
		e.Router.POST("/api/drive/share-link/{token}/otp-verify", func(re *core.RequestEvent) error {
			return handleShareOTPVerify(app, re)
		})

		// Share link management (auth required)
		e.Router.POST("/api/drive/share-link", func(re *core.RequestEvent) error {
			return handleCreateShareLink(app, re)
		}).BindFunc(requireAuth)

		e.Router.DELETE("/api/drive/share-link/{id}", func(re *core.RequestEvent) error {
			return handleDeleteShareLink(app, re)
		}).BindFunc(requireAuth)

		e.Router.GET("/api/drive/share-links", func(re *core.RequestEvent) error {
			return handleListShareLinks(app, re)
		}).BindFunc(requireAuth)

		// Folder download endpoints
		e.Router.POST("/api/drive/download-token", func(re *core.RequestEvent) error {
			return handleCreateDownloadToken(app, re)
		}).BindFunc(requireAuth)

		e.Router.GET("/api/drive/download-folder", func(re *core.RequestEvent) error {
			return handleDownloadFolder(app, re)
		})

		// Export (convert-and-download) endpoints. Same auth shape as the
		// folder download above: authed POST mints a single-use token; the
		// unauthed GET streams the converted bytes using the token in the URL.
		e.Router.POST("/api/drive/export-token", func(re *core.RequestEvent) error {
			return handleCreateExportToken(app, re)
		}).BindFunc(requireAuth)

		e.Router.GET("/api/drive/export", func(re *core.RequestEvent) error {
			return handleExport(app, re)
		})

		// Storage usage endpoint
		e.Router.GET("/api/drive/storage-usage", func(re *core.RequestEvent) error {
			return handleStorageUsage(app, re)
		}).BindFunc(requireAuth)

		return e.Next()
	})
}

// quotaSources are the collections whose bytes count toward the storage
// ceilings. Versions are included because a restore-able history is real disk;
// both carry created_by, so they count per-user as well as per-org.
//
// core/quota binds the enforcement hooks — drive does not, so no write path
// (REST, WebDAV, the version endpoints) can route around the limit.
var quotaSources = []quota.Source{
	{Slug: "drive", Collection: "drive_items", SizeField: "size", OwnerField: "created_by"},
	{Slug: "drive", Collection: "drive_item_versions", SizeField: "size", OwnerField: "created_by"},
}

// webDAVSource maps drive_items onto a WebDAV file tree. The protocol server,
// its path resolution and its blob handling all live in core/webdav; drive
// contributes the field map plus the few decisions a field map can't express.
var webDAVSource = webdav.Source{
	Slug:       "drive",
	Prefix:     "/dav/drive",
	Collection: "drive_items",
	Fields: webdav.FieldMap{
		Name:     "name",
		Parent:   "parent",
		IsFolder: "is_folder",
		Size:     "size",
		MimeType: "mime_type",
		File:     "file",
		Owner:    "created_by",
		Updated:  "updated",
	},
	// Mirrors the manifest's `webdav.trash` block: DAV DELETE stamps the
	// per-user trash state (restorable from the Trash screen) instead of
	// destroying the record.
	Trash: &webdav.TrashConfig{
		Collection:     "drive_item_state",
		ItemField:      "item",
		UserField:      "user",
		TrashedAtField: "trashed_at",
	},
	// No permission or quota callbacks: core evaluates drive_items' own
	// List/View/Update/Delete rules (shipped in the migrations; the current
	// restatement is 1782100000_restore_guest_clause_and_settle_commentor.js) and
	// core/quota enforces the ceilings as record hooks, so WebDAV gets both
	// from the same definitions the REST API and the web UI use.
	Hooks: driveWebDAVHooks,
}

// driveWebDAVHooks are drive's Go side effects on the WebDAV tree. They ride
// on webDAVSource directly — Register self-mounts the source in both
// compositions, so the closures need no side channel (R7).
var driveWebDAVHooks = webdav.Hooks{
	// Archive the outgoing blob before an overwrite replaces it, so a
	// WebDAV PUT gets the same version history as a UI upload.
	BeforeOverwrite: func(app core.App, userID string, record *core.Record) error {
		_, err := snapshotCurrentFile(app, record, userID, "upload", "")
		return err
	},
}

func requireAuth(re *core.RequestEvent) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Authentication required", nil)
	}
	return re.Next()
}

// resolveItemAndUser loads the item and validates the caller's share access to
// it, returning the item plus the caller's user id. Single-org: there is no org
// membership to match, so the authenticated user id IS the access key.
// If requireWrite is true, validates editor/owner share permission.
func resolveItemAndUser(app core.App, re *core.RequestEvent, itemID string, requireWrite bool) (*core.Record, string, error) {
	item, err := app.FindRecordById("drive_items", itemID)
	if err != nil {
		return nil, "", re.NotFoundError("item not found", nil)
	}

	userID := re.Auth.Id

	if requireWrite {
		if err := driveshare.CheckWrite(app, userID, item.Id); err != nil {
			return nil, "", re.ForbiddenError("editor or owner access required", nil)
		}
	} else if err := driveshare.CheckReadItem(app, userID, item); err != nil {
		return nil, "", re.ForbiddenError("no access to item", nil)
	}

	return item, userID, nil
}

// handleUploadVersion snapshots the current file and replaces it with the uploaded one.
func handleUploadVersion(app core.App, re *core.RequestEvent) error {
	itemID := re.Request.FormValue("item")
	if itemID == "" {
		return re.BadRequestError("missing item parameter", nil)
	}

	item, userID, err := resolveItemAndUser(app, re, itemID, true)
	if err != nil {
		return err
	}

	file, header, err := re.Request.FormFile("file")
	if err != nil {
		return re.BadRequestError("missing file", nil)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return re.BadRequestError("failed to read file", nil)
	}

	// Pre-flight quota check. core/quota is the authoritative enforcement (a
	// record hook every write passes through); this rejects early, before the
	// snapshot and blob write, rather than doing that work only to have the
	// save refused.
	sizeDelta := int64(len(data)) - int64(item.GetInt("size"))
	if sizeDelta > 0 {
		if err := checkUserStorageQuota(app, userID, sizeDelta); err != nil {
			return router.NewApiError(http.StatusRequestEntityTooLarge, err.Error(), nil)
		}
	}

	if _, err := snapshotCurrentFile(app, item, userID, "upload", ""); err != nil {
		app.Logger().Warn("version snapshot failed during upload", "id", item.Id, "error", err)
	}

	f, err := filesystem.NewFileFromBytes(data, header.Filename)
	if err != nil {
		return re.BadRequestError("failed to create file", nil)
	}

	item.Set("file", f)
	item.Set("size", len(data))
	item.Set("mime_type", header.Header.Get("Content-Type"))

	// Clear editor hashes so the freshly uploaded bytes force a one-shot full
	// regen via the upload fallback path rather than being skipped as stale.
	item.Set("thumb_region_hash", "")
	item.Set("index_hash", "")

	if err := app.Save(item); err != nil {
		return re.BadRequestError("failed to save item", nil)
	}

	return re.JSON(http.StatusOK, api.VersionFileResponse{
		ID:       item.Id,
		Name:     item.GetString("name"),
		File:     item.GetString("file"),
		Size:     int64(item.GetInt("size")),
		MimeType: item.GetString("mime_type"),
	})
}

// handleSnapshotVersion snapshots the current file on a drive_item as a labeled
// version without uploading any new bytes. Used by calc/text "Save version".
func handleSnapshotVersion(app core.App, re *core.RequestEvent) error {
	var body api.SnapshotVersionRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}
	if body.Item == "" {
		return re.BadRequestError("missing item", nil)
	}

	label := strings.TrimSpace(body.Label)
	if len(label) > 500 {
		label = label[:500]
	}

	item, userID, err := resolveItemAndUser(app, re, body.Item, true)
	if err != nil {
		return err
	}

	if item.GetString("file") == "" {
		return router.NewApiError(http.StatusUnprocessableEntity, "nothing to snapshot — file is empty", nil)
	}

	version, err := snapshotCurrentFile(app, item, userID, "user", label)
	if err != nil {
		app.Logger().Warn("version snapshot failed", "id", item.Id, "error", err)
		return re.InternalServerError("failed to save version", nil)
	}

	if version != nil {
		itemType := item.GetString("type")
		if hook := versionhooks.For(itemType); hook.OnSnapshot != nil {
			if err := hook.OnSnapshot(app, item, version); err != nil {
				app.Logger().Warn("drive: version snapshot hook failed",
					"itemID", item.Id, "versionID", version.Id, "type", itemType, "err", err)
				// continue — the docx blob is already saved; the hook is supplementary
			}
		}
	}

	return re.JSON(http.StatusOK, api.SnapshotVersionResponse{Item: item.Id})
}

// handleRestoreVersion restores a previous version as the current file.
func handleRestoreVersion(app core.App, re *core.RequestEvent) error {
	var body api.RestoreVersionRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}

	if body.Item == "" || body.Version == "" {
		return re.BadRequestError("missing item or version", nil)
	}

	item, userID, err := resolveItemAndUser(app, re, body.Item, true)
	if err != nil {
		return err
	}

	version, err := app.FindRecordById("drive_item_versions", body.Version)
	if err != nil {
		return re.NotFoundError("version not found", nil)
	}

	if version.GetString("item") != item.Id {
		return re.BadRequestError("version does not belong to item", nil)
	}

	// Pre-flight quota check; core/quota is the authoritative one. See
	// handleUploadVersion.
	sizeDelta := int64(version.GetInt("size")) - int64(item.GetInt("size"))
	if sizeDelta > 0 {
		if err := checkUserStorageQuota(app, userID, sizeDelta); err != nil {
			return router.NewApiError(http.StatusRequestEntityTooLarge, err.Error(), nil)
		}
	}

	// Snapshot the current file before restoring (system-generated, hidden from UI)
	if _, err := snapshotCurrentFile(app, item, userID, "system", ""); err != nil {
		app.Logger().Warn("version snapshot failed during restore", "id", item.Id, "error", err)
	}

	versionFilename := version.GetString("file")
	if versionFilename == "" {
		return re.BadRequestError("version has no file", nil)
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return re.BadRequestError("filesystem error", nil)
	}
	defer fsys.Close()

	key := version.BaseFilesPath() + "/" + versionFilename
	reader, err := fsys.GetReader(key)
	if err != nil {
		return re.BadRequestError("failed to read version file", nil)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return re.BadRequestError("failed to read version data", nil)
	}

	f, err := filesystem.NewFileFromBytes(data, versionFilename)
	if err != nil {
		return re.BadRequestError("failed to create file from version", nil)
	}

	item.Set("file", f)
	item.Set("size", version.GetInt("size"))
	item.Set("mime_type", version.GetString("mime_type"))

	// Clear editor hashes so the restored bytes force a one-shot full regen via
	// the upload fallback path rather than being skipped as stale.
	item.Set("thumb_region_hash", "")
	item.Set("index_hash", "")

	if err := app.Save(item); err != nil {
		return re.BadRequestError("failed to save restored item", nil)
	}

	itemType := item.GetString("type")
	if hook := versionhooks.For(itemType); hook.OnRestore != nil {
		if err := hook.OnRestore(app, item, version); err != nil {
			app.Logger().Warn("drive: version restore hook failed",
				"itemID", item.Id, "versionID", version.Id, "type", itemType, "err", err)
		}
	}

	return re.JSON(http.StatusOK, api.VersionFileResponse{
		ID:       item.Id,
		Name:     item.GetString("name"),
		File:     item.GetString("file"),
		Size:     int64(item.GetInt("size")),
		MimeType: item.GetString("mime_type"),
	})
}

// handleStorageUsage returns storage usage info for the requesting user and the
// deployment. Single-org: the deployment IS the org, so there is no org
// parameter and the caller's role comes off their auth record.
func handleStorageUsage(app core.App, re *core.RequestEvent) error {
	userUsed, err := getUserStorageUsed(app, re.Auth.Id)
	if err != nil {
		return re.InternalServerError("failed to get user storage", nil)
	}

	orgDriveBytes, orgMailBytes, err := getDeploymentStorageUsed(app)
	if err != nil {
		return re.InternalServerError("failed to get deployment storage", nil)
	}

	limitBytes := getStorageLimitBytes(app)

	result := api.StorageUsageResponse{
		UserUsedBytes: userUsed,
		OrgDriveBytes: orgDriveBytes,
		OrgMailBytes:  orgMailBytes,
		LimitBytes:    limitBytes,
		HasLimit:      limitBytes > 0,
	}

	if re.Request.URL.Query().Get("breakdown") == "users" {
		if role := re.Auth.GetString("role"); role == "owner" || role == "admin" {
			breakdown, err := getUsersStorageBreakdown(app)
			if err != nil {
				return re.InternalServerError("failed to get breakdown", nil)
			}
			result.Users = breakdown
		}
	}

	return re.JSON(http.StatusOK, result)
}

func notifyDriveShare(app core.App, shareRecord *core.Record) {
	userID := shareRecord.GetString("user")
	itemID := shareRecord.GetString("item")
	createdBy := shareRecord.GetString("created_by")

	if userID == "" || itemID == "" {
		return
	}

	// Self-shares (owner/author sharing with themselves) aren't real notifications
	// for the recipient — they're the bookkeeping rows created alongside every
	// upload/folder so the author retains access after rule changes.
	if userID == createdBy {
		return
	}

	item, err := app.FindRecordById("drive_items", itemID)
	if err != nil {
		return
	}

	notify.NotifyUser(app, notify.NotifyParams{
		UserID:  userID,
		Type:    "drive_file_shared",
		Package: "drive",
		Title:   fmt.Sprintf("File shared with you: %s", item.GetString("name")),
		URL:     "/drive",
	})
}
