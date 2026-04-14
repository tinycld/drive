import { Download, Star, Trash2 } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { type LayoutChangeEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { DataTableHeader } from '~/components/DataTableHeader'
import { EmptyState } from '~/components/EmptyState'
import { HoverAction } from '~/components/HoverAction'
import { StarIcon } from '~/components/StarIcon'
import { ConfirmTrash } from '~/components/SuretyGuard'
import { SwipeableRow, SwipeableRowProvider } from '~/components/SwipeableRow'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { formatBytes, formatDate } from '~/lib/format-utils'
import { useThemeColor } from '~/lib/use-app-theme'
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
    { label: '', width: 80 },
]

const TRASH_COLUMNS = [
    { label: 'Name', flex: 3 },
    { label: 'Date deleted', flex: 2 },
    { label: 'File size', flex: 1 },
]

function ListView({ items, isTrash }: { items: DriveItemView[]; isTrash: boolean }) {
    const isMobile = useBreakpoint() === 'mobile'
    const folders = items.filter(i => i.isFolder)
    const files = items.filter(i => !i.isFolder)

    return (
        <SwipeableRowProvider>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: isMobile ? 0 : 16 }}
            >
                {!isMobile && <DataTableHeader columns={isTrash ? TRASH_COLUMNS : DRIVE_COLUMNS} />}
                {folders.map((item, i) =>
                    isTrash ? (
                        <DriveContextMenu key={item.id} item={item}>
                            <TrashListRow item={item} />
                        </DriveContextMenu>
                    ) : (
                        <DriveContextMenu key={item.id} item={item}>
                            <FilesListRow item={item} index={i} />
                        </DriveContextMenu>
                    )
                )}
                {files.map((item, i) =>
                    isTrash ? (
                        <DriveContextMenu key={item.id} item={item}>
                            <TrashListRow item={item} />
                        </DriveContextMenu>
                    ) : (
                        <DriveContextMenu key={item.id} item={item}>
                            <FilesListRow item={item} index={folders.length + i} />
                        </DriveContextMenu>
                    )
                )}
            </ScrollView>
        </SwipeableRowProvider>
    )
}

function FilesListRow({ item, index }: { item: DriveItemView; index: number }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const bgColor = useThemeColor('background')
    const activeIndicator = useThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const {
        selectedItemId,
        selectItem,
        openPreview,
        navigateToFolder,
        toggleStar,
        downloadItem,
        moveToTrash,
    } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)
    const [isHovered, setIsHovered] = useState(false)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => {
        if (item.isFolder) navigateToFolder(item.id)
        else openPreview(item)
    }, [item, openPreview, navigateToFolder])
    const handlePress = useDoubleClick(handleSingle, handleDouble)

    const handleMobilePress = useCallback(() => {
        if (item.isFolder) navigateToFolder(item.id)
        else openPreview(item)
    }, [item, openPreview, navigateToFolder])

    const hoverWebProps =
        Platform.OS === 'web' && !isMobile
            ? {
                  onMouseEnter: () => setIsHovered(true),
                  onMouseLeave: () => setIsHovered(false),
              }
            : {}

    const tooltipPosition = index === 0 ? ('below' as const) : ('above' as const)

    const yellowColor = '#facc15'

    const swipeActions = [
        {
            icon: Trash2,
            label: 'Delete',
            onPress: () => moveToTrash(item.id),
            backgroundColor: '#ef4444',
        },
        {
            icon: Download,
            label: 'Download',
            onPress: () => downloadItem(item.id),
            backgroundColor: '#3b82f6',
        },
        {
            icon: Star,
            label: item.starred ? 'Unstar' : 'Star',
            onPress: () => toggleStar(item.id),
            backgroundColor: yellowColor,
        },
    ]

    if (isMobile) {
        const mobileRow = (
            <Pressable
                onPress={handleMobilePress}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    gap: 12,
                }}
            >
                <FileIcon size={24} color={iconColor} />
                <View className="flex-1 gap-0.5">
                    <Text
                        numberOfLines={1}
                        style={{ fontSize: 16, fontWeight: '500', color: fgColor }}
                    >
                        {item.name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: mutedColor }}>
                        {formatDate(item.updated)}
                        {item.isFolder ? '' : ` · ${formatBytes(item.size)}`}
                    </Text>
                </View>
                <Pressable
                    className="p-1"
                    onPress={e => {
                        e.stopPropagation()
                        toggleStar(item.id)
                    }}
                >
                    <StarIcon isStarred={item.starred} size={18} />
                </Pressable>
            </Pressable>
        )

        return <SwipeableRow actions={swipeActions}>{mobileRow}</SwipeableRow>
    }

    return (
        <Pressable
            onPress={handlePress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                backgroundColor: isSelected ? `${activeIndicator}12` : bgColor,
            }}
            {...hoverWebProps}
        >
            <View className="flex-row items-center" style={{ gap: 10, flex: 3 }}>
                <FileIcon size={20} color={iconColor} />
                <Text
                    numberOfLines={1}
                    className="flex-1"
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 12, color: mutedColor, flex: 2 }}>
                {item.owner}
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor, flex: 2 }}>
                {formatDate(item.updated)}
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor, flex: 1 }}>
                {item.isFolder ? '\u2014' : formatBytes(item.size)}
            </Text>
            <View
                className="relative items-end justify-center"
                style={{
                    width: 80,
                    flexShrink: 0,
                }}
            >
                <Pressable
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: bgColor,
                        ...(isHovered ? {} : { opacity: 0, pointerEvents: 'none' as const }),
                    }}
                    onPress={e => e.stopPropagation()}
                >
                    <ConfirmTrash itemName={item.name} onConfirmed={() => moveToTrash(item.id)}>
                        {onOpen => (
                            <HoverAction
                                icon={Trash2}
                                label="Delete"
                                onPress={onOpen}
                                tooltipPosition={tooltipPosition}
                            />
                        )}
                    </ConfirmTrash>
                    <HoverAction
                        icon={Download}
                        label="Download"
                        onPress={() => downloadItem(item.id)}
                        tooltipPosition={tooltipPosition}
                    />
                    <HoverAction
                        icon={Star}
                        label={item.starred ? 'Unstar' : 'Star'}
                        onPress={() => toggleStar(item.id)}
                        iconColor={item.starred ? mutedColor : yellowColor}
                        iconFill={item.starred ? 'transparent' : yellowColor}
                        tooltipPosition={tooltipPosition}
                    />
                </Pressable>
                <Pressable
                    style={{
                        padding: 4,
                        ...(isHovered ? { opacity: 0, pointerEvents: 'none' as const } : {}),
                    }}
                    onPress={e => {
                        e.stopPropagation()
                        toggleStar(item.id)
                    }}
                >
                    <StarIcon isStarred={item.starred} size={16} />
                </Pressable>
            </View>
        </Pressable>
    )
}

function TrashListRow({ item }: { item: DriveItemView }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const { selectedItemId, selectItem } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)

    if (isMobile) {
        return (
            <Pressable
                onPress={() => selectItem(item.id)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    gap: 12,
                }}
            >
                <FileIcon size={24} color={iconColor} />
                <View className="flex-1 gap-0.5">
                    <Text
                        numberOfLines={1}
                        style={{ fontSize: 16, fontWeight: '500', color: fgColor }}
                    >
                        {item.name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: mutedColor }}>
                        Deleted {formatDate(item.trashedAt)}
                        {item.isFolder ? '' : ` · ${formatBytes(item.size)}`}
                    </Text>
                </View>
            </Pressable>
        )
    }

    return (
        <Pressable
            onPress={() => selectItem(item.id)}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                ...(isSelected ? { backgroundColor: `${activeIndicator}12` } : {}),
            }}
        >
            <View className="flex-row items-center" style={{ gap: 10, flex: 3 }}>
                <FileIcon size={20} color={iconColor} />
                <Text
                    numberOfLines={1}
                    className="flex-1"
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
            </View>
            <Text style={{ fontSize: 12, color: mutedColor, flex: 2 }}>
                {formatDate(item.trashedAt)}
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor, flex: 1 }}>
                {item.isFolder ? '\u2014' : formatBytes(item.size)}
            </Text>
        </Pressable>
    )
}

const GRID_GAP = 12
const GRID_PADDING = 16
const CARD_MIN_DESKTOP = 200
const CARD_MIN_MOBILE = 150

function useGridLayout() {
    const isMobile = useBreakpoint() === 'mobile'
    const cardMin = isMobile ? CARD_MIN_MOBILE : CARD_MIN_DESKTOP
    const [cardWidth, setCardWidth] = useState(cardMin)
    const onLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const w = e.nativeEvent.layout.width - GRID_PADDING * 2
            const cols = Math.max(2, Math.floor((w + GRID_GAP) / (cardMin + GRID_GAP)))
            setCardWidth(Math.floor((w - GRID_GAP * (cols - 1)) / cols))
        },
        [cardMin]
    )
    return { cardWidth, onLayout }
}

function GridView({ items }: { items: DriveItemView[] }) {
    const folders = items.filter(i => i.isFolder)
    const files = items.filter(i => !i.isFolder)
    const { cardWidth, onLayout } = useGridLayout()

    return (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }} onLayout={onLayout}>
            {folders.length > 0 && (
                <View className="mb-5">
                    <GridSectionHeader title="Folders" />
                    <View className="flex-row flex-wrap gap-3">
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
                <View className="mb-5">
                    <GridSectionHeader title="Files" />
                    <View className="flex-row flex-wrap gap-3">
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
        </ScrollView>
    )
}

function GridSectionHeader({ title }: { title: string }) {
    const mutedColor = useThemeColor('muted-foreground')

    return (
        <Text
            className="uppercase"
            style={{
                fontSize: 12,
                fontWeight: '600',
                color: mutedColor,
                letterSpacing: 0.5,
                marginBottom: 10,
            }}
        >
            {title}
        </Text>
    )
}

function FolderGridCard({ item }: { item: DriveItemView }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const { selectedItemId, selectItem, navigateToFolder } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => navigateToFolder(item.id), [item.id, navigateToFolder])
    const handleDesktopPress = useDoubleClick(handleSingle, handleDouble)
    const handlePress = isMobile ? handleDouble : handleDesktopPress

    return (
        <Pressable
            onPress={handlePress}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: isSelected ? 2 : 1,
                borderRadius: 8,
                borderColor: isSelected ? activeIndicator : borderColor,
            }}
        >
            <FileIcon size={20} color={iconColor} />
            <Text
                numberOfLines={1}
                className="flex-1"
                style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: fgColor,
                }}
            >
                {item.name}
            </Text>
        </Pressable>
    )
}

function FileGridCard({ item }: { item: DriveItemView }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const { selectedItemId, selectItem, openPreview } = useDrive()
    const isSelected = selectedItemId === item.id
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)

    const handleSingle = useCallback(() => selectItem(item.id), [item.id, selectItem])
    const handleDouble = useCallback(() => openPreview(item), [item, openPreview])
    const handleDesktopPress = useDoubleClick(handleSingle, handleDouble)
    const handlePress = isMobile ? handleDouble : handleDesktopPress

    return (
        <Pressable
            onPress={handlePress}
            className="rounded-lg overflow-hidden"
            style={{
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? activeIndicator : borderColor,
            }}
        >
            <View
                className="flex-row items-center gap-2"
                style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <FileIcon size={18} color={iconColor} />
                <Text
                    numberOfLines={1}
                    className="flex-1"
                    style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
            </View>
            <View
                className="items-center justify-center"
                style={{
                    height: 120,
                    backgroundColor: `${mutedColor}08`,
                }}
            >
                <Thumbnail item={item} size={120} />
            </View>
        </Pressable>
    )
}
