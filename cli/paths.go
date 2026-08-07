package cli

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"tinycld.org/cli/client"
)

// item is the drive_items row shape the CLI reads. `File` is PocketBase's
// sanitized, suffixed stored name — file URLs are built from it, never from
// `Name` (the user-visible column).
type item struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	IsFolder    bool   `json:"is_folder"`
	MimeType    string `json:"mime_type"`
	Parent      string `json:"parent"`
	Size        int64  `json:"size"`
	File        string `json:"file"`
	Description string `json:"description"`
	CreatedBy   string `json:"created_by"`
	Updated     string `json:"updated"`
}

// The hierarchy root: drive_items.parent is the empty string at the top, not
// null. root is a synthetic folder so `ls /` needs no special-casing.
var root = item{ID: "", Name: "/", IsFolder: true}

// maxPathDepth bounds the resolution walk. The tree cannot legitimately be
// this deep; hitting the cap means a corrupted (cyclic) parent chain.
const maxPathDepth = 64

var errNotFound = errors.New("not found")

// resolvePath walks a slash path down from the root, one indexed lookup per
// segment. An `id:<recordid>` argument short-circuits to a direct fetch.
func resolvePath(ctx context.Context, c *client.Client, path string) (item, error) {
	if id, ok := strings.CutPrefix(path, "id:"); ok {
		it, err := client.GetRecord[item](ctx, c, "drive_items", id)
		if err != nil {
			return item{}, fmt.Errorf("%s: %w", path, err)
		}
		return it, nil
	}

	segments := splitPath(path)
	if len(segments) > maxPathDepth {
		return item{}, fmt.Errorf("%s: path exceeds %d segments", path, maxPathDepth)
	}
	cur := root
	seen := map[string]bool{}
	for i, seg := range segments {
		res, err := client.ListRecords[item](ctx, c, "drive_items", client.ListOptions{
			Filter: client.Filter("parent = {:p} && name = {:n}",
				map[string]any{"p": cur.ID, "n": seg}),
			PerPage:   1,
			SkipTotal: true,
		})
		if err != nil {
			return item{}, err
		}
		if len(res.Items) == 0 {
			return item{}, fmt.Errorf("%s: %w", "/"+strings.Join(segments[:i+1], "/"), errNotFound)
		}
		cur = res.Items[0]
		if seen[cur.ID] {
			return item{}, fmt.Errorf("%s: cyclic parent chain at %q", path, cur.Name)
		}
		seen[cur.ID] = true
	}
	return cur, nil
}

// resolveParentAndName resolves path's directory portion (which must exist and
// be a folder) and returns it with the final segment. Used by the write
// commands, where the leaf itself may not exist yet.
func resolveParentAndName(ctx context.Context, c *client.Client, path string) (item, string, error) {
	segments := splitPath(path)
	if len(segments) == 0 {
		return item{}, "", errors.New("a destination name is required")
	}
	parentPath := "/" + strings.Join(segments[:len(segments)-1], "/")
	parent, err := resolvePath(ctx, c, parentPath)
	if err != nil {
		return item{}, "", err
	}
	if !parent.IsFolder {
		return item{}, "", fmt.Errorf("%s: not a folder", parentPath)
	}
	return parent, segments[len(segments)-1], nil
}

// childByName fetches one child of parent, distinguishing absence from error.
func childByName(ctx context.Context, c *client.Client, parentID, name string) (item, bool, error) {
	res, err := client.ListRecords[item](ctx, c, "drive_items", client.ListOptions{
		Filter: client.Filter("parent = {:p} && name = {:n}",
			map[string]any{"p": parentID, "n": name}),
		PerPage:   1,
		SkipTotal: true,
	})
	if err != nil || len(res.Items) == 0 {
		return item{}, false, err
	}
	return res.Items[0], true, nil
}

func splitPath(path string) []string {
	var segments []string
	for _, seg := range strings.Split(path, "/") {
		if seg != "" && seg != "." {
			segments = append(segments, seg)
		}
	}
	return segments
}
