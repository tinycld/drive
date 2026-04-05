package mail

import (
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type searchResultItem struct {
	ThreadID         string `json:"thread_id"`
	Subject          string `json:"subject"`
	SubjectHighlight string `json:"subject_highlight"`
	SnippetHighlight string `json:"snippet_highlight"`
	LatestDate       string `json:"latest_date"`
	Participants     string `json:"participants"`
	MessageCount     int    `json:"message_count"`
	MailboxID        string `json:"mailbox_id"`
}

type searchResponse struct {
	Items []searchResultItem `json:"items"`
	Total int                `json:"total"`
}

func handleSearch(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	userID := re.Auth.Id
	q := re.Request.URL.Query().Get("q")
	mailboxID := re.Request.URL.Query().Get("mailbox_id")
	limitStr := re.Request.URL.Query().Get("limit")
	offsetStr := re.Request.URL.Query().Get("offset")

	limit := 25
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	emptyResponse := searchResponse{Items: []searchResultItem{}, Total: 0}

	if len(q) < 2 {
		return re.JSON(http.StatusOK, emptyResponse)
	}

	ftsQuery := sanitizeFTSQuery(q)
	if ftsQuery == "" {
		return re.JSON(http.StatusOK, emptyResponse)
	}

	// Resolve accessible mailbox IDs for this user
	accessibleMailboxIDs, err := getUserMailboxIDs(app, userID, mailboxID)
	if err != nil || len(accessibleMailboxIDs) == 0 {
		return re.JSON(http.StatusOK, emptyResponse)
	}

	// Build IN clause for mailbox filtering
	mailboxParams := make(map[string]any)
	mailboxPlaceholders := make([]string, len(accessibleMailboxIDs))
	for i, id := range accessibleMailboxIDs {
		key := "mb" + strconv.Itoa(i)
		mailboxParams[key] = id
		mailboxPlaceholders[i] = "{:" + key + "}"
	}
	inClause := "(" + strings.Join(mailboxPlaceholders, ", ") + ")"

	// Search threads by subject/snippet/participants
	threadQuery := `
		SELECT
			t.id as thread_id,
			t.subject,
			highlight(fts_mail_threads, 1, '<mark>', '</mark>') as subject_highlight,
			snippet(fts_mail_threads, 2, '<mark>', '</mark>', '...', 40) as snippet_highlight,
			t.latest_date,
			t.participants,
			t.message_count,
			t.mailbox as mailbox_id,
			fts_mail_threads.rank
		FROM fts_mail_threads
		JOIN mail_threads t ON t.id = fts_mail_threads.record_id
		WHERE fts_mail_threads MATCH {:ftsQuery}
		AND t.mailbox IN ` + inClause

	// Search messages for body-level matches, join back to threads
	messageQuery := `
		SELECT
			t.id as thread_id,
			t.subject,
			'' as subject_highlight,
			snippet(fts_mail_messages, 5, '<mark>', '</mark>', '...', 40) as snippet_highlight,
			t.latest_date,
			t.participants,
			t.message_count,
			t.mailbox as mailbox_id,
			fts_mail_messages.rank
		FROM fts_mail_messages
		JOIN mail_messages m ON m.id = fts_mail_messages.record_id
		JOIN mail_threads t ON t.id = m.thread
		WHERE fts_mail_messages MATCH {:ftsQuery}
		AND t.mailbox IN ` + inClause

	// Union both, dedup by thread_id, order by rank.
	// MAX() on highlight columns ensures thread-level highlights (non-empty) take priority.
	combinedQuery := `
		SELECT thread_id, MAX(subject) as subject,
			   MAX(subject_highlight) as subject_highlight,
			   MAX(snippet_highlight) as snippet_highlight,
			   MAX(latest_date) as latest_date,
			   MAX(participants) as participants,
			   MAX(message_count) as message_count,
			   MAX(mailbox_id) as mailbox_id
		FROM (
			` + threadQuery + `
			UNION ALL
			` + messageQuery + `
		)
		GROUP BY thread_id
		ORDER BY MIN(rank)
		LIMIT {:limit} OFFSET {:offset}
	`

	params := map[string]any{
		"ftsQuery": ftsQuery,
		"limit":    limit,
		"offset":   offset,
	}
	maps.Copy(params, mailboxParams)

	var results []struct {
		ThreadID         string `db:"thread_id"`
		Subject          string `db:"subject"`
		SubjectHighlight string `db:"subject_highlight"`
		SnippetHighlight string `db:"snippet_highlight"`
		LatestDate       string `db:"latest_date"`
		Participants     string `db:"participants"`
		MessageCount     int    `db:"message_count"`
		MailboxID        string `db:"mailbox_id"`
	}

	err = app.DB().NewQuery(combinedQuery).Bind(dbx.Params(params)).All(&results)
	if err != nil {
		app.Logger().Warn("FTS: search query failed", "error", err, "query", q)
		return re.JSON(http.StatusOK, emptyResponse)
	}

	items := make([]searchResultItem, len(results))
	for i, r := range results {
		items[i] = searchResultItem{
			ThreadID:         r.ThreadID,
			Subject:          r.Subject,
			SubjectHighlight: r.SubjectHighlight,
			SnippetHighlight: r.SnippetHighlight,
			LatestDate:       r.LatestDate,
			Participants:     r.Participants,
			MessageCount:     r.MessageCount,
			MailboxID:        r.MailboxID,
		}
	}

	// Skip expensive count query when we know the total from the result set
	total := len(items)
	if len(items) >= limit {
		countQuery := `
			SELECT COUNT(DISTINCT thread_id) as total FROM (
				SELECT t.id as thread_id
				FROM fts_mail_threads
				JOIN mail_threads t ON t.id = fts_mail_threads.record_id
				WHERE fts_mail_threads MATCH {:ftsQuery}
				AND t.mailbox IN ` + inClause + `
				UNION
				SELECT t.id as thread_id
				FROM fts_mail_messages
				JOIN mail_messages m ON m.id = fts_mail_messages.record_id
				JOIN mail_threads t ON t.id = m.thread
				WHERE fts_mail_messages MATCH {:ftsQuery}
				AND t.mailbox IN ` + inClause + `
			)
		`
		var countResult struct {
			Total int `db:"total"`
		}
		countParams := map[string]any{"ftsQuery": ftsQuery}
		maps.Copy(countParams, mailboxParams)
		if err := app.DB().NewQuery(countQuery).Bind(dbx.Params(countParams)).One(&countResult); err == nil {
			total = countResult.Total
		}
	} else if offset > 0 {
		total = offset + len(items)
	}

	return re.JSON(http.StatusOK, searchResponse{Items: items, Total: total})
}

// getUserMailboxIDs returns the mailbox IDs the user has access to.
// If mailboxID is provided, it filters to just that mailbox (after verifying access).
func getUserMailboxIDs(app *pocketbase.PocketBase, userID, mailboxID string) ([]string, error) {
	userOrgs, err := app.FindRecordsByFilter(
		"user_org",
		"user = {:user}",
		"",
		100,
		0,
		map[string]any{"user": userID},
	)
	if err != nil || len(userOrgs) == 0 {
		return nil, err
	}

	userOrgIDs := make([]string, len(userOrgs))
	for i, uo := range userOrgs {
		userOrgIDs[i] = uo.Id
	}

	var allMailboxIDs []string
	for _, uoID := range userOrgIDs {
		members, err := app.FindRecordsByFilter(
			"mail_mailbox_members",
			"user_org = {:userOrg}",
			"",
			100,
			0,
			map[string]any{"userOrg": uoID},
		)
		if err != nil {
			continue
		}
		for _, m := range members {
			allMailboxIDs = append(allMailboxIDs, m.GetString("mailbox"))
		}
	}

	if mailboxID != "" {
		if slices.Contains(allMailboxIDs, mailboxID) {
			return []string{mailboxID}, nil
		}
		return nil, nil
	}

	return allMailboxIDs, nil
}
