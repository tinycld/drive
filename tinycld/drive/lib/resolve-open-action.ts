import type { DriveItemView } from '../types'
import type { DriveItemAction } from './item-actions-registry'

/**
 * Decides what "opening" a drive file means. Returns the first registered
 * *opener* action whose predicate positively matches the file, or null when no
 * app is associated (the caller then falls back to the preview modal).
 *
 * Folders never resolve here — the caller navigates into them before
 * consulting this. Only actions flagged `isOpener` are candidates: an auxiliary
 * action like "Export to PDF" is `isApplicable` to xlsx/docx but is NOT an
 * opener, so it must never be what a tap/double-click invokes (it still shows
 * in the context menu). Direct-open also requires a positive `isApplicable`
 * match so a catch-all opener can't hijack every file's click.
 */
export function resolveOpenAction(
    item: DriveItemView,
    actions: DriveItemAction[]
): DriveItemAction | null {
    if (item.isFolder) return null
    return (
        actions.find(action => action.isOpener === true && action.isApplicable?.(item) === true) ??
        null
    )
}
