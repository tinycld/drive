package push

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
)

var (
	sentReminders sync.Map // key: "eventID-fireMinute" → value: time.Time (when it was added)
)

func startScheduler(app *pocketbase.PocketBase) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	// Run once immediately on startup
	checkReminders(app)

	for range ticker.C {
		checkReminders(app)
		cleanExpiredEntries()
	}
}

func checkReminders(app *pocketbase.PocketBase) {
	now := time.Now().UTC()
	windowEnd := now.Add(90 * time.Second)
	lookahead := now.Add(24 * time.Hour)

	// Find events with reminders that start within 24 hours
	records, err := app.FindRecordsByFilter(
		"calendar_events",
		"reminder > 0 && start >= {:now} && start <= {:lookahead}",
		"",
		0,
		0,
		map[string]any{
			"now":       now.Format("2006-01-02 15:04:05.000Z"),
			"lookahead": lookahead.Format("2006-01-02 15:04:05.000Z"),
		},
	)
	if err != nil {
		log.Printf("[push/scheduler] failed to query calendar events: %v", err)
		return
	}

	for _, event := range records {
		startStr := event.GetString("start")
		eventStart, err := time.Parse("2006-01-02 15:04:05.000Z", startStr)
		if err != nil {
			continue
		}

		reminderMinutes := event.GetFloat("reminder")
		if reminderMinutes <= 0 {
			continue
		}

		fireTime := eventStart.Add(-time.Duration(reminderMinutes) * time.Minute)

		if fireTime.Before(now) || fireTime.After(windowEnd) {
			continue
		}

		// Dedup key includes the event ID and the fire minute
		dedup := fmt.Sprintf("%s-%d", event.Id, fireTime.Unix()/60)
		if _, loaded := sentReminders.LoadOrStore(dedup, time.Now()); loaded {
			continue
		}

		calendarID := event.GetString("calendar")
		title := event.GetString("title")

		// Find all users who are members of this calendar
		members, err := app.FindRecordsByFilter(
			"calendar_members",
			"calendar = {:calendarId}",
			"",
			0,
			0,
			map[string]any{"calendarId": calendarID},
		)
		if err != nil {
			log.Printf("[push/scheduler] failed to query members for calendar %s: %v", calendarID, err)
			continue
		}

		for _, member := range members {
			userOrgID := member.GetString("user_org")

			// Resolve user_org → user
			userOrgRecord, err := app.FindRecordById("user_org", userOrgID)
			if err != nil {
				continue
			}
			userID := userOrgRecord.GetString("user")

			body := fmt.Sprintf("Starts in %.0f minutes", reminderMinutes)

			SendToUser(app, userID, Payload{
				Title: title,
				Body:  body,
				Tag:   fmt.Sprintf("cal-reminder-%s", event.Id),
				URL:   fmt.Sprintf("/a/%s/calendar/%s", getOrgSlug(app, userOrgRecord.GetString("org")), event.Id),
			})
		}
	}
}

func getOrgSlug(app *pocketbase.PocketBase, orgID string) string {
	record, err := app.FindRecordById("orgs", orgID)
	if err != nil {
		return ""
	}
	return record.GetString("slug")
}

func cleanExpiredEntries() {
	cutoff := time.Now().Add(-24 * time.Hour)
	sentReminders.Range(func(key, value any) bool {
		if t, ok := value.(time.Time); ok && t.Before(cutoff) {
			sentReminders.Delete(key)
		}
		return true
	})
}
