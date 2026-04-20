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
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const borderColor = useThemeColor('border')

    const handleMove = () => {
        onMove(selectedId)
        onClose()
    }

    return (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[400px] max-h-[70vh] p-0">
                <View className="px-4 pt-4 pb-2">
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
                    className="flex-row gap-3 justify-end p-3"
                    style={{
                        borderTopWidth: 1,
                        borderColor,
                    }}
                >
                    <Pressable onPress={onClose} className="px-3 py-2">
                        <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleMove}
                        className="px-4 py-2 rounded-md"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <Text style={{ fontWeight: '600', color: primaryFgColor }}>{confirmLabel}</Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )
}

function RootItem({ isSelected, onSelect }: { isSelected: boolean; onSelect: () => void }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const accentColor = useThemeColor('primary')

    return (
        <Pressable
            className="flex-row items-center gap-2 py-2 pr-3 rounded-lg mx-2 pl-3"
            style={isSelected ? { backgroundColor: `${accentColor}18` } : undefined}
            onPress={onSelect}
        >
            <HardDrive size={16} color={isSelected ? accentColor : mutedColor} />
            <Text
                className={`flex-1 text-[13px] ${isSelected ? 'font-semibold' : ''}`}
                style={{ color: isSelected ? accentColor : fgColor }}
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
            {nodes.map((node) => {
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
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const accentColor = useThemeColor('primary')
    const [expanded, setExpanded] = useState(false)
    const isSelected = selectedId === node.item.id
    const hasChildren = node.children.filter((c) => c.item.id !== excludeId).length > 0
    const ChevronIcon = expanded ? ChevronDown : ChevronRight

    return (
        <View>
            <Pressable
                className="flex-row items-center gap-2 py-2 pr-3 rounded-lg mx-2"
                style={{
                    paddingLeft: depth * 20 + 12,
                    ...(isSelected ? { backgroundColor: `${accentColor}18` } : {}),
                }}
                onPress={() => onSelect(node.item.id)}
            >
                {hasChildren ? (
                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation()
                            setExpanded((prev) => !prev)
                        }}
                        className="items-center justify-center"
                        style={{ width: 18 }}
                    >
                        <ChevronIcon size={14} color={mutedColor} />
                    </Pressable>
                ) : (
                    <View className="items-center justify-center" style={{ width: 18 }} />
                )}
                <Folder size={16} color={isSelected ? accentColor : mutedColor} />
                <Text
                    numberOfLines={1}
                    className={`flex-1 text-[13px] ${isSelected ? 'font-semibold' : ''}`}
                    style={{ color: isSelected ? accentColor : fgColor }}
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
