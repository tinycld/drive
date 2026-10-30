package drive

import (
	"fmt"
	"sort"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Retention for drive_item_versions. Uploads, "Save version" versions and
// any version with a label are kept forever. Automatic versions without a
// label thin out with age, and the hidden copies a restore takes expire.
const (
	keepAllAutoFor  = 7 * 24 * time.Hour
	keepDailyAutoTo = 90 * 24 * time.Hour
	keepSystemFor   = 30 * 24 * time.Hour
)

type versionRow struct {
	ID           string
	Source       string
	Label        string
	Created      time.Time
	Editors      []string
	ShareEditors []string
}

// editorMerge is the full editor lists a surviving version gets when the
// versions pruned before it hand their editors on.
type editorMerge struct {
	Editors      []string
	ShareEditors []string
}

// thinBucket names the bucket an unlabeled auto version falls in; within a
// bucket only the newest version stays. "" means keep it.
func thinBucket(r versionRow, now time.Time) string {
	age := now.Sub(r.Created)
	switch {
	case age <= keepAllAutoFor:
		return ""
	case age <= keepDailyAutoTo:
		return "day:" + r.Created.UTC().Format("2006-01-02")
	default:
		year, week := r.Created.UTC().ISOWeek()
		return fmt.Sprintf("week:%d-%02d", year, week)
	}
}

// planPrune decides, for one item's versions, which to delete and which
// survivors take over the editors of the deleted ones. Pure: no database.
func planPrune(rows []versionRow, now time.Time) ([]string, map[string]editorMerge) {
	sorted := append([]versionRow(nil), rows...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Created.After(sorted[j].Created) })

	deleted := map[string]bool{}
	seenBucket := map[string]bool{}
	for _, r := range sorted {
		switch {
		case r.Source == "system":
			if now.Sub(r.Created) > keepSystemFor {
				deleted[r.ID] = true
			}
		case r.Source == "auto" && r.Label == "":
			bucket := thinBucket(r, now)
			if bucket == "" {
				continue
			}
			if seenBucket[bucket] {
				deleted[r.ID] = true
			}
			seenBucket[bucket] = true
		}
	}

	merges := map[string]editorMerge{}
	var target *versionRow
	for i := range sorted {
		r := &sorted[i]
		if !deleted[r.ID] {
			if r.Source != "system" {
				target = r
			}
			continue
		}
		if r.Source == "system" || target == nil {
			continue
		}
		m, ok := merges[target.ID]
		if !ok {
			m = editorMerge{
				Editors:      unionSorted(target.Editors, nil),
				ShareEditors: unionSorted(target.ShareEditors, nil),
			}
		}
		m.Editors = unionSorted(m.Editors, r.Editors)
		m.ShareEditors = unionSorted(m.ShareEditors, r.ShareEditors)
		merges[target.ID] = m
	}
	ids := make([]string, 0, len(deleted))
	for _, r := range sorted {
		if deleted[r.ID] {
			ids = append(ids, r.ID)
		}
	}
	return ids, merges
}

func unionSorted(a, b []string) []string {
	set := map[string]struct{}{}
	for _, v := range a {
		set[v] = struct{}{}
	}
	for _, v := range b {
		set[v] = struct{}{}
	}
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for v := range set {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

// pruneVersions applies the retention rules to every item that has
// automatic or hidden restore versions.
func pruneVersions(app core.App, now time.Time) error {
	var items []struct {
		Item string `db:"item"`
	}
	if err := app.DB().NewQuery(
		"SELECT DISTINCT item FROM drive_item_versions WHERE source IN ('auto', 'system')",
	).All(&items); err != nil {
		return err
	}
	for _, it := range items {
		if err := pruneItemVersions(app, it.Item, now); err != nil {
			versionLog.Warn("version retention failed for an item", "itemID", it.Item, "err", err)
		}
	}
	return nil
}

func pruneItemVersions(app core.App, itemID string, now time.Time) error {
	records, err := app.FindRecordsByFilter("drive_item_versions", "item = {:item}", "", 0, 0,
		dbx.Params{"item": itemID})
	if err != nil {
		return err
	}
	byID := map[string]*core.Record{}
	rows := make([]versionRow, 0, len(records))
	for _, rec := range records {
		byID[rec.Id] = rec
		var share []string
		_ = rec.UnmarshalJSONField("share_editors", &share)
		rows = append(rows, versionRow{
			ID:           rec.Id,
			Source:       rec.GetString("source"),
			Label:        rec.GetString("label"),
			Created:      rec.GetDateTime("created").Time(),
			Editors:      rec.GetStringSlice("editors"),
			ShareEditors: share,
		})
	}
	deleteIDs, merges := planPrune(rows, now)
	if len(deleteIDs) == 0 {
		return nil
	}
	return app.RunInTransaction(func(tx core.App) error {
		for id, m := range merges {
			rec := byID[id]
			rec.Set("editors", m.Editors)
			rec.Set("share_editors", m.ShareEditors)
			if err := tx.Save(rec); err != nil {
				return err
			}
		}
		for _, id := range deleteIDs {
			if err := tx.Delete(byID[id]); err != nil {
				return err
			}
		}
		return nil
	})
}
