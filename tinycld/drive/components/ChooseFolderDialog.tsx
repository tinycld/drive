import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Dialog } from '@tinycld/core/ui/dialog'
import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFolderTreeQuery } from '../hooks/use-folder-tree-query'
import type { FolderTreeNode } from '../types'

interface ChooseFolderDialogProps {
    open: boolean
    itemName: string
    excludeId: string
    /**
     * Folder tree to render. When omitted the dialog runs its own live
     * query for folders owned by the current user — use that path
     * from packages that don't already have the drive state tree in
     * hand (e.g. @tinycld/calc's File menu).
     */
    folderTree?: FolderTreeNode[]
    /**
     * Folder pre-selected when the dialog opens. Defaults to `''` (the
     * root "My Files"). Calc passes the source workbook's current
     * parent so the user lands on the same folder by default.
     */
    initialSelectedId?: string
    onMove: (targetFolderId: string) => void
    onClose: () => void
    title?: string
    confirmLabel?: string
}

export function ChooseFolderDialog(props: ChooseFolderDialogProps) {
    // Unmount the body when closed so the next open re-derives
    // `selectedId` from `initialSelectedId` and the internal folder-tree
    // query stops fetching.
    if (!props.open) return null
    return <ChooseFolderDialogBody {...props} />
}

function ChooseFolderDialogBody({
    itemName,
    excludeId,
    folderTree: externalFolderTree,
    initialSelectedId = '',
    onMove,
    onClose,
    title,
    confirmLabel = 'Move here',
}: ChooseFolderDialogProps) {
    const internalFolderTree = useFolderTreeQuery({ enabled: externalFolderTree == null })
    const folderTree = externalFolderTree ?? internalFolderTree
    const [selectedId, setSelectedId] = useState(initialSelectedId)

    const handleMove = () => {
        onMove(selectedId)
        onClose()
    }

    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={title ?? `Move \u201C${itemName}\u201D`}
            size="md"
            testID="choose-folder-dialog"
        >
            <Dialog.Body contentClassName="pb-2">
                <RootItem isSelected={selectedId === ''} onSelect={() => setSelectedId('')} />
                <PickerTree
                    nodes={folderTree}
                    excludeId={excludeId}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    depth={1}
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onClose} />
                <Dialog.ActionButton label={confirmLabel} onPress={handleMove} />
            </Dialog.Footer>
        </Dialog>
    )
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
    const mutedColor = useThemeColor('muted-foreground')
    const accentColor = useThemeColor('primary')
    const [expanded, setExpanded] = useState(false)
    const isSelected = selectedId === node.item.id
    const hasChildren = node.children.filter(c => c.item.id !== excludeId).length > 0
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
                        onPress={e => {
                            e.stopPropagation()
                            setExpanded(prev => !prev)
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
