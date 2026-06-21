import { captureException } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'
import { useForceFlush } from '../hooks/use-force-flush'
import { useCopyDriveItem } from '../lib/copy-drive-item'
import { useCopyDialogStore } from '../stores/copy-dialog-store'
import { ChooseFolderDialog } from './ChooseFolderDialog'

interface CopyToFolderDialogProps {
    // Source item id. The dialog only inspects the copy-dialog store
    // (open/close + the desired copy name + the source's current
    // parent), so the item id is passed in separately by the host
    // screen rather than re-resolved from the store.
    itemId: string
    // Called after the new copy is created; the host screen typically
    // navigates to the new item's detail route.
    onCopied: (newItemId: string) => void
}

// CopyToFolderDialog presents the "Choose a folder" picker pre-
// selected at the source item's current parent, and on confirm runs
// the useCopyDriveItem mutation. On success it calls onCopied with
// the new row id so the host can navigate (or otherwise react).
//
// The dialog is opened by useDriveItemFileActions.makeCopy (and the
// analogous "Export as template" action), which pushes the pending copy
// into useCopyDialogStore. When the pending copy names a `roomKind`, the
// source is a live document (text/calc) whose durable blob only refreshes
// on a debounce — so we force-flush the room before copying, otherwise
// the duplicate would miss the most recent edits. Mount this once
// alongside the host package's other detail-screen dialogs.
export function CopyToFolderDialog({ itemId, onCopied }: CopyToFolderDialogProps) {
    const pending = useCopyDialogStore(s => s.pendingCopy)
    const close = useCopyDialogStore(s => s.closeCopyDialog)
    const copyDriveItem = useCopyDriveItem()
    const forceFlush = useForceFlush()

    if (pending == null) return null

    // Capture the bits we need at fire time — the store entry is cleared
    // by `close()`, so reading `pending` inside the async onSuccess would
    // race the clear.
    const { copyName, skipNavigateOnDone } = pending

    const runCopy = (targetFolderId: string) => {
        copyDriveItem.mutate(
            {
                sourceItemId: itemId,
                newName: copyName,
                parentId: targetFolderId,
            },
            {
                onSuccess: result => {
                    if (skipNavigateOnDone) {
                        // "Export as template": leave the user on their
                        // current document and confirm with a toast.
                        notify.emit({
                            event: 'drive.template_saved',
                            title: 'Template saved',
                            body: copyName,
                            durationMs: 4000,
                            data: { name: copyName },
                        })
                        return
                    }
                    onCopied(result.itemId)
                },
            }
        )
    }

    const handleMove = (targetFolderId: string) => {
        if (!pending.roomKind) {
            runCopy(targetFolderId)
            return
        }
        // Flush the live room first so the copy reads edit-current bytes.
        // A flush failure is non-fatal: fall back to copying the
        // last-saved blob rather than blocking the user entirely.
        forceFlush.mutate(
            { roomKind: pending.roomKind, itemId },
            {
                onSuccess: () => runCopy(targetFolderId),
                onError: err => {
                    captureException('drive.copyToFolder.forceFlush', err)
                    runCopy(targetFolderId)
                },
            }
        )
    }

    return (
        <ChooseFolderDialog
            open
            itemName={pending.copyName}
            excludeId=""
            initialSelectedId={pending.sourceParentId}
            onMove={handleMove}
            onClose={close}
            title={pending.title ?? `Copy "${pending.copyName}" to`}
            confirmLabel={pending.confirmLabel ?? 'Copy here'}
        />
    )
}
