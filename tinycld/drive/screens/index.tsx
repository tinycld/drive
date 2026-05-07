import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { DataTableHeader } from '@tinycld/core/components/DataTableHeader'
import { EmptyState } from '@tinycld/core/components/EmptyState'
import { rowFocusStyle } from '@tinycld/core/components/focusable-row'
import { HoverAction } from '@tinycld/core/components/HoverAction'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { RowHoverActions } from '@tinycld/core/components/RowHoverActions'
import { StarIcon } from '@tinycld/core/components/StarIcon'
import { ConfirmTrash } from '@tinycld/core/components/SuretyGuard'
import { SwipeableRow, SwipeableRowProvider } from '@tinycld/core/components/SwipeableRow'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { formatBytes, formatDate } from '@tinycld/core/lib/format-utils'
import { queryClient } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Download, Star, Trash2 } from 'lucide-react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    type GestureResponderEvent,
    Image,
    type LayoutChangeEvent,
    Platform,
    Pressable,
    RefreshControl,
    Text,
    View,
} from 'react-native'
import { DriveContextMenu } from '../components/DriveContextMenu'
import { getFileIcon } from '../components/file-icons'
import { Thumbnail } from '../components/Thumbnail'
import { UploadingGridCard } from '../components/UploadingGridCard'
import { UploadingListRow } from '../components/UploadingListRow'
import { useDoubleClick } from '../hooks/useDoubleClick'
import { useDrive } from '../hooks/useDrive'
import { type RowData, useDriveRows } from '../hooks/useDriveRows'
import { useDriveShortcuts } from '../hooks/useDriveShortcuts'
import { useFileSelection } from '../hooks/useFileSelection'
import { driveItemToSource } from '../lib/file-url'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView } from '../types'

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

const GRID_GAP = 12
const GRID_PADDING = 16
const CARD_MIN_DESKTOP = 200
const CARD_MIN_MOBILE = 150

interface GridLayout {
    cols: number
    cardWidth: number
    onLayout: (e: LayoutChangeEvent) => void
}

function useGridLayout(isMobile: boolean): GridLayout {
    const cardMin = isMobile ? CARD_MIN_MOBILE : CARD_MIN_DESKTOP
    const [width, setWidth] = useState(0)
    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setWidth((prev) => {
            const next = e.nativeEvent.layout.width
            return prev === next ? prev : next
        })
    }, [])
    const { cols, cardWidth } = useMemo(() => {
        if (width <= 0) return { cols: 2, cardWidth: cardMin }
        const inner = width - GRID_PADDING * 2
        const c = Math.max(2, Math.floor((inner + GRID_GAP) / (cardMin + GRID_GAP)))
        const w = Math.floor((inner - GRID_GAP * (c - 1)) / c)
        return { cols: c, cardWidth: w }
    }, [width, cardMin])
    return { cols, cardWidth, onLayout }
}

export default function DriveScreen() {
    const drive = useDrive()
    const {
        viewMode,
        activeSection,
        currentFolderId,
        currentItems,
        searchQuery,
        isSearching,
        isLoading,
        navigateToFolder,
        openPreview,
        openPrompt,
        dismissUpload,
    } = drive
    const isSearchActive = searchQuery.length >= 2
    const isTrash = activeSection === 'trash'
    const isMobile = useBreakpoint() === 'mobile'

    // Theme colors are global — read once at the screen level so all rows share
    // the same JS-side cache. Each useThemeColor call hits getComputedStyle on
    // the document element; doing that 3-4× per row × 50 rows would re-pay the
    // cost on every toggle.
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('active-indicator')

    const [isRefreshing, setIsRefreshing] = useState(false)
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true)
        try {
            await queryClient.invalidateQueries()
        } finally {
            setIsRefreshing(false)
        }
    }, [])

    const { folders, files } = useMemo(
        () => ({
            folders: currentItems.filter((i) => i.isFolder),
            files: currentItems.filter((i) => !i.isFolder),
        }),
        [currentItems]
    )

    const { cols, cardWidth, onLayout } = useGridLayout(isMobile)
    const data = useDriveRows({ folders, files, viewMode })

    // Navigable items power keyboard nav and shift-range selection. Skips
    // upload placeholders since they aren't actionable.
    const navigableItems = useMemo(
        () => [...folders, ...files.filter((i) => !i.uploadStatus)],
        [folders, files]
    )
    const orderedIds = useMemo(() => navigableItems.map((i) => i.id), [navigableItems])
    const { handleSelect, isSelected } = useFileSelection(orderedIds)
    const selectToggle = useDriveUIStore((s) => s.selectToggle)
    const { focusedId } = useDriveShortcuts({
        items: navigableItems,
        toggleSelect: selectToggle,
        openItem: (item) => {
            if (item.isFolder) navigateToFolder(item.id)
            else openPreview(item)
        },
        onNewFolder: () => openPrompt({ type: 'new-folder' }),
        isEnabled: !isTrash,
        listKey: `${activeSection}:${currentFolderId}`,
    })

    // Map item id → row index so j/k navigation can scroll the focused row
    // into view. Items that live inside a multi-column grid row map to that
    // row's index — FlashList scrolls the row, the cell stays visible.
    const indexByItemId = useMemo(() => {
        const m = new Map<string, number>()
        data.forEach((row, i) => {
            if (row.kind === 'list-item' || row.kind === 'grid-item') {
                m.set(row.item.id, i)
            }
        })
        return m
    }, [data])

    const flashListRef = useRef<FlashListRef<RowData>>(null)
    useEffect(() => {
        if (!focusedId) return
        const index = indexByItemId.get(focusedId)
        if (index == null) return
        flashListRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true })
    }, [focusedId, indexByItemId])

    const numColumns = viewMode === 'grid' ? cols : 1

    // Each row kind gets its own recycling pool so list rows and grid cards
    // don't compete for the same recycled DOM nodes.
    const getItemType = useCallback((row: RowData) => row.kind, [])

    // Section labels span the full row in grid mode.
    const overrideItemLayout = useCallback(
        (layout: { span?: number }, row: RowData) => {
            if (row.kind === 'section-label') {
                layout.span = numColumns
            }
        },
        [numColumns]
    )

    const keyExtractor = useCallback((row: RowData, index: number) => keyForRow(row, index), [])

    const renderItem = useCallback(
        ({ item: row }: { item: RowData }) => {
            switch (row.kind) {
                case 'section-label':
                    return <GridSectionHeader title={row.title} />
                case 'list-item': {
                    const item = row.item
                    if (item.uploadStatus) {
                        return <UploadingListRow item={item} onDismiss={dismissUpload} />
                    }
                    if (isTrash) {
                        return (
                            <DriveContextMenu item={item}>
                                <TrashListRow
                                    item={item}
                                    isSelected={isSelected(item.id)}
                                    onSelect={handleSelect}
                                    isMobile={isMobile}
                                    mutedColor={mutedColor}
                                    activeIndicator={activeIndicator}
                                />
                            </DriveContextMenu>
                        )
                    }
                    return (
                        <DriveContextMenu item={item}>
                            <FilesListRow
                                item={item}
                                index={row.index}
                                isSelected={isSelected(item.id)}
                                isFocused={item.id === focusedId}
                                onSelect={handleSelect}
                                isMobile={isMobile}
                                mutedColor={mutedColor}
                                borderColor={borderColor}
                                activeIndicator={activeIndicator}
                            />
                        </DriveContextMenu>
                    )
                }
                case 'grid-item': {
                    const item = row.item
                    return (
                        <View style={{ paddingHorizontal: GRID_GAP / 2, paddingBottom: GRID_GAP }}>
                            {item.uploadStatus ? (
                                <UploadingGridCard item={item} onDismiss={dismissUpload} />
                            ) : (
                                <DriveContextMenu item={item}>
                                    {item.isFolder ? (
                                        <FolderGridCard
                                            item={item}
                                            isSelected={isSelected(item.id)}
                                            onSelect={handleSelect}
                                            isMobile={isMobile}
                                            mutedColor={mutedColor}
                                        />
                                    ) : (
                                        <FileGridCard
                                            item={item}
                                            isSelected={isSelected(item.id)}
                                            onSelect={handleSelect}
                                            isMobile={isMobile}
                                            mutedColor={mutedColor}
                                        />
                                    )}
                                </DriveContextMenu>
                            )}
                        </View>
                    )
                }
            }
        },
        [
            isTrash,
            isMobile,
            mutedColor,
            borderColor,
            activeIndicator,
            focusedId,
            handleSelect,
            isSelected,
            dismissUpload,
        ]
    )

    if (isSearching) {
        return <LoadingState message="Searching…" />
    }

    if (isLoading && currentItems.length === 0) {
        return <LoadingState />
    }

    if (currentItems.length === 0) {
        let message = 'No files in this location'
        if (isSearchActive) message = `No results for "${searchQuery}"`
        else if (isTrash) message = 'Trash is empty'
        return <EmptyState message={message} />
    }

    const showColumnHeader = viewMode === 'list' && !isMobile

    return (
        <SwipeableRowProvider>
            <View className="flex-1" onLayout={onLayout}>
                {/* Column header lives above the FlashList rather than as
                    data[0] + stickyHeaderIndices. RN Web's sticky impl
                    double-rendered the cell, painting the overlay on top
                    of the unhidden in-flow row ("NAMEAME / OOWWNNEEER").
                    Sitting above the scroll area pins it naturally. */}
                {showColumnHeader && (
                    <View style={{ paddingHorizontal: 16 }}>
                        <DataTableHeader columns={isTrash ? TRASH_COLUMNS : DRIVE_COLUMNS} />
                    </View>
                )}
                <FlashList<RowData>
                    ref={flashListRef}
                    data={data}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    getItemType={getItemType}
                    overrideItemLayout={overrideItemLayout}
                    numColumns={numColumns}
                    contentContainerStyle={
                        viewMode === 'list'
                            ? { paddingHorizontal: isMobile ? 0 : 16 }
                            : { paddingHorizontal: GRID_PADDING - GRID_GAP / 2 }
                    }
                    refreshControl={
                        isMobile ? (
                            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
                        ) : undefined
                    }
                    // Bumping extraData on every viewMode/cardWidth/isMobile
                    // change tells FlashList to re-render its rows; without it
                    // recycled cells in list mode kept their grid-mode
                    // dimensions after a list↔grid toggle.
                    extraData={`${viewMode}:${cardWidth}:${isMobile ? 'm' : 'd'}`}
                />
            </View>
        </SwipeableRowProvider>
    )
}

function keyForRow(row: RowData, index: number): string {
    switch (row.kind) {
        case 'section-label':
            return `__section_${row.title}__`
        case 'list-item':
        case 'grid-item':
            return row.item.id
        default:
            return `__row_${index}__`
    }
}

interface SelectableRowProps {
    isSelected: boolean
    onSelect: (itemId: string, event: GestureResponderEvent) => void
}

interface RowThemeProps {
    isMobile: boolean
    mutedColor: string
    borderColor: string
    activeIndicator: string
}

const FilesListRow = memo(FilesListRowImpl)
function FilesListRowImpl({
    item,
    index,
    isSelected,
    isFocused,
    onSelect,
    isMobile,
    mutedColor,
    borderColor,
    activeIndicator,
}: { item: DriveItemView; index: number; isFocused?: boolean } & SelectableRowProps & RowThemeProps) {
    const { openPreview, navigateToFolder, toggleStar, downloadItem, moveToTrash } = useDrive()
    const [isHovered, setIsHovered] = useState(false)

    const handleSingle = useCallback((event: GestureResponderEvent) => onSelect(item.id, event), [item.id, onSelect])
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
                className="flex-row items-center px-4 py-3 border-b border-border gap-3"
            >
                <ListRowThumbnail item={item} size={40} fallbackIconSize={24} mutedColor={mutedColor} />
                <View className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-foreground" style={{ fontSize: 16, fontWeight: '500' }}>
                        {item.name}
                    </Text>
                    <Text numberOfLines={1} className="text-muted-foreground" style={{ fontSize: 12 }}>
                        {formatDate(item.updated)}
                        {item.isFolder ? '' : ` · ${formatBytes(item.size)}`}
                    </Text>
                </View>
                <Pressable
                    className="p-1"
                    onPress={(e) => {
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

    const effectStyle = rowFocusStyle({ isFocused, isHovered, borderColor, activeIndicator })

    return (
        <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} ${item.owner} ${formatDate(item.updated)}`}
            className={`flex-row items-center px-3 py-2.5 border-b border-border ${isSelected ? '' : 'bg-background'}`}
            style={[isSelected ? { backgroundColor: `${activeIndicator}12` } : null, effectStyle]}
            {...hoverWebProps}
        >
            <View className="flex-row items-center" style={{ gap: 10, flex: 3 }}>
                <ListRowThumbnail item={item} size={28} fallbackIconSize={20} mutedColor={mutedColor} />
                <Text
                    numberOfLines={1}
                    className="flex-1 text-foreground"
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                    }}
                >
                    {item.name}
                </Text>
            </View>
            <Text numberOfLines={1} className="text-muted-foreground" style={{ fontSize: 12, flex: 2 }}>
                {item.owner}
            </Text>
            <Text className="text-muted-foreground" style={{ fontSize: 12, flex: 2 }}>
                {formatDate(item.updated)}
            </Text>
            <Text className="text-muted-foreground" style={{ fontSize: 12, flex: 1 }}>
                {item.isFolder ? '—' : formatBytes(item.size)}
            </Text>
            <RowHoverActions
                isHovered={isHovered}
                width={80}
                rest={
                    <Pressable
                        style={{ padding: 4 }}
                        onPress={(e) => {
                            e.stopPropagation()
                            toggleStar(item.id)
                        }}
                    >
                        <StarIcon isStarred={item.starred} size={16} />
                    </Pressable>
                }
                hover={
                    <>
                        <ConfirmTrash itemName={item.name} onConfirmed={() => moveToTrash(item.id)}>
                            {(onOpen) => (
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
                    </>
                }
            />
        </Pressable>
    )
}

const ListRowThumbnail = memo(ListRowThumbnailImpl)
function ListRowThumbnailImpl({
    item,
    size,
    fallbackIconSize,
    mutedColor,
}: {
    item: DriveItemView
    size: number
    fallbackIconSize: number
    mutedColor: string
}) {
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)
    const { url: thumbnailUrl } = useAuthedThumbnailURL(
        item.isFolder ? undefined : driveItemToSource(item),
        `${size * 2}x${size * 2}`
    )

    if (!thumbnailUrl) {
        return (
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <FileIcon size={fallbackIconSize} color={iconColor} />
            </View>
        )
    }

    return (
        <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: size, height: size, borderRadius: 4 }}
            resizeMode="cover"
        />
    )
}

const TrashListRow = memo(TrashListRowImpl)
function TrashListRowImpl({
    item,
    isSelected,
    onSelect,
    isMobile,
    mutedColor,
    activeIndicator,
}: { item: DriveItemView } & SelectableRowProps & {
    isMobile: boolean
    mutedColor: string
    activeIndicator: string
}) {
    if (isMobile) {
        return (
            <Pressable
                onPress={(e) => onSelect(item.id, e)}
                className="flex-row items-center px-4 py-3 border-b border-border gap-3"
            >
                <ListRowThumbnail item={item} size={40} fallbackIconSize={24} mutedColor={mutedColor} />
                <View className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-foreground" style={{ fontSize: 16, fontWeight: '500' }}>
                        {item.name}
                    </Text>
                    <Text numberOfLines={1} className="text-muted-foreground" style={{ fontSize: 12 }}>
                        Deleted {formatDate(item.trashedAt)}
                        {item.isFolder ? '' : ` · ${formatBytes(item.size)}`}
                    </Text>
                </View>
            </Pressable>
        )
    }

    return (
        <Pressable
            onPress={(e) => onSelect(item.id, e)}
            className="flex-row items-center px-3 py-2.5 border-b border-border"
            style={isSelected ? { backgroundColor: `${activeIndicator}12` } : undefined}
        >
            <View className="flex-row items-center" style={{ gap: 10, flex: 3 }}>
                <ListRowThumbnail item={item} size={28} fallbackIconSize={20} mutedColor={mutedColor} />
                <Text
                    numberOfLines={1}
                    className="flex-1 text-foreground"
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                    }}
                >
                    {item.name}
                </Text>
            </View>
            <Text className="text-muted-foreground" style={{ fontSize: 12, flex: 2 }}>
                {formatDate(item.trashedAt)}
            </Text>
            <Text className="text-muted-foreground" style={{ fontSize: 12, flex: 1 }}>
                {item.isFolder ? '—' : formatBytes(item.size)}
            </Text>
        </Pressable>
    )
}

function GridSectionHeader({ title }: { title: string }) {
    return (
        <Text
            className="uppercase text-muted-foreground"
            style={{
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.5,
                marginTop: 8,
                marginBottom: 10,
                paddingHorizontal: GRID_GAP / 2,
            }}
        >
            {title}
        </Text>
    )
}

interface GridCardThemeProps {
    isMobile: boolean
    mutedColor: string
}

const FolderGridCard = memo(FolderGridCardImpl)
function FolderGridCardImpl({
    item,
    isSelected,
    onSelect,
    isMobile,
    mutedColor,
}: { item: DriveItemView } & SelectableRowProps & GridCardThemeProps) {
    const { navigateToFolder } = useDrive()
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)

    const handleSingle = useCallback((event: GestureResponderEvent) => onSelect(item.id, event), [item.id, onSelect])
    const handleDouble = useCallback(() => navigateToFolder(item.id), [item.id, navigateToFolder])
    const handleDesktopPress = useDoubleClick(handleSingle, handleDouble)
    const handlePress = isMobile ? handleDouble : handleDesktopPress

    return (
        <Pressable
            onPress={handlePress}
            className={`flex-row items-center gap-2.5 px-3 py-2.5 rounded-lg border ${isSelected ? 'border-2 border-active-indicator' : 'border-border'}`}
        >
            <FileIcon size={20} color={iconColor} />
            <Text numberOfLines={1} className="flex-1 text-xs font-medium text-foreground">
                {item.name}
            </Text>
        </Pressable>
    )
}

const FileGridCard = memo(FileGridCardImpl)
function FileGridCardImpl({
    item,
    isSelected,
    onSelect,
    isMobile,
    mutedColor,
}: { item: DriveItemView } & SelectableRowProps & GridCardThemeProps) {
    const { openPreview } = useDrive()
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)

    const handleSingle = useCallback((event: GestureResponderEvent) => onSelect(item.id, event), [item.id, onSelect])
    const handleDouble = useCallback(() => openPreview(item), [item, openPreview])
    const handleDesktopPress = useDoubleClick(handleSingle, handleDouble)
    const handlePress = isMobile ? handleDouble : handleDesktopPress

    return (
        <Pressable
            onPress={handlePress}
            className={`rounded-lg overflow-hidden border ${isSelected ? 'border-2 border-active-indicator' : 'border-border'}`}
        >
            <View className="flex-row items-center gap-2 px-2.5 py-2 border-b border-border">
                <FileIcon size={18} color={iconColor} />
                <Text numberOfLines={1} className="flex-1 text-xs font-medium text-foreground">
                    {item.name}
                </Text>
            </View>
            <View className="items-center justify-center bg-muted-foreground/5" style={{ height: 120 }}>
                <Thumbnail item={item} size={120} />
            </View>
        </Pressable>
    )
}
