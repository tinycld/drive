import { create } from '@tinycld/core/lib/store'

interface PendingCopy {
    copyName: string
    sourceParentId: string
    // The realtime room kind that owns the source document (e.g. 'text',
    // 'calc'). When set, CopyToFolderDialog force-flushes the live room to
    // its drive_items.file blob before copying, so the duplicate captures
    // in-flight edits rather than the last debounced save. Omit for copies
    // of static files (no live room to flush).
    roomKind?: string
    // Optional dialog chrome overrides. "Export as template" reuses this
    // same copy flow but wants template-flavored title/confirm text.
    title?: string
    confirmLabel?: string
}

interface CopyDialogState {
    pendingCopy: PendingCopy | null
    openCopyDialog: (pending: PendingCopy) => void
    closeCopyDialog: () => void
}

// Shared store for the "Copy to folder" dialog flow. Packages that
// duplicate a drive_items row through a File → Make a copy menu
// (calc, text, …) push the desired copy name + source parent here
// from their file-actions hook; CopyToFolderDialog reads it to know
// when to render and what to pre-select.
export const useCopyDialogStore = create<CopyDialogState>()(set => ({
    pendingCopy: null,
    openCopyDialog: pending => set({ pendingCopy: pending }),
    closeCopyDialog: () => set({ pendingCopy: null }),
}))
