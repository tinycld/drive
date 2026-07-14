import type { LucideIcon } from 'lucide-react-native'
import type { DriveItemView } from '../types'

/**
 * A consumer-supplied action rendered in drive's per-row context menu
 * (right-click). Sheets uses this to inject "Open in Sheets" for xlsx
 * files; future packages can add their own openers without drive
 * needing to know they exist.
 *
 * Sibling registry to core's `preview-action-registry`. They are kept
 * separate because:
 *   - DriveItemAction operates on `DriveItemView` (drive's row shape).
 *   - PreviewAction operates on `FilePreviewSource` (core's preview
 *     shape, used by mail attachments and any future preview surface).
 * Unifying would either leak DriveItemView into core or downgrade
 * row-level actions to the lower-resolution preview shape.
 *
 * Convention: factories supplying both surfaces (a row action AND a
 * preview-modal button) register independently against each registry
 * with the same `id` so QA / users can correlate them.
 */
export interface DriveItemAction {
    /** Stable identifier used as the React key. */
    id: string
    /** Icon shown in the menu row. */
    icon: LucideIcon
    /** Short human-readable label rendered next to the icon. */
    label: string
    /**
     * Optional per-item predicate. When supplied, the action is only
     * rendered for items where this returns true. Sheets uses this to
     * limit "Open in Sheets" to xlsx mime types. Default: always
     * applicable to non-folder items.
     */
    isApplicable?: (item: DriveItemView) => boolean
    /**
     * Marks this as the action that "opening" the item (a tap on mobile, a
     * double-click on desktop) should invoke — e.g. "Open in Calc". Only
     * openers are consulted by resolveOpenAction; auxiliary actions like
     * "Export to PDF" still appear in the context menu but must never hijack
     * tap-to-open. Default: false.
     */
    isOpener?: boolean
    /** Invoked with the right-clicked item when the user picks the menu row. */
    onPress: (item: DriveItemView) => void
}

/**
 * A "factory hook" — called from React rendering so it can use other
 * hooks (mutations, useOrgHref, etc.) and returns a ready-to-use
 * DriveItemAction. Same pattern as core's PreviewActionFactory.
 */
export type DriveItemActionFactory = () => DriveItemAction

const factories = new Map<string, DriveItemActionFactory>()
const subscribers = new Set<() => void>()

// Cached snapshot so getDriveItemActionFactories returns a referentially
// stable array between mutations — required by useSyncExternalStore, which
// would otherwise loop forever on a fresh array each render.
let snapshot: { id: string; factory: DriveItemActionFactory }[] = []

function refreshSnapshot() {
    snapshot = Array.from(factories, ([id, factory]) => ({ id, factory }))
    for (const notify of subscribers) notify()
}

/**
 * Register a DriveItemAction factory by ID. Re-registering the same
 * ID replaces the prior entry (most recent linker wins). Designed to
 * be called at module load from a consumer package's provider.
 *
 * Providers are lazy-loaded (see tinycld.config.ts), so registration
 * can land AFTER a drive screen has already rendered. Subscribers are
 * notified so consumers re-render with the now-complete list rather
 * than reading a half-populated registry mid-mount.
 */
export function registerDriveItemAction(id: string, factory: DriveItemActionFactory) {
    factories.set(id, factory)
    refreshSnapshot()
}

export function unregisterDriveItemAction(id: string) {
    factories.delete(id)
    refreshSnapshot()
}

/**
 * Referentially-stable snapshot of registered factories (with their
 * ids), in insertion order. The array identity only changes when the
 * registry mutates, so it is safe to feed useSyncExternalStore.
 *
 * IMPORTANT: do NOT call these factories directly at a component's top
 * level — their count varies as lazy providers register, which would
 * change the host component's hook count between renders and crash
 * React's hook dispatcher. Render each one inside its own keyed child
 * component instead (see useDriveItemActions).
 */
export function getDriveItemActionFactories(): { id: string; factory: DriveItemActionFactory }[] {
    return snapshot
}

export function subscribeDriveItemActions(notify: () => void): () => void {
    subscribers.add(notify)
    return () => subscribers.delete(notify)
}

export function __resetDriveItemActionRegistryForTests() {
    factories.clear()
    refreshSnapshot()
}
