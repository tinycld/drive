package drive

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// parsePath strips the /drive/ prefix and returns the remaining path
// segments. Empty segments indicate the WebDAV root (/drive or /drive/),
// which the handler serves as the single synthetic root directory.
//
// Single-org: the deployment IS the org, so there is no org segment — the
// tree hangs directly off /drive. (Multi-org previously nested every path
// under an /drive/<orgSlug>/ root; the router now handles that split by
// giving each org its own process.)
//
// Inputs are run through path.Clean first, which collapses //, ., and ..
// segments. If a traversal sequence escapes the /drive prefix entirely
// (e.g. "/drive/../../etc/passwd" cleans to "/etc/passwd"), this returns
// no segments — i.e. the handler treats it as the WebDAV root rather than
// resolving anything outside the request's intent.
//
// For example: "/drive/Documents/report.pdf" → ["Documents", "report.pdf"]
func parsePath(name string) (segments []string) {
	name = path.Clean(name)
	if name != "/drive" && !strings.HasPrefix(name, "/drive/") {
		return nil
	}
	name = strings.TrimPrefix(name, "/drive")
	name = strings.Trim(name, "/")

	if name == "" || name == "." {
		return nil
	}

	return strings.Split(name, "/")
}

// maxFolderDepth bounds every parent-chain walk (acyclicity check, download
// CTE, buildPath). It caps how deep a legitimate tree can nest and doubles as
// the termination guard against a pre-existing cycle: a walk that hasn't
// reached the root after this many hops is treated as corrupt/cyclic and
// stops rather than spinning forever.
const maxFolderDepth = 256

// moveWouldCreateCycle reports whether reparenting movedID under newParentID
// would introduce a cycle — i.e. movedID is newParentID itself, or an
// ancestor of newParentID. It walks the new parent's ancestor chain upward
// via the `parent` column, guarded by a visited-set AND a depth cap so a
// PRE-EXISTING cycle in the data can't hang the check itself.
//
// A move to the org root (empty newParentID) can never create a cycle.
func moveWouldCreateCycle(app core.App, movedID, newParentID string) (bool, error) {
	if newParentID == "" || movedID == "" {
		return false, nil
	}
	if newParentID == movedID {
		return true, nil
	}

	seen := map[string]bool{}
	id := newParentID
	for depth := 0; id != "" && depth < maxFolderDepth; depth++ {
		if id == movedID {
			return true, nil
		}
		if seen[id] {
			// Already-cyclic ancestor chain (not involving movedID): stop
			// walking. The move isn't what creates the cycle, so don't block
			// it on that basis — bail out cleanly instead of looping.
			return false, nil
		}
		seen[id] = true

		rec, err := app.FindRecordById("drive_items", id)
		if err != nil {
			// A dangling parent pointer terminates the chain; no cycle.
			return false, nil
		}
		id = rec.GetString("parent")
	}
	return false, nil
}

// resolveItemIDByPath resolves the drive_items.id at the end of a path
// in a single SQL roundtrip via a recursive CTE driven by a JSON array
// of segment names. Returns os.ErrNotExist if any segment doesn't
// resolve. Empty segments return ("", nil) to signal the org root.
//
// The N+1 hazard this replaces: the per-segment filter loop did one
// FindRecordsByFilter per segment. Finder hammers Stat during PROPFIND
// walks, so depth-D paths cost O(N·D) round trips for a directory of
// N children. The CTE is one query regardless of depth; the caller
// pays one more FindRecordById to hydrate the *core.Record (or skips
// it entirely if it just needs the ID).
func resolveItemIDByPath(app core.App, segments []string) (id string, isFolder bool, err error) {
	if len(segments) == 0 {
		return "", false, nil
	}

	segsJSON, err := json.Marshal(segments)
	if err != nil {
		return "", false, err
	}

	var row struct {
		ID       string `db:"id"`
		Idx      int    `db:"idx"`
		IsFolder bool   `db:"is_folder"`
	}

	const q = `
WITH RECURSIVE
  segs(idx, name) AS (
    SELECT CAST(key AS INTEGER), value FROM json_each({:segs})
  ),
  walk(idx, id, is_folder) AS (
    SELECT segs.idx, di.id, di.is_folder
      FROM segs
      JOIN drive_items di
        ON di.parent = '' AND di.name = segs.name AND segs.idx = 0
    UNION ALL
    SELECT segs.idx, di.id, di.is_folder
      FROM segs, walk
      JOIN drive_items di
        ON di.parent = walk.id AND di.name = segs.name AND segs.idx = walk.idx + 1
  )
SELECT idx, id, is_folder FROM walk ORDER BY idx DESC LIMIT 1`

	err = app.DB().NewQuery(q).Bind(dbx.Params{
		"segs": string(segsJSON),
	}).One(&row)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, os.ErrNotExist
	}
	if err != nil {
		return "", false, err
	}

	// idx counts from 0; matched-all-segments means idx == len(segments) - 1.
	if row.Idx != len(segments)-1 {
		return "", false, os.ErrNotExist
	}
	return row.ID, row.IsFolder, nil
}

// resolveItemByPath walks the path segments to find the drive_items
// record. Returns nil if the path resolves to the root (no segments).
// Two queries total: the recursive CTE in resolveItemIDByPath, then
// FindRecordById to hydrate.
func resolveItemByPath(app core.App, segments []string) (*core.Record, error) {
	if len(segments) == 0 {
		return nil, nil
	}
	id, _, err := resolveItemIDByPath(app, segments)
	if err != nil {
		return nil, err
	}
	record, err := app.FindRecordById("drive_items", id)
	if err != nil {
		return nil, os.ErrNotExist
	}
	return record, nil
}

// resolveParentByPath resolves the parent folder for a given path.
// Returns the parent's drive_items ID (empty for the root) and the final
// segment name. The parent must exist and be a folder.
//
// Callers (Mkdir, openForWrite, Rename) only ever read the parent's ID,
// so this skips hydrating the full *core.Record and stays at one SQL
// roundtrip via the recursive CTE.
func resolveParentByPath(app core.App, segments []string) (parentID, name string, err error) {
	if len(segments) == 0 {
		return "", "", os.ErrNotExist
	}

	name = segments[len(segments)-1]
	parentSegments := segments[:len(segments)-1]

	if len(parentSegments) == 0 {
		return "", name, nil
	}

	id, isFolder, err := resolveItemIDByPath(app, parentSegments)
	if err != nil {
		return "", "", os.ErrNotExist
	}
	if !isFolder {
		return "", "", os.ErrNotExist
	}
	return id, name, nil
}
