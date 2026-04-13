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
import { Pressable, Text, View } from 'react-native'
import { MenuActionItem } from '~/components/DropdownMenu'
import { SidebarDivider, SidebarItem, SidebarNav } from '~/components/sidebar-primitives'
import { useThemeColor } from '~/lib/use-app-theme'
import { Menu } from '~/ui/menu'
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
    const accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')
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
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                <Menu
                    trigger={triggerProps => (
                        <Pressable
                            {...triggerProps}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderRadius: 20,
                                backgroundColor: accentColor,
                            }}
                        >
                            <Plus size={16} color={accentFgColor} />
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontWeight: '600',
                                    color: accentFgColor,
                                }}
                            >
                                New
                            </Text>
                        </Pressable>
                    )}
                    placement="bottom left"
                    className="min-w-[200px]"
                >
                    <MenuActionItem label="Upload file" icon={Upload} onPress={triggerFilePicker} />
                    <MenuActionItem label="New folder" icon={FolderPlus} onPress={() => {}} />
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
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const activeIndicator = useThemeColor('active-indicator')
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
                    ...(isSelected ? { backgroundColor: `${activeIndicator}18` } : {}),
                }}
                onPress={() => onSelect(node.item.id)}
            >
                {hasChildren ? (
                    <Pressable
                        onPress={() => onToggle(node.item.id)}
                        style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ChevronIcon size={14} color={mutedColor} />
                    </Pressable>
                ) : (
                    <View style={{ width: 18, alignItems: 'center', justifyContent: 'center' }} />
                )}
                <Folder size={16} color={isSelected ? activeIndicator : mutedColor} />
                <Text
                    numberOfLines={1}
                    style={{
                        fontSize: 12,
                        flex: 1,
                        color: isSelected ? activeIndicator : fgColor,
                        fontWeight: isSelected ? '600' : undefined,
                    }}
                >
                    {node.item.name}
                </Text>
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
    const mutedColor = useThemeColor('muted')
    const accentColor = useThemeColor('accent')
    const percentage = (usedGB / totalGB) * 100

    return (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
            <View
                style={{
                    height: 4,
                    borderRadius: 2,
                    overflow: 'hidden',
                    backgroundColor: `${mutedColor}20`,
                }}
            >
                <View
                    style={{
                        height: '100%',
                        borderRadius: 2,
                        width: `${percentage}%`,
                        backgroundColor: accentColor,
                    }}
                />
            </View>
            <Text style={{ fontSize: 11, color: mutedColor }}>
                {usedGB.toFixed(2)} GB of {totalGB} GB used
            </Text>
        </View>
    )
}
