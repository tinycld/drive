import { useCallback, useRef } from 'react'
import { Platform } from 'react-native'

const DOUBLE_CLICK_MS = 300

export function useDoubleClick(onSingleClick: () => void, onDoubleClick: () => void) {
    const lastTapRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    return useCallback(() => {
        const now = Date.now()
        if (Platform.OS === 'web' && now - lastTapRef.current < DOUBLE_CLICK_MS) {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
            onDoubleClick()
        } else {
            timerRef.current = setTimeout(() => {
                onSingleClick()
                timerRef.current = null
            }, DOUBLE_CLICK_MS)
        }
        lastTapRef.current = now
    }, [onSingleClick, onDoubleClick])
}
