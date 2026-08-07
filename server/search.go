package drive

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/driveshare"
	"tinycld.org/packages/drive/api"
)

var fts5SpecialChars = regexp.MustCompile(`[":*^{}()\[\]~\-]`)

func sanitizeFTSQuery(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	cleaned := fts5SpecialChars.ReplaceAllString(input, " ")
	terms := strings.Fields(cleaned)
	if len(terms) == 0 {
		return ""
	}

	// Use prefix matches (term*) so search-as-you-type finds partial words — a
	// query of "Financ" matches "Financials". FTS5 matches whole tokens by
	// default, so without the trailing * every intermediate keystroke of a search
	// returns zero rows until the last full word is typed. Mail and contacts
	// search already do this (see mail/contacts server sanitizeFTSQuery); Drive
	// was the outlier.
	quoted := make([]string, len(terms))
	for i, term := range terms {
		term = strings.ReplaceAll(term, `"`, `""`)
		quoted[i] = `"` + term + `"*`
	}

	return strings.Join(quoted, " ")
}

func syncDriveItemToFTS(app core.App, record *core.Record, op string) {
	db := app.NonconcurrentDB()
	recordID := record.Id

	_, err := db.NewQuery("DELETE FROM fts_drive_items WHERE record_id = {:id}").
		Bind(map[string]any{"id": recordID}).Execute()
	if err != nil {
		app.Logger().Warn("FTS: failed to delete drive item from index",
			"id", recordID, "error", err)
	}

	if op == "delete" {
		return
	}

	_, err = db.NewQuery(`
		INSERT INTO fts_drive_items (record_id, name, description, content)
		VALUES ({:id}, {:name}, {:description}, {:content})
	`).Bind(map[string]any{
		"id":          recordID,
		"name":        record.GetString("name"),
		"description": record.GetString("description"),
		"content":     "",
	}).Execute()

	if err != nil {
		app.Logger().Warn("FTS: failed to index drive item",
			"id", recordID, "error", err)
	}
}

// updateFTSContent updates just the content field for async extraction results.
func updateFTSContent(app core.App, recordID, content string) {
	db := app.NonconcurrentDB()

	// Re-read the record to get current name/description
	record, err := app.FindRecordById("drive_items", recordID)
	if err != nil {
		return
	}

	_, err = db.NewQuery("DELETE FROM fts_drive_items WHERE record_id = {:id}").
		Bind(map[string]any{"id": recordID}).Execute()
	if err != nil {
		app.Logger().Warn("FTS: failed to delete drive item for content update",
			"id", recordID, "error", err)
	}

	_, err = db.NewQuery(`
		INSERT INTO fts_drive_items (record_id, name, description, content)
		VALUES ({:id}, {:name}, {:description}, {:content})
	`).Bind(map[string]any{
		"id":          recordID,
		"name":        record.GetString("name"),
		"description": record.GetString("description"),
		"content":     content,
	}).Execute()

	if err != nil {
		app.Logger().Warn("FTS: failed to update drive item content",
			"id", recordID, "error", err)
	}
}

func handleDriveSearch(app core.App, re *core.RequestEvent) error {
	limit := 25
	offset := 0
	if l, err := strconv.Atoi(re.Request.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	if o, err := strconv.Atoi(re.Request.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	resp, err := searchDriveItems(app, re.Auth.Id, re.Request.URL.Query().Get("q"), limit, offset)
	if err != nil {
		app.Logger().Warn("FTS: drive search failed", "error", err)
		return re.JSON(http.StatusOK, api.SearchResponse{Items: []api.SearchResultItem{}, Total: 0})
	}
	return re.JSON(http.StatusOK, resp)
}

// searchDriveItems runs the authorized FTS query. Shared by the HTTP endpoint
// and the $drive.search JS binding so both enforce the same access scope — a
// binding that reimplemented the filter could drift out of agreement with the
// endpoint, which is precisely the class of bug this migration was about.
func searchDriveItems(app core.App, userID, q string, limit, offset int) (api.SearchResponse, error) {
	empty := api.SearchResponse{Items: []api.SearchResultItem{}, Total: 0}

	if len(q) < 2 {
		return empty, nil
	}

	ftsQuery := sanitizeFTSQuery(q)
	if ftsQuery == "" {
		return empty, nil
	}

	// A suspended account reaches nothing. This path authorizes a whole query
	// in raw SQL, so neither the collection rules (which cover REST) nor
	// driveshare.ResolveRoleForItem (which covers WebDAV, downloads and
	// realtime) apply to it — without this check, search kept returning names,
	// sizes and content highlights of everything shared with the user for as
	// long as their token lived.
	if driveshare.IsSuspended(app, userID) {
		return empty, nil
	}

	// Single-org: authorization is a single drive_shares row keyed by the
	// caller's user id — the former per-membership IN clause is gone.
	searchQuery := `
		SELECT DISTINCT
			d.id,
			d.name,
			d.is_folder,
			d.mime_type,
			d.size,
			d.description,
			d.updated,
			snippet(fts_drive_items, -1, '<mark>', '</mark>', '...', 30) as highlight
		FROM fts_drive_items
		JOIN drive_items d ON d.id = fts_drive_items.record_id
		JOIN drive_shares ds ON ds.item = d.id
		WHERE fts_drive_items MATCH {:ftsQuery}
		AND ds.user = {:userID}
		ORDER BY fts_drive_items.rank
		LIMIT {:limit} OFFSET {:offset}
	`

	params := map[string]any{
		"ftsQuery": ftsQuery,
		"userID":   userID,
		"limit":    limit,
		"offset":   offset,
	}

	var results []struct {
		ID          string `db:"id"`
		Name        string `db:"name"`
		IsFolder    bool   `db:"is_folder"`
		MimeType    string `db:"mime_type"`
		Size        int64  `db:"size"`
		Description string `db:"description"`
		Updated     string `db:"updated"`
		Highlight   string `db:"highlight"`
	}

	if err := app.DB().NewQuery(searchQuery).Bind(dbx.Params(params)).All(&results); err != nil {
		return empty, err
	}

	items := make([]api.SearchResultItem, len(results))
	for i, r := range results {
		items[i] = api.SearchResultItem{
			ID:          r.ID,
			Name:        r.Name,
			IsFolder:    r.IsFolder,
			MimeType:    r.MimeType,
			Size:        r.Size,
			Description: r.Description,
			Updated:     r.Updated,
			Highlight:   r.Highlight,
		}
	}

	// Count total
	countQuery := `
		SELECT COUNT(DISTINCT d.id) as total
		FROM fts_drive_items
		JOIN drive_items d ON d.id = fts_drive_items.record_id
		JOIN drive_shares ds ON ds.item = d.id
		WHERE fts_drive_items MATCH {:ftsQuery}
		AND ds.user = {:userID}`

	countParams := map[string]any{"ftsQuery": ftsQuery, "userID": userID}

	var countResult struct {
		Total int `db:"total"`
	}
	if err := app.DB().NewQuery(countQuery).Bind(dbx.Params(countParams)).One(&countResult); err != nil {
		countResult.Total = len(items)
	}

	return api.SearchResponse{Items: items, Total: countResult.Total}, nil
}
