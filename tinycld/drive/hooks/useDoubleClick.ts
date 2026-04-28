import { useCallback, useRef } from 'react'
import { type GestureResponderEvent, Platform } from 'react-native'

const DOUBLE_CLICK_MS = 300

export function useDoubleClick(
    onSingleClick: (event: GestureResponderEvent) => void,
    onDoubleClick: () => void
) {
    const lastTapRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingEventRef = useRef<GestureResponderEvent | null>(null)

    return useCallback(
        (event: GestureResponderEvent) => {
            const now = Date.now()
            if (Platform.OS === 'web' && now - lastTapRef.current < DOUBLE_CLICK_MS) {
                if (timerRef.current) {
                    clearTimeout(timerRef.current)
                    timerRef.current = null
                }
                pendingEventRef.current = null
                onDoubleClick()
            } else {
                pendingEventRef.current = event
                timerRef.current = setTimeout(() => {
                    if (pendingEventRef.current) {
                        onSingleClick(pendingEventRef.current)
                        pendingEventRef.current = null
                    }
                    timerRef.current = null
                }, DOUBLE_CLICK_MS)
            }
            lastTapRef.current = now
        },
        [onSingleClick, onDoubleClick]
    )
}
