package drive

import (
	"context"
	"errors"
	"mime"
	"os"
	"path"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/net/webdav"
)

const pbTimeFormat = "2006-01-02 15:04:05.000Z"

type contextKey string

// userKey is the context key under which the WebDAV middleware in
// register.go stashes the authenticated *core.Record. FileSystem methods
// look it up via userFromContext — they never re-authenticate.
const userKey contextKey = "drive.webdav.user"

// DriveFileSystem implements webdav.FileSystem (golang.org/x/net/webdav)
// backed by PocketBase drive_items records. The set of paths it serves
// is rooted at "/drive/" and structured as "/drive/<segments...>"; the
// root is a synthetic directory.
type DriveFileSystem struct {
	app core.App
}

var _ webdav.FileSystem = (*DriveFileSystem)(nil)

// userFromContext returns the user the WebDAV auth middleware attached
// to the request context. Anything reaching a FileSystem method without
// a user is a programming error — the middleware always enforces auth
// before dispatching to the handler.
func (fs *DriveFileSystem) userFromContext(ctx context.Context) (*core.Record, error) {
	user, ok := ctx.Value(userKey).(*core.Record)
	if !ok || user == nil {
		return nil, errors.New("drive webdav: missing authenticated user in context")
	}
	return user, nil
}

// resolveContext authenticates and parses the path into segments.
// Single-org: there is no org to resolve, so this is just the auth check
// plus the path split. Callers handle the root case (no segments)
// themselves before acting on the result.
func (fs *DriveFileSystem) resolveContext(ctx context.Context, name string) (user *core.Record, segments []string, err error) {
	user, err = fs.userFromContext(ctx)
	if err != nil {
		return
	}
	return user, parsePath(name), nil
}

func isRootPath(name string) bool {
	return len(parsePath(name)) == 0
}

// Stat resolves the path to either the synthetic root or a backing
// drive_items record.
func (fs *DriveFileSystem) Stat(ctx context.Context, name string) (os.FileInfo, error) {
	user, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	if len(segments) == 0 {
		return &driveFileInfo{name: "drive", isDir: true}, nil
	}

	record, err := resolveItemByPath(fs.app, segments)
	if err != nil {
		return nil, err
	}

	// The drive_items view rule hides unshared items entirely, so answer
	// not-found rather than permission-denied to avoid confirming that
	// the path exists.
	if err := checkReadPermission(fs.app, user.Id, record); err != nil {
		return nil, os.ErrNotExist
	}

	return recordToFileInfo(record), nil
}

// OpenFile dispatches to the read or write path based on flag bits.
// Directories always return a directory driveFile (read-only and never
// has its Read called by the handler); files return either a seekable
// reader-backed driveFile (read) or a temp-file-backed driveFile (write).
func (fs *DriveFileSystem) OpenFile(ctx context.Context, name string, flag int, perm os.FileMode) (webdav.File, error) {
	wantWrite := flag&(os.O_WRONLY|os.O_RDWR) != 0

	if wantWrite {
		return fs.openForWrite(ctx, name, flag)
	}
	return fs.openForRead(ctx, name)
}

// openForRead handles GET, HEAD and the read side of COPY. A successful
// open of a file returns a driveFile with rdSeeker primed; a successful
// open of any directory (root or folder) returns a driveFile with
// children pre-populated for Readdir.
func (fs *DriveFileSystem) openForRead(ctx context.Context, name string) (webdav.File, error) {
	user, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	if len(segments) == 0 {
		children, err := fs.listChildren("", user.Id)
		if err != nil {
			return nil, err
		}
		return &driveFile{
			info:     &driveFileInfo{name: "drive", isDir: true},
			children: children,
		}, nil
	}

	record, err := resolveItemByPath(fs.app, segments)
	if err != nil {
		return nil, err
	}

	// Same not-found masking as Stat: unshared items must stay invisible.
	if err := checkReadPermission(fs.app, user.Id, record); err != nil {
		return nil, os.ErrNotExist
	}

	if record.GetBool("is_folder") {
		children, err := fs.listChildren(record.Id, user.Id)
		if err != nil {
			return nil, err
		}
		return &driveFile{
			info:     recordToFileInfo(record),
			children: children,
		}, nil
	}

	rdr, tmpPath, err := openSeekableContent(fs.app, record)
	if err != nil {
		return nil, err
	}
	return &driveFile{
		info:     recordToFileInfo(record),
		rdSeeker: rdr,
		tmpPath:  tmpPath,
	}, nil
}

// openForWrite handles PUT and the write side of COPY. The temp file is
// created eagerly so the handler's io.Copy works as soon as it returns;
// the actual persistence into a drive_items record happens on Close.
// Quota and write-permission checks are deferred to Close because that
// is when the final size is known.
func (fs *DriveFileSystem) openForWrite(ctx context.Context, name string, flag int) (webdav.File, error) {
	user, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return nil, err
	}

	if len(segments) == 0 {
		return nil, os.ErrPermission
	}

	parentID, itemName, err := resolveParentByPath(fs.app, segments)
	if err != nil {
		return nil, err
	}

	existing, _ := resolveItemByPath(fs.app, segments)
	if existing != nil && existing.GetBool("is_folder") {
		return nil, os.ErrPermission
	}

	if existing == nil && flag&os.O_CREATE == 0 {
		return nil, os.ErrNotExist
	}

	tmp, err := os.CreateTemp("", "tinycld-drive-*")
	if err != nil {
		return nil, err
	}

	return &driveFile{
		fs:       fs,
		info:     &driveFileInfo{name: itemName},
		wrBuf:    tmp,
		wrName:   itemName,
		parentID: parentID,
		user:     user,
		existing: existing,
	}, nil
}

// Mkdir creates a folder drive_items record at the given path. Parent
// must exist. The handler treats os.ErrExist as 405.
func (fs *DriveFileSystem) Mkdir(ctx context.Context, name string, _ os.FileMode) error {
	user, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return err
	}

	if len(segments) == 0 {
		return os.ErrPermission
	}

	parentID, folderName, err := resolveParentByPath(fs.app, segments)
	if err != nil {
		return err
	}

	if existing, _ := resolveItemByPath(fs.app, segments); existing != nil {
		return os.ErrExist
	}

	collection, err := fs.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("name", folderName)
	record.Set("is_folder", true)
	record.Set("parent", parentID)
	record.Set("created_by", user.Id)

	// The OnRecordCreate("drive_items") hook in register.go creates the
	// owner drive_shares row in the same transaction; no follow-up call needed.
	if err := fs.app.Save(record); err != nil {
		return err
	}

	return nil
}

// RemoveAll deletes the drive_items record at the given path. PocketBase
// cascade rules handle recursive deletion of folder children.
func (fs *DriveFileSystem) RemoveAll(ctx context.Context, name string) error {
	user, segments, err := fs.resolveContext(ctx, name)
	if err != nil {
		return err
	}

	if len(segments) == 0 {
		return os.ErrPermission
	}

	record, err := resolveItemByPath(fs.app, segments)
	if err != nil {
		return err
	}

	if err := checkDeletePermission(fs.app, user.Id, record.Id); err != nil {
		return err
	}

	return fs.app.Delete(record)
}

// Rename implements MOVE. The handler pre-removes an existing
// destination only when Overwrite: T is set; otherwise we must report
// os.ErrExist if the destination is still present.
func (fs *DriveFileSystem) Rename(ctx context.Context, oldName, newName string) error {
	user, srcSegments, err := fs.resolveContext(ctx, oldName)
	if err != nil {
		return err
	}

	destSegments := parsePath(newName)

	if len(srcSegments) == 0 || len(destSegments) == 0 {
		return os.ErrPermission
	}

	srcRecord, err := resolveItemByPath(fs.app, srcSegments)
	if err != nil {
		return err
	}

	if err := checkWritePermission(fs.app, user.Id, srcRecord.Id); err != nil {
		return err
	}

	if existing, _ := resolveItemByPath(fs.app, destSegments); existing != nil {
		return os.ErrExist
	}

	destParentID, destName, err := resolveParentByPath(fs.app, destSegments)
	if err != nil {
		return err
	}

	srcRecord.Set("name", destName)
	srcRecord.Set("parent", destParentID)

	return fs.app.Save(srcRecord)
}

// listChildren returns the immediate child drive_items of a given parent
// (or, for empty parentID, of the root), limited to items the viewer
// created or holds a drive_shares row for. WebDAV bypasses PocketBase's
// rule engine, so the drive_items view rule has to be applied here by
// hand — being authenticated must not expose every user's files.
func (fs *DriveFileSystem) listChildren(parentID, viewerUserID string) ([]os.FileInfo, error) {
	var filter string
	params := map[string]any{}
	if parentID == "" {
		filter = "parent = ''"
	} else {
		filter = "parent = {:parent}"
		params["parent"] = parentID
	}

	records, err := fs.app.FindRecordsByFilter("drive_items", filter, "name", 0, 0, params)
	if err != nil {
		return nil, err
	}

	infos := make([]os.FileInfo, 0, len(records))
	for _, r := range records {
		if checkReadPermission(fs.app, viewerUserID, r) != nil {
			continue
		}
		infos = append(infos, recordToFileInfo(r))
	}
	return infos, nil
}

// recordToFileInfo builds an os.FileInfo from a drive_items record.
func recordToFileInfo(record *core.Record) *driveFileInfo {
	modTime := time.Time{}
	if updated := record.GetString("updated"); updated != "" {
		if t, err := time.Parse(pbTimeFormat, updated); err == nil {
			modTime = t
		}
	}
	return &driveFileInfo{
		name:    record.GetString("name"),
		size:    int64(record.GetInt("size")),
		modTime: modTime,
		isDir:   record.GetBool("is_folder"),
		record:  record,
	}
}

// guessMimeType derives a Content-Type from a basename's extension,
// falling back to application/octet-stream. Used when we don't have a
// source MIME type to carry over (which is always under x/net/webdav,
// since the framework reads bytes only — no Content-Type ever reaches
// us).
func guessMimeType(filename string) string {
	if t := mime.TypeByExtension(path.Ext(filename)); t != "" {
		return t
	}
	return "application/octet-stream"
}
