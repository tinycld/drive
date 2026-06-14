import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import type { ReactNode } from 'react'
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

    return (
        <DraxView
            receptive
            acceptsDrag={payload => canDrop(payload, targetFolderId, itemsById)}
            // Reserve the highlight border in the base style (transparent) and
            // only change its colour when receiving — otherwise adding the
            // border on drag-over grows the box by 2px per side and shifts every
            // row below it (visible in the sidebar tree).
            style={{ borderWidth: 2, borderColor: 'transparent', borderRadius: 8 }}
            receivingStyle={{ borderColor: primaryColor }}
            onReceiveDragDrop={({ dragged }) => {
                if (!isDriveDragPayload(dragged.payload)) return
                onDropItems(dragged.payload, targetFolderId)
            }}
        >
            {children}
        </DraxView>
    )
}
