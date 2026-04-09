import { useContext } from 'react'
import { WorkspaceLayoutContext } from './WorkspaceLayoutProvider'

export function useWorkspaceLayout() {
    const context = useContext(WorkspaceLayoutContext)
    if (!context) {
        throw new Error('useWorkspaceLayout must be used within WorkspaceLayoutProvider')
    }
    return context
}
