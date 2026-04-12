import { Menu, useThemeColor } from 'heroui-native'
import type { LucideIcon } from 'lucide-react-native'
import {
    Download,
    Eye,
    FolderInput,
    FolderOpen,
    Pencil,
    RotateCcw,
    Star,
    StarOff,
    Trash2,
    UserPlus,
} from 'lucide-react-native'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { ContextMenu } from '~/components/ContextMenu'
import { useDrive } from '../hooks/useDrive'
import type { DriveItemView } from '../types'

interface DriveContextMenuProps {
    item: DriveItemView
    children: ReactNode
}

export function DriveContextMenu({ item, children }: DriveContextMenuProps) {
    const mutedColor = useThemeColor('muted')
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
    } = useDrive()

    const isTrash = activeSection === 'trash'

    const menuContent = isTrash ? (
        <TrashMenuItems
            mutedColor={mutedColor}
            onRestore={() => restoreFromTrash(item.id)}
            canRestoreToOriginal={canRestoreToOriginalLocation(item.id)}
            onRequestMove={() => openMoveDialog(item.id, item.name)}
            onPermanentDelete={() => permanentlyDelete(item.id)}
        />
    ) : (
        <NormalMenuItems
            item={item}
            mutedColor={mutedColor}
            onPreview={() => openPreview(item)}
            onOpen={() => openItem(item)}
            onDownload={() => downloadItem(item.id)}
            onToggleStar={() => toggleStar(item.id)}
            onShare={() => openShareDialog(item.id, item.name)}
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

    return <ContextMenu content={menuContent}>{children}</ContextMenu>
}

function NormalMenuItems({
    item,
    mutedColor,
    onPreview,
    onOpen,
    onDownload,
    onToggleStar,
    onShare,
    onRename,
    onMove,
    onTrash,
}: {
    item: DriveItemView
    mutedColor: string
    onPreview: () => void
    onOpen: () => void
    onDownload: () => void
    onToggleStar: () => void
    onShare: () => void
    onRename: () => void
    onMove: () => void
    onTrash: () => void
}) {
    return (
        <>
            {!item.isFolder && (
                <ContextMenuItem
                    label="Preview"
                    icon={Eye}
                    onPress={onPreview}
                    mutedColor={mutedColor}
                />
            )}
            <ContextMenuItem
                label="Open"
                icon={FolderOpen}
                onPress={onOpen}
                mutedColor={mutedColor}
            />
            <ContextMenuItem
                label="Download"
                icon={Download}
                onPress={onDownload}
                mutedColor={mutedColor}
            />
            <View className="h-px my-1 mx-2 bg-separator" />
            <ContextMenuItem
                label={item.starred ? 'Remove star' : 'Add star'}
                icon={item.starred ? StarOff : Star}
                onPress={onToggleStar}
                mutedColor={mutedColor}
            />
            <ContextMenuItem
                label="Share"
                icon={UserPlus}
                onPress={onShare}
                mutedColor={mutedColor}
            />
            <ContextMenuItem
                label="Rename"
                icon={Pencil}
                onPress={onRename}
                mutedColor={mutedColor}
            />
            <ContextMenuItem
                label="Move"
                icon={FolderInput}
                onPress={onMove}
                mutedColor={mutedColor}
            />
            <View className="h-px my-1 mx-2 bg-separator" />
            <ContextMenuItem
                label="Move to trash"
                icon={Trash2}
                onPress={onTrash}
                mutedColor={mutedColor}
            />
        </>
    )
}

function TrashMenuItems({
    mutedColor,
    onRestore,
    canRestoreToOriginal,
    onRequestMove,
    onPermanentDelete,
}: {
    mutedColor: string
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
                mutedColor={mutedColor}
            />
            <View className="h-px my-1 mx-2 bg-separator" />
            <ContextMenuItem
                label="Delete permanently"
                icon={Trash2}
                onPress={onPermanentDelete}
                mutedColor={mutedColor}
            />
        </>
    )
}

function ContextMenuItem({
    label,
    icon: Icon,
    onPress,
    mutedColor,
}: {
    label: string
    icon: LucideIcon
    onPress: () => void
    mutedColor: string
}) {
    return (
        <Menu.Item onPress={onPress}>
            <Icon size={16} color={mutedColor} />
            <Menu.ItemTitle>{label}</Menu.ItemTitle>
        </Menu.Item>
    )
}
