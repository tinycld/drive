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
    searchQuery: string
    promptDialog: PromptDialog
    promptKey: number
    moveTarget: DialogTarget | null
    shareTarget: DialogTarget | null
}

interface DriveUIActions {
    setSearchQuery: (query: string) => void
    openPrompt: (state: PromptDialog) => void
    closePrompt: () => void
    openMoveDialog: (id: string, name: string) => void
    closeMoveDialog: () => void
    openShareDialog: (id: string, name: string) => void
    closeShareDialog: () => void
}

export type { DialogTarget, PromptDialog }

export const useDriveUIStore = create<DriveUIState & DriveUIActions>(set => ({
    searchQuery: '',
    promptDialog: { type: 'closed' },
    promptKey: 0,
    moveTarget: null,
    shareTarget: null,

    setSearchQuery: (query: string) => set({ searchQuery: query }),

    openPrompt: (state: PromptDialog) =>
        set(prev => ({ promptDialog: state, promptKey: prev.promptKey + 1 })),

    closePrompt: () => set({ promptDialog: { type: 'closed' } }),

    openMoveDialog: (id: string, name: string) => set({ moveTarget: { id, name } }),

    closeMoveDialog: () => set({ moveTarget: null }),

    openShareDialog: (id: string, name: string) => set({ shareTarget: { id, name } }),

    closeShareDialog: () => set({ shareTarget: null }),
}))
