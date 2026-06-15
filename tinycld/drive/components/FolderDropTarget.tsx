import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { DraxView } from 'react-native-drax'
import { canDrop, type DriveDragPayload, isDriveDragPayload } from '../lib/dnd'
import type { DriveItemView } from '../types'

interface FolderDropTargetProps {
    /** Destination folder id; the empty string is the drive root. */
    targetFolderId: string
    /** Lookup used to validate drops (self/descendant/no-op rules). */
    itemsById: Map<string, DriveItemView>
    /** Performs the move; only valid (movable) ids reach here. */
    onDropItems: (payload: DriveDragPayload, targetFolderId: string) => void
    children: ReactNode
}

/**
 * Wraps a folder row/card, breadcrumb segment, or sidebar entry so dragged
 * drive items can be dropped onto it. `acceptsDrag` gates both the receiving
 * highlight and the drop using the shared `canDrop` rules, so an invalid
 * target (itself, a descendant, or a no-op) never highlights or accepts.
 */
export function FolderDropTarget({
    targetFolderId,
    itemsById,
    onDropItems,
    children,
}: FolderDropTargetProps) {
    const primaryColor = useThemeColor('primary')
    // Whether a valid drag is currently hovering this target. Drives both the
    // highlight border and the accessibilityState below, so the "this target is
    // accepting the drop" cue is exposed to assistive tech (and e2e) the same
    // way it's shown visually — not via a hidden test-only element.
    const [isReceiving, setIsReceiving] = useState(false)

    return (
        <DraxView
            receptive
            acceptsDrag={payload => canDrop(payload, targetFolderId, itemsById)}
            // selected = "this drop target is currently receiving the drag".
            // Surfaces as aria-selected on web.
            accessibilityState={{ selected: isReceiving }}
            // Reserve the highlight border in the base style (transparent) and
            // only change its colour when receiving — otherwise adding the
            // border on drag-over grows the box by 2px per side and shifts every
            // row below it (visible in the sidebar tree).
            style={{ borderWidth: 2, borderColor: 'transparent', borderRadius: 8 }}
            receivingStyle={{ borderColor: primaryColor }}
            onReceiveDragEnter={() => setIsReceiving(true)}
            onReceiveDragExit={() => setIsReceiving(false)}
            onReceiveDragDrop={({ dragged }) => {
                setIsReceiving(false)
                if (!isDriveDragPayload(dragged.payload)) return
                onDropItems(dragged.payload, targetFolderId)
            }}
        >
            {/* Unambiguous DOM signal that THIS target is receiving — only
                mounted while hovered. (aria-selected would collide with the
                view-mode tabs.) e2e waits on its presence before releasing so
                the drop never fires before the hit-test registers. */}
            {isReceiving ? (
                <View testID="drop-target-receiving" style={{ width: 0, height: 0 }} />
            ) : null}
            {children}
        </DraxView>
    )
}
