import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Dialog, useTheme, XStack } from 'tamagui'
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

    return (
        <Dialog
            modal
            open={open}
            onOpenChange={o => {
                if (!o) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    key="overlay"
                    opacity={0.3}
                    backgroundColor="$shadow6"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                />
                <Dialog.Content
                    key="content"
                    bordered
                    elevate
                    padding={0}
                    width={400}
                    maxHeight="70vh"
                    backgroundColor="$background"
                >
                    <View style={styles.header}>
                        <Dialog.Title size="$4">
                            {title ?? `Move \u201C${itemName}\u201D`}
                        </Dialog.Title>
                    </View>

                    <ScrollView style={styles.treeContainer}>
                        <RootItem
                            isSelected={selectedId === ''}
                            onSelect={() => setSelectedId('')}
                        />
                        <PickerTree
                            nodes={folderTree}
                            excludeId={excludeId}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            depth={1}
                        />
                    </ScrollView>

                    <XStack
                        gap="$3"
                        justifyContent="flex-end"
                        padding="$3"
                        borderTopWidth={1}
                        borderColor="$borderColor"
                    >
                        <Dialog.Close asChild>
                            <Button size="$3" chromeless>
                                <Button.Text>Cancel</Button.Text>
                            </Button>
                        </Dialog.Close>
                        <Button size="$3" theme="accent" onPress={handleMove}>
                            <Button.Text fontWeight="600">{confirmLabel}</Button.Text>
                        </Button>
                    </XStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}

function RootItem({ isSelected, onSelect }: { isSelected: boolean; onSelect: () => void }) {
    const theme = useTheme()

    return (
        <Pressable
            style={[
                styles.row,
                { paddingLeft: 12 },
                isSelected && { backgroundColor: `${theme.accentBackground.val}18` },
            ]}
            onPress={onSelect}
        >
            <HardDrive
                size={16}
                color={isSelected ? theme.accentBackground.val : theme.color8.val}
            />
            <Text
                style={[
                    styles.label,
                    { color: isSelected ? theme.accentBackground.val : theme.color.val },
                    isSelected && styles.labelActive,
                ]}
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
    const theme = useTheme()
    const [expanded, setExpanded] = useState(false)
    const isSelected = selectedId === node.item.id
    const hasChildren = node.children.filter(c => c.item.id !== excludeId).length > 0
    const ChevronIcon = expanded ? ChevronDown : ChevronRight

    return (
        <View>
            <Pressable
                style={[
                    styles.row,
                    { paddingLeft: depth * 20 + 12 },
                    isSelected && { backgroundColor: `${theme.accentBackground.val}18` },
                ]}
                onPress={() => onSelect(node.item.id)}
            >
                {hasChildren ? (
                    <Pressable
                        onPress={e => {
                            e.stopPropagation()
                            setExpanded(prev => !prev)
                        }}
                        style={styles.chevron}
                    >
                        <ChevronIcon size={14} color={theme.color8.val} />
                    </Pressable>
                ) : (
                    <View style={styles.chevron} />
                )}
                <Folder
                    size={16}
                    color={isSelected ? theme.accentBackground.val : theme.color8.val}
                />
                <Text
                    style={[
                        styles.label,
                        { color: isSelected ? theme.accentBackground.val : theme.color.val },
                        isSelected && styles.labelActive,
                    ]}
                    numberOfLines={1}
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

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    treeContainer: {
        maxHeight: 320,
        paddingVertical: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingRight: 12,
        borderRadius: 8,
        marginHorizontal: 8,
    },
    chevron: {
        width: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 14,
        flex: 1,
    },
    labelActive: {
        fontWeight: '600',
    },
})
