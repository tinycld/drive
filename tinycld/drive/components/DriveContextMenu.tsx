import { ContextMenu } from '@tinycld/core/components/ContextMenu'
import { Menu } from '@tinycld/core/ui/menu'
import type { LucideIcon } from 'lucide-react-native'
import {
    Download,
    Eye,
    FolderInput,
    FolderOpen,
    Info,
    Pencil,
    RotateCcw,
    Star,
    StarOff,
    Trash2,
    UserPlus,
} from 'lucide-react-native'
import { type ReactNode, useCallback } from 'react'
import { useResolvedDriveItemActions } from '../hooks/useDriveItemActions'
import { useDriveSnapshot } from '../stores/drive-snapshot-store'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView } from '../types'

interface DriveContextMenuProps {
    item: DriveItemView
    children: ReactNode
}

// The outer wrapper must stay cheap — a populated list view mounts ~60 of
// these. The expensive parts (reading drive state and building the menu
// items JSX) live inside <DriveMenuContent>, which ContextMenu mounts
// lazily on first open.
//
// DriveMenuContent renders inside the overlay layer, outside the drive
// screen's tree, so it reads drive state from useDriveSnapshot() — an
// external box that DriveStateProvider mirrors on every render — rather
// than useDrive().
export function DriveContextMenu({ item, children }: DriveContextMenuProps) {
    // Right-click should highlight the row it targets. Match Finder /
    // Explorer convention: if the right-clicked row is already part of a
    // multi-selection, leave that selection alone (the menu's actions are
    // single-row, but the user's prior selection survives the gesture);
    // otherwise switch to single-select on the right-clicked row.
    // Using getState() rather than a hook subscription keeps the wrapper
    // free of any per-render selection state.
    //
    // The cleanup runs when the menu is dismissed without picking an item
    // (outside-click, escape) — restore the prior selection so an
    // unactioned right-click doesn't leave a transient highlight behind.
    // When a menu item is pressed the cleanup is skipped, so the
    // highlighted row remains while its action runs.
    const handleOpen = useCallback(() => {
        const ui = useDriveUIStore.getState()
        const wasAlreadySelected = ui.selectedIds.has(item.id)
        const priorSelectedIds = ui.selectedIds
        const priorLastSelectedId = ui.lastSelectedId
        const priorSelectedItemId = ui.selectedItemId
        if (!wasAlreadySelected) {
            ui.selectSingle(item.id)
        }
        ui.selectItem(item.id)
        if (wasAlreadySelected) return
        return () => {
            useDriveUIStore.setState({
                selectedIds: priorSelectedIds,
                lastSelectedId: priorLastSelectedId,
                selectedItemId: priorSelectedItemId,
            })
        }
    }, [item.id])

    return (
        <ContextMenu content={() => <DriveMenuContent item={item} />} onOpen={handleOpen}>
            {children}
        </ContextMenu>
    )
}

export function DriveMenuContent({ item }: { item: DriveItemView }) {
    const {
        activeSection,
        openPreview,
        openItem,
        downloadItem,
        toggleStar,
        moveToTrash,
        restoreFromTrash,
        permanentlyDelete,
        canRestoreToOriginalLocation,
        openPrompt,
        openMoveDialog,
        openShareDialog,
        selectItem,
        openDetailPanel,
    } = useDriveSnapshot()

    const isTrash = activeSection === 'trash'

    if (isTrash) {
        return (
            <TrashMenuItems
                onRestore={() => restoreFromTrash(item.id)}
                canRestoreToOriginal={canRestoreToOriginalLocation(item.id)}
                onRequestMove={() => openMoveDialog(item.id, item.name)}
                onPermanentDelete={() => permanentlyDelete(item.id)}
            />
        )
    }

    return (
        <NormalMenuItems
            item={item}
            onPreview={() => openPreview(item)}
            onOpen={() => openItem(item)}
            onDownload={() => downloadItem(item.id)}
            onToggleStar={() => toggleStar(item.id)}
            onShare={() => openShareDialog(item.id, item.name)}
            onInfo={() => {
                selectItem(item.id)
                openDetailPanel()
            }}
            onRename={() => {
                selectItem(item.id)
                openPrompt({
                    type: 'rename',
                    itemId: item.id,
                    currentName: item.name,
                })
            }}
            onMove={() => openMoveDialog(item.id, item.name)}
            onTrash={() => moveToTrash(item.id)}
        />
    )
}

function NormalMenuItems({
    item,
    onPreview,
    onOpen,
    onDownload,
    onToggleStar,
    onShare,
    onInfo,
    onRename,
    onMove,
    onTrash,
}: {
    item: DriveItemView
    onPreview: () => void
    onOpen: () => void
    onDownload: () => void
    onToggleStar: () => void
    onShare: () => void
    onInfo: () => void
    onRename: () => void
    onMove: () => void
    onTrash: () => void
}) {
    // Extension-point actions registered by other packages (e.g. calc's
    // "Open in Calc" for xlsx files). Read the already-resolved actions from
    // the store rather than invoking the factories here: factory count varies
    // at runtime (lazy providers), and calling them at the top level would
    // crash React's hook dispatcher. Folders never get extension actions.
    const extensionActions = useResolvedDriveItemActions().filter(
        action => !item.isFolder && (action.isApplicable?.(item) ?? true)
    )

    return (
        <>
            {!item.isFolder && <ContextMenuItem label="Preview" icon={Eye} onPress={onPreview} />}
            {item.isFolder && <ContextMenuItem label="Open" icon={FolderOpen} onPress={onOpen} />}
            {extensionActions.map(action => (
                <ContextMenuItem
                    key={action.id}
                    label={action.label}
                    icon={action.icon}
                    onPress={() => action.onPress(item)}
                />
            ))}
            <ContextMenuItem label="Info" icon={Info} onPress={onInfo} />
            <ContextMenuItem label="Download" icon={Download} onPress={onDownload} />
            <Menu.Separator />
            <ContextMenuItem
                label={item.starred ? 'Remove star' : 'Add star'}
                icon={item.starred ? StarOff : Star}
                onPress={onToggleStar}
            />
            <ContextMenuItem label="Share" icon={UserPlus} onPress={onShare} />
            <ContextMenuItem label="Rename" icon={Pencil} onPress={onRename} />
            <ContextMenuItem label="Move" icon={FolderInput} onPress={onMove} />
            <Menu.Separator />
            <ContextMenuItem label="Move to trash" icon={Trash2} onPress={onTrash} />
        </>
    )
}

function TrashMenuItems({
    onRestore,
    canRestoreToOriginal,
    onRequestMove,
    onPermanentDelete,
}: {
    onRestore: () => void
    canRestoreToOriginal: boolean
    onRequestMove: () => void
    onPermanentDelete: () => void
}) {
    const handleRestore = canRestoreToOriginal ? onRestore : onRequestMove

    return (
        <>
            <ContextMenuItem
                label={canRestoreToOriginal ? 'Restore' : 'Restore to...'}
                icon={RotateCcw}
                onPress={handleRestore}
            />
            <Menu.Separator />
            <ContextMenuItem label="Delete permanently" icon={Trash2} onPress={onPermanentDelete} />
        </>
    )
}

function ContextMenuItem({
    label,
    icon,
    onPress,
}: {
    label: string
    icon: LucideIcon
    onPress: () => void
}) {
    return <Menu.Item label={label} icon={icon} onSelect={onPress} />
}
