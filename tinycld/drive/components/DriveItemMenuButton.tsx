import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import { type ReactNode, useCallback } from 'react'
import { Platform, Pressable, View } from 'react-native'
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
// detail header.
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

    // The bare Pressable is the trigger: Menu clones it to inject onPress and
    // the anchor ref, so a wrapper would be measured (and pressed) instead.
    const triggerButton = (
        <Pressable
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
            <PressGuard>
                <EllipsisVertical size={size} color={mutedColor} />
            </PressGuard>
        </Pressable>
    )

    return (
        <Menu
            trigger={triggerButton}
            onOpenChange={handleOpenChange}
            placement="bottom-end"
            title="File actions"
        >
            <DriveMenuContent item={item} />
        </Menu>
    )
}

// On web, halt pointerdown/touchstart at the ⋯ so a press here can't start
// an enclosing draggable card/row's Pan gesture (which listens on
// pointerdown); the menu's own click still fires. The guard carries the
// button's padding so the whole hit area is covered. RN's Pressable forwards
// no capture-phase pointer handlers, hence the raw element.
function PressGuard({ children }: { children: ReactNode }) {
    if (Platform.OS !== 'web') return <View style={{ padding: 4 }}>{children}</View>
    return (
        <div
            role="presentation"
            style={{ display: 'flex', padding: 4 }}
            onPointerDownCapture={e => e.stopPropagation()}
            onTouchStartCapture={e => e.stopPropagation()}
        >
            {children}
        </div>
    )
}
