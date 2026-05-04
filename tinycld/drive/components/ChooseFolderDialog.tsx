import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react-native'
import { useState } from 'react'
import { Platform, Pressable, Modal as RNModal, ScrollView, Text, View } from 'react-native'
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

    const handleMove = () => {
        onMove(selectedId)
        onClose()
    }

    const dialog = (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[400px] max-h-[70vh] p-0">
                <View className="px-4 pt-4 pb-2">
                    <Text className="text-foreground" style={{ fontSize: 16, fontWeight: '600' }}>
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

                <View className="flex-row gap-3 justify-end p-3 border-t border-border">
                    <Pressable onPress={onClose} className="px-3 py-2">
                        <Text className="text-foreground" style={{ fontSize: 13 }}>
                            Cancel
                        </Text>
                    </Pressable>
                    <Pressable onPress={handleMove} className="px-4 py-2 rounded-md bg-primary">
                        <Text className="text-primary-foreground" style={{ fontWeight: '600' }}>
                            {confirmLabel}
                        </Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )

    // The core/Gluestack Modal is just an absolutely-positioned overlay in
    // the React tree, so on native it sits behind any open native <RNModal>
    // (e.g. PreviewModal's fullScreen modal). Wrapping in a transparent RN
    // Modal puts the dialog in its own native layer that stacks above.
    if (Platform.OS !== 'web') {
        return (
            <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
                {dialog}
            </RNModal>
        )
    }

    return dialog
}

function RootItem({ isSelected, onSelect }: { isSelected: boolean; onSelect: () => void }) {
    const mutedColor = useThemeColor('muted-foreground')
    const accentColor = useThemeColor('primary')

    return (
        <Pressable
            className={`flex-row items-center gap-2 py-2 pr-3 rounded-lg mx-2 pl-3 ${isSelected ? 'bg-primary/10' : ''}`}
            onPress={onSelect}
        >
            <HardDrive size={16} color={isSelected ? accentColor : mutedColor} />
            <Text
                className={`flex-1 text-[13px] ${isSelected ? 'font-semibold text-primary' : 'text-foreground'}`}
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
    const accentColor = useThemeColor('primary')
    const [expanded, setExpanded] = useState(false)
    const isSelected = selectedId === node.item.id
    const hasChildren = node.children.filter((c) => c.item.id !== excludeId).length > 0
    const ChevronIcon = expanded ? ChevronDown : ChevronRight

    return (
        <View>
            <Pressable
                className={`flex-row items-center gap-2 py-2 pr-3 rounded-lg mx-2 ${isSelected ? 'bg-primary/10' : ''}`}
                style={{ paddingLeft: depth * 20 + 12 }}
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
                    className={`flex-1 text-[13px] ${isSelected ? 'font-semibold text-primary' : 'text-foreground'}`}
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
