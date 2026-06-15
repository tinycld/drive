import { useCallback, useRef } from 'react'
import type { GestureResponderEvent } from 'react-native'

const DOUBLE_CLICK_MS = 300

// Fires `onSingleClick` immediately on every tap, and additionally fires
// `onDoubleClick` when a second tap lands within 300ms. The single handler is
// NOT deferred: its only use here is selection, which is harmless to apply
// eagerly and must feel instant — a double-tap simply selects then opens.
// (The previous version deferred the single handler 300ms to disambiguate,
// which made selecting a file feel laggy.)
export function useDoubleClick(
    onSingleClick: (event: GestureResponderEvent) => void,
    onDoubleClick: () => void
) {
    const lastTapRef = useRef(0)

    return useCallback(
        (event: GestureResponderEvent) => {
            onSingleClick(event)
            const now = Date.now()
            if (now - lastTapRef.current < DOUBLE_CLICK_MS) {
                onDoubleClick()
                // Reset so a third rapid tap starts a fresh pair rather than
                // immediately counting as another double.
                lastTapRef.current = 0
            } else {
                lastTapRef.current = now
            }
        },
        [onSingleClick, onDoubleClick]
    )
}
