import { type ReactNode, useContext } from 'react'
import { SheetsContext, useSheetsState } from './hooks/useSheets'

export default function SheetsProvider({ children }: { children: ReactNode }) {
    const existing = useContext(SheetsContext)
    if (existing) return <>{children}</>

    return <SheetsProviderInner>{children}</SheetsProviderInner>
}

function SheetsProviderInner({ children }: { children: ReactNode }) {
    const state = useSheetsState()
    return <SheetsContext.Provider value={state}>{children}</SheetsContext.Provider>
}
