import { create } from '~/lib/store'

type PromptDialog =
    | { type: 'closed' }
    | { type: 'new-folder' }
    | { type: 'rename'; itemId: string; currentName: string }

interface DialogTarget {
    id: string
    name: string
}

interface DriveUIState {
    selectedItemId: string | null
    selectedIds: Set<string>
    lastSelectedId: string | null
    searchQuery: string
    promptDialog: PromptDialog
    promptKey: number
    moveTarget: DialogTarget | null
    shareTarget: DialogTarget | null
    detailPanelOpen: boolean
    /**
     * Keyboard-driven focus index into the current file listing. Persisted so
     * opening a file and returning lands back on the row the user was on.
     */
    focusedIndex: number
}

interface DriveUIActions {
    selectItem: (itemId: string | null) => void
    selectSingle: (id: string) => void
    selectToggle: (id: string) => void
    selectRange: (id: string, orderedIds: string[]) => void
    clearSelection: () => void
    setSearchQuery: (query: string) => void
    openPrompt: (state: PromptDialog) => void
    closePrompt: () => void
    openMoveDialog: (id: string, name: string) => void
    closeMoveDialog: () => void
    openShareDialog: (id: string, name: string) => void
    closeShareDialog: () => void
    toggleDetailPanel: () => void
    openDetailPanel: () => void
    closeDetailPanel: () => void
    setFocusedIndex: (i: number | ((prev: number) => number)) => void
}

export type { DialogTarget, PromptDialog }

export const useDriveUIStore = create<DriveUIState & DriveUIActions>((set) => ({
    selectedItemId: null,
    selectedIds: new Set<string>(),
    lastSelectedId: null,
    searchQuery: '',
    promptDialog: { type: 'closed' },
    promptKey: 0,
    moveTarget: null,
    shareTarget: null,
    detailPanelOpen: false,
    focusedIndex: 0,

    selectItem: (itemId: string | null) => set({ selectedItemId: itemId }),

    selectSingle: (id: string) => set({ selectedIds: new Set([id]), lastSelectedId: id }),

    selectToggle: (id: string) =>
        set((prev) => {
            const next = new Set(prev.selectedIds)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return { selectedIds: next, lastSelectedId: id }
        }),

    selectRange: (id: string, orderedIds: string[]) =>
        set((prev) => {
            const anchor = prev.lastSelectedId
            if (!anchor) return { selectedIds: new Set([id]), lastSelectedId: id }
            const startIdx = orderedIds.indexOf(anchor)
            const endIdx = orderedIds.indexOf(id)
            if (startIdx === -1 || endIdx === -1) return { selectedIds: new Set([id]), lastSelectedId: id }
            const lo = Math.min(startIdx, endIdx)
            const hi = Math.max(startIdx, endIdx)
            const rangeIds = orderedIds.slice(lo, hi + 1)
            return { selectedIds: new Set([...prev.selectedIds, ...rangeIds]), lastSelectedId: id }
        }),

    clearSelection: () => set({ selectedIds: new Set<string>(), lastSelectedId: null }),

    setSearchQuery: (query: string) => set({ searchQuery: query }),

    openPrompt: (state: PromptDialog) => set((prev) => ({ promptDialog: state, promptKey: prev.promptKey + 1 })),

    closePrompt: () => set({ promptDialog: { type: 'closed' } }),

    openMoveDialog: (id: string, name: string) => set({ moveTarget: { id, name } }),

    closeMoveDialog: () => set({ moveTarget: null }),

    openShareDialog: (id: string, name: string) => set({ shareTarget: { id, name } }),

    closeShareDialog: () => set({ shareTarget: null }),

    toggleDetailPanel: () => set((prev) => ({ detailPanelOpen: !prev.detailPanelOpen })),
    openDetailPanel: () => set({ detailPanelOpen: true }),
    closeDetailPanel: () => set({ detailPanelOpen: false }),
    setFocusedIndex: (next) =>
        set((state) => ({
            focusedIndex: typeof next === 'function' ? next(state.focusedIndex) : next,
        })),
}))
