import { useActiveParams, useRouter } from 'one'
import {
    createContext,
    createElement,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react'
import type { GestureResponderEvent } from 'react-native'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { useOrgHref } from '~/lib/org-routes'
import { addDays, addMonths, addWeeks, parseDate, toDateString } from './useCalendarNavigation'

export type ViewMode = 'day' | 'week' | 'month' | 'schedule'

const VIEW_MODES = new Set<string>(['day', 'week', 'month', 'schedule'])

function parseViewMode(str: string | undefined): ViewMode {
    if (str && VIEW_MODES.has(str)) return str as ViewMode
    return 'week'
}

export interface AnchorRect {
    x: number
    y: number
    width: number
    height: number
}

type PopoverState =
    | { type: 'closed' }
    | { type: 'quick-create'; date: Date; hour: number }
    | { type: 'event-detail'; eventId: string; anchorRect?: AnchorRect }

interface CalendarViewState {
    viewMode: ViewMode
    focusDate: Date
    popover: PopoverState
    setViewMode: (mode: ViewMode) => void
    goToday: () => void
    goNext: () => void
    goPrevious: () => void
    goToDate: (date: Date) => void
    openQuickCreate: (date: Date, hour: number) => void
    openEventDetail: (eventId: string, e?: GestureResponderEvent) => void
    closePopover: () => void
}

const PopoverContext = createContext<{
    popover: PopoverState
    setPopover: (state: PopoverState) => void
} | null>(null)

export function CalendarViewProvider({ children }: { children: ReactNode }) {
    const [popover, setPopover] = useState<PopoverState>({ type: 'closed' })
    const value = useMemo(() => ({ popover, setPopover }), [popover])
    return createElement(PopoverContext.Provider, { value }, children)
}

export function useCalendarView(): CalendarViewState {
    const router = useRouter()
    const orgHref = useOrgHref()
    const { view, date } = useActiveParams<{ view?: string; date?: string }>()
    const popoverCtx = useContext(PopoverContext)
    const breakpoint = useBreakpoint()
    const isMobile = breakpoint === 'mobile'

    if (!popoverCtx) {
        throw new Error('useCalendarView must be used within CalendarViewProvider')
    }

    const viewMode = parseViewMode(view)
    const focusDate = useMemo(() => parseDate(date), [date])
    const { popover, setPopover } = popoverCtx

    const navigate = useCallback(
        (newView: ViewMode, newDate: Date) => {
            router.push(orgHref('calendar', { view: newView, date: toDateString(newDate) }))
        },
        [router, orgHref]
    )

    const setViewMode = useCallback(
        (mode: ViewMode) => navigate(mode, focusDate),
        [navigate, focusDate]
    )

    const goToday = useCallback(() => navigate(viewMode, new Date()), [navigate, viewMode])

    const goNext = useCallback(() => {
        if (viewMode === 'day' || viewMode === 'schedule') navigate(viewMode, addDays(focusDate, 1))
        else if (viewMode === 'week')
            navigate(viewMode, isMobile ? addDays(focusDate, 3) : addWeeks(focusDate, 1))
        else navigate(viewMode, addMonths(focusDate, 1))
    }, [navigate, viewMode, focusDate, isMobile])

    const goPrevious = useCallback(() => {
        if (viewMode === 'day' || viewMode === 'schedule')
            navigate(viewMode, addDays(focusDate, -1))
        else if (viewMode === 'week')
            navigate(viewMode, isMobile ? addDays(focusDate, -3) : addWeeks(focusDate, -1))
        else navigate(viewMode, addMonths(focusDate, -1))
    }, [navigate, viewMode, focusDate, isMobile])

    const goToDate = useCallback((d: Date) => navigate(viewMode, d), [navigate, viewMode])

    const openQuickCreate = useCallback(
        (d: Date, hour: number) => setPopover({ type: 'quick-create', date: d, hour }),
        [setPopover]
    )

    const openEventDetail = useCallback(
        (eventId: string, e?: GestureResponderEvent) => {
            let anchorRect: AnchorRect | undefined
            if (e?.currentTarget) {
                const target = e.currentTarget as unknown as Element
                if ('getBoundingClientRect' in target) {
                    const rect = target.getBoundingClientRect()
                    anchorRect = {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                    }
                }
            }
            setPopover({ type: 'event-detail', eventId, anchorRect })
        },
        [setPopover]
    )

    const closePopover = useCallback(() => setPopover({ type: 'closed' }), [setPopover])

    return {
        viewMode,
        focusDate,
        popover,
        setViewMode,
        goToday,
        goNext,
        goPrevious,
        goToDate,
        openQuickCreate,
        openEventDetail,
        closePopover,
    }
}
