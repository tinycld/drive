import { useMemo, useState } from 'react'
import { type Shortcut, useRegisterShortcuts, useShortcutScope } from '~/lib/shortcuts'
import type { DriveItemView } from '../types'

interface UseDriveShortcutsArgs {
    items: DriveItemView[]
    toggleSelect: (id: string) => void
    openItem: (item: DriveItemView) => void
    onNewFolder: () => void
    isEnabled: boolean
}

export function useDriveShortcuts({
    items,
    toggleSelect,
    openItem,
    onNewFolder,
    isEnabled,
}: UseDriveShortcutsArgs) {
    const [focusedIndex, setFocusedIndex] = useState(0)

    useShortcutScope('list')

    const focused = items[focusedIndex] ?? null

    const shortcuts = useMemo<Shortcut[]>(() => {
        if (!isEnabled) return []
        return [
            {
                id: 'drive.list.next',
                keys: 'j',
                scope: 'list',
                group: 'Drive',
                description: 'Next item',
                run: () => setFocusedIndex(i => Math.min(i + 1, Math.max(items.length - 1, 0))),
            },
            {
                id: 'drive.list.prev',
                keys: 'k',
                scope: 'list',
                group: 'Drive',
                description: 'Previous item',
                run: () => setFocusedIndex(i => Math.max(i - 1, 0)),
            },
            {
                id: 'drive.list.open',
                keys: 'Enter',
                scope: 'list',
                group: 'Drive',
                description: 'Open item',
                run: () => {
                    if (!focused) return
                    openItem(focused)
                },
            },
            {
                id: 'drive.list.select',
                keys: 'x',
                scope: 'list',
                group: 'Drive',
                description: 'Toggle selection',
                run: () => {
                    if (!focused) return
                    toggleSelect(focused.id)
                },
            },
            {
                id: 'drive.list.newFolder',
                keys: 'Shift+F',
                scope: 'list',
                group: 'Drive',
                description: 'New folder',
                run: () => onNewFolder(),
            },
        ]
    }, [isEnabled, items.length, focused, openItem, toggleSelect, onNewFolder])

    useRegisterShortcuts(shortcuts)

    return { focusedIndex, focusedId: focused?.id ?? null }
}
