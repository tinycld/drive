package drive

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/search"
)

// searchSource contributes drive to the federated GET /api/search.
//
// The row mapping here is what the TypeScript adapter's toRow used to own.
// Server-side means the palette and the CLI render identical rows from one
// implementation; a TS version could only ever serve the browser.
//
// Drive keeps its own /api/drive/search route as well: the in-app search box
// filters the grid in place and rebuilds DriveItemViews from drive-shaped
// fields, which a normalized row cannot express. Both read the same index.
func searchSource() search.Source {
	return search.Source{
		Slug:  "drive",
		Label: "Drive",
		// Mirrors manifest.ts nav.order, the cross-package ranking tie-break.
		Order:  12,
		Scopes: []string{"drive:read"},
		Search: searchDriveRows,
	}
}

func searchDriveRows(app core.App, userID string, q search.Query) (search.Result, error) {
	resp, err := searchDriveItems(
		app, userID, joinTerms(q.Include), joinTerms(q.Exclude), q.Limit, q.Offset,
	)
	if err != nil {
		return search.Result{}, err
	}

	rows := make([]search.Row, 0, len(resp.Items))
	for _, item := range resp.Items {
		rows = append(rows, search.Row{
			ID: item.ID,
			// A file with no name is still openable, so label it rather than
			// render a blank, unclickable row.
			Title: titleOr(item.Name, "Untitled file"),
			// The description is what the old adapter showed. The FTS highlight
			// is deliberately not used: it carries <mark> markup, and a CLI
			// would have to strip tags a server sent purely for the web.
			Subtitle: item.Description,
			Meta:     item.Updated,
			// The fields a scripted caller filters on, and the ones a client
			// needs to pick an icon.
			Fields: map[string]any{
				"is_folder": item.IsFolder,
				"mime_type": item.MimeType,
				"size":      item.Size,
			},
		})
	}
	return search.Result{Rows: rows, Total: resp.Total}, nil
}

// joinTerms flattens parsed terms into the space-separated string the search
// helpers sanitize. The aggregator's contract is parsed terms; the FTS layer
// owns the quoting, so the round trip keeps that boundary in one place.
func joinTerms(terms []string) string {
	return strings.Join(terms, " ")
}

func titleOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
