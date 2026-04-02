import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useBreakpoint, type Breakpoint } from './useBreakpoint'

interface WorkspaceLayoutContextValue {
    activeAddonSlug: string | null
    isSidebarOpen: boolean
    breakpoint: Breakpoint
    toggleSidebar: () => void
    setSidebarOpen: (open: boolean) => void
    setActiveAddonSlug: (slug: string | null) => void
}

export const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null)

const SIDEBAR_KEY = 'tinycld_sidebar_open'

export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
    const breakpoint = useBreakpoint()
    const [activeAddonSlug, setActiveAddonSlug] = useState<string | null>(null)
    const [isSidebarOpen, setSidebarOpen] = useState(true)

    useEffect(() => {
        AsyncStorage.getItem(SIDEBAR_KEY).then((val) => {
            if (val !== null) setSidebarOpen(val === 'true')
        })
    }, [])

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => {
            const next = !prev
            AsyncStorage.setItem(SIDEBAR_KEY, String(next))
            return next
        })
    }, [])

    const handleSetSidebarOpen = useCallback((open: boolean) => {
        setSidebarOpen(open)
        AsyncStorage.setItem(SIDEBAR_KEY, String(open))
    }, [])

    const value = useMemo(
        () => ({
            activeAddonSlug,
            isSidebarOpen,
            breakpoint,
            toggleSidebar,
            setSidebarOpen: handleSetSidebarOpen,
            setActiveAddonSlug,
        }),
        [activeAddonSlug, isSidebarOpen, breakpoint, toggleSidebar, handleSetSidebarOpen],
    )

    return (
        <WorkspaceLayoutContext.Provider value={value}>
            {children}
        </WorkspaceLayoutContext.Provider>
    )
}
