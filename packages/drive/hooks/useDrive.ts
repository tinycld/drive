import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { newRecordId } from 'pbtsdb'
import { useActiveParams, useRouter } from 'one'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { useMutation } from '~/lib/mutations'
import { useOrgHref } from '~/lib/org-routes'
import { pb, useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgInfo } from '~/lib/use-org-info'
import { mimeTypeToCategory } from '../components/file-icons'
import type { DriveItemView, FolderTreeNode, SidebarSection, ViewMode } from '../types'
import { useDriveSearch } from './useDriveSearch'
import { useFileUpload } from './useFileUpload'

interface DriveContextValue {
    currentFolderId: string
    activeSection: SidebarSection
    selectedItemId: string | null
    viewMode: ViewMode
    currentItems: DriveItemView[]
    breadcrumbs: DriveItemView[]
    selectedItem: DriveItemView | undefined
    folderTree: FolderTreeNode[]
    totalStorageUsed: number
    isLoading: boolean
    searchQuery: string
    setSearchQuery: (query: string) => void
    isSearching: boolean
    navigateToFolder: (folderId: string) => void
    navigateToSection: (section: SidebarSection) => void
    selectItem: (itemId: string | null) => void
    setViewMode: (mode: ViewMode) => void
    openItem: (item: DriveItemView) => void
    toggleStar: (itemId: string) => void
    moveToTrash: (itemId: string) => void
    restoreFromTrash: (itemId: string) => void
    createFolder: (name: string) => void
    renameItem: (itemId: string, name: string) => void
    downloadItem: (itemId: string) => void
    moveItem: (itemId: string, newParentId: string) => void
    shareItem: (itemId: string, userOrgId: string, role: 'editor' | 'viewer') => void
    removeShare: (shareId: string) => void
    getSharesForItem: (itemId: string) => { id: string; userOrgId: string; name: string; email: string; role: string }[]
    orgMembers: { userOrgId: string; name: string; email: string }[]
    uploadFiles: (files: File[]) => void
    isUploading: boolean
    uploadingFiles: { name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[]
    triggerFilePicker: () => void
    uploadNewVersion: (itemId: string, file: File) => Promise<void>
}

export const DriveContext = createContext<DriveContextValue | null>(null)

export function useDrive(): DriveContextValue {
    const ctx = useContext(DriveContext)
    if (!ctx) throw new Error('useDrive must be used within DriveProvider')
    return ctx
}

function parseSectionParam(s: string | undefined): SidebarSection {
    const valid: SidebarSection[] = ['my-drive', 'shared-with-me', 'recent', 'starred', 'trash']
    return valid.includes(s as SidebarSection) ? (s as SidebarSection) : 'my-drive'
}

export function useDriveState(): DriveContextValue {
    const { orgSlug, orgId } = useOrgInfo()
    const router = useRouter()
    const orgHref = useOrgHref()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''

    const [itemsCollection] = useStore('drive_items')
    const [sharesCollection] = useStore('drive_shares')
    const [stateCollection] = useStore('drive_item_state')
    const [userOrgCollection] = useStore('user_org')

    const params = useActiveParams<{
        folder?: string
        file?: string
        section?: string
    }>()
    const currentFolderId = params.folder ?? ''
    const selectedItemId = params.file ?? null
    const activeSection = parseSectionParam(params.section)

    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [searchQuery, setSearchQuery] = useState('')

    const pushParams = useCallback(
        (p: { folder?: string; file?: string; section?: string }) => {
            const query: Record<string, string> = {}
            if (p.folder) query.folder = p.folder
            if (p.file) query.file = p.file
            if (p.section && p.section !== 'my-drive') query.section = p.section
            router.push(orgHref('drive', query))
        },
        [router, orgHref]
    )

    const isSearchActive = searchQuery.length >= 2
    const { results: searchResults, isSearching } = useDriveSearch(
        isSearchActive ? searchQuery : '',
        orgId
    )

    const { data: rawItems } = useLiveQuery(
        query => query.from({ item: itemsCollection }).where(({ item }) => eq(item.org, orgId)),
        [orgId]
    )

    const { data: rawShares } = useLiveQuery(query => query.from({ share: sharesCollection }), [])

    const { data: rawStates } = useLiveQuery(
        query =>
            query
                .from({ state: stateCollection })
                .where(({ state }) => eq(state.user_org, userOrgId)),
        [userOrgId]
    )

    const { data: orgUserOrgs } = useLiveQuery(
        query => query.from({ uo: userOrgCollection }).where(({ uo }) => eq(uo.org, orgId)),
        [orgId]
    )

    const userOrgNames = useMemo(
        () =>
            new Map(
                (orgUserOrgs ?? []).map(uo => [
                    uo.id,
                    uo.expand?.user?.name || uo.expand?.user?.email || '',
                ])
            ),
        [orgUserOrgs]
    )

    const orgMembers = useMemo(
        () =>
            (orgUserOrgs ?? [])
                .filter(uo => uo.id !== userOrgId)
                .map(uo => ({
                    userOrgId: uo.id,
                    name: uo.expand?.user?.name || '',
                    email: uo.expand?.user?.email || '',
                })),
        [orgUserOrgs, userOrgId]
    )

    const userOrgEmails = useMemo(
        () =>
            new Map(
                (orgUserOrgs ?? []).map(uo => [
                    uo.id,
                    uo.expand?.user?.email || '',
                ])
            ),
        [orgUserOrgs]
    )

    const sharesByItem = useMemo(() => {
        const map = new Map<string, typeof rawShares>()
        for (const share of rawShares ?? []) {
            const list = map.get(share.item) ?? []
            list.push(share)
            map.set(share.item, list)
        }
        return map
    }, [rawShares])

    const stateByItem = useMemo(() => new Map((rawStates ?? []).map(s => [s.item, s])), [rawStates])

    const allItems = useMemo<DriveItemView[]>(
        () =>
            (rawItems ?? []).map(item => {
                const state = stateByItem.get(item.id)
                const shares = sharesByItem.get(item.id) ?? []
                const hasNonOwnerShares = shares.some(s => s.role !== 'owner')
                const ownerName = userOrgNames.get(item.created_by) ?? ''

                return {
                    id: item.id,
                    name: item.name,
                    isFolder: item.is_folder,
                    mimeType: item.mime_type,
                    parentId: item.parent ?? '',
                    owner: item.created_by === userOrgId ? 'me' : ownerName,
                    ownerUserOrgId: item.created_by,
                    updated: item.updated,
                    size: item.size,
                    shared: hasNonOwnerShares,
                    starred: state?.is_starred ?? false,
                    trashedAt: state?.trashed_at ?? '',
                    file: item.file,
                    description: item.description,
                    category: mimeTypeToCategory(item.mime_type, item.is_folder),
                }
            }),
        [rawItems, stateByItem, sharesByItem, userOrgId, userOrgNames]
    )

    const itemsById = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems])

    const searchItemViews = useMemo<DriveItemView[]>(() => {
        if (!isSearchActive) return []
        return searchResults.map(sr => {
            const existing = itemsById.get(sr.id)
            if (existing) return existing
            return {
                id: sr.id,
                name: sr.name,
                isFolder: sr.is_folder,
                mimeType: sr.mime_type,
                parentId: '',
                owner: '',
                ownerUserOrgId: '',
                updated: '',
                size: sr.size,
                shared: false,
                starred: false,
                trashedAt: '',
                file: '',
                description: sr.description,
                category: mimeTypeToCategory(sr.mime_type, sr.is_folder),
            }
        })
    }, [isSearchActive, searchResults, itemsById])

    const currentItems = useMemo(() => {
        if (isSearchActive) return searchItemViews

        switch (activeSection) {
            case 'my-drive':
                return allItems.filter(
                    i =>
                        i.ownerUserOrgId === userOrgId &&
                        i.parentId === currentFolderId &&
                        !i.trashedAt
                )
            case 'shared-with-me':
                return allItems.filter(i => i.ownerUserOrgId !== userOrgId && !i.trashedAt)
            case 'recent':
                return allItems
                    .filter(i => !i.isFolder && !i.trashedAt)
                    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
                    .slice(0, 20)
            case 'starred':
                return allItems.filter(i => i.starred && !i.trashedAt)
            case 'trash':
                return allItems.filter(i => !!i.trashedAt)
            default:
                return []
        }
    }, [isSearchActive, searchItemViews, activeSection, allItems, currentFolderId, userOrgId])

    const breadcrumbs = useMemo(() => {
        const crumbs: DriveItemView[] = []
        let id = currentFolderId
        while (id) {
            const item = itemsById.get(id)
            if (!item) break
            crumbs.unshift(item)
            id = item.parentId
        }
        return crumbs
    }, [currentFolderId, itemsById])

    const selectedItem = useMemo(
        () => (selectedItemId ? itemsById.get(selectedItemId) : undefined),
        [selectedItemId, itemsById]
    )

    const folderTree = useMemo(() => {
        const folders = allItems.filter(
            i => i.isFolder && i.ownerUserOrgId === userOrgId && !i.trashedAt
        )

        function buildTree(parentId: string): FolderTreeNode[] {
            return folders
                .filter(f => f.parentId === parentId)
                .map(folder => ({
                    item: folder,
                    children: buildTree(folder.id),
                }))
        }

        return buildTree('')
    }, [allItems, userOrgId])

    const totalStorageUsed = useMemo(() => allItems.reduce((sum, i) => sum + i.size, 0), [allItems])

    const isLoading = !rawItems || !rawShares || !rawStates || !orgUserOrgs

    const toggleStarMutation = useMutation({
        mutationFn: function* ({ itemId, starred }: { itemId: string; starred: boolean }) {
            const existing = stateByItem.get(itemId)
            if (existing) {
                yield stateCollection.update(existing.id, draft => {
                    draft.is_starred = !starred
                })
            } else {
                yield stateCollection.insert({
                    id: newRecordId(),
                    item: itemId,
                    user_org: userOrgId,
                    is_starred: true,
                    trashed_at: '',
                    last_viewed_at: '',
                })
            }
        },
    })

    const trashMutation = useMutation({
        mutationFn: function* ({ itemId, restore }: { itemId: string; restore: boolean }) {
            const existing = stateByItem.get(itemId)
            if (existing) {
                yield stateCollection.update(existing.id, draft => {
                    draft.trashed_at = restore ? '' : new Date().toISOString()
                })
            } else if (!restore) {
                yield stateCollection.insert({
                    id: newRecordId(),
                    item: itemId,
                    user_org: userOrgId,
                    is_starred: false,
                    trashed_at: new Date().toISOString(),
                    last_viewed_at: '',
                })
            }
        },
    })

    const toggleStar = useCallback(
        (itemId: string) => {
            const item = itemsById.get(itemId)
            toggleStarMutation.mutate({ itemId, starred: item?.starred ?? false })
        },
        [itemsById, toggleStarMutation]
    )

    const moveToTrash = useCallback(
        (itemId: string) => trashMutation.mutate({ itemId, restore: false }),
        [trashMutation]
    )

    const restoreFromTrash = useCallback(
        (itemId: string) => trashMutation.mutate({ itemId, restore: true }),
        [trashMutation]
    )

    const createFolderMutation = useMutation({
        mutationFn: function* (name: string) {
            yield itemsCollection.insert({
                id: newRecordId(),
                org: orgId,
                name,
                is_folder: true,
                mime_type: '',
                parent: currentFolderId || '',
                created_by: userOrgId,
                size: 0,
                file: '',
                description: '',
            })
        },
    })

    const renameMutation = useMutation({
        mutationFn: function* ({ itemId, name }: { itemId: string; name: string }) {
            yield itemsCollection.update(itemId, draft => {
                draft.name = name
            })
        },
    })

    const shareMutation = useMutation({
        mutationFn: function* ({
            itemId,
            targetUserOrgId,
            role,
        }: { itemId: string; targetUserOrgId: string; role: 'editor' | 'viewer' }) {
            yield sharesCollection.insert({
                id: newRecordId(),
                item: itemId,
                user_org: targetUserOrgId,
                role,
                created_by: userOrgId,
            })
        },
    })

    const unshareMutation = useMutation({
        mutationFn: function* (shareId: string) {
            yield sharesCollection.delete(shareId)
        },
    })

    const shareItem = useCallback(
        (itemId: string, targetUserOrgId: string, role: 'editor' | 'viewer') =>
            shareMutation.mutate({ itemId, targetUserOrgId, role }),
        [shareMutation]
    )

    const removeShare = useCallback(
        (shareId: string) => unshareMutation.mutate(shareId),
        [unshareMutation]
    )

    const getSharesForItem = useCallback(
        (itemId: string) => {
            const shares = sharesByItem.get(itemId) ?? []
            return shares.map(s => ({
                id: s.id,
                userOrgId: s.user_org,
                name: userOrgNames.get(s.user_org) ?? '',
                email: userOrgEmails.get(s.user_org) ?? '',
                role: s.role,
            }))
        },
        [sharesByItem, userOrgNames, userOrgEmails]
    )

    const moveMutation = useMutation({
        mutationFn: function* ({
            itemId,
            newParentId,
        }: { itemId: string; newParentId: string }) {
            yield itemsCollection.update(itemId, draft => {
                draft.parent = newParentId
            })
        },
    })

    const moveItem = useCallback(
        (itemId: string, newParentId: string) => moveMutation.mutate({ itemId, newParentId }),
        [moveMutation]
    )

    const createFolder = useCallback(
        (name: string) => createFolderMutation.mutate(name),
        [createFolderMutation]
    )

    const renameItem = useCallback(
        (itemId: string, name: string) => renameMutation.mutate({ itemId, name }),
        [renameMutation]
    )

    const downloadItem = useCallback(
        (itemId: string) => {
            const item = itemsById.get(itemId)
            if (!item?.file) return
            const url = pb.files.getURL(
                { collectionId: 'drive_items', id: itemId },
                item.file
            )
            if (Platform.OS === 'web') {
                const a = document.createElement('a')
                a.href = url
                a.download = item.name
                a.click()
            }
        },
        [itemsById]
    )

    const { uploadFiles, isUploading, uploadingFiles, triggerFilePicker, uploadNewVersion } =
        useFileUpload({
            orgId,
            userOrgId,
            currentFolderId,
        })

    const navigateToFolder = useCallback(
        (folderId: string) => {
            pushParams({ folder: folderId || undefined })
            setSearchQuery('')
        },
        [pushParams]
    )

    const navigateToSection = useCallback(
        (section: SidebarSection) => {
            pushParams({ section })
            setSearchQuery('')
        },
        [pushParams]
    )

    const selectItem = useCallback(
        (itemId: string | null) => {
            pushParams({
                folder: currentFolderId || undefined,
                section: activeSection !== 'my-drive' ? activeSection : undefined,
                file: itemId ?? undefined,
            })
        },
        [pushParams, currentFolderId, activeSection]
    )

    const openItem = useCallback(
        (item: DriveItemView) => {
            if (item.isFolder) {
                navigateToFolder(item.id)
            } else {
                selectItem(item.id)
            }
        },
        [navigateToFolder, selectItem]
    )

    return useMemo(
        () => ({
            currentFolderId,
            activeSection,
            selectedItemId,
            viewMode,
            currentItems,
            breadcrumbs,
            selectedItem,
            folderTree,
            totalStorageUsed,
            isLoading,
            searchQuery,
            setSearchQuery,
            isSearching,
            navigateToFolder,
            navigateToSection,
            selectItem,
            setViewMode,
            openItem,
            toggleStar,
            moveToTrash,
            restoreFromTrash,
            createFolder,
            renameItem,
            downloadItem,
            moveItem,
            shareItem,
            removeShare,
            getSharesForItem,
            orgMembers,
            uploadFiles,
            isUploading,
            uploadingFiles,
            triggerFilePicker,
            uploadNewVersion,
        }),
        [
            currentFolderId,
            activeSection,
            selectedItemId,
            viewMode,
            currentItems,
            breadcrumbs,
            selectedItem,
            folderTree,
            totalStorageUsed,
            isLoading,
            searchQuery,
            isSearching,
            navigateToFolder,
            navigateToSection,
            selectItem,
            openItem,
            toggleStar,
            moveToTrash,
            restoreFromTrash,
            createFolder,
            renameItem,
            downloadItem,
            moveItem,
            shareItem,
            removeShare,
            getSharesForItem,
            orgMembers,
            uploadFiles,
            isUploading,
            uploadingFiles,
            triggerFilePicker,
            uploadNewVersion,
        ]
    )
}
