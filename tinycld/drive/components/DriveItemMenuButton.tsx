import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable } from 'react-native'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView } from '../types'
import { DriveMenuContent } from './DriveContextMenu'

interface DriveItemMenuButtonProps {
    item: DriveItemView
    /** Icon size in px. Lists use 16, grid cards 16, the detail header 20. */
    size?: number
}

// A tap-triggered "⋮" overflow menu carrying the same actions as the
// long-press / right-click context menu (DriveMenuContent). Use it where a
// long-press is awkward or undiscoverable: the list/grid rows and the file
// detail header. DriveMenuContent renders inside Menu.Portal — which severs the
// React context chain — so it reads drive state from the snapshot store rather
// than useDrive(); nothing extra is needed here.
export function DriveItemMenuButton({ item, size = 16 }: DriveItemMenuButtonProps) {
    const mutedColor = useThemeColor('muted-foreground')

    // Mirror the tapped row into selection state when the menu opens so the
    // menu's single-item actions operate on the right item and the row reads
    // as highlighted — matching the right-click behaviour in DriveContextMenu.
    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open) return
            const ui = useDriveUIStore.getState()
            if (!ui.selectedIds.has(item.id)) ui.selectSingle(item.id)
            ui.selectItem(item.id)
        },
        [item.id]
    )

    return (
        <Menu onOpenChange={handleOpenChange}>
            <Menu.Trigger>
                <Pressable
                    style={{ padding: 4 }}
                    // Deliberately generic — must NOT contain item.name. Row
                    // locators select file rows by an accessible name ending in a
                    // file extension (e.g. /\.[a-z]{2,4}\b/); embedding the
                    // filename here would make this 3-dot button collide with
                    // those locators and steal row clicks. Matches the
                    // ResponsiveToolbar overflow button's "More actions".
                    accessibilityLabel="More actions"
                    accessibilityRole="button"
                    // Keep the row's own press/navigation from also firing.
                    onPress={e => e.stopPropagation()}
                >
                    <EllipsisVertical size={size} color={mutedColor} />
                </Pressable>
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" placement="bottom" align="end">
                    <DriveMenuContent item={item} />
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}
