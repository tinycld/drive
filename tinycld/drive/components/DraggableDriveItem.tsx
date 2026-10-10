import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Grip } from 'lucide-react-native'
import { type ReactNode, useMemo, useRef } from 'react'
import { type LayoutChangeEvent, Platform, Text, View } from 'react-native'
import { type DraxRenderHoverContentProps, DraxView } from 'react-native-drax'
import type { DriveDragPayload } from '../lib/dnd'
import { useDriveUIStore } from '../stores/drive-ui-store'

// How a drag activates, per platform.
//
// Web/desktop: 0 — no time-based activation. Drax forwards this to RNGH as
// `activateAfterLongPress`, and a non-zero value makes the gesture activate on
// a *timer* while the pointer is held still (no movement), which turned an
// ordinary click-and-hold on a grid card into an instant drag. With 0, RNGH
// falls back to its movement threshold (~15px touch-slop): a drag begins only
// once the pointer actually moves, so a plain click stays a tap/select/open.
//
// Native (touch): a short hold — there's no "move while held" affordance before
// a touch starts scrolling, so press-and-hold is the expected way to grab.
const DRAG_LONG_PRESS_MS = Platform.OS === 'web' ? 0 : 120

/**
 * Suppresses the browser's native HTML5 drag on web. The grid card renders a
 * real <img> thumbnail (expo-image), which the browser will "ghost-drag"
 * before Drax's long-press activates — stealing the gesture. Cancelling
 * `dragstart` on a wrapping element stops any native drag (image or selection)
 * that begins anywhere inside the card, leaving Drax's pointer gesture as the
 * only drag. `display: contents` keeps layout untouched; the event still
 * bubbles to this wrapper. No-op on native.
 */
function NoNativeDrag({ children }: { children: ReactNode }) {
    if (Platform.OS !== 'web') return <>{children}</>
    return (
        <div
            role="presentation"
            style={{ display: 'contents' }}
            onDragStartCapture={e => e.preventDefault()}
        >
            {children}
        </div>
    )
}

/** The ids a drag of `itemId` carries: the whole multi-selection when the
 *  grabbed item is part of it, otherwise just this item. Reads the store
 *  imperatively so callers can resolve it at drag-START — Drax registers a
 *  view's props once and doesn't refresh the captured render closures when
 *  `selectedIds` later changes, so a value closed over at render time would be
 *  stale (e.g. the drag preview would always show 1). */
function dragIdsFor(itemId: string): string[] {
    const { selectedIds } = useDriveUIStore.getState()
    return selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId]
}

/** Drax id for an item's draggable view. A FlashList recycles a cell to a
 *  new item without remounting it, and Drax measures a view only when it
 *  registers or resizes, so a recycled view would keep the old item's position
 *  and hit-test at the wrong place. Keying the id on the item makes Drax
 *  register and measure the view again when its cell is recycled. `scope`
 *  keeps the id unique when the same item renders in two mounted lists (a
 *  folder screen stays mounted under the one pushed above it). */
export function dragViewId(scope: string, itemId: string): string {
    return `drive-drag-${scope}-${itemId}`
}

/** Drag payload for an item — recomputed live so it reflects the selection at
 *  drag-start, not whenever the view last rendered. */
function useDragPayload(itemId: string): { payload: DriveDragPayload } {
    // Subscribe so the DraxView re-registers its dragPayload as the selection
    // changes; the hover preview reads the count live (see dragIdsFor).
    useDriveUIStore(s => s.selectedIds)
    return { payload: { kind: 'drive-items', ids: dragIdsFor(itemId) } }
}

interface Point {
    x: number
    y: number
}

const ORIGIN: Point = { x: 0, y: 0 }

/** The floating copy of an item shown while it is dragged. */
export interface DragPreview {
    content: ReactNode
    /** Where the dragged view sits inside `content`. Drax places the preview
     *  at the dragged view's origin, so the copy is shifted back by this much
     *  to start out exactly over the item it copies. A list row drags by its
     *  grip, not by the whole row, so its anchor is the grip's offset in the
     *  row; a grid card drags as a whole and needs none. */
    anchor?: Point
}

/** Builds the drag preview, given the measured size of the dragged view. */
export type RenderDragPreview = (
    draggedSize: { width: number; height: number } | undefined
) => DragPreview

interface DraggableDriveItemProps {
    itemId: string
    /** Unique per list instance; see dragViewId. */
    dndScope: string
    /** The copy of the item that follows the pointer. */
    renderPreview: RenderDragPreview
    /** Whether dragging is allowed (e.g. disabled in trash). */
    isEnabled: boolean
    children: ReactNode
}

/**
 * Wraps a drive row/card so it can be dragged. The payload is the current
 * multi-selection when the grabbed item is part of it, otherwise just this
 * item — computed from a live `selectedIds` subscription so it reflects the
 * selection at drag-start. The floating hover copy is `renderPreview`'s copy
 * of the item; multi-item drags add a count badge.
 */
export function DraggableDriveItem({
    itemId,
    dndScope,
    renderPreview,
    isEnabled,
    children,
}: DraggableDriveItemProps) {
    const { payload } = useDragPayload(itemId)
    const renderHover = useHoverPreview(itemId, renderPreview)

    if (!isEnabled) return <>{children}</>

    return (
        <DraxView
            id={dragViewId(dndScope, itemId)}
            draggable
            dragPayload={payload}
            longPressDelay={DRAG_LONG_PRESS_MS}
            dragInactiveStyle={{ opacity: 1 }}
            draggingStyle={{ opacity: 0.3 }}
            renderHoverContent={renderHover}
        >
            <NoNativeDrag>{children}</NoNativeDrag>
        </DraxView>
    )
}

interface DragGripProps {
    itemId: string
    /** Unique per list instance; see dragViewId. */
    dndScope: string
    /** The copy of the row that follows the pointer. */
    renderPreview: RenderDragPreview
    /** Reports where the grip sits in its parent, for the preview's anchor. */
    onLayout: (event: LayoutChangeEvent) => void
}

/**
 * A small, finger-sized draggable grip for list rows. Unlike wrapping the whole
 * (full-width) row, the registered draggable here is grip-sized — so Drax's
 * hit-test, which is anchored at `finger − grabOffset + sourceWidth/2`, tracks
 * the finger and can reach narrow drop targets like the sidebar tree. The row
 * stays a normal pressable; only this grip initiates a drag.
 */
export function DragGrip({ itemId, dndScope, renderPreview, onLayout }: DragGripProps) {
    const { payload } = useDragPayload(itemId)
    const renderHover = useHoverPreview(itemId, renderPreview)
    const mutedColor = useThemeColor('muted-foreground')

    return (
        // DraxView takes over onLayout for its own measuring, so a plain
        // wrapper reports the grip's position instead.
        <View onLayout={onLayout}>
            <DraxView
                id={dragViewId(dndScope, itemId)}
                draggable
                dragPayload={payload}
                longPressDelay={DRAG_LONG_PRESS_MS}
                renderHoverContent={renderHover}
                // Finger-sized drag handle; labelled so e2e can grab the grip for a
                // specific row (scoped under that row's aria-label) to drive a drag
                // to narrow targets like the sidebar.
                accessibilityLabel="Drag to move"
            >
                <Grip size={DRAG_GRIP_SIZE} color={mutedColor} />
            </DraxView>
        </View>
    )
}

const DRAG_GRIP_SIZE = 16

/** The grip's look without the drag gesture, for a row's drag preview. */
export function StaticDragGrip() {
    const mutedColor = useThemeColor('muted-foreground')
    return <Grip size={DRAG_GRIP_SIZE} color={mutedColor} />
}

/** Shared hover-content renderer for the draggable wrappers + grip. Drax keeps
 *  the closure it registered for a view and does not take a newer one until
 *  the view's id changes, so this closure reads the latest `renderPreview`
 *  through a ref, and the count when Drax INVOKES it (at drag-start) — a value
 *  captured at render would be stale after a rename or a selection change. */
function useHoverPreview(
    itemId: string,
    renderPreview: RenderDragPreview
): (props: DraxRenderHoverContentProps) => ReactNode {
    const renderPreviewRef = useRef(renderPreview)
    renderPreviewRef.current = renderPreview

    return ({ dimensions }) => (
        <DragPreviewFrame
            preview={renderPreviewRef.current(dimensions)}
            count={dragIdsFor(itemId).length}
        />
    )
}

// Drax renders hover content in its own layer, above the app's
// QueryClientProvider (see core's Providers), and the copy's thumbnails read
// the file token through React Query. The app's client is shared, so the copy
// sees the token the source item already fetched and draws its thumbnail at once.
function DragPreviewFrame({ preview, count }: { preview: DragPreview; count: number }) {
    const anchor = preview.anchor ?? ORIGIN
    return (
        <QueryClientProvider client={queryClient}>
            <View
                testID="drive-drag-preview"
                style={{ marginLeft: -anchor.x, marginTop: -anchor.y }}
            >
                {preview.content}
                <DragCountBadge count={count} isVisible={count > 1} />
            </View>
        </QueryClientProvider>
    )
}

function DragCountBadge({ count, isVisible }: { count: number; isVisible: boolean }) {
    const background = useThemeColor('primary')
    const foreground = useThemeColor('primary-foreground')
    if (!isVisible) return null
    return (
        <View
            className="absolute items-center justify-center rounded-full"
            style={{
                top: -6,
                right: -6,
                minWidth: 22,
                height: 22,
                paddingHorizontal: 6,
                backgroundColor: background,
            }}
        >
            <Text style={{ color: foreground, fontSize: 12, fontWeight: '700' }}>{count}</Text>
        </View>
    )
}

/** Tracks a list row's size and where its drag grip sits inside it, so the
 *  grip's preview can draw the whole row and line it up over the source. The
 *  values live in a ref: they are read only when a drag starts, and writing
 *  them must not re-render the row. */
export function useRowDragGeometry() {
    const geometry = useRef({ width: 0, height: 0, leading: ORIGIN, grip: ORIGIN })
    return useMemo(
        () => ({
            onRowLayout: (event: LayoutChangeEvent) => {
                const { width, height } = event.nativeEvent.layout
                geometry.current = { ...geometry.current, width, height }
            },
            /** The grip's parent, laid out inside the row. */
            onLeadingLayout: (event: LayoutChangeEvent) => {
                const { x, y } = event.nativeEvent.layout
                geometry.current = { ...geometry.current, leading: { x, y } }
            },
            onGripLayout: (event: LayoutChangeEvent) => {
                const { x, y } = event.nativeEvent.layout
                geometry.current = { ...geometry.current, grip: { x, y } }
            },
            read: () => {
                const { width, height, leading, grip } = geometry.current
                return { width, height, anchor: { x: leading.x + grip.x, y: leading.y + grip.y } }
            },
        }),
        []
    )
}
