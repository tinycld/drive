import type { Ref } from 'react'
import type { ScrollView, ScrollViewProps } from 'react-native'
import { DraxScrollView } from 'react-native-drax'

// One jump per frame, each 2% of the list height (~14px on a 700px list), so an
// item held at an edge glides instead of hopping. A jump this small must not be
// animated: an animated scroll would still run when the next one starts.
const AUTO_SCROLL_INTERVAL_MS = 16
const AUTO_SCROLL_JUMP_RATIO = 0.02

/**
 * The scroll view under the drive FlashLists. Drax must know about the list's
 * scroll: it measures drop targets inside it relative to the content and
 * offsets them by the live scroll position, so hit-tests stay correct after the
 * list scrolls. It also scrolls the list while a drag hovers near its top or
 * bottom edge, so an item can be carried to a folder that is out of view.
 */
export function DriveDragScrollView({
    style,
    ...props
}: ScrollViewProps & { ref?: Ref<ScrollView> }) {
    return (
        <DraxScrollView
            {...props}
            // DraxScrollView puts `style` on the Drax view that wraps the scroll
            // view. FlashList gives the scroll component no flex, so without
            // this the wrapper grows to the content height and the list can
            // neither scroll nor virtualize.
            style={[{ flex: 1 }, style]}
            autoScrollIntervalLength={AUTO_SCROLL_INTERVAL_MS}
            autoScrollJumpRatio={AUTO_SCROLL_JUMP_RATIO}
            autoScrollAnimated={false}
        />
    )
}
