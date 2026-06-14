import type { DriveItemView } from '../types'

/**
 * Payload carried by a drive drag. A drag can move one item or a whole
 * multi-selection at once, so `ids` is always an array. `kind` lets a drop
 * target reject foreign payloads (e.g. an OS file drag) up front.
 */
export interface DriveDragPayload {
    kind: 'drive-items'
    ids: string[]
}

export function isDriveDragPayload(payload: unknown): payload is DriveDragPayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as DriveDragPayload).kind === 'drive-items' &&
        Array.isArray((payload as DriveDragPayload).ids)
    )
}

/**
 * Walk a folder's ancestor chain (mirrors the parent walk in
 * useDriveMutations.getItemPath). Returns true if `ancestorId` is `itemId`
 * itself or any of its parents — used to forbid dropping a folder into its
 * own descendant, which would orphan the subtree.
 */
function isSelfOrDescendant(
    ancestorId: string,
    itemId: string,
    itemsById: Map<string, DriveItemView>
): boolean {
    // `seen` guards against a cyclic/corrupt parent chain: the data is a true
    // tree today, but a bad parentId pointing back up would otherwise spin
    // forever. Revisiting an id means a cycle — stop and treat it as no match.
    const seen = new Set<string>()
    let id = itemId
    while (id && !seen.has(id)) {
        if (id === ancestorId) return true
        seen.add(id)
        const item = itemsById.get(id)
        if (!item) break
        id = item.parentId
    }
    return false
}

/**
 * Whether the target folder exists and can receive drops. The empty string is
 * the drive root, which is always a valid container.
 */
function isValidTarget(targetFolderId: string, itemsById: Map<string, DriveItemView>): boolean {
    if (!targetFolderId) return true
    const target = itemsById.get(targetFolderId)
    return !!target && target.isFolder
}

/**
 * The subset of dragged ids that will actually move into `targetFolderId`,
 * filtering out no-ops and invalid drops:
 *   - an item dropped onto itself
 *   - an item already living in that parent (a no-op move)
 *   - a folder dropped into its own descendant (would orphan the subtree)
 * The drop handler iterates this so a multi-select drag that includes the
 * target folder itself still moves the rest.
 */
export function movableIds(
    payload: DriveDragPayload,
    targetFolderId: string,
    itemsById: Map<string, DriveItemView>
): string[] {
    if (!isValidTarget(targetFolderId, itemsById)) return []
    return payload.ids.filter(id => {
        if (id === targetFolderId) return false
        const item = itemsById.get(id)
        if (!item) return false
        if (item.parentId === targetFolderId) return false
        if (item.isFolder && isSelfOrDescendant(id, targetFolderId, itemsById)) return false
        return true
    })
}

/**
 * Whether `payload` may be dropped onto the folder identified by
 * `targetFolderId`. True only when at least one dragged item would actually
 * move — drives the receiver highlight so it never invites a no-op drop.
 * Encodes the same move-validity rules as the ChooseFolderDialog.
 */
export function canDrop(
    payload: unknown,
    targetFolderId: string,
    itemsById: Map<string, DriveItemView>
): boolean {
    if (!isDriveDragPayload(payload)) return false
    return movableIds(payload, targetFolderId, itemsById).length > 0
}
