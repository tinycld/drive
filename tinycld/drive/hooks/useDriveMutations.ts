import { downloadFile, downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { captureException, errorToString } from '@tinycld/core/lib/errors'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { driveItemToSource } from '../lib/file-url'
import type { DriveItemView } from '../types'

interface UseDriveMutationsParams {
    userId: string
    currentFolderId: string
    stateByItem: Map<string, { id: string; is_starred: boolean; trashed_at: string }>
    itemsById: Map<string, DriveItemView>
    userNames: Map<string, string>
    userEmails: Map<string, string>
    sharesByItem: Map<string, { id: string; item: string; user: string; role: string }[]>
    prepareLayoutAnimation?: () => void
}

export function useDriveMutations({
    userId,
    currentFolderId,
    stateByItem,
    itemsById,
    userNames,
    userEmails,
    sharesByItem,
    prepareLayoutAnimation,
}: UseDriveMutationsParams) {
    const [itemsCollection] = useStore('drive_items')
    const [sharesCollection] = useStore('drive_shares')
    const [stateCollection] = useStore('drive_item_state')

    const toggleStarMutation = useMutation({
        mutationFn: mutation(function* ({ itemId, starred }: { itemId: string; starred: boolean }) {
            const existing = stateByItem.get(itemId)
            if (existing) {
                yield stateCollection.update(existing.id, draft => {
                    draft.is_starred = !starred
                })
            } else {
                yield stateCollection.insert({
                    id: newRecordId(),
                    item: itemId,
                    user: userId,
                    is_starred: true,
                    trashed_at: '',
                    last_viewed_at: '',
                })
            }
        }),
    })

    const trashMutation = useMutation({
        mutationFn: mutation(function* ({ itemId, restore }: { itemId: string; restore: boolean }) {
            const existing = stateByItem.get(itemId)
            if (existing) {
                yield stateCollection.update(existing.id, draft => {
                    draft.trashed_at = restore ? '' : new Date().toISOString()
                })
            } else if (!restore) {
                yield stateCollection.insert({
                    id: newRecordId(),
                    item: itemId,
                    user: userId,
                    is_starred: false,
                    trashed_at: new Date().toISOString(),
                    last_viewed_at: '',
                })
            }
        }),
    })

    const permanentDeleteMutation = useMutation({
        mutationFn: mutation(function* (itemId: string) {
            const existing = stateByItem.get(itemId)
            if (existing) {
                yield stateCollection.delete(existing.id)
            }
            yield itemsCollection.delete(itemId)
        }),
    })

    const createFolderMutation = useMutation({
        mutationFn: mutation(function* (name: string) {
            yield itemsCollection.insert({
                id: newRecordId(),
                name,
                is_folder: true,
                mime_type: '',
                parent: currentFolderId || '',
                created_by: userId,
                size: 0,
                file: '',
                description: '',
            })
        }),
    })

    const renameMutation = useMutation({
        mutationFn: mutation(function* ({ itemId, name }: { itemId: string; name: string }) {
            yield itemsCollection.update(itemId, draft => {
                draft.name = name
            })
        }),
    })

    const shareMutation = useMutation({
        mutationFn: mutation(function* ({
            itemId,
            targetUserId,
            role,
        }: {
            itemId: string
            targetUserId: string
            role: 'editor' | 'viewer'
        }) {
            yield sharesCollection.insert({
                id: newRecordId(),
                item: itemId,
                user: targetUserId,
                role,
                created_by: userId,
            })
        }),
    })

    const unshareMutation = useMutation({
        mutationFn: mutation(function* (shareId: string) {
            yield sharesCollection.delete(shareId)
        }),
    })

    const moveMutation = useMutation({
        mutationFn: mutation(function* ({
            itemId,
            newParentId,
        }: {
            itemId: string
            newParentId: string
        }) {
            yield itemsCollection.update(itemId, draft => {
                draft.parent = newParentId
            })
        }),
        // Covers every move path — drag-and-drop, the move dialog, and
        // restore-to-folder. Without this, a rejected move (permission denied,
        // network) rolls back the optimistic update with no feedback. .mutate()
        // never throws to its caller, so this is the only place errors surface.
        onError: err => {
            captureException('drive.move', err)
            notify.emit({
                event: 'mutation.error',
                title: 'Could not move item',
                body: errorToString(err),
                data: { operation: 'drive.move', error: errorToString(err) },
            })
        },
    })

    const toggleStar = (itemId: string) => {
        const item = itemsById.get(itemId)
        toggleStarMutation.mutate({ itemId, starred: item?.starred ?? false })
    }

    const moveToTrash = (itemId: string) => {
        prepareLayoutAnimation?.()
        trashMutation.mutate({ itemId, restore: false })
    }
    const restoreFromTrash = (itemId: string) => {
        prepareLayoutAnimation?.()
        trashMutation.mutate({ itemId, restore: true })
    }
    const permanentlyDelete = (itemId: string) => {
        prepareLayoutAnimation?.()
        permanentDeleteMutation.mutate(itemId)
    }

    const createFolder = (name: string) => createFolderMutation.mutate(name)
    const renameItem = (itemId: string, name: string) => renameMutation.mutate({ itemId, name })

    const shareItem = (itemId: string, targetUserId: string, role: 'editor' | 'viewer') =>
        shareMutation.mutate({ itemId, targetUserId, role })

    const removeShare = (shareId: string) => unshareMutation.mutate(shareId)

    const moveItem = (itemId: string, newParentId: string) => {
        // A move reparents the item OUT of the current folder, so it's removed
        // from the visible list — the same row-removal that trash/delete animate.
        // Without prepping the layout animation first, FlashList's layout cache
        // desyncs from the shrunk data and throws "index out of bounds, not
        // enough layouts" (which, unhandled, raises a LogBox overlay). Every
        // other row-removing mutation preps; the move path must too.
        prepareLayoutAnimation?.()
        moveMutation.mutate({ itemId, newParentId })
    }

    const restoreToFolder = (itemId: string, newParentId: string) => {
        // moveItem already preps the layout animation.
        moveItem(itemId, newParentId)
        trashMutation.mutate({ itemId, restore: true })
    }

    const canRestoreToOriginalLocation = (itemId: string) => {
        const item = itemsById.get(itemId)
        if (!item) return false
        if (!item.parentId) return true
        const parent = itemsById.get(item.parentId)
        return !!parent && !parent.trashedAt
    }

    const getItemPath = (itemId: string) => {
        const parts: string[] = []
        // `seen` guards a cyclic/corrupt parent chain (mirrors dnd.ts): the
        // server now rejects moves that would form a cycle, but stale local
        // data could still loop this walk forever. Revisiting an id means a
        // cycle — stop.
        const seen = new Set<string>()
        let id = itemId
        while (id && !seen.has(id)) {
            const item = itemsById.get(id)
            if (!item) break
            seen.add(id)
            parts.unshift(item.name)
            id = item.parentId
        }
        return parts.length > 0 ? `/${parts.join('/')}` : '/My Files'
    }

    const getSharesForItem = (itemId: string) => {
        const shares = sharesByItem.get(itemId) ?? []
        return shares.map(s => ({
            id: s.id,
            userId: s.user,
            name: userNames.get(s.user) ?? '',
            email: userEmails.get(s.user) ?? '',
            role: s.role,
        }))
    }

    const downloadItem = async (itemId: string) => {
        const item = itemsById.get(itemId)
        if (!item) return

        if (item.isFolder) {
            // Folders download as a server-zipped archive behind a one-shot
            // token URL. downloadFromUrl handles both web (anchor download) and
            // native (cache + share sheet).
            const response = await pb.send('/api/drive/download-token', {
                method: 'POST',
                body: { item: itemId },
            })
            downloadFromUrl(`${pb.baseURL}${response.url}`, `${item.name}.zip`, 'application/zip')
            return
        }

        if (!item.file) return
        // Files download via the shared helper, which fetches a short-lived
        // file token (so protected collections work) and routes to the right
        // platform path — previously this early-returned on native, so the
        // mobile download button did nothing.
        downloadFile(driveItemToSource(item))
    }

    return {
        toggleStar,
        moveToTrash,
        restoreFromTrash,
        permanentlyDelete,
        canRestoreToOriginalLocation,
        restoreToFolder,
        createFolder,
        renameItem,
        downloadItem,
        moveItem,
        shareItem,
        removeShare,
        getSharesForItem,
        getItemPath,
    }
}
