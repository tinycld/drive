import { useCallback, useRef } from 'react'
import { resolveOpenAction } from '../lib/resolve-open-action'
import type { DriveItemView } from '../types'
import { useResolvedDriveItemActions } from './useDriveItemActions'

interface UseOpenDriveItemActions {
    navigateToFolder: (folderId: string) => void
    openPreview: (item: DriveItemView) => void
}

/**
 * Returns `openFile`, the single entry point for "opening" a drive item:
 *   - folder            → navigate into it
 *   - file w/ app match → launch the registered opener (router.push to the app)
 *   - file, no match    → open the preview modal
 *
 * Item-action factories are hooks whose count varies at runtime (lazy
 * providers register them), so they're invoked in their own component
 * instances (DriveItemActionsHost) and the resolved actions are read here
 * from a stable store — never by calling the factories at this top level,
 * which would crash React's hook dispatcher. See useDriveItemActions.
 */
export function useOpenDriveItem(actions: UseOpenDriveItemActions) {
    const itemActions = useResolvedDriveItemActions()
    // Stash in a ref so `openFile` stays stable for row/card memoization
    // even as the resolved-actions list settles after lazy registration.
    const itemActionsRef = useRef(itemActions)
    itemActionsRef.current = itemActions

    const openFile = useCallback(
        (item: DriveItemView) => {
            if (item.isFolder) {
                actions.navigateToFolder(item.id)
                return
            }
            const openAction = resolveOpenAction(item, itemActionsRef.current)
            if (openAction) {
                openAction.onPress(item)
            } else {
                actions.openPreview(item)
            }
        },
        [actions]
    )

    return openFile
}
