import { Menu } from '@tamagui/menu'
import {
    ChevronDown,
    ChevronRight,
    Clock,
    Folder,
    FolderPlus,
    HardDrive,
    Plus,
    Star,
    Trash2,
    Upload,
    UserPlus,
} from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { SizableText, useTheme, View } from 'tamagui'
import { MenuActionItem } from '~/components/DropdownMenu'
import { SidebarDivider, SidebarItem, SidebarNav } from '~/components/sidebar-primitives'
import { useDrive } from './hooks/useDrive'
import type { FolderTreeNode } from './types'

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
        totalStorageUsed,
        triggerFilePicker,
    } = useDrive()
    const theme = useTheme()
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (breadcrumbs.length === 0 && folderTree.length > 0) {
            setExpandedIds(prev => {
                if (prev.size > 0) return prev
                return new Set(folderTree.map(n => n.item.id))
            })
        }
        if (breadcrumbs.length > 0) {
            const ancestorIds = breadcrumbs.map(b => b.id)
            setExpandedIds(prev => {
                const next = new Set(prev)
                for (const id of ancestorIds) next.add(id)
                return next
            })
        }
    }, [breadcrumbs, folderTree])

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleFolderPress = (id: string) => {
        navigateToFolder(id)
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
    }

    return (
        <SidebarNav>
            <View paddingHorizontal={12} paddingVertical={8}>
                <Menu>
                    <Menu.Trigger asChild>
                        <Pressable
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderRadius: 20,
                                backgroundColor: theme.accentBackground.val,
                            }}
                        >
                            <Plus size={16} color={theme.accentColor.val} />
                            <SizableText size="$3" fontWeight="600" color={theme.accentColor.val}>
                                New
                            </SizableText>
                        </Pressable>
                    </Menu.Trigger>
                    <Menu.Portal zIndex={100}>
                        <Menu.Content
                            borderRadius={8}
                            minWidth={200}
                            backgroundColor="$background"
                            borderColor="$borderColor"
                            borderWidth={1}
                            paddingVertical="$1"
                            shadowColor="#000"
                            shadowOffset={{ width: 0, height: 4 }}
                            shadowOpacity={0.15}
                            shadowRadius={12}
                        >
                            <MenuActionItem
                                label="Upload file"
                                icon={Upload}
                                onPress={triggerFilePicker}
                            />
                            <MenuActionItem
                                label="New folder"
                                icon={FolderPlus}
                                onPress={() => {}}
                            />
                        </Menu.Content>
                    </Menu.Portal>
                </Menu>
            </View>

            <SidebarItem
                label="My Files"
                icon={HardDrive}
                isActive={activeSection === 'my-drive' && currentFolderId === ''}
                closesDrawer
                onPress={() => navigateToSection('my-drive')}
            />

            <FolderTree
                nodes={folderTree}
                expandedIds={expandedIds}
                selectedFolderId={currentFolderId}
                onToggle={toggleExpand}
                onSelect={handleFolderPress}
                depth={1}
            />

            <SidebarDivider />

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

            <StorageBar usedGB={totalStorageUsed / 1024 ** 3} totalGB={15} />
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
}

function FolderTree({
    nodes,
    expandedIds,
    selectedFolderId,
    onToggle,
    onSelect,
    depth,
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
}

function FolderTreeItem({
    node,
    expandedIds,
    selectedFolderId,
    onToggle,
    onSelect,
    depth,
}: FolderTreeItemProps) {
    const theme = useTheme()
    const isExpanded = expandedIds.has(node.item.id)
    const isSelected = selectedFolderId === node.item.id
    const hasChildren = node.children.length > 0
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

    return (
        <View key={node.item.id}>
            <Pressable
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 6,
                    paddingRight: 12,
                    borderRadius: 8,
                    paddingLeft: depth * 16,
                    ...(isSelected ? { backgroundColor: `${theme.activeIndicator.val}18` } : {}),
                }}
                onPress={() => onSelect(node.item.id)}
            >
                {hasChildren ? (
                    <Pressable
                        onPress={() => onToggle(node.item.id)}
                        style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ChevronIcon size={14} color={theme.color8.val} />
                    </Pressable>
                ) : (
                    <View width={18} alignItems="center" justifyContent="center" />
                )}
                <Folder
                    size={16}
                    color={isSelected ? theme.activeIndicator.val : theme.color8.val}
                />
                <SizableText
                    size="$2"
                    flex={1}
                    color={isSelected ? theme.activeIndicator.val : '$color'}
                    fontWeight={isSelected ? '600' : undefined}
                    numberOfLines={1}
                >
                    {node.item.name}
                </SizableText>
            </Pressable>
            {isExpanded && node.children.length > 0 && (
                <FolderTree
                    nodes={node.children}
                    expandedIds={expandedIds}
                    selectedFolderId={selectedFolderId}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            )}
        </View>
    )
}

function StorageBar({ usedGB, totalGB }: { usedGB: number; totalGB: number }) {
    const theme = useTheme()
    const percentage = (usedGB / totalGB) * 100

    return (
        <View paddingHorizontal={12} paddingVertical={8} gap={6}>
            <View
                height={4}
                borderRadius={2}
                overflow="hidden"
                backgroundColor={`${theme.color8.val}20`}
            >
                <View
                    height="100%"
                    borderRadius={2}
                    width={`${percentage}%`}
                    backgroundColor="$accentBackground"
                />
            </View>
            <SizableText size="$1" color="$color8">
                {usedGB.toFixed(2)} GB of {totalGB} GB used
            </SizableText>
        </View>
    )
}
