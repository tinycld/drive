package drive

import (
	"path"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const webdavPrefix = "/webdav/"

// parsePath strips the /webdav/{orgSlug}/ prefix and returns the org slug
// and the remaining path segments.
// For example: "/webdav/acme/Documents/report.pdf" → ("acme", ["Documents", "report.pdf"])
func parsePath(name string) (orgSlug string, segments []string) {
	name = path.Clean(name)
	name = strings.TrimPrefix(name, "/webdav")
	name = strings.TrimPrefix(name, "/")

	if name == "" || name == "." {
		return "", nil
	}

	parts := strings.SplitN(name, "/", 2)
	orgSlug = parts[0]

	if len(parts) < 2 || parts[1] == "" {
		return orgSlug, nil
	}

	remaining := strings.Trim(parts[1], "/")
	if remaining == "" {
		return orgSlug, nil
	}

	return orgSlug, strings.Split(remaining, "/")
}

// resolveOrg finds the org record for a given slug.
func resolveOrg(app *pocketbase.PocketBase, slug string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		"orgs",
		"slug = {:slug}",
		"", 1, 0,
		map[string]any{"slug": slug},
	)
	if err != nil || len(records) == 0 {
		return nil, errNotFound
	}
	return records[0], nil
}

// resolveItemByPath walks the path segments to find the drive_items record.
// Each segment is matched by name within the parent folder.
// Returns nil if the path resolves to the org root (no segments).
func resolveItemByPath(app *pocketbase.PocketBase, orgID string, segments []string) (*core.Record, error) {
	if len(segments) == 0 {
		return nil, nil
	}

	var parentID string
	var record *core.Record

	for _, segment := range segments {
		filter := "org = {:org} && name = {:name}"
		params := map[string]any{"org": orgID, "name": segment}

		if parentID == "" {
			filter += " && parent = ''"
		} else {
			filter += " && parent = {:parent}"
			params["parent"] = parentID
		}

		records, err := app.FindRecordsByFilter("drive_items", filter, "", 1, 0, params)
		if err != nil || len(records) == 0 {
			return nil, errNotFound
		}

		record = records[0]
		parentID = record.Id
	}

	return record, nil
}

// resolveParentByPath resolves the parent folder for a given path.
// Returns the parent record and the final segment name.
// The parent must exist and be a folder.
func resolveParentByPath(app *pocketbase.PocketBase, orgID string, segments []string) (parent *core.Record, name string, err error) {
	if len(segments) == 0 {
		return nil, "", errNotFound
	}

	name = segments[len(segments)-1]
	parentSegments := segments[:len(segments)-1]

	if len(parentSegments) == 0 {
		return nil, name, nil
	}

	parent, err = resolveItemByPath(app, orgID, parentSegments)
	if err != nil {
		return nil, "", errNotFound
	}
	if parent == nil || !parent.GetBool("is_folder") {
		return nil, "", errNotFound
	}

	return parent, name, nil
}

// buildItemPath constructs the WebDAV path for a drive_items record by walking up the parent chain.
func buildItemPath(app *pocketbase.PocketBase, record *core.Record, orgSlug string) string {
	var parts []string
	current := record

	for current != nil {
		parts = append([]string{current.GetString("name")}, parts...)
		parentID := current.GetString("parent")
		if parentID == "" {
			break
		}
		parent, err := app.FindRecordById("drive_items", parentID)
		if err != nil {
			break
		}
		current = parent
	}

	itemPath := strings.Join(parts, "/")
	fullPath := "/webdav/" + orgSlug + "/" + itemPath

	if record.GetBool("is_folder") {
		fullPath += "/"
	}

	return fullPath
}
