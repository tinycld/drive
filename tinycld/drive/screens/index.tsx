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
import { formatBytes, formatDate } from '@tinycld/core/lib/format-utils'
import { queryClient } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Download, Star, Trash2 } from 'lucide-react-native'
import { memo, useCallback, useMemo, useState } from 'react'
import {
    type GestureResponderEvent,
    Image,
    type LayoutChangeEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
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
import { useDriveShortcuts } from '../hooks/useDriveShortcuts'
import { useFileSelection } from '../hooks/useFileSelection'
import { driveItemToSource } from '../lib/file-url'
import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView } from '../types'

export default function DriveScreen() {
    const { viewMode, activeSection, currentItems, searchQuery, isSearching, isLoading } = useDrive()
    const isSearchActive = searchQuery.length >= 2
    const isTrash = activeSection === 'trash'

    const [isRefreshing, setIsRefreshing] = useState(false)
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true)
        try {
            await queryClient.invalidateQueries()
        } finally {
            setIsRefreshing(false)
        }
    }, [])

    // Track which views the user has visited so we can keep them mounted.
    // Toggling list↔grid otherwise unmounts ~60 rows and remounts ~60 cards
    // (or vice versa); on a populated folder that's 500ms+ of pure React
    // commit work. Once a view has been mounted we hide it via display:none
    // instead of unmounting, so subsequent toggles are a CSS-level swap.
    const [visitedList, setVisitedList] = useState(viewMode === 'list')
    const [visitedGrid, setVisitedGrid] = useState(viewMode === 'grid')
    if (viewMode === 'list' && !visitedList) setVisitedList(true)
    if (viewMode === 'grid' && !visitedGrid) setVisitedGrid(true)

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

    return (
        <>
            {visitedList && (
                <HiddenView isHidden={viewMode !== 'list'}>
                    <ListView
                        items={currentItems}
                        isTrash={isTrash}
                        isRefreshing={isRefreshing}
                        onRefresh={handleRefresh}
                    />
                </HiddenView>
            )}
            {visitedGrid && (
                <HiddenView isHidden={viewMode !== 'grid'}>
                    <GridView items={currentItems} isRefreshing={isRefreshing} onRefresh={handleRefresh} />
                </HiddenView>
            )}
        </>
    )
}

function HiddenView({ isHidden, children }: { isHidden: boolean; children: React.ReactNode }) {
    if (Platform.OS !== 'web') {
        // Native lacks display:none; just don't render the inactive tree.
        // The toggle cost on native isn't the user's reported bottleneck.
        return isHidden ? null : <>{children}</>
    }
    // Active view fills the parent normally. Hidden view stays in the tree
    // (so its DOM/fibers persist across toggles) but is moved out of layout
    // and made non-interactive. We use display:none for the hidden side
    // because position:absolute + visibility:hidden still pays full layout
    // cost on the hidden subtree and slows the toggle.
    return (
        <View
            // biome-ignore lint/suspicious/noExplicitAny: web-only style props
            style={
                {
                    display: isHidden ? 'none' : 'flex',
                    flex: isHidden ? 0 : 1,
                    pointerEvents: isHidden ? 'none' : 'auto',
                } as any
            }
        >
            {children}
        </View>
    )
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

// Memoized so the hidden view skips re-render when only viewMode changes.
// Toggle re-renders DriveScreen, but as long as items / isTrash / isRefreshing
// / onRefresh are stable, the entire view subtree (and its 50+ rows) is reused.
const ListView = memo(ListViewImpl)
function ListViewImpl({
    items,
    isTrash,
    isRefreshing,
    onRefresh,
}: {
    items: DriveItemView[]
    isTrash: boolean
    isRefreshing: boolean
    onRefresh: () => void
}) {
    const isMobile = useBreakpoint() === 'mobile'
    // Theme colors are global — read once at the view level so all rows share
    // the same JS-side cache. Each useThemeColor call hits getComputedStyle on
    // the document element; doing that 4× per row × 60 rows × multiple renders
    // costs ~75ms per toggle.
    const mutedColor = useThemeColor('muted-foreground')
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('active-indicator')
    const { folders, files } = useMemo(
        () => ({
            folders: items.filter((i) => i.isFolder),
            files: items.filter((i) => !i.isFolder),
        }),
        [items]
    )
    const navigableItems = useMemo(
        () => [...folders, ...files.filter((i) => !i.uploadStatus)],
        [folders, files]
    )
    const orderedIds = useMemo(() => navigableItems.map((i) => i.id), [navigableItems])
    const { handleSelect, isSelected } = useFileSelection(orderedIds)
    const { activeSection, currentFolderId, navigateToFolder, openPreview, openPrompt, dismissUpload } = useDrive()
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

    return (
        <SwipeableRowProvider>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: isMobile ? 0 : 16 }}
                refreshControl={
                    isMobile ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined
                }
            >
                {!isMobile && <DataTableHeader columns={isTrash ? TRASH_COLUMNS : DRIVE_COLUMNS} />}
                {folders.map((item, i) =>
                    isTrash ? (
                        <DriveContextMenu key={item.id} item={item}>
                            <TrashListRow
                                item={item}
                                isSelected={isSelected(item.id)}
                                onSelect={handleSelect}
                                isMobile={isMobile}
                                mutedColor={mutedColor}
                                activeIndicator={activeIndicator}
                            />
                        </DriveContextMenu>
                    ) : (
                        <DriveContextMenu key={item.id} item={item}>
                            <FilesListRow
                                item={item}
                                index={i}
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
                )}
                {files.map((item, i) => {
                    if (item.uploadStatus) {
                        return <UploadingListRow key={item.id} item={item} onDismiss={dismissUpload} />
                    }
                    if (isTrash) {
                        return (
                            <DriveContextMenu key={item.id} item={item}>
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
                        <DriveContextMenu key={item.id} item={item}>
                            <FilesListRow
                                item={item}
                                index={folders.length + i}
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
                })}
            </ScrollView>
        </SwipeableRowProvider>
    )
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
                {item.isFolder ? '\u2014' : formatBytes(item.size)}
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
                {item.isFolder ? '\u2014' : formatBytes(item.size)}
            </Text>
        </Pressable>
    )
}

const GRID_GAP = 12
const GRID_PADDING = 16
const CARD_MIN_DESKTOP = 200
const CARD_MIN_MOBILE = 150

// Cache the most recent computed cardWidth per breakpoint. The drive screen
// container width doesn't change when toggling list↔grid, so reusing the
// previous value as the initial state lets the new GridView paint with the
// correct width on the first frame instead of rendering at cardMin and
// then re-rendering once onLayout fires.
const cachedCardWidth: { mobile: number | null; desktop: number | null } = {
    mobile: null,
    desktop: null,
}

function useGridLayout() {
    const isMobile = useBreakpoint() === 'mobile'
    const cardMin = isMobile ? CARD_MIN_MOBILE : CARD_MIN_DESKTOP
    const [cardWidth, setCardWidth] = useState(() => {
        const cached = isMobile ? cachedCardWidth.mobile : cachedCardWidth.desktop
        return cached ?? cardMin
    })
    const onLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const w = e.nativeEvent.layout.width - GRID_PADDING * 2
            const cols = Math.max(2, Math.floor((w + GRID_GAP) / (cardMin + GRID_GAP)))
            const next = Math.floor((w - GRID_GAP * (cols - 1)) / cols)
            if (isMobile) cachedCardWidth.mobile = next
            else cachedCardWidth.desktop = next
            setCardWidth((prev) => (prev === next ? prev : next))
        },
        [cardMin, isMobile]
    )
    return { cardWidth, onLayout }
}

const GridView = memo(GridViewImpl)
function GridViewImpl({
    items,
    isRefreshing,
    onRefresh,
}: {
    items: DriveItemView[]
    isRefreshing: boolean
    onRefresh: () => void
}) {
    const isMobile = useBreakpoint() === 'mobile'
    const mutedColor = useThemeColor('muted-foreground')
    const { folders, files } = useMemo(
        () => ({
            folders: items.filter((i) => i.isFolder),
            files: items.filter((i) => !i.isFolder),
        }),
        [items]
    )
    const { cardWidth, onLayout } = useGridLayout()
    const orderedIds = useMemo(
        () => [...folders, ...files.filter((i) => !i.uploadStatus)].map((i) => i.id),
        [folders, files]
    )
    const { handleSelect, isSelected } = useFileSelection(orderedIds)
    const { dismissUpload } = useDrive()

    return (
        <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16 }}
            onLayout={onLayout}
            refreshControl={isMobile ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined}
        >
            {folders.length > 0 && (
                <View className="mb-5">
                    <GridSectionHeader title="Folders" />
                    <View className="flex-row flex-wrap gap-3">
                        {folders.map((item) => (
                            <View key={item.id} style={{ width: cardWidth }}>
                                <DriveContextMenu item={item}>
                                    <FolderGridCard
                                        item={item}
                                        isSelected={isSelected(item.id)}
                                        onSelect={handleSelect}
                                        isMobile={isMobile}
                                        mutedColor={mutedColor}
                                    />
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
                        {files.map((item) => (
                            <View key={item.id} style={{ width: cardWidth }}>
                                {item.uploadStatus ? (
                                    <UploadingGridCard item={item} onDismiss={dismissUpload} />
                                ) : (
                                    <DriveContextMenu item={item}>
                                        <FileGridCard
                                            item={item}
                                            isSelected={isSelected(item.id)}
                                            onSelect={handleSelect}
                                            isMobile={isMobile}
                                            mutedColor={mutedColor}
                                        />
                                    </DriveContextMenu>
                                )}
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </ScrollView>
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
                marginBottom: 10,
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
