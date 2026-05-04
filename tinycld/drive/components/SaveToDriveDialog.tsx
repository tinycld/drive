import { useFolderTree } from '../hooks/useFolderTree'
import { useSaveToDrive } from '../lib/save-to-drive'
import { useSaveToDriveStore } from '../stores/save-to-drive-store'
import { ChooseFolderDialog } from './ChooseFolderDialog'

/**
 * Mounted once at app boot via DriveProvider. Listens for an open request on
 * the SaveToDrive store, presents drive's standard folder picker, and runs
 * the save mutation against the chosen folder.
 */
export function SaveToDriveDialog() {
    const pendingSource = useSaveToDriveStore((s) => s.pendingSource)
    const close = useSaveToDriveStore((s) => s.close)
    const folderTree = useFolderTree()
    const saveMutation = useSaveToDrive()

    const handleSave = (parentId: string) => {
        if (!pendingSource) return
        saveMutation.mutate({ source: pendingSource, parentId })
        // Close eagerly so the toast lands over the original surface; the
        // mutation runs in the background and emits its own toast on completion.
    }

    return (
        <ChooseFolderDialog
            open={pendingSource !== null}
            itemName={pendingSource?.displayName ?? ''}
            excludeId=""
            folderTree={folderTree}
            onMove={handleSave}
            onClose={close}
            title={pendingSource ? `Save “${pendingSource.displayName}” to Drive` : 'Save to Drive'}
            confirmLabel="Save here"
        />
    )
}
