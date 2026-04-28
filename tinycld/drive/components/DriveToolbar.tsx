import { MenuActionItem } from '@tinycld/core/components/DropdownMenu'
import { ResponsiveToolbar, type ToolbarItem } from '@tinycld/core/components/ResponsiveToolbar'
import { ScreenHeader } from '@tinycld/core/components/ScreenHeader'
import { ConfirmTrash, SuretyGuard } from '@tinycld/core/components/SuretyGuard'
import { ToolbarIconButton } from '@tinycld/core/components/ToolbarIconButton'
import { ToolbarSeparator } from '@tinycld/core/components/ToolbarSeparator'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { captureException } from '@tinycld/core/lib/errors'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useCurrentRole } from '@tinycld/core/lib/use-current-role'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import {
    ArrowLeft,
    ChevronRight,
    Download,
    Eye,
    FolderInput,
    FolderPlus,
    FolderUp,
    Grid,
    Info,
    List,
    Pencil,
    RotateCcw,
    Search,
    Trash2,
    Upload,
    UserPlus,
    X,
} from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { useDrive } from '../hooks/useDrive'
import type { DriveItemView, ViewMode } from '../types'
import { ChooseFolderDialog } from './ChooseFolderDialog'
import { ShareDialog } from './ShareDialog'

export function DriveDialogs() {
    const {
        promptDialog,
        promptKey,
        handlePromptSubmit,
        closePrompt,
        moveTarget,
        moveItem,
        selectItem,
        selectedIds,
        clearSelection,
        closeMoveDialog,
        shareTarget,
        getSharesForItem,
        orgMembers,
        removeShare,
        closeShareDialog,
        folderTree,
    } = useDrive()
    const { userOrgId } = useCurrentRole()

    const isMultiMove = moveTarget?.id === '__multi__'

    const handleMove = (targetId: string) => {
        if (!moveTarget) return
        if (isMultiMove) {
            for (const id of selectedIds) moveItem(id, targetId)
            clearSelection()
        } else {
            moveItem(moveTarget.id, targetId)
        }
        selectItem(null)
    }

    return (
        <>
            <NamePromptDialog
                key={promptKey}
                open={promptDialog.type !== 'closed'}
                title={promptDialog.type === 'new-folder' ? 'New folder' : 'Rename'}
                placeholder={promptDialog.type === 'new-folder' ? 'Untitled folder' : ''}
                defaultValue={promptDialog.type === 'rename' ? promptDialog.currentName : ''}
                submitLabel={promptDialog.type === 'new-folder' ? 'Create' : 'Rename'}
                onSubmit={handlePromptSubmit}
                onClose={closePrompt}
            />
            <ChooseFolderDialog
                open={moveTarget !== null}
                itemName={moveTarget?.name ?? ''}
                excludeId={isMultiMove ? '' : (moveTarget?.id ?? '')}
                folderTree={folderTree}
                onMove={handleMove}
                onClose={closeMoveDialog}
            />
            <ShareDialog
                open={shareTarget !== null}
                itemId={shareTarget?.id ?? ''}
                itemName={shareTarget?.name ?? ''}
                shares={shareTarget ? getSharesForItem(shareTarget.id) : []}
                orgMembers={orgMembers}
                currentUserOrgId={userOrgId}
                onRemoveShare={removeShare}
                onClose={closeShareDialog}
            />
        </>
    )
}

export function DriveToolbar() {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const activeIndicator = useThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const {
        selectedItem,
        selectedIds,
        clearSelection,
        activeSection,
        breadcrumbs,
        currentFolderId,
        viewMode,
        setViewMode,
        selectItem,
        navigateToFolder,
        searchQuery,
        setSearchQuery,
        isSearching,
        triggerFilePicker,
        triggerFolderPicker,
        moveToTrash,
        openPrompt,
        openMoveDialog,
        openShareDialog,
    } = useDrive()

    const selectionCount = selectedIds.size
    const hasSelection = selectionCount > 0 || selectedItem

    if (hasSelection) {
        const handleClear = () => {
            selectItem(null)
            clearSelection()
        }

        return (
            <SelectionToolbar
                selectedIds={selectedIds}
                selectedItem={selectedItem}
                selectionCount={selectionCount}
                viewMode={viewMode}
                onSetViewMode={setViewMode}
                onClearSelection={handleClear}
                onOpenRename={(itemId, name) =>
                    openPrompt({ type: 'rename', itemId, currentName: name })
                }
                onOpenMove={(itemId, name) => openMoveDialog(itemId, name)}
                onOpenShare={(itemId, name) => openShareDialog(itemId, name)}
                mutedColor={mutedColor}
                fgColor={fgColor}
                activeIndicator={activeIndicator}
            />
        )
    }

    const isSearchActive = searchQuery.length >= 2

    const currentFolder = breadcrumbs.at(-1)
    const currentLabel = currentFolder?.name ?? 'My Files'
    const isInsideFolder = currentFolderId !== ''
    const handleRename =
        isInsideFolder && currentFolder
            ? () =>
                  openPrompt({
                      type: 'rename',
                      itemId: currentFolder.id,
                      currentName: currentFolder.name,
                  })
            : undefined

    const folderActions = (
        <View className="flex-row items-center gap-0.5">
            <Menu>
                <Menu.Trigger>
                    <ToolbarIconButton icon={Upload} label="Upload" />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Overlay />
                    <Menu.Content presentation="popover" placement="bottom" align="start">
                        <MenuActionItem
                            label="Upload file"
                            icon={Upload}
                            onPress={triggerFilePicker}
                        />
                        <MenuActionItem
                            label="Upload folder"
                            icon={FolderUp}
                            onPress={triggerFolderPicker}
                        />
                    </Menu.Content>
                </Menu.Portal>
            </Menu>
            <ToolbarIconButton
                icon={FolderPlus}
                label="New folder"
                onPress={() => openPrompt({ type: 'new-folder' })}
            />
            {isInsideFolder && handleRename && (
                <ToolbarIconButton icon={Pencil} label="Rename" onPress={handleRename} />
            )}
            {isInsideFolder && (
                <ConfirmTrash
                    itemName={currentLabel}
                    onConfirmed={() => {
                        moveToTrash(currentFolderId)
                        navigateToFolder('')
                    }}
                >
                    {onOpen => <ToolbarIconButton icon={Trash2} label="Delete" onPress={onOpen} />}
                </ConfirmTrash>
            )}
        </View>
    )

    const titleContent = (() => {
        if (isSearchActive) {
            return (
                <Text
                    className="flex-1"
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: mutedColor,
                    }}
                >
                    Search results{isSearching ? '...' : ''}
                </Text>
            )
        }
        if (activeSection === 'trash') {
            return (
                <Text
                    className="flex-1"
                    style={{
                        fontSize: 24,
                        fontWeight: '500',
                        color: fgColor,
                    }}
                >
                    Trash
                </Text>
            )
        }
        if (isMobile) {
            return (
                <MobileBreadcrumbs
                    breadcrumbs={breadcrumbs}
                    currentLabel={currentLabel}
                    onNavigate={navigateToFolder}
                    fgColor={fgColor}
                />
            )
        }
        return (
            <DesktopBreadcrumbs
                breadcrumbs={breadcrumbs}
                currentLabel={currentLabel}
                onNavigate={navigateToFolder}
                fgColor={fgColor}
                mutedColor={mutedColor}
            />
        )
    })()

    return (
        <ScreenHeader>
            {isMobile ? (
                <View className="px-4 gap-2" style={{ paddingVertical: 10 }}>
                    <View className="flex-row items-center justify-between gap-2">
                        {titleContent}
                        {folderActions}
                        <ViewToggle
                            viewMode={viewMode}
                            onSetViewMode={setViewMode}
                            mutedColor={mutedColor}
                            activeIndicator={activeIndicator}
                        />
                    </View>
                    <SearchInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        mutedColor={mutedColor}
                        fgColor={fgColor}
                        fullWidth
                    />
                </View>
            ) : (
                <View
                    className="flex-row items-center justify-between px-4 gap-3"
                    style={{ paddingVertical: 10 }}
                >
                    {titleContent}
                    <ToolbarSeparator />
                    {folderActions}
                    <ToolbarSeparator />
                    <View className="flex-row items-center gap-2 shrink-0">
                        <SearchInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            mutedColor={mutedColor}
                            fgColor={fgColor}
                        />
                        <ViewToggle
                            viewMode={viewMode}
                            onSetViewMode={setViewMode}
                            mutedColor={mutedColor}
                            activeIndicator={activeIndicator}
                        />
                    </View>
                </View>
            )}
        </ScreenHeader>
    )
}

function DesktopBreadcrumbs({
    breadcrumbs,
    currentLabel,
    onNavigate,
    fgColor,
    mutedColor,
}: {
    breadcrumbs: DriveItemView[]
    currentLabel: string
    onNavigate: (folderId: string) => void
    fgColor: string
    mutedColor: string
}) {
    const ancestors = breadcrumbs.slice(0, -1)

    return (
        <View
            className="flex-row items-center flex-1 gap-1 overflow-hidden"
            style={{ minWidth: 0 }}
        >
            {ancestors.length > 0 && (
                <>
                    <Pressable onPress={() => onNavigate('')}>
                        <Text numberOfLines={1} style={{ fontSize: 16, color: mutedColor }}>
                            My Files
                        </Text>
                    </Pressable>
                    <ChevronRight size={14} color={mutedColor} />
                </>
            )}
            {ancestors.map(crumb => (
                <View
                    key={crumb.id}
                    className="flex-row items-center gap-1 shrink"
                    style={{ minWidth: 0 }}
                >
                    <Pressable onPress={() => onNavigate(crumb.id)}>
                        <Text
                            numberOfLines={1}
                            style={{
                                fontSize: 16,
                                color: mutedColor,
                                flexShrink: 1,
                            }}
                        >
                            {crumb.name}
                        </Text>
                    </Pressable>
                    <ChevronRight size={14} color={mutedColor} />
                </View>
            ))}
            <Text
                numberOfLines={1}
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                    color: fgColor,
                    flexShrink: 1,
                }}
            >
                {currentLabel}
            </Text>
        </View>
    )
}

function MobileBreadcrumbs({
    breadcrumbs,
    currentLabel,
    onNavigate,
    fgColor,
}: {
    breadcrumbs: DriveItemView[]
    currentLabel: string
    onNavigate: (folderId: string) => void
    fgColor: string
}) {
    const hasParent = breadcrumbs.length > 1
    const parent = breadcrumbs.at(-2)

    const goUp = () => {
        if (parent) onNavigate(parent.id)
        else onNavigate('')
    }

    return (
        <View className="flex-row items-center flex-1" style={{ gap: 6, minWidth: 0 }}>
            {hasParent && (
                <Pressable onPress={goUp} hitSlop={8}>
                    <ArrowLeft size={20} color={fgColor} />
                </Pressable>
            )}
            <Text
                numberOfLines={1}
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                    color: fgColor,
                    flex: 1,
                }}
            >
                {currentLabel}
            </Text>
        </View>
    )
}

interface SearchInputProps {
    value: string
    onChangeText: (text: string) => void
    mutedColor: string
    fgColor: string
    fullWidth?: boolean
}

function SearchInput({ value, onChangeText, mutedColor, fgColor, fullWidth }: SearchInputProps) {
    const borderColor = useThemeColor('border')

    return (
        <View
            className="flex-row items-center border rounded-lg"
            style={{
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                width: fullWidth ? '100%' : 240,
                borderColor,
            }}
        >
            <Search size={14} color={mutedColor} />
            <PlainInput
                className="flex-1 p-0"
                style={{ fontSize: 13, color: fgColor }}
                placeholder="Search in Files"
                placeholderTextColor={mutedColor}
                value={value}
                onChangeText={onChangeText}
            />
            {value.length > 0 && (
                <Pressable onPress={() => onChangeText('')} hitSlop={8}>
                    <X size={14} color={mutedColor} />
                </Pressable>
            )}
        </View>
    )
}

interface SelectionToolbarProps {
    selectedIds: Set<string>
    selectedItem: DriveItemView | undefined
    selectionCount: number
    viewMode: ViewMode
    onSetViewMode: (mode: ViewMode) => void
    onClearSelection: () => void
    onOpenRename: (itemId: string, currentName: string) => void
    onOpenMove: (itemId: string, name: string) => void
    onOpenShare: (itemId: string, name: string) => void
    mutedColor: string
    fgColor: string
    activeIndicator: string
}

function SelectionToolbar({
    selectedIds,
    selectedItem,
    selectionCount,
    viewMode,
    onSetViewMode,
    onClearSelection,
    onOpenRename,
    onOpenMove,
    onOpenShare,
    mutedColor,
    fgColor,
    activeIndicator,
}: SelectionToolbarProps) {
    const {
        activeSection,
        uploadNewVersion,
        downloadItem,
        moveToTrash,
        restoreFromTrash,
        permanentlyDelete,
        canRestoreToOriginalLocation,
        restoreToFolder,
        folderTree,
        openPreview,
        toggleDetailPanel,
    } = useDrive()
    const [restoreMoveTarget, setRestoreMoveTarget] = useState<string | null>(null)

    const isTrash = activeSection === 'trash'
    const isSingle = selectionCount <= 1
    const item = selectedItem
    const selectedIdArray = useMemo(() => [...selectedIds], [selectedIds])

    const displayLabel = isSingle ? (item?.name ?? '') : `${selectionCount} selected`

    const triggerVersionUpload = useCallback(() => {
        if (Platform.OS === 'web' && item) {
            const input = document.createElement('input')
            input.type = 'file'
            input.onchange = () => {
                if (input.files?.[0]) {
                    uploadNewVersion(item.id, input.files[0]).catch(err =>
                        captureException('uploadNewVersion', err)
                    )
                }
            }
            input.click()
        }
    }, [uploadNewVersion, item])

    const handleDownloadAll = useCallback(() => {
        for (const id of selectedIdArray) downloadItem(id)
    }, [selectedIdArray, downloadItem])

    const handleTrashAll = useCallback(() => {
        for (const id of selectedIdArray) moveToTrash(id)
        onClearSelection()
    }, [selectedIdArray, moveToTrash, onClearSelection])

    const toolbarItems: ToolbarItem[] = useMemo(() => {
        const items: ToolbarItem[] = [
            {
                type: 'custom',
                key: 'close',
                element: (
                    <Pressable onPress={onClearSelection} className="p-1">
                        <X size={16} color={mutedColor} />
                    </Pressable>
                ),
            },
            {
                type: 'custom',
                key: 'name',
                element: (
                    <Text
                        numberOfLines={1}
                        className="flex-1"
                        style={{ fontSize: 13, fontWeight: '500', color: fgColor }}
                    >
                        {displayLabel}
                    </Text>
                ),
            },
        ]

        if (isSingle && item && !item.isFolder) {
            items.push(
                {
                    type: 'button',
                    key: 'preview',
                    icon: Eye,
                    label: 'Preview',
                    onPress: () => {
                        if (selectedItem) openPreview(selectedItem)
                    },
                },
                {
                    type: 'button',
                    key: 'upload-version',
                    icon: Upload,
                    label: 'Upload new version',
                    onPress: triggerVersionUpload,
                }
            )
        }

        if (isSingle && item) {
            items.push(
                {
                    type: 'button',
                    key: 'share',
                    icon: UserPlus,
                    label: 'Share',
                    onPress: () => onOpenShare(item.id, item.name),
                },
                {
                    type: 'button',
                    key: 'rename',
                    icon: Pencil,
                    label: 'Rename',
                    onPress: () => onOpenRename(item.id, item.name),
                },
                {
                    type: 'button',
                    key: 'info',
                    icon: Info,
                    label: 'Info',
                    onPress: toggleDetailPanel,
                }
            )
        }

        // Multi-capable actions: download, move, trash
        items.push(
            {
                type: 'button',
                key: 'download',
                icon: Download,
                label: 'Download',
                onPress: isSingle && item ? () => downloadItem(item.id) : handleDownloadAll,
            },
            {
                type: 'button',
                key: 'move',
                icon: FolderInput,
                label: 'Move',
                onPress:
                    isSingle && item
                        ? () => onOpenMove(item.id, item.name)
                        : () => onOpenMove('__multi__', `${selectionCount} items`),
            },
            {
                type: 'custom',
                key: 'trash',
                element: (
                    <ConfirmTrash
                        itemName={isSingle && item ? item.name : `${selectionCount} items`}
                        onConfirmed={
                            isSingle && item
                                ? () => {
                                      moveToTrash(item.id)
                                      onClearSelection()
                                  }
                                : handleTrashAll
                        }
                    >
                        {onOpen => (
                            <ToolbarIconButton icon={Trash2} label="Trash" onPress={onOpen} />
                        )}
                    </ConfirmTrash>
                ),
            }
        )

        return items
    }, [
        isSingle,
        item,
        displayLabel,
        selectionCount,
        mutedColor,
        fgColor,
        selectedItem,
        openPreview,
        triggerVersionUpload,
        onOpenShare,
        downloadItem,
        handleDownloadAll,
        onOpenRename,
        onOpenMove,
        moveToTrash,
        handleTrashAll,
        onClearSelection,
        toggleDetailPanel,
    ])

    const rightItems: ToolbarItem[] = useMemo(
        () => [
            {
                type: 'custom',
                key: 'view-toggle',
                element: (
                    <ViewToggle
                        viewMode={viewMode}
                        onSetViewMode={onSetViewMode}
                        mutedColor={mutedColor}
                        activeIndicator={activeIndicator}
                    />
                ),
            },
        ],
        [viewMode, onSetViewMode, mutedColor, activeIndicator]
    )

    if (isTrash) {
        const handleRestoreAll = () => {
            for (const id of selectedIdArray) {
                if (canRestoreToOriginalLocation(id)) restoreFromTrash(id)
            }
            onClearSelection()
        }

        const handleDeleteAll = () => {
            for (const id of selectedIdArray) permanentlyDelete(id)
            onClearSelection()
        }

        const handleRestoreSingle = () => {
            if (!item) return
            if (canRestoreToOriginalLocation(item.id)) {
                restoreFromTrash(item.id)
                onClearSelection()
            } else {
                setRestoreMoveTarget(item.id)
            }
        }

        return (
            <>
                <ScreenHeader>
                    <View
                        className="flex-row items-center justify-between px-4"
                        style={{ paddingVertical: 10 }}
                    >
                        <View className="flex-row items-center gap-2 flex-1">
                            <Pressable onPress={onClearSelection} className="p-1">
                                <X size={16} color={mutedColor} />
                            </Pressable>
                            <Text
                                numberOfLines={1}
                                className="flex-1"
                                style={{
                                    fontSize: 13,
                                    fontWeight: '500',
                                    color: fgColor,
                                }}
                            >
                                {displayLabel}
                            </Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                            <ToolbarIconButton
                                icon={RotateCcw}
                                label="Restore"
                                onPress={isSingle ? handleRestoreSingle : handleRestoreAll}
                            />
                            <SuretyGuard
                                message={
                                    isSingle && item
                                        ? `Permanently delete "${item.name}"? This cannot be undone.`
                                        : `Permanently delete ${selectionCount} items? This cannot be undone.`
                                }
                                confirmLabel="Delete permanently"
                                onConfirmed={
                                    isSingle && item
                                        ? () => {
                                              permanentlyDelete(item.id)
                                              onClearSelection()
                                          }
                                        : handleDeleteAll
                                }
                            >
                                {onOpen => (
                                    <ToolbarIconButton
                                        icon={Trash2}
                                        label="Delete permanently"
                                        onPress={onOpen}
                                    />
                                )}
                            </SuretyGuard>
                            <ToolbarSeparator />
                            <ViewToggle
                                viewMode={viewMode}
                                onSetViewMode={onSetViewMode}
                                mutedColor={mutedColor}
                                activeIndicator={activeIndicator}
                            />
                        </View>
                    </View>
                </ScreenHeader>
                {item && isSingle && (
                    <ChooseFolderDialog
                        open={restoreMoveTarget !== null}
                        itemName={item.name}
                        excludeId={item.id}
                        folderTree={folderTree}
                        title="Original location has been removed, select alternative location"
                        confirmLabel="Restore here"
                        onMove={targetId => {
                            if (restoreMoveTarget) {
                                restoreToFolder(restoreMoveTarget, targetId)
                                onClearSelection()
                            }
                        }}
                        onClose={() => setRestoreMoveTarget(null)}
                    />
                )}
            </>
        )
    }

    return (
        <ScreenHeader>
            <View style={{ paddingVertical: 10, paddingHorizontal: 8 }}>
                <ResponsiveToolbar items={toolbarItems} rightItems={rightItems} />
            </View>
        </ScreenHeader>
    )
}

interface ViewToggleProps {
    viewMode: ViewMode
    onSetViewMode: (mode: ViewMode) => void
    mutedColor: string
    activeIndicator: string
}

function ViewToggle({ viewMode, onSetViewMode, mutedColor, activeIndicator }: ViewToggleProps) {
    return (
        <View className="flex-row gap-0.5">
            <Pressable
                onPress={() => onSetViewMode('list')}
                style={{
                    padding: 6,
                    borderRadius: 6,
                    ...(viewMode === 'list' ? { backgroundColor: `${activeIndicator}18` } : {}),
                }}
            >
                <List size={18} color={viewMode === 'list' ? activeIndicator : mutedColor} />
            </Pressable>
            <Pressable
                onPress={() => onSetViewMode('grid')}
                style={{
                    padding: 6,
                    borderRadius: 6,
                    ...(viewMode === 'grid' ? { backgroundColor: `${activeIndicator}18` } : {}),
                }}
            >
                <Grid size={18} color={viewMode === 'grid' ? activeIndicator : mutedColor} />
            </Pressable>
        </View>
    )
}

interface NamePromptDialogProps {
    open: boolean
    title: string
    placeholder: string
    defaultValue: string
    submitLabel: string
    onSubmit: (value: string) => void
    onClose: () => void
}

function NamePromptDialog({
    open,
    title,
    placeholder,
    defaultValue,
    submitLabel,
    onSubmit,
    onClose,
}: NamePromptDialogProps) {
    const [value, setValue] = useState(defaultValue)
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')

    const handleSubmit = () => {
        const trimmed = value.trim()
        if (trimmed) onSubmit(trimmed)
    }

    return (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[360px] p-4 gap-3">
                <Text style={{ fontSize: 20, fontWeight: '600', color: fgColor }}>{title}</Text>
                <View
                    className="flex-row border rounded-lg px-3"
                    style={{
                        borderColor,
                        paddingVertical: 10,
                    }}
                >
                    <PlainInput
                        value={value}
                        onChangeText={setValue}
                        placeholder={placeholder}
                        autoFocus
                        onSubmitEditing={handleSubmit}
                        className="flex-1"
                        style={{ fontSize: 15, color: fgColor }}
                    />
                </View>
                <View className="flex-row gap-3 justify-end">
                    <Pressable onPress={onClose} className="px-3 py-2">
                        <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                    </Pressable>
                    <Button onPress={handleSubmit} isDisabled={!value.trim()} size="sm">
                        <ButtonText>{submitLabel}</ButtonText>
                    </Button>
                </View>
            </ModalContent>
        </Modal>
    )
}
