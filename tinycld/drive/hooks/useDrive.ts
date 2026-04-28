import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useUserPreference } from '@tinycld/core/lib/use-user-preference'
import { useGlobalSearchParams, usePathname } from 'expo-router'
import type { DialogTarget, PromptDialog } from '../stores/drive-ui-store'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView, SidebarSection, ViewMode } from '../types'
import { useDriveItems } from './useDriveItems'
import { useDriveMutations } from './useDriveMutations'
import { parseDrivePath, useDriveNavigation } from './useDriveNavigation'
import { useDriveSearch } from './useDriveSearch'

export interface DriveContextValue {
    currentFolderId: string
    activeSection: SidebarSection
    selectedItemId: string | null
    selectedIds: Set<string>
    clearSelection: () => void
    viewMode: ViewMode
    currentItems: DriveItemView[]
    breadcrumbs: DriveItemView[]
    selectedItem: DriveItemView | undefined
    folderTree: import('../types').FolderTreeNode[]
    totalStorageUsed: number
    isLoading: boolean
    searchQuery: string
    setSearchQuery: (query: string) => void
    isSearching: boolean
    previewItem: DriveItemView | null
    openPreview: (item: DriveItemView) => void
    closePreview: () => void
    detailPanelOpen: boolean
    toggleDetailPanel: () => void
    openDetailPanel: () => void
    closeDetailPanel: () => void
    navigateToFolder: (folderId: string) => void
    navigateToSection: (section: SidebarSection) => void
    selectItem: (itemId: string | null) => void
    setViewMode: (mode: ViewMode) => void
    openItem: (item: DriveItemView) => void
    toggleStar: (itemId: string) => void
    moveToTrash: (itemId: string) => void
    restoreFromTrash: (itemId: string) => void
    permanentlyDelete: (itemId: string) => void
    canRestoreToOriginalLocation: (itemId: string) => boolean
    restoreToFolder: (itemId: string, newParentId: string) => void
    createFolder: (name: string) => void
    renameItem: (itemId: string, name: string) => void
    downloadItem: (itemId: string) => void
    moveItem: (itemId: string, newParentId: string) => void
    shareItem: (itemId: string, userOrgId: string, role: 'editor' | 'viewer') => void
    removeShare: (shareId: string) => void
    getSharesForItem: (
        itemId: string
    ) => { id: string; userOrgId: string; name: string; email: string; role: string }[]
    orgMembers: { userOrgId: string; name: string; email: string }[]
    uploadFiles: (files: File[]) => void
    uploadTree: (entries: import('./useFileUpload').DroppedEntry[]) => void
    isUploading: boolean
    uploadingFiles: { name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]
    triggerFilePicker: () => void
    triggerFolderPicker: () => void
    uploadNewVersion: (itemId: string, file: File) => Promise<void>
    getItemPath: (itemId: string) => string
    promptDialog: PromptDialog
    promptKey: number
    openPrompt: (state: PromptDialog) => void
    closePrompt: () => void
    handlePromptSubmit: (value: string) => void
    moveTarget: DialogTarget | null
    openMoveDialog: (id: string, name: string) => void
    closeMoveDialog: () => void
    shareTarget: DialogTarget | null
    openShareDialog: (id: string, name: string) => void
    closeShareDialog: () => void
}

export function useDrive(): DriveContextValue {
    return useDriveState()
}

export function useDriveState(): DriveContextValue {
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''

    const pathname = usePathname()
    const { section: activeSection, folderId: currentFolderId } = parseDrivePath(pathname)

    const params = useGlobalSearchParams<{ file?: string; preview?: string }>()
    const selectedItemId = useDriveUIStore(s => s.selectedItemId) ?? params.file ?? null
    const selectItem = useDriveUIStore(s => s.selectItem)
    const selectedIds = useDriveUIStore(s => s.selectedIds)
    const clearSelection = useDriveUIStore(s => s.clearSelection)
    const previewItemId = params.preview === '1' && selectedItemId ? selectedItemId : null

    const [viewMode, setViewMode] = useUserPreference<ViewMode>('drive', 'view_mode', 'list')

    const {
        searchQuery,
        setSearchQuery,
        promptDialog,
        promptKey,
        openPrompt,
        closePrompt,
        moveTarget,
        openMoveDialog: openMoveDialogStore,
        closeMoveDialog,
        shareTarget,
        openShareDialog: openShareDialogStore,
        closeShareDialog,
        detailPanelOpen,
        toggleDetailPanel,
        openDetailPanel,
        closeDetailPanel,
    } = useDriveUIStore()

    const isSearchActive = searchQuery.length >= 2
    const { results: searchResults, isSearching } = useDriveSearch(
        isSearchActive ? searchQuery : '',
        orgId
    )

    const items = useDriveItems({
        userOrgId,
        activeSection,
        currentFolderId,
        selectedItemId,
        previewItemId,
        searchQuery,
        searchResults,
        isSearchActive,
    })

    const mutations = useDriveMutations({
        orgId,
        userOrgId,
        currentFolderId,
        stateByItem: items.stateByItem,
        itemsById: items.itemsById,
        userOrgNames: items.userOrgNames,
        userOrgEmails: items.userOrgEmails,
        sharesByItem: items.sharesByItem,
    })

    const nav = useDriveNavigation({
        orgSlug,
        activeSection,
        currentFolderId,
        selectItem,
        clearSearch: () => setSearchQuery(''),
        clearSelection,
    })

    const openMoveDialog = (id: string, name: string) => {
        selectItem(id)
        openMoveDialogStore(id, name)
    }

    const openShareDialog = (id: string, name: string) => {
        selectItem(id)
        openShareDialogStore(id, name)
    }

    const handlePromptSubmit = (value: string) => {
        if (promptDialog.type === 'new-folder') {
            mutations.createFolder(value)
        } else if (promptDialog.type === 'rename') {
            mutations.renameItem(promptDialog.itemId, value)
        }
        closePrompt()
    }

    return {
        currentFolderId,
        activeSection,
        selectedItemId,
        selectedIds,
        clearSelection,
        viewMode,
        currentItems: items.currentItems,
        breadcrumbs: items.breadcrumbs,
        selectedItem: items.selectedItem,
        folderTree: items.folderTree,
        totalStorageUsed: items.totalStorageUsed,
        isLoading: items.isLoading,
        searchQuery,
        setSearchQuery,
        isSearching,
        previewItem: items.previewItem,
        openPreview: nav.openPreview,
        closePreview: nav.closePreview,
        detailPanelOpen,
        toggleDetailPanel,
        openDetailPanel,
        closeDetailPanel,
        navigateToFolder: nav.navigateToFolder,
        navigateToSection: nav.navigateToSection,
        selectItem,
        setViewMode,
        openItem: nav.openItem,
        toggleStar: mutations.toggleStar,
        moveToTrash: mutations.moveToTrash,
        restoreFromTrash: mutations.restoreFromTrash,
        permanentlyDelete: mutations.permanentlyDelete,
        canRestoreToOriginalLocation: mutations.canRestoreToOriginalLocation,
        restoreToFolder: mutations.restoreToFolder,
        createFolder: mutations.createFolder,
        renameItem: mutations.renameItem,
        downloadItem: mutations.downloadItem,
        moveItem: mutations.moveItem,
        shareItem: mutations.shareItem,
        removeShare: mutations.removeShare,
        getSharesForItem: mutations.getSharesForItem,
        orgMembers: items.orgMembers,
        uploadFiles: mutations.uploadFiles,
        uploadTree: mutations.uploadTree,
        isUploading: mutations.isUploading,
        uploadingFiles: mutations.uploadingFiles,
        triggerFilePicker: mutations.triggerFilePicker,
        triggerFolderPicker: mutations.triggerFolderPicker,
        uploadNewVersion: mutations.uploadNewVersion,
        getItemPath: mutations.getItemPath,
        promptDialog,
        promptKey,
        openPrompt,
        closePrompt,
        handlePromptSubmit,
        moveTarget,
        openMoveDialog,
        closeMoveDialog,
        shareTarget,
        openShareDialog,
        closeShareDialog,
    }
}
