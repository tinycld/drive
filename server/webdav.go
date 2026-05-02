package drive

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"time"

	"github.com/emersion/go-webdav"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const pbTimeFormat = "2006-01-02 15:04:05.000Z"

type contextKey string

const httpRequestKey contextKey = "httpRequest"

// DriveFileSystem implements webdav.FileSystem backed by PocketBase drive_items.
type DriveFileSystem struct {
	app *pocketbase.PocketBase
}

var _ webdav.FileSystem = (*DriveFileSystem)(nil)

var (
	errNotFound  = webdav.NewHTTPError(http.StatusNotFound, fmt.Errorf("not found"))
	errForbidden = webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("forbidden"))
)

// authFromContext extracts the authenticated user from the request context.
func (fs *DriveFileSystem) authFromContext(ctx context.Context) (*core.Record, error) {
	r, ok := ctx.Value(httpRequestKey).(*http.Request)
	if !ok {
		return nil, errUnauthorized
	}
	return authenticateRequest(fs.app, r)
}

// resolveContext authenticates and resolves the org from the path.
// Returns the user, org record, user_org record, org slug, and remaining path segments.
// Returns errNotFound when the path is the WebDAV root (no org slug); read-side
// callers (Stat, ReadDir) handle the root case before invoking this helper.
func (fs *DriveFileSystem) resolveContext(ctx context.Context, name string) (user *core.Record, org *core.Record, userOrg *core.Record, orgSlug string, segments []string, err error) {
	user, err = fs.authFromContext(ctx)
	if err != nil {
		return
	}

	orgSlug, segments = parsePath(name)
	if orgSlug == "" {
		err = errNotFound
		return
	}

	org, err = resolveOrg(fs.app, orgSlug)
	if err != nil {
		return
	}

	userOrg, err = getUserOrgForOrg(fs.app, user.Id, org.Id)
	return
}

// isRootPath reports whether the parsed path is the WebDAV root — i.e.
// /drive or /drive/, with no org slug. Used by Stat/ReadDir to short-circuit
// to a synthetic listing of the user's orgs before resolveContext rejects.
func isRootPath(name string) bool {
	orgSlug, _ := parsePath(name)
	return orgSlug == ""
}

func (fs *DriveFileSystem) Stat(ctx context.Context, name string) (*webdav.FileInfo, error) {
	if isRootPath(name) {
		// Authenticate to ensure 401 (not 404) for unauthenticated requests
		// to the root, but don't require an org slug.
		if _, err := fs.authFromContext(ctx); err != nil {
			return nil, err
		}
		return &webdav.FileInfo{
			Path:  "/drive/",
			IsDir: true,
		}, nil
	}

	_, org, _, orgSlug, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	// Org root = virtual directory
	if len(segments) == 0 {
		return &webdav.FileInfo{
			Path:  "/drive/" + orgSlug + "/",
			IsDir: true,
		}, nil
	}

	record, err := resolveItemByPath(fs.app, org.Id, segments)
	if err != nil {
		return nil, err
	}

	return recordToFileInfo(fs.app, record, orgSlug), nil
}

func (fs *DriveFileSystem) ReadDir(ctx context.Context, name string, recursive bool) ([]webdav.FileInfo, error) {
	if isRootPath(name) {
		user, err := fs.authFromContext(ctx)
		if err != nil {
			return nil, err
		}
		return fs.listUserOrgs(user.Id)
	}

	_, org, _, orgSlug, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	var parentID string
	if len(segments) > 0 {
		record, err := resolveItemByPath(fs.app, org.Id, segments)
		if err != nil {
			return nil, err
		}
		if !record.GetBool("is_folder") {
			return nil, errNotFound
		}
		parentID = record.Id
	}

	return fs.listChildren(org.Id, parentID, orgSlug, recursive)
}

// listUserOrgs returns one synthetic directory per org the user belongs to,
// for PROPFIND on the WebDAV root. Folder names use org.slug (globally unique,
// URL-safe). Includes the root itself as the first entry, per WebDAV
// convention that ReadDir emits the directory plus its children.
func (fs *DriveFileSystem) listUserOrgs(userID string) ([]webdav.FileInfo, error) {
	// Note: not reusing search.go's getUserOrgIDs here — that helper returns
	// user_org junction record IDs (used for share filtering), not org IDs.
	// Query directly for the org relation instead.
	userOrgs, err := fs.app.FindRecordsByFilter(
		"user_org",
		"user = {:user}",
		"",
		100,
		0,
		map[string]any{"user": userID},
	)
	if err != nil {
		return nil, err
	}

	infos := make([]webdav.FileInfo, 0, len(userOrgs)+1)
	infos = append(infos, webdav.FileInfo{
		Path:  "/drive/",
		IsDir: true,
	})

	for _, uo := range userOrgs {
		orgID := uo.GetString("org")
		if orgID == "" {
			continue
		}
		o, err := fs.app.FindRecordById("orgs", orgID)
		if err != nil {
			// Skip orgs that have been deleted out from under user_org rather
			// than failing the entire listing.
			continue
		}
		slug := o.GetString("slug")
		if slug == "" {
			continue
		}
		infos = append(infos, webdav.FileInfo{
			Path:  "/drive/" + slug + "/",
			IsDir: true,
		})
	}

	return infos, nil
}

func (fs *DriveFileSystem) listChildren(orgID, parentID, orgSlug string, recursive bool) ([]webdav.FileInfo, error) {
	// Empty parentID means the org root. PocketBase's filter language needs
	// the literal `parent = ''` form for empty-string relations; the
	// `parent = {:parent}` substitution form does not match. Mirrors the
	// same idiom used in resolveItemByPath (paths.go).
	filter := "org = {:org}"
	params := map[string]any{"org": orgID}
	if parentID == "" {
		filter += " && parent = ''"
	} else {
		filter += " && parent = {:parent}"
		params["parent"] = parentID
	}

	records, err := fs.app.FindRecordsByFilter("drive_items", filter, "name", 0, 0, params)
	if err != nil {
		return nil, err
	}

	// Start with the parent itself (WebDAV convention: ReadDir includes the directory itself)
	var infos []webdav.FileInfo
	if parentID == "" {
		infos = append(infos, webdav.FileInfo{
			Path:  "/drive/" + orgSlug + "/",
			IsDir: true,
		})
	} else {
		parent, err := fs.app.FindRecordById("drive_items", parentID)
		if err == nil {
			infos = append(infos, *recordToFileInfo(fs.app, parent, orgSlug))
		}
	}

	for _, record := range records {
		infos = append(infos, *recordToFileInfo(fs.app, record, orgSlug))

		if recursive && record.GetBool("is_folder") {
			children, err := fs.listChildren(orgID, record.Id, orgSlug, true)
			if err != nil {
				return nil, err
			}
			// Skip the first element as it's the folder itself
			if len(children) > 1 {
				infos = append(infos, children[1:]...)
			}
		}
	}

	return infos, nil
}

func (fs *DriveFileSystem) Open(ctx context.Context, name string) (io.ReadCloser, error) {
	_, org, _, _, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	if len(segments) == 0 {
		return nil, webdav.NewHTTPError(http.StatusMethodNotAllowed, fmt.Errorf("cannot open directory"))
	}

	record, err := resolveItemByPath(fs.app, org.Id, segments)
	if err != nil {
		return nil, err
	}

	if record.GetBool("is_folder") {
		return nil, webdav.NewHTTPError(http.StatusMethodNotAllowed, fmt.Errorf("cannot open directory"))
	}

	return readFileContent(fs.app, record)
}

func (fs *DriveFileSystem) Create(ctx context.Context, name string, body io.ReadCloser, opts *webdav.CreateOptions) (*webdav.FileInfo, bool, error) {
	user, org, userOrg, orgSlug, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, false, err
	}

	_ = user

	if len(segments) == 0 {
		return nil, false, webdav.NewHTTPError(http.StatusMethodNotAllowed, fmt.Errorf("cannot create at org root"))
	}

	parent, itemName, err := resolveParentByPath(fs.app, org.Id, segments)
	if err != nil {
		return nil, false, err
	}

	var parentID string
	if parent != nil {
		parentID = parent.Id
	}

	// Read file data upfront for quota checking
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, false, err
	}

	// Check if the item already exists (update case)
	existing, _ := resolveItemByPath(fs.app, org.Id, segments)
	if existing != nil {
		if err := checkWritePermission(fs.app, userOrg.Id, existing.Id); err != nil {
			return nil, false, err
		}

		// Check quota: only the delta (new size - old size) counts
		sizeDelta := int64(len(data)) - int64(existing.GetInt("size"))
		if sizeDelta > 0 {
			if err := checkUserStorageQuotaWebDAV(fs.app, userOrg.Id, org.Id, sizeDelta); err != nil {
				return nil, false, err
			}
		}

		if existing.GetString("file") != "" {
			if err := snapshotCurrentFile(fs.app, existing, userOrg.Id, "upload", ""); err != nil {
				fs.app.Logger().Warn("version snapshot failed", "id", existing.Id, "error", err)
			}
		}

		if err := writeFileContentFromBytes(fs.app, existing, data, itemName); err != nil {
			return nil, false, err
		}

		fi := recordToFileInfo(fs.app, existing, orgSlug)
		return fi, false, nil
	}

	// Check quota for new file
	if err := checkUserStorageQuotaWebDAV(fs.app, userOrg.Id, org.Id, int64(len(data))); err != nil {
		return nil, false, err
	}

	// Create new file
	collection, err := fs.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		return nil, false, err
	}

	record := core.NewRecord(collection)
	record.Set("org", org.Id)
	record.Set("name", itemName)
	record.Set("is_folder", false)
	record.Set("parent", parentID)
	record.Set("created_by", userOrg.Id)
	record.Set("mime_type", mime.TypeByExtension(path.Ext(itemName)))

	if err := writeFileContentFromBytes(fs.app, record, data, itemName); err != nil {
		return nil, false, err
	}

	if err := createOwnerShare(fs.app, record.Id, userOrg.Id); err != nil {
		fs.app.Logger().Warn("WebDAV: failed to create owner share", "id", record.Id, "error", err)
	}

	fi := recordToFileInfo(fs.app, record, orgSlug)
	return fi, true, nil
}

func (fs *DriveFileSystem) RemoveAll(ctx context.Context, name string, _ *webdav.RemoveAllOptions) error {
	_, org, userOrg, _, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return err
	}

	if len(segments) == 0 {
		return webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("cannot delete org root"))
	}

	record, err := resolveItemByPath(fs.app, org.Id, segments)
	if err != nil {
		return err
	}

	if err := checkDeletePermission(fs.app, userOrg.Id, record.Id); err != nil {
		return err
	}

	return fs.app.Delete(record)
}

func (fs *DriveFileSystem) Mkdir(ctx context.Context, name string) error {
	_, org, userOrg, _, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return err
	}

	if len(segments) == 0 {
		return webdav.NewHTTPError(http.StatusMethodNotAllowed, fmt.Errorf("cannot create org root"))
	}

	// Check parent exists
	parent, folderName, err := resolveParentByPath(fs.app, org.Id, segments)
	if err != nil {
		return err
	}

	var parentID string
	if parent != nil {
		parentID = parent.Id
	}

	// Check if already exists
	existing, _ := resolveItemByPath(fs.app, org.Id, segments)
	if existing != nil {
		return webdav.NewHTTPError(http.StatusMethodNotAllowed, fmt.Errorf("folder already exists"))
	}

	collection, err := fs.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("org", org.Id)
	record.Set("name", folderName)
	record.Set("is_folder", true)
	record.Set("parent", parentID)
	record.Set("created_by", userOrg.Id)

	if err := fs.app.Save(record); err != nil {
		return err
	}

	if err := createOwnerShare(fs.app, record.Id, userOrg.Id); err != nil {
		fs.app.Logger().Warn("WebDAV: failed to create owner share for folder", "id", record.Id, "error", err)
	}

	return nil
}

func (fs *DriveFileSystem) Copy(ctx context.Context, src, dest string, options *webdav.CopyOptions) (bool, error) {
	_, srcOrg, userOrg, _, srcSegments, err := fs.resolveContext(ctx, src)
	if err != nil {
		return false, err
	}

	_, destOrg, _, destOrgSlug, destSegments, err := fs.resolveContext(ctx, dest)
	if err != nil {
		return false, err
	}
	_ = destOrgSlug

	if srcOrg.Id != destOrg.Id {
		return false, webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("cross-org copy not supported"))
	}

	if len(srcSegments) == 0 || len(destSegments) == 0 {
		return false, webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("cannot copy org root"))
	}

	srcRecord, err := resolveItemByPath(fs.app, srcOrg.Id, srcSegments)
	if err != nil {
		return false, err
	}

	// Check if destination already exists
	existing, _ := resolveItemByPath(fs.app, destOrg.Id, destSegments)
	created := existing == nil
	if !created && options.NoOverwrite {
		return false, webdav.NewHTTPError(http.StatusPreconditionFailed, fmt.Errorf("destination exists"))
	}

	// If overwriting, delete the existing item
	if !created {
		if err := fs.app.Delete(existing); err != nil {
			return false, err
		}
	}

	destParent, destName, err := resolveParentByPath(fs.app, destOrg.Id, destSegments)
	if err != nil {
		return false, err
	}

	var destParentID string
	if destParent != nil {
		destParentID = destParent.Id
	}

	collection, err := fs.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		return false, err
	}

	// Check quota for the copy (use source file size)
	if !srcRecord.GetBool("is_folder") {
		srcSize := int64(srcRecord.GetInt("size"))
		if srcSize > 0 {
			if err := checkUserStorageQuotaWebDAV(fs.app, userOrg.Id, srcOrg.Id, srcSize); err != nil {
				return false, err
			}
		}
	}

	newRecord := core.NewRecord(collection)
	newRecord.Set("org", srcOrg.Id)
	newRecord.Set("name", destName)
	newRecord.Set("is_folder", srcRecord.GetBool("is_folder"))
	newRecord.Set("parent", destParentID)
	newRecord.Set("created_by", userOrg.Id)
	newRecord.Set("mime_type", srcRecord.GetString("mime_type"))
	newRecord.Set("description", srcRecord.GetString("description"))

	if !srcRecord.GetBool("is_folder") {
		reader, err := readFileContent(fs.app, srcRecord)
		if err != nil {
			return false, err
		}
		defer reader.Close()

		if err := writeFileContent(fs.app, newRecord, reader, destName); err != nil {
			return false, err
		}
	} else {
		newRecord.Set("size", 0)
		if err := fs.app.Save(newRecord); err != nil {
			return false, err
		}
	}

	if err := createOwnerShare(fs.app, newRecord.Id, userOrg.Id); err != nil {
		fs.app.Logger().Warn("WebDAV: failed to create owner share for copy", "id", newRecord.Id, "error", err)
	}

	return created, nil
}

func (fs *DriveFileSystem) Move(ctx context.Context, src, dest string, options *webdav.MoveOptions) (bool, error) {
	_, srcOrg, userOrg, _, srcSegments, err := fs.resolveContext(ctx, src)
	if err != nil {
		return false, err
	}

	_, destOrg, _, _, destSegments, err := fs.resolveContext(ctx, dest)
	if err != nil {
		return false, err
	}

	if srcOrg.Id != destOrg.Id {
		return false, webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("cross-org move not supported"))
	}

	if len(srcSegments) == 0 || len(destSegments) == 0 {
		return false, webdav.NewHTTPError(http.StatusForbidden, fmt.Errorf("cannot move org root"))
	}

	srcRecord, err := resolveItemByPath(fs.app, srcOrg.Id, srcSegments)
	if err != nil {
		return false, err
	}

	if err := checkWritePermission(fs.app, userOrg.Id, srcRecord.Id); err != nil {
		return false, err
	}

	// Check if destination already exists
	existing, _ := resolveItemByPath(fs.app, destOrg.Id, destSegments)
	created := existing == nil
	if !created && options.NoOverwrite {
		return false, webdav.NewHTTPError(http.StatusPreconditionFailed, fmt.Errorf("destination exists"))
	}

	// If overwriting, delete the existing item
	if !created {
		if err := fs.app.Delete(existing); err != nil {
			return false, err
		}
	}

	destParent, destName, err := resolveParentByPath(fs.app, destOrg.Id, destSegments)
	if err != nil {
		return false, err
	}

	var destParentID string
	if destParent != nil {
		destParentID = destParent.Id
	}

	srcRecord.Set("name", destName)
	srcRecord.Set("parent", destParentID)

	if err := fs.app.Save(srcRecord); err != nil {
		return false, err
	}

	return created, nil
}

func recordToFileInfo(app *pocketbase.PocketBase, record *core.Record, orgSlug string) *webdav.FileInfo {
	modTime := time.Time{}
	if updated := record.GetString("updated"); updated != "" {
		if t, err := time.Parse(pbTimeFormat, updated); err == nil {
			modTime = t
		}
	}

	return &webdav.FileInfo{
		Path:     buildItemPath(app, record, orgSlug),
		Size:     int64(record.GetInt("size")),
		ModTime:  modTime,
		IsDir:    record.GetBool("is_folder"),
		MIMEType: record.GetString("mime_type"),
		ETag:     fmt.Sprintf(`"%s"`, record.GetString("updated")),
	}
}
