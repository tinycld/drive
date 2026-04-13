import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useThemeColor } from '~/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '~/ui/modal'
import type { FolderTreeNode } from '../types'

interface ChooseFolderDialogProps {
    open: boolean
    itemName: string
    excludeId: string
    folderTree: FolderTreeNode[]
    onMove: (targetFolderId: string) => void
    onClose: () => void
    title?: string
    confirmLabel?: string
}

export function ChooseFolderDialog({
    open,
    itemName,
    excludeId,
    folderTree,
    onMove,
    onClose,
    title,
    confirmLabel = 'Move here',
}: ChooseFolderDialogProps) {
    const [selectedId, setSelectedId] = useState('')
    const fgColor = useThemeColor('foreground')
    const accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')
    const borderColor = useThemeColor('border')

    const handleMove = () => {
        onMove(selectedId)
        onClose()
    }

    return (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[400px] max-h-[70vh] p-0">
                <View
                    style={{
                        paddingHorizontal: 16,
                        paddingTop: 16,
                        paddingBottom: 8,
                    }}
                >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: fgColor }}>
                        {title ?? `Move \u201C${itemName}\u201D`}
                    </Text>
                </View>

                <ScrollView style={{ maxHeight: 320, paddingVertical: 4 }}>
                    <RootItem isSelected={selectedId === ''} onSelect={() => setSelectedId('')} />
                    <PickerTree
                        nodes={folderTree}
                        excludeId={excludeId}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        depth={1}
                    />
                </ScrollView>

                <View
                    style={{
                        flexDirection: 'row',
                        gap: 12,
                        justifyContent: 'flex-end',
                        padding: 12,
                        borderTopWidth: 1,
                        borderColor,
                    }}
                >
                    <Pressable
                        onPress={onClose}
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                    >
                        <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleMove}
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 6,
                            backgroundColor: accentColor,
                        }}
                    >
                        <Text style={{ fontWeight: '600', color: accentFgColor }}>
                            {confirmLabel}
                        </Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )
}

function RootItem({ isSelected, onSelect }: { isSelected: boolean; onSelect: () => void }) {
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const accentColor = useThemeColor('accent')

    return (
        <Pressable
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                paddingRight: 12,
                borderRadius: 8,
                marginHorizontal: 8,
                paddingLeft: 12,
                ...(isSelected ? { backgroundColor: `${accentColor}18` } : {}),
            }}
            onPress={onSelect}
        >
            <HardDrive size={16} color={isSelected ? accentColor : mutedColor} />
            <Text
                style={{
                    fontSize: 13,
                    flex: 1,
                    color: isSelected ? accentColor : fgColor,
                    fontWeight: isSelected ? '600' : undefined,
                }}
            >
                My Files
            </Text>
        </Pressable>
    )
}

function PickerTree({
    nodes,
    excludeId,
    selectedId,
    onSelect,
    depth,
}: {
    nodes: FolderTreeNode[]
    excludeId: string
    selectedId: string
    onSelect: (id: string) => void
    depth: number
}) {
    return (
        <>
            {nodes.map(node => {
                if (node.item.id === excludeId) return null
                return (
                    <PickerTreeItem
                        key={node.item.id}
                        node={node}
                        excludeId={excludeId}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        depth={depth}
                    />
                )
            })}
        </>
    )
}

function PickerTreeItem({
    node,
    excludeId,
    selectedId,
    onSelect,
    depth,
}: {
    node: FolderTreeNode
    excludeId: string
    selectedId: string
    onSelect: (id: string) => void
    depth: number
}) {
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const accentColor = useThemeColor('accent')
    const [expanded, setExpanded] = useState(false)
    const isSelected = selectedId === node.item.id
    const hasChildren = node.children.filter(c => c.item.id !== excludeId).length > 0
    const ChevronIcon = expanded ? ChevronDown : ChevronRight

    return (
        <View>
            <Pressable
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    paddingRight: 12,
                    borderRadius: 8,
                    marginHorizontal: 8,
                    paddingLeft: depth * 20 + 12,
                    ...(isSelected ? { backgroundColor: `${accentColor}18` } : {}),
                }}
                onPress={() => onSelect(node.item.id)}
            >
                {hasChildren ? (
                    <Pressable
                        onPress={e => {
                            e.stopPropagation()
                            setExpanded(prev => !prev)
                        }}
                        style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ChevronIcon size={14} color={mutedColor} />
                    </Pressable>
                ) : (
                    <View style={{ width: 18, alignItems: 'center', justifyContent: 'center' }} />
                )}
                <Folder size={16} color={isSelected ? accentColor : mutedColor} />
                <Text
                    numberOfLines={1}
                    style={{
                        fontSize: 13,
                        flex: 1,
                        color: isSelected ? accentColor : fgColor,
                        fontWeight: isSelected ? '600' : undefined,
                    }}
                >
                    {node.item.name}
                </Text>
            </Pressable>
            {expanded && hasChildren && (
                <PickerTree
                    nodes={node.children}
                    excludeId={excludeId}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            )}
        </View>
    )
}
