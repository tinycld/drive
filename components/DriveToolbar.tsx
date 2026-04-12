import { Button, Dialog, useThemeColor } from 'heroui-native'
import {
    ArrowLeft,
    ChevronRight,
    Download,
    Eye,
    FolderInput,
    FolderPlus,
    Grid,
    List,
    MoreVertical,
    Pencil,
    RotateCcw,
    Search,
    Trash2,
    Upload,
    UserPlus,
    X,
} from 'lucide-react-native'
import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { ScreenHeader } from '~/components/ScreenHeader'
import { ConfirmTrash, SuretyGuard } from '~/components/SuretyGuard'
import { ToolbarIconButton } from '~/components/ToolbarIconButton'
import { ToolbarSeparator } from '~/components/ToolbarSeparator'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { captureException } from '~/lib/errors'
import { useThemeColor as useAppThemeColor } from '~/lib/use-app-theme'
import { useCurrentRole } from '~/lib/use-current-role'
import { PlainInput } from '~/ui/PlainInput'
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
        closeMoveDialog,
        shareTarget,
        getSharesForItem,
        orgMembers,
        removeShare,
        closeShareDialog,
        folderTree,
    } = useDrive()
    const { userOrgId } = useCurrentRole()

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
                excludeId={moveTarget?.id ?? ''}
                folderTree={folderTree}
                onMove={targetId => {
                    if (moveTarget) {
                        moveItem(moveTarget.id, targetId)
                        selectItem(null)
                    }
                }}
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
    const [mutedColor, fgColor] = useThemeColor(['muted', 'foreground'])
    const activeIndicator = useAppThemeColor('active-indicator')
    const isMobile = useBreakpoint() === 'mobile'
    const {
        selectedItem,
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
        moveToTrash,
        openPrompt,
        openMoveDialog,
        openShareDialog,
    } = useDrive()

    if (selectedItem) {
        return (
            <SelectionToolbar
                item={selectedItem}
                viewMode={viewMode}
                onSetViewMode={setViewMode}
                onClearSelection={() => selectItem(null)}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <ToolbarIconButton icon={Upload} label="Upload file" onPress={triggerFilePicker} />
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
                    style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: mutedColor,
                        flex: 1,
                    }}
                >
                    Search results{isSearching ? '...' : ''}
                </Text>
            )
        }
        if (activeSection === 'trash') {
            return (
                <Text
                    style={{
                        fontSize: 24,
                        fontWeight: '500',
                        color: fgColor,
                        flex: 1,
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
                <View
                    style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        gap: 8,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                        }}
                    >
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
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        gap: 12,
                    }}
                >
                    {titleContent}
                    <ToolbarSeparator />
                    {folderActions}
                    <ToolbarSeparator />
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            flexShrink: 0,
                        }}
                    >
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
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                flex: 1,
                gap: 4,
                minWidth: 0,
                overflow: 'hidden',
            }}
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
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        flexShrink: 1,
                        minWidth: 0,
                    }}
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
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                minWidth: 0,
            }}
        >
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
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                width: fullWidth ? '100%' : 240,
                borderColor,
            }}
        >
            <Search size={14} color={mutedColor} />
            <PlainInput
                style={{ flex: 1, fontSize: 13, padding: 0, color: fgColor }}
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
    item: { name: string; isFolder: boolean; id: string }
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
    item,
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
        selectedItem,
    } = useDrive()
    const [restoreMoveTarget, setRestoreMoveTarget] = useState<string | null>(null)

    const isTrash = activeSection === 'trash'

    const triggerVersionUpload = () => {
        if (Platform.OS === 'web') {
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
    }

    if (isTrash) {
        const handleRestore = () => {
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
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                        }}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                flex: 1,
                            }}
                        >
                            <Pressable onPress={onClearSelection} style={{ padding: 4 }}>
                                <X size={16} color={mutedColor} />
                            </Pressable>
                            <Text
                                numberOfLines={1}
                                style={{
                                    fontSize: 13,
                                    fontWeight: '500',
                                    color: fgColor,
                                    flex: 1,
                                }}
                            >
                                {item.name}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <ToolbarIconButton
                                icon={RotateCcw}
                                label="Restore"
                                onPress={handleRestore}
                            />
                            <SuretyGuard
                                message={`Permanently delete "${item.name}"? This cannot be undone.`}
                                confirmLabel="Delete permanently"
                                onConfirmed={() => {
                                    permanentlyDelete(item.id)
                                    onClearSelection()
                                }}
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
            </>
        )
    }

    const actionIcons = [
        ...(!item.isFolder
            ? [
                  {
                      key: 'preview',
                      icon: Eye,
                      label: 'Preview',
                      onPress: () => {
                          if (selectedItem) openPreview(selectedItem)
                      },
                  },
                  {
                      key: 'upload-version',
                      icon: Upload,
                      label: 'Upload new version',
                      onPress: triggerVersionUpload,
                  },
              ]
            : []),
        {
            key: 'share',
            icon: UserPlus,
            label: 'Share',
            onPress: () => onOpenShare(item.id, item.name),
        },
        {
            key: 'download',
            icon: Download,
            label: 'Download',
            onPress: () => downloadItem(item.id),
        },
        {
            key: 'rename',
            icon: Pencil,
            label: 'Rename',
            onPress: () => onOpenRename(item.id, item.name),
        },
        {
            key: 'move',
            icon: FolderInput,
            label: 'Move',
            onPress: () => onOpenMove(item.id, item.name),
        },
        { key: 'more', icon: MoreVertical, label: 'More actions', onPress: () => {} },
    ]

    return (
        <ScreenHeader>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                }}
            >
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1,
                    }}
                >
                    <Pressable onPress={onClearSelection} style={{ padding: 4 }}>
                        <X size={16} color={mutedColor} />
                    </Pressable>
                    <Text
                        numberOfLines={1}
                        style={{
                            fontSize: 13,
                            fontWeight: '500',
                            color: fgColor,
                            flex: 1,
                        }}
                    >
                        {item.name}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {actionIcons.map(({ key, icon, label, onPress }) => (
                        <ToolbarIconButton key={key} icon={icon} label={label} onPress={onPress} />
                    ))}
                    <ConfirmTrash
                        itemName={item.name}
                        onConfirmed={() => {
                            moveToTrash(item.id)
                            onClearSelection()
                        }}
                    >
                        {onOpen => (
                            <ToolbarIconButton icon={Trash2} label="Trash" onPress={onOpen} />
                        )}
                    </ConfirmTrash>
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
        <View style={{ flexDirection: 'row', gap: 2 }}>
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
    const [fgColor, borderColor] = useThemeColor(['foreground', 'border'])

    const handleSubmit = () => {
        const trimmed = value.trim()
        if (trimmed) onSubmit(trimmed)
    }

    return (
        <Dialog
            isOpen={open}
            onOpenChange={o => {
                if (!o) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content className="w-[360px] p-4 gap-3">
                    <Text style={{ fontSize: 20, fontWeight: '600', color: fgColor }}>{title}</Text>
                    <View
                        style={{
                            flexDirection: 'row',
                            borderWidth: 1,
                            borderColor,
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                        }}
                    >
                        <PlainInput
                            value={value}
                            onChangeText={setValue}
                            placeholder={placeholder}
                            autoFocus
                            onSubmitEditing={handleSubmit}
                            style={{ flex: 1, fontSize: 15, color: fgColor }}
                        />
                    </View>
                    <View
                        style={{
                            flexDirection: 'row',
                            gap: 12,
                            justifyContent: 'flex-end',
                        }}
                    >
                        <Pressable
                            onPress={onClose}
                            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                        >
                            <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                        </Pressable>
                        <Button onPress={handleSubmit} isDisabled={!value.trim()} size="sm">
                            {submitLabel}
                        </Button>
                    </View>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}
