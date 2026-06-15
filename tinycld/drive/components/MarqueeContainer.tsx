import type { ReactNode, RefObject } from 'react'
import { type LayoutChangeEvent, Platform, View } from 'react-native'

interface MarqueeContainerProps {
    /** Receives the underlying DOM node on web (the marquee gesture measures and
     *  listens on it). Unused on native. */
    containerRef: RefObject<HTMLDivElement | null>
    /** Forwarded so the grid can keep computing its column count from width. */
    onLayout: (e: LayoutChangeEvent) => void
    children: ReactNode
}

/**
 * The file-area wrapper that hosts the drag-to-select gesture. On web it's a
 * `position: relative` <div> whose node the marquee hook attaches to (and which
 * the marquee overlay positions against); on native it's a plain flex View and
 * the gesture is inert. Mirrors the web/native split DropZone uses for its own
 * DOM-event needs.
 *
 * The <div> doesn't fire React Native's `onLayout`, so on web a zero-size inner
 * View carries it — width is all the grid needs for its column math.
 */
export function MarqueeContainer({ containerRef, onLayout, children }: MarqueeContainerProps) {
    if (Platform.OS !== 'web') {
        return (
            <View className="flex-1" onLayout={onLayout}>
                {children}
            </View>
        )
    }
    return (
        <div
            ref={containerRef}
            style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
            }}
        >
            <View style={{ width: '100%', height: 0 }} onLayout={onLayout} />
            {children}
        </div>
    )
}
