import { Star } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { DataTableHeader } from '~/components/DataTableHeader'
import { EmptyState } from '~/components/EmptyState'
import { formatBytes, formatDate } from '~/lib/format-utils'
import { DriveContextMenu } from '../components/DriveContextMenu'
import { getFileIcon } from '../components/file-icons'
import { Thumbnail } from '../components/Thumbnail'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { useDrive } from '../hooks/useDrive'
import type { DriveItemView } from '../types'

export default function DriveScreen() {
    const { viewMode, activeSection, currentItems, searchQuery, isSearching } = useDrive()
    const isSearchActive = searchQuery.length >= 2
    const isTrash = activeSection === 'trash'

    if (isSearching) {
        return <EmptyState message="Searching..." />
    }

    if (currentItems.length === 0) {
        let message = 'No files in this location'
        if (isSearchActive) message = `No results for "${searchQuery}"`
        else if (isTrash) message = 'Trash is empty'
        return <EmptyState message={message} />
    }

    if (viewMode === 'grid') {
        return <GridView items={currentItems} />
    }

    return <ListView items={currentItems} isTrash={isTrash} />
}

const DRIVE_COLUMNS = [
    { label: 'Name', flex: 3 },
    { label: 'Owner', flex: 2 },
    { label: 'Date modified', flex: 2 },
    { label: 'File size', flex: 1 },
]

const TRASH_COLUMNS = [
    { label: 'Name', flex: 3 },
    { label: 'Date deleted', flex: 2 },
    { label: 'File size', flex: 1 },
]

function ListView({ items, isTrash }: { items: DriveItemView[]; isTrash: boolean }) {
    const folders = items.filter(i => i.isFolder)
    const files = items.filter(i => !i.isFolder)

    return (
        <View style={styles.listContainer}>
            <DataTableHeader columns={isTrash ? TRASH_COLUMNS : DRIVE_COLUMNS} />
            {folders.map(item =>
                isTrash ? (
                    <DriveContextMenu key={item.id} item={item}>
                        <TrashListRow item={item} />
                    </DriveContextMenu>
                ) : (
                    <DriveContextMenu key={item.id} item={item}>
                        <FilesListRow item={item} />
                    </DriveContextMenu>
                )
            )}
            {files.map(item =>
                isTrash ? (
                    <DriveContextMenu key={item.id} item={item}>
                        <TrashListRow item={item} />
                    </DriveContextMenu>
                ) : (
                    <DriveContextMenu key={item.id} item={item}>
                        <FilesListRow item={item} />
                    </DriveContextMenu>
                )
            )}
        </View>
    )
}

function FilesListRow({ item }: { item: DriveItemView }) {
    const theme = useTheme()
    const { selectedItemId, selectItem, openPreview, navigateToFolder } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, theme.color8.val)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => {
        if (item.isFolder) navigateToFolder(item.id)
        else openPreview(item)
    }, [item, openPreview, navigateToFolder])
    const handlePress = useDoubleClick(handleSingle, handleDouble)

    return (
        <Pressable
            onPress={handlePress}
            style={[
                styles.listRow,
                { borderBottomColor: theme.borderColor.val },
                isSelected && { backgroundColor: `${theme.activeIndicator.val}12` },
            ]}
        >
            <View style={[styles.nameCell, { flex: 3 }]}>
                <FileIcon size={20} color={iconColor} />
                <Text style={[styles.nameText, { color: theme.color.val }]} numberOfLines={1}>
                    {item.name}
                </Text>
                {item.starred && (
                    <Star size={14} color={theme.yellow8.val} fill={theme.yellow8.val} />
                )}
            </View>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 2 }]} numberOfLines={1}>
                {item.owner}
            </Text>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 2 }]}>
                {formatDate(item.updated)}
            </Text>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 1 }]}>
                {item.isFolder ? '—' : formatBytes(item.size)}
            </Text>
        </Pressable>
    )
}

function TrashListRow({ item }: { item: DriveItemView }) {
    const theme = useTheme()
    const { selectedItemId, selectItem } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, theme.color8.val)

    return (
        <Pressable
            onPress={() => selectItem(item.id)}
            style={[
                styles.listRow,
                { borderBottomColor: theme.borderColor.val },
                isSelected && { backgroundColor: `${theme.activeIndicator.val}12` },
            ]}
        >
            <View style={[styles.nameCell, { flex: 3 }]}>
                <FileIcon size={20} color={iconColor} />
                <Text style={[styles.nameText, { color: theme.color.val }]} numberOfLines={1}>
                    {item.name}
                </Text>
            </View>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 2 }]}>
                {formatDate(item.trashedAt)}
            </Text>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 1 }]}>
                {item.isFolder ? '—' : formatBytes(item.size)}
            </Text>
        </Pressable>
    )
}

const GRID_GAP = 12
const GRID_PADDING = 16
const CARD_MIN = 200

function useGridLayout() {
    const [cardWidth, setCardWidth] = useState(CARD_MIN)
    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width - GRID_PADDING * 2
        const cols = Math.max(1, Math.floor((w + GRID_GAP) / (CARD_MIN + GRID_GAP)))
        setCardWidth(Math.floor((w - GRID_GAP * (cols - 1)) / cols))
    }, [])
    return { cardWidth, onLayout }
}

function GridView({ items }: { items: DriveItemView[] }) {
    const folders = items.filter(i => i.isFolder)
    const files = items.filter(i => !i.isFolder)
    const { cardWidth, onLayout } = useGridLayout()

    return (
        <View style={styles.gridContainer} onLayout={onLayout}>
            {folders.length > 0 && (
                <View style={styles.gridSection}>
                    <GridSectionHeader title="Folders" />
                    <View style={styles.gridWrap}>
                        {folders.map(item => (
                            <View key={item.id} style={{ width: cardWidth }}>
                                <DriveContextMenu item={item}>
                                    <FolderGridCard item={item} />
                                </DriveContextMenu>
                            </View>
                        ))}
                    </View>
                </View>
            )}
            {files.length > 0 && (
                <View style={styles.gridSection}>
                    <GridSectionHeader title="Files" />
                    <View style={styles.gridWrap}>
                        {files.map(item => (
                            <View key={item.id} style={{ width: cardWidth }}>
                                <DriveContextMenu item={item}>
                                    <FileGridCard item={item} />
                                </DriveContextMenu>
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </View>
    )
}

function GridSectionHeader({ title }: { title: string }) {
    const theme = useTheme()
    return <Text style={[styles.gridSectionTitle, { color: theme.color8.val }]}>{title}</Text>
}

function FolderGridCard({ item }: { item: DriveItemView }) {
    const theme = useTheme()
    const { selectedItemId, selectItem, navigateToFolder } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, theme.color8.val)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => navigateToFolder(item.id), [item.id, navigateToFolder])
    const handlePress = useDoubleClick(handleSingle, handleDouble)

    return (
        <Pressable
            onPress={handlePress}
            style={[
                styles.folderCard,
                { borderColor: theme.borderColor.val },
                isSelected && { borderColor: theme.activeIndicator.val, borderWidth: 2 },
            ]}
        >
            <FileIcon size={20} color={iconColor} />
            <Text style={[styles.cardName, { color: theme.color.val }]} numberOfLines={1}>
                {item.name}
            </Text>
        </Pressable>
    )
}

function FileGridCard({ item }: { item: DriveItemView }) {
    const theme = useTheme()
    const { selectedItemId, selectItem, openPreview } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, theme.color8.val)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => openPreview(item), [item, openPreview])
    const handlePress = useDoubleClick(handleSingle, handleDouble)

    return (
        <Pressable
            onPress={handlePress}
            style={[
                styles.fileCard,
                { borderColor: theme.borderColor.val },
                isSelected && { borderColor: theme.activeIndicator.val, borderWidth: 2 },
            ]}
        >
            <View style={[styles.fileCardHeader, { borderBottomColor: theme.borderColor.val }]}>
                <FileIcon size={18} color={iconColor} />
                <Text style={[styles.cardName, { color: theme.color.val }]} numberOfLines={1}>
                    {item.name}
                </Text>
            </View>
            <View style={[styles.fileCardBody, { backgroundColor: `${theme.color8.val}08` }]}>
                <Thumbnail item={item} size={120} />
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    listContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    nameCell: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    nameText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    cellText: {
        fontSize: 13,
    },
    gridContainer: {
        flex: 1,
        padding: 16,
    },
    gridSection: {
        marginBottom: 20,
    },
    gridSectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
    },
    gridWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    folderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 8,
    },
    fileCard: {
        borderWidth: 1,
        borderRadius: 8,
        overflow: 'hidden',
    },
    fileCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    fileCardBody: {
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardName: {
        fontSize: 13,
        fontWeight: '500',
        flex: 1,
    },
})
