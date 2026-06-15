import { MenuActionItem } from '@tinycld/core/components/DropdownMenu'
import {
    SidebarActionButton,
    SidebarDivider,
    SidebarItem,
    SidebarNav,
    SidebarSlot,
} from '@tinycld/core/components/sidebar-primitives'
import { openHelpPackage } from '@tinycld/core/lib/help/open-help'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import {
    ChevronDown,
    ChevronRight,
    Clock,
    Folder,
    FolderPlus,
    HardDrive,
    HelpCircle,
    Plus,
    Star,
    Trash2,
    Upload,
    UserPlus,
} from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { FolderDropTarget } from './components/FolderDropTarget'
import { useDriveState } from './hooks/useDrive'
import type { StorageUsage } from './hooks/useTotalStorage'
import type { DriveDragPayload } from './lib/dnd'
import { useDriveUIStore } from './stores/drive-ui-store'
import type { DriveItemView, FolderTreeNode } from './types'

interface DriveSidebarProps {
    isCollapsed: boolean
}

export default function DriveSidebar(_props: DriveSidebarProps) {
    const {
        activeSection,
        currentFolderId,
        breadcrumbs,
        navigateToFolder,
        navigateToSection,
        folderTree,
        storageUsage,
        triggerFilePicker,
        openPrompt,
        itemsById,
        actions,
    } = useDriveState()
    const openUploadSheet = useDriveUIStore(s => s.openUploadSheet)
    const handleUploadPress = Platform.OS === 'web' ? triggerFilePicker : openUploadSheet
    const handleNewFolderPress = () => openPrompt({ type: 'new-folder' })
    // Explicit per-folder open/closed intent from user toggles. Absent = no
    // opinion (fall back to the auto-expand rules below). Kept separate from the
    // derived set so navigation can auto-open ancestors without clobbering a
    // folder the user deliberately collapsed.
    const [userExpanded, setUserExpanded] = useState<Map<string, boolean>>(new Map())

    // Which folders render expanded — derived during render rather than synced
    // via an effect. (A breadcrumb/tree effect that setState'd here raced the
    // sidebar's own useLiveQuery first-snapshot commit, tripping React's
    // "setState while rendering" once Drax drop targets mounted.) Auto-expand =
    // all top-level folders when sitting at the root untouched, plus every
    // breadcrumb ancestor of the current folder; explicit user toggles win.
    const expandedIds = useMemo(() => {
        const ids = new Set<string>()
        const atUntouchedRoot = breadcrumbs.length === 0 && userExpanded.size === 0
        if (atUntouchedRoot) {
            for (const node of folderTree) ids.add(node.item.id)
        }
        for (const b of breadcrumbs) ids.add(b.id)
        for (const [id, open] of userExpanded) {
            if (open) ids.add(id)
            else ids.delete(id)
        }
        return ids
    }, [breadcrumbs, folderTree, userExpanded])

    const toggleExpand = (id: string) => {
        setUserExpanded(prev => {
            const next = new Map(prev)
            next.set(id, !expandedIds.has(id))
            return next
        })
    }

    const handleFolderPress = (id: string) => {
        navigateToFolder(id)
        setUserExpanded(prev => {
            const next = new Map(prev)
            next.set(id, true)
            return next
        })
    }

    return (
        <SidebarNav>
            <Menu>
                <Menu.Trigger>
                    <SidebarActionButton label="New" icon={Plus} />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Overlay />
                    <Menu.Content presentation="popover" placement="bottom" align="start">
                        <MenuActionItem label="Upload" icon={Upload} onPress={handleUploadPress} />
                        <MenuActionItem
                            label="New folder"
                            icon={FolderPlus}
                            onPress={handleNewFolderPress}
                        />
                    </Menu.Content>
                </Menu.Portal>
            </Menu>

            <FolderDropTarget
                targetFolderId=""
                itemsById={itemsById}
                onDropItems={actions.moveItems}
            >
                <SidebarItem
                    label="My Files"
                    icon={HardDrive}
                    isActive={activeSection === 'my-drive' && currentFolderId === ''}
                    closesDrawer
                    onPress={() => navigateToSection('my-drive')}
                />
            </FolderDropTarget>

            <FolderTree
                nodes={folderTree}
                expandedIds={expandedIds}
                selectedFolderId={currentFolderId}
                onToggle={toggleExpand}
                onSelect={handleFolderPress}
                depth={1}
                itemsById={itemsById}
                onDropItems={actions.moveItems}
            />

            <SidebarDivider />

            <SidebarSlot target="drive" slot="sidebar.after-tree" />

            <SidebarItem
                label="Shared with me"
                icon={UserPlus}
                isActive={activeSection === 'shared-with-me'}
                closesDrawer
                onPress={() => navigateToSection('shared-with-me')}
            />
            <SidebarItem
                label="Recent"
                icon={Clock}
                isActive={activeSection === 'recent'}
                closesDrawer
                onPress={() => navigateToSection('recent')}
            />
            <SidebarItem
                label="Starred"
                icon={Star}
                isActive={activeSection === 'starred'}
                closesDrawer
                onPress={() => navigateToSection('starred')}
            />

            <SidebarDivider />

            <SidebarItem
                label="Trash"
                icon={Trash2}
                isActive={activeSection === 'trash'}
                closesDrawer
                onPress={() => navigateToSection('trash')}
            />

            <SidebarDivider />

            <SidebarItem
                label="Help"
                icon={HelpCircle}
                closesDrawer
                onPress={() => openHelpPackage('drive')}
            />

            <StorageBar storageUsage={storageUsage} />
        </SidebarNav>
    )
}

interface FolderTreeProps {
    nodes: FolderTreeNode[]
    expandedIds: Set<string>
    selectedFolderId: string
    onToggle: (id: string) => void
    onSelect: (id: string) => void
    depth: number
    itemsById: Map<string, DriveItemView>
    onDropItems: (payload: DriveDragPayload, targetFolderId: string) => void
}

function FolderTree({
    nodes,
    expandedIds,
    selectedFolderId,
    onToggle,
    onSelect,
    depth,
    itemsById,
    onDropItems,
}: FolderTreeProps) {
    if (nodes.length === 0) return null

    return (
        <View>
            {nodes.map(node => (
                <FolderTreeItem
                    key={node.item.id}
                    node={node}
                    expandedIds={expandedIds}
                    selectedFolderId={selectedFolderId}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    depth={depth}
                    itemsById={itemsById}
                    onDropItems={onDropItems}
                />
            ))}
        </View>
    )
}

interface FolderTreeItemProps {
    node: FolderTreeNode
    expandedIds: Set<string>
    selectedFolderId: string
    onToggle: (id: string) => void
    onSelect: (id: string) => void
    depth: number
    itemsById: Map<string, DriveItemView>
    onDropItems: (payload: DriveDragPayload, targetFolderId: string) => void
}

function FolderTreeItem({
    node,
    expandedIds,
    selectedFolderId,
    onToggle,
    onSelect,
    depth,
    itemsById,
    onDropItems,
}: FolderTreeItemProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const activeIndicator = useThemeColor('active-indicator')
    const isExpanded = expandedIds.has(node.item.id)
    const isSelected = selectedFolderId === node.item.id
    const hasChildren = node.children.length > 0
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

    return (
        <View key={node.item.id}>
            <FolderDropTarget
                targetFolderId={node.item.id}
                itemsById={itemsById}
                onDropItems={onDropItems}
            >
                <Pressable
                    className="flex-row items-center rounded-lg pr-3"
                    style={{
                        gap: 6,
                        paddingVertical: 6,
                        paddingLeft: depth * 16,
                        ...(isSelected ? { backgroundColor: `${activeIndicator}18` } : {}),
                    }}
                    onPress={() => onSelect(node.item.id)}
                >
                    {hasChildren ? (
                        <Pressable
                            onPress={() => onToggle(node.item.id)}
                            className="items-center justify-center"
                            style={{ width: 18 }}
                        >
                            <ChevronIcon size={14} color={mutedColor} />
                        </Pressable>
                    ) : (
                        <View className="items-center justify-center" style={{ width: 18 }} />
                    )}
                    <Folder size={16} color={isSelected ? activeIndicator : mutedColor} />
                    <Text
                        numberOfLines={1}
                        className="flex-1"
                        style={{
                            fontSize: 12,
                            color: isSelected ? activeIndicator : fgColor,
                            fontWeight: isSelected ? '600' : undefined,
                        }}
                    >
                        {node.item.name}
                    </Text>
                </Pressable>
            </FolderDropTarget>
            {isExpanded && node.children.length > 0 && (
                <FolderTree
                    nodes={node.children}
                    expandedIds={expandedIds}
                    selectedFolderId={selectedFolderId}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    depth={depth + 1}
                    itemsById={itemsById}
                    onDropItems={onDropItems}
                />
            )}
        </View>
    )
}

function StorageBar({ storageUsage }: { storageUsage: StorageUsage }) {
    const { usedBytes, limitBytes, hasLimit } = storageUsage
    const usedGB = usedBytes / 1024 ** 3

    if (!hasLimit || limitBytes <= 0) {
        return (
            <View className="px-3 py-2" style={{ gap: 6 }}>
                <Text className="text-muted-foreground" style={{ fontSize: 11 }}>
                    {usedGB.toFixed(2)} GB used
                </Text>
            </View>
        )
    }

    const totalGB = limitBytes / 1024 ** 3
    const percentage = Math.min(100, (usedBytes / limitBytes) * 100)

    return (
        <View className="px-3 py-2" style={{ gap: 6 }}>
            <View
                className="overflow-hidden rounded-sm bg-muted-foreground/10"
                style={{ height: 4 }}
            >
                <View
                    className="h-full rounded-sm bg-primary"
                    style={{ width: `${percentage}%` }}
                />
            </View>
            <Text className="text-muted-foreground" style={{ fontSize: 11 }}>
                {usedGB.toFixed(2)} GB of {totalGB.toFixed(0)} GB used
            </Text>
        </View>
    )
}
