import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { View } from 'react-native'
import type { Rect } from '../lib/marquee'

interface MarqueeOverlayProps {
    /** Container-relative box to draw. */
    rect: Rect | null
    /** Whether a marquee drag is in progress. */
    visible: boolean
}

/**
 * The translucent rubber-band rectangle drawn while a drag-to-select is in
 * progress. Pointer-transparent so the underlying mouseup still lands, and only
 * mounted while dragging.
 */
export function MarqueeOverlay({ rect, visible }: MarqueeOverlayProps) {
    const borderColor = useThemeColor('primary')
    if (!visible || !rect) return null
    return (
        <View
            pointerEvents="none"
            className="absolute bg-primary/10"
            style={{
                left: rect.left,
                top: rect.top,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
                borderWidth: 1,
                borderColor,
                zIndex: 50,
            }}
        />
    )
}
