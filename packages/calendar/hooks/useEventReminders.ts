import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useRef } from 'react'
import {
    cancelAllNotifications,
    requestNotificationPermission,
    scheduleNotification,
} from '~/lib/notifications'
import { useStore } from '~/lib/pocketbase'
import type { CalendarEvents } from '../types'
import { useVisibleCalendars } from './useCalendarEvents'

/** How far ahead to look for upcoming events to schedule reminders */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000 // 24 hours

function getReminderTime(event: CalendarEvents): number | null {
    if (!event.reminder || event.reminder <= 0) return null
    const eventStart = new Date(event.start).getTime()
    return eventStart - event.reminder * 60 * 1000
}

function isInWindow(reminderTime: number, now: number, end: number) {
    return reminderTime > now && reminderTime <= end
}

async function scheduleEventReminders(
    events: CalendarEvents[],
    visibleIds: Set<string>,
    alreadyScheduled: Set<string>
) {
    const now = Date.now()
    const lookaheadEnd = now + LOOKAHEAD_MS
    const nextScheduled = new Set<string>()

    for (const event of events) {
        if (!visibleIds.has(event.calendar)) continue
        const reminderTime = getReminderTime(event)
        if (!reminderTime || !isInWindow(reminderTime, now, lookaheadEnd)) continue

        const identifier = `cal-reminder-${event.id}`
        nextScheduled.add(identifier)
        if (alreadyScheduled.has(identifier)) continue

        await scheduleNotification({
            title: event.title,
            body: `Starts in ${event.reminder} minutes`,
            identifier,
            triggerAt: new Date(reminderTime),
            data: { eventId: event.id },
        })
    }

    return nextScheduled
}

/**
 * Watches calendar events and schedules OS-level notifications
 * for events that have a reminder value > 0.
 *
 * Should be mounted once in the calendar provider.
 */
export function useEventReminders() {
    const { visibleIds } = useVisibleCalendars()
    const [eventsCollection] = useStore('calendar_events')
    const scheduledRef = useRef(new Set<string>())

    const { data: allEvents } = useLiveQuery(query => query.from({ evt: eventsCollection }), [])

    useEffect(() => {
        if (!allEvents) return

        let cancelled = false

        async function run() {
            const granted = await requestNotificationPermission()
            if (!granted || cancelled) return
            scheduledRef.current = await scheduleEventReminders(
                allEvents,
                visibleIds,
                scheduledRef.current
            )
        }

        run()

        // Re-check every 5 minutes to pick up events entering the lookahead window
        const interval = setInterval(run, 5 * 60 * 1000)

        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [allEvents, visibleIds])

    // Clean up all scheduled notifications on unmount
    useEffect(() => {
        return () => {
            cancelAllNotifications()
        }
    }, [])
}
