import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Grip } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Platform, Text, View } from 'react-native'
import { DraxView } from 'react-native-drax'
import type { DriveDragPayload } from '../lib/dnd'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { FileCategory } from '../types'
import { getFileIcon } from './file-icons'

// Long-press before a drag activates. Short enough to feel immediate (a quick
// grab-and-move works) but long enough that a plain click still reads as a tap.
const DRAG_LONG_PRESS_MS = 120

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

/** Drag payload for an item, honouring the active multi-selection: when the
 *  grabbed item is part of the selection the whole selection travels, else just
 *  this item. Read from a live selectedIds subscription so it's current at
 *  drag-start. */
function useDragPayload(itemId: string): { payload: DriveDragPayload; count: number } {
    const selectedIds = useDriveUIStore(s => s.selectedIds)
    const ids = selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId]
    return { payload: { kind: 'drive-items', ids }, count: ids.length }
}

/** How the floating drag copy should look. List rows drag as a compact name
 *  pill; grid cards drag as a simplified card-shaped preview. */
type DragPreviewKind = 'name' | 'card'

interface DraggableDriveItemProps {
    itemId: string
    /** Item name, shown in the drag preview. */
    label: string
    /** Drives the card preview's icon (folder vs file type). */
    category: FileCategory
    /** Preview style — 'name' in list view, 'card' in grid view. */
    dragPreview: DragPreviewKind
    /** Whether dragging is allowed (e.g. disabled in trash). */
    isEnabled: boolean
    children: ReactNode
}

/**
 * Wraps a drive row/card so it can be dragged. The payload is the current
 * multi-selection when the grabbed item is part of it, otherwise just this
 * item — computed from a live `selectedIds` subscription so it reflects the
 * selection at drag-start. The floating hover copy matches the view: a name
 * pill in list view, a simplified card in grid view; multi-item drags add a
 * count badge.
 */
export function DraggableDriveItem({
    itemId,
    label,
    category,
    dragPreview,
    isEnabled,
    children,
}: DraggableDriveItemProps) {
    const { payload, count } = useDragPayload(itemId)
    const renderHover = useHoverPreview({ label, category, count, dragPreview })

    if (!isEnabled) return <>{children}</>

    return (
        <DraxView
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
    label: string
    category: FileCategory
    /** Preview shown while dragging (list rows use 'name'). */
    dragPreview: DragPreviewKind
}

/**
 * A small, finger-sized draggable grip for list rows. Unlike wrapping the whole
 * (full-width) row, the registered draggable here is grip-sized — so Drax's
 * hit-test, which is anchored at `finger − grabOffset + sourceWidth/2`, tracks
 * the finger and can reach narrow drop targets like the sidebar tree. The row
 * stays a normal pressable; only this grip initiates a drag.
 */
export function DragGrip({ itemId, label, category, dragPreview }: DragGripProps) {
    const { payload, count } = useDragPayload(itemId)
    const renderHover = useHoverPreview({ label, category, count, dragPreview })
    const mutedColor = useThemeColor('muted-foreground')

    return (
        <DraxView
            draggable
            dragPayload={payload}
            longPressDelay={DRAG_LONG_PRESS_MS}
            renderHoverContent={renderHover}
        >
            <Grip size={16} color={mutedColor} />
        </DraxView>
    )
}

/** Shared hover-content renderer for the draggable wrappers + grip. */
function useHoverPreview({
    label,
    category,
    count,
    dragPreview,
}: {
    label: string
    category: FileCategory
    count: number
    dragPreview: DragPreviewKind
}): () => ReactNode {
    const primaryColor = useThemeColor('primary')
    const primaryForeground = useThemeColor('primary-foreground')
    const mutedColor = useThemeColor('muted-foreground')

    return () =>
        dragPreview === 'card' ? (
            <CardDragPreview
                label={label}
                category={category}
                count={count}
                neutralColor={mutedColor}
                badgeBackground={primaryColor}
                badgeForeground={primaryForeground}
            />
        ) : (
            <NameDragPreview
                label={label}
                count={count}
                background={primaryColor}
                foreground={primaryForeground}
            />
        )
}

function NameDragPreview({
    label,
    count,
    background,
    foreground,
}: {
    label: string
    count: number
    background: string
    foreground: string
}) {
    const text = count > 1 ? `${count} items` : label
    return (
        <View
            className="flex-row items-center gap-2 rounded-lg px-3 py-2 shadow-md"
            style={{ backgroundColor: background }}
        >
            <Text numberOfLines={1} style={{ color: foreground, fontWeight: '600' }}>
                {text}
            </Text>
        </View>
    )
}

// A lightweight stand-in for the grid card — icon header + large centered icon
// — so a grid drag visually reads as the square tile without re-fetching the
// thumbnail. Mirrors FolderGridCard/FileGridCard's structure at a fixed size.
function CardDragPreview({
    label,
    category,
    count,
    neutralColor,
    badgeBackground,
    badgeForeground,
}: {
    label: string
    category: FileCategory
    count: number
    neutralColor: string
    badgeBackground: string
    badgeForeground: string
}) {
    const { icon: FileIcon, color: iconColor } = getFileIcon(category, neutralColor)
    return (
        <View>
            <View
                className="rounded-lg border border-border bg-background shadow-md overflow-hidden"
                style={{ width: 132, height: 120 }}
            >
                <View className="flex-row items-center gap-2 px-2.5 py-2 border-b border-border">
                    <FileIcon size={18} color={iconColor} />
                    <Text numberOfLines={1} className="flex-1 text-xs font-medium text-foreground">
                        {label}
                    </Text>
                </View>
                <View className="flex-1 items-center justify-center bg-muted-foreground/5">
                    <FileIcon size={44} color={iconColor} />
                </View>
            </View>
            {count > 1 ? (
                <View
                    className="absolute items-center justify-center rounded-full"
                    style={{
                        top: -6,
                        right: -6,
                        minWidth: 22,
                        height: 22,
                        paddingHorizontal: 6,
                        backgroundColor: badgeBackground,
                    }}
                >
                    <Text style={{ color: badgeForeground, fontSize: 12, fontWeight: '700' }}>
                        {count}
                    </Text>
                </View>
            ) : null}
        </View>
    )
}
