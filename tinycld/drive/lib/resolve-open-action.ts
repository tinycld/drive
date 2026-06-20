import type { DriveItemView } from '../types'
import type { DriveItemAction } from './item-actions-registry'

/**
 * Decides what "opening" a drive file means. Returns the first registered
 * action whose predicate positively matches the file, or null when no app
 * is associated (the caller then falls back to the preview modal).
 *
 * Folders never resolve here — the caller navigates into them before
 * consulting this. An action without an `isApplicable` predicate is treated
 * as NOT auto-launchable: direct-open requires a positive type match so a
 * catch-all action can't hijack every file's click. (The context menu keeps
 * its own, more permissive default — it still lists such actions.)
 */
export function resolveOpenAction(
    item: DriveItemView,
    actions: DriveItemAction[]
): DriveItemAction | null {
    if (item.isFolder) return null
    return actions.find(action => action.isApplicable?.(item) === true) ?? null
}
