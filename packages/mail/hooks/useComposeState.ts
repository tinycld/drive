import { createContext, useContext } from 'react'

export type ComposeMode = 'closed' | 'minimized' | 'open' | 'maximized'

export interface ComposeState {
    mode: ComposeMode
    open: () => void
    minimize: () => void
    maximize: () => void
    close: () => void
}

export const ComposeContext = createContext<ComposeState>({
    mode: 'closed',
    open: () => {},
    minimize: () => {},
    maximize: () => {},
    close: () => {},
})

export function useCompose() {
    return useContext(ComposeContext)
}
