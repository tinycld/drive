import { useCallback, useMemo } from 'react'
import { getDriveItemActionFactories } from '../lib/item-actions-registry'
import { resolveOpenAction } from '../lib/resolve-open-action'
import type { DriveItemView } from '../types'

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
 * Factories are invoked here (not inside the callback) because they are
 * React hooks; registration happens at module load so the factory list is
 * stable for the app's lifetime — see resolveOpenAction for the match rules.
 */
export function useOpenDriveItem(actions: UseOpenDriveItemActions) {
    // Factory list is fixed for the app lifetime (registration is
    // module-load-time), so invoke the factories once on mount. A fresh
    // array each render would make the useCallback below a no-op and bust
    // memoization in the row/card consumers that hold openFile.
    const itemActions = useMemo(() => getDriveItemActionFactories().map(factory => factory()), [])

    const openFile = useCallback(
        (item: DriveItemView) => {
            if (item.isFolder) {
                actions.navigateToFolder(item.id)
                return
            }
            const openAction = resolveOpenAction(item, itemActions)
            if (openAction) {
                openAction.onPress(item)
            } else {
                actions.openPreview(item)
            }
        },
        [actions, itemActions]
    )

    return openFile
}
