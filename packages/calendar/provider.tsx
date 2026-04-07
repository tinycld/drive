import type { ReactNode } from 'react'
import { VisibleCalendarsProvider } from './hooks/useCalendarEvents'
import { useEventReminders } from './hooks/useEventReminders'

function EventReminders() {
    useEventReminders()
    return null
}

export default function CalendarProvider({ children }: { children: ReactNode }) {
    return (
        <VisibleCalendarsProvider>
            <EventReminders />
            {children}
        </VisibleCalendarsProvider>
    )
}
