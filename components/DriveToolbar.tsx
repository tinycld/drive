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
import { Platform, Pressable } from 'react-native'
import { Button, Dialog, SizableText, useMedia, useTheme, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '~/components/ScreenHeader'
import { ConfirmTrash, SuretyGuard } from '~/components/SuretyGuard'
import { ToolbarIconButton } from '~/components/ToolbarIconButton'
import { ToolbarSeparator } from '~/components/ToolbarSeparator'
import { captureException } from '~/lib/errors'
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
    const theme = useTheme()
    const media = useMedia()
    const isMobile = !media.md
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
                theme={theme}
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
        <XStack alignItems="center" gap={2}>
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
        </XStack>
    )

    const titleContent = (() => {
        if (isSearchActive) {
            return (
                <SizableText size="$3" fontWeight="500" color="$color8" flex={1}>
                    Search results{isSearching ? '...' : ''}
                </SizableText>
            )
        }
        if (activeSection === 'trash') {
            return (
                <SizableText size="$6" fontWeight="500" color="$color" flex={1}>
                    Trash
                </SizableText>
            )
        }
        if (isMobile) {
            return (
                <MobileBreadcrumbs
                    breadcrumbs={breadcrumbs}
                    currentLabel={currentLabel}
                    onNavigate={navigateToFolder}
                    theme={theme}
                />
            )
        }
        return (
            <DesktopBreadcrumbs
                breadcrumbs={breadcrumbs}
                currentLabel={currentLabel}
                onNavigate={navigateToFolder}
                theme={theme}
            />
        )
    })()

    return (
        <ScreenHeader>
            {isMobile ? (
                <YStack paddingHorizontal={16} paddingVertical={10} gap={8}>
                    <XStack alignItems="center" justifyContent="space-between" gap={8}>
                        {titleContent}
                        {folderActions}
                        <ViewToggle viewMode={viewMode} onSetViewMode={setViewMode} theme={theme} />
                    </XStack>
                    <SearchInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        theme={theme}
                        fullWidth
                    />
                </YStack>
            ) : (
                <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    paddingHorizontal={16}
                    paddingVertical={10}
                    gap={12}
                >
                    {titleContent}
                    <ToolbarSeparator />
                    {folderActions}
                    <ToolbarSeparator />
                    <XStack alignItems="center" gap={8} flexShrink={0}>
                        <SearchInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            theme={theme}
                        />
                        <ViewToggle viewMode={viewMode} onSetViewMode={setViewMode} theme={theme} />
                    </XStack>
                </XStack>
            )}
        </ScreenHeader>
    )
}

function DesktopBreadcrumbs({
    breadcrumbs,
    currentLabel,
    onNavigate,
    theme,
}: {
    breadcrumbs: DriveItemView[]
    currentLabel: string
    onNavigate: (folderId: string) => void
    theme: ReturnType<typeof useTheme>
}) {
    const ancestors = breadcrumbs.slice(0, -1)

    return (
        <XStack alignItems="center" flex={1} gap={4} minWidth={0} overflow="hidden">
            {ancestors.length > 0 && (
                <>
                    <Pressable onPress={() => onNavigate('')}>
                        <SizableText size="$4" color="$color8" numberOfLines={1}>
                            My Files
                        </SizableText>
                    </Pressable>
                    <ChevronRight size={14} color={theme.color8.val} />
                </>
            )}
            {ancestors.map(crumb => (
                <XStack key={crumb.id} alignItems="center" gap={4} flexShrink={1} minWidth={0}>
                    <Pressable onPress={() => onNavigate(crumb.id)}>
                        <SizableText size="$4" color="$color8" numberOfLines={1} flexShrink={1}>
                            {crumb.name}
                        </SizableText>
                    </Pressable>
                    <ChevronRight size={14} color={theme.color8.val} />
                </XStack>
            ))}
            <SizableText size="$5" fontWeight="600" color="$color" numberOfLines={1} flexShrink={1}>
                {currentLabel}
            </SizableText>
        </XStack>
    )
}

function MobileBreadcrumbs({
    breadcrumbs,
    currentLabel,
    onNavigate,
    theme,
}: {
    breadcrumbs: DriveItemView[]
    currentLabel: string
    onNavigate: (folderId: string) => void
    theme: ReturnType<typeof useTheme>
}) {
    const hasParent = breadcrumbs.length > 1
    const parent = breadcrumbs.at(-2)

    const goUp = () => {
        if (parent) onNavigate(parent.id)
        else onNavigate('')
    }

    return (
        <XStack alignItems="center" gap={6} flex={1} minWidth={0}>
            {hasParent && (
                <Pressable onPress={goUp} hitSlop={8}>
                    <ArrowLeft size={20} color={theme.color.val} />
                </Pressable>
            )}
            <SizableText size="$5" fontWeight="600" color="$color" numberOfLines={1} flex={1}>
                {currentLabel}
            </SizableText>
        </XStack>
    )
}

interface SearchInputProps {
    value: string
    onChangeText: (text: string) => void
    theme: ReturnType<typeof useTheme>
    fullWidth?: boolean
}

function SearchInput({ value, onChangeText, theme, fullWidth }: SearchInputProps) {
    return (
        <XStack
            alignItems="center"
            gap={6}
            borderWidth={1}
            borderRadius={8}
            paddingHorizontal={10}
            paddingVertical={6}
            width={fullWidth ? '100%' : 240}
            borderColor="$borderColor"
        >
            <Search size={14} color={theme.color8.val} />
            <PlainInput
                style={{ flex: 1, fontSize: 13, padding: 0, color: theme.color.val }}
                placeholder="Search in Files"
                placeholderTextColor={theme.color8.val}
                value={value}
                onChangeText={onChangeText}
            />
            {value.length > 0 && (
                <Pressable onPress={() => onChangeText('')} hitSlop={8}>
                    <X size={14} color={theme.color8.val} />
                </Pressable>
            )}
        </XStack>
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
    theme: ReturnType<typeof useTheme>
}

function SelectionToolbar({
    item,
    viewMode,
    onSetViewMode,
    onClearSelection,
    onOpenRename,
    onOpenMove,
    onOpenShare,
    theme,
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
                    <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        paddingHorizontal={16}
                        paddingVertical={10}
                    >
                        <XStack alignItems="center" gap={8} flex={1}>
                            <Pressable onPress={onClearSelection} style={{ padding: 4 }}>
                                <X size={16} color={theme.color8.val} />
                            </Pressable>
                            <SizableText
                                size="$3"
                                fontWeight="500"
                                color="$color"
                                flex={1}
                                numberOfLines={1}
                            >
                                {item.name}
                            </SizableText>
                        </XStack>
                        <XStack alignItems="center" gap={4}>
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
                                theme={theme}
                            />
                        </XStack>
                    </XStack>
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
            <XStack
                alignItems="center"
                justifyContent="space-between"
                paddingHorizontal={16}
                paddingVertical={10}
            >
                <XStack alignItems="center" gap={8} flex={1}>
                    <Pressable onPress={onClearSelection} style={{ padding: 4 }}>
                        <X size={16} color={theme.color8.val} />
                    </Pressable>
                    <SizableText
                        size="$3"
                        fontWeight="500"
                        color="$color"
                        flex={1}
                        numberOfLines={1}
                    >
                        {item.name}
                    </SizableText>
                </XStack>
                <XStack alignItems="center" gap={4}>
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
                    <ViewToggle viewMode={viewMode} onSetViewMode={onSetViewMode} theme={theme} />
                </XStack>
            </XStack>
        </ScreenHeader>
    )
}

interface ViewToggleProps {
    viewMode: ViewMode
    onSetViewMode: (mode: ViewMode) => void
    theme: ReturnType<typeof useTheme>
}

function ViewToggle({ viewMode, onSetViewMode, theme }: ViewToggleProps) {
    return (
        <XStack gap={2}>
            <Pressable
                onPress={() => onSetViewMode('list')}
                style={{
                    padding: 6,
                    borderRadius: 6,
                    ...(viewMode === 'list'
                        ? { backgroundColor: `${theme.activeIndicator.val}18` }
                        : {}),
                }}
            >
                <List
                    size={18}
                    color={viewMode === 'list' ? theme.activeIndicator.val : theme.color8.val}
                />
            </Pressable>
            <Pressable
                onPress={() => onSetViewMode('grid')}
                style={{
                    padding: 6,
                    borderRadius: 6,
                    ...(viewMode === 'grid'
                        ? { backgroundColor: `${theme.activeIndicator.val}18` }
                        : {}),
                }}
            >
                <Grid
                    size={18}
                    color={viewMode === 'grid' ? theme.activeIndicator.val : theme.color8.val}
                />
            </Pressable>
        </XStack>
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

    const handleSubmit = () => {
        const trimmed = value.trim()
        if (trimmed) onSubmit(trimmed)
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
                    padding="$4"
                    gap="$3"
                    width={360}
                    backgroundColor="$background"
                >
                    <Dialog.Title size="$5">{title}</Dialog.Title>
                    <XStack
                        borderWidth={1}
                        borderColor="$borderColor"
                        borderRadius={8}
                        paddingHorizontal={12}
                        paddingVertical={10}
                    >
                        <PlainInput
                            value={value}
                            onChangeText={setValue}
                            placeholder={placeholder}
                            autoFocus
                            onSubmitEditing={handleSubmit}
                            style={{ flex: 1, fontSize: 15 }}
                        />
                    </XStack>
                    <XStack gap="$3" justifyContent="flex-end">
                        <Button size="$3" chromeless onPress={onClose}>
                            <Button.Text>Cancel</Button.Text>
                        </Button>
                        <Button
                            size="$3"
                            theme="accent"
                            onPress={handleSubmit}
                            disabled={!value.trim()}
                        >
                            <Button.Text fontWeight="600">{submitLabel}</Button.Text>
                        </Button>
                    </XStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}
