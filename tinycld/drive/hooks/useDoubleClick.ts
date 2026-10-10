import { useCallback, useRef } from 'react'
import type { GestureResponderEvent } from 'react-native'

const DOUBLE_CLICK_MS = 300

// Fires `onSingleClick` immediately on every tap, and additionally fires
// `onDoubleClick` when a second tap lands within 300ms. The single handler is
// NOT deferred: its only use here is selection, which is harmless to apply
// eagerly and must feel instant — a double-tap simply selects then opens.
// (The previous version deferred the single handler 300ms to disambiguate,
// which made selecting a file feel laggy.)
//
// `onSingleClickSettled` is the deferred half, for what must NOT happen on a
// double-click: it fires 300ms after a tap that no second tap followed.
export function useDoubleClick(
    onSingleClick: (event: GestureResponderEvent) => void,
    onDoubleClick: () => void,
    onSingleClickSettled?: (event: GestureResponderEvent) => void
) {
    const lastTapRef = useRef(0)
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    return useCallback(
        (event: GestureResponderEvent) => {
            onSingleClick(event)
            clearTimeout(settleTimerRef.current)
            const now = Date.now()
            if (now - lastTapRef.current < DOUBLE_CLICK_MS) {
                onDoubleClick()
                // Reset so a third rapid tap starts a fresh pair rather than
                // immediately counting as another double.
                lastTapRef.current = 0
                return
            }
            lastTapRef.current = now
            if (!onSingleClickSettled) return
            settleTimerRef.current = setTimeout(() => onSingleClickSettled(event), DOUBLE_CLICK_MS)
        },
        [onSingleClick, onDoubleClick, onSingleClickSettled]
    )
}
