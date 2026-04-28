import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import { mimeTypeToCategory } from '../components/file-icons'
import type { DriveItemView, FolderTreeNode, SidebarSection } from '../types'
import type { DriveSearchResult } from './useDriveSearch'

interface UseDriveItemsParams {
    userOrgId: string
    activeSection: SidebarSection
    currentFolderId: string
    selectedItemId: string | null
    previewItemId: string | null
    searchQuery: string
    searchResults: DriveSearchResult[]
    isSearchActive: boolean
}

export function useDriveItems({
    userOrgId,
    activeSection,
    currentFolderId,
    selectedItemId,
    previewItemId,
    searchResults,
    isSearchActive,
}: UseDriveItemsParams) {
    const [itemsCollection] = useStore('drive_items')
    const [sharesCollection] = useStore('drive_shares')
    const [stateCollection] = useStore('drive_item_state')
    const [userOrgCollection] = useStore('user_org')

    const { data: rawItems } = useOrgLiveQuery((query, { orgId: scopedOrgId }) =>
        query.from({ item: itemsCollection }).where(({ item }) => eq(item.org, scopedOrgId))
    )

    const { data: rawShares } = useOrgLiveQuery((query, { orgId: scopedOrgId }) =>
        query
            .from({ share: sharesCollection })
            .join({ item: itemsCollection }, ({ share, item }) => eq(share.item, item.id))
            .where(({ item }) => eq(item.org, scopedOrgId))
            .select(({ share }) => share)
    )

    const { data: rawStates } = useOrgLiveQuery((query, { userOrgId: scopedUserOrgId }) =>
        query.from({ state: stateCollection }).where(({ state }) => eq(state.user_org, scopedUserOrgId))
    )

    const { data: orgUserOrgs } = useOrgLiveQuery((query, { orgId: scopedOrgId }) =>
        query.from({ uo: userOrgCollection }).where(({ uo }) => eq(uo.org, scopedOrgId))
    )

    const userOrgNames = useMemo(
        () => new Map((orgUserOrgs ?? []).map((uo) => [uo.id, uo.expand?.user?.name || uo.expand?.user?.email || ''])),
        [orgUserOrgs]
    )

    const orgMembers = useMemo(
        () =>
            (orgUserOrgs ?? [])
                .filter((uo) => uo.id !== userOrgId)
                .map((uo) => ({
                    userOrgId: uo.id,
                    name: uo.expand?.user?.name || '',
                    email: uo.expand?.user?.email || '',
                })),
        [orgUserOrgs, userOrgId]
    )

    const userOrgEmails = useMemo(
        () => new Map((orgUserOrgs ?? []).map((uo) => [uo.id, uo.expand?.user?.email || ''])),
        [orgUserOrgs]
    )

    const sharesByItem = useMemo(() => {
        const map = new Map<string, NonNullable<typeof rawShares>>()
        for (const share of rawShares ?? []) {
            const list = map.get(share.item) ?? []
            list.push(share)
            map.set(share.item, list)
        }
        return map
    }, [rawShares])

    const stateByItem = useMemo(() => new Map((rawStates ?? []).map((s) => [s.item, s])), [rawStates])

    const allItems = useMemo<DriveItemView[]>(
        () =>
            (rawItems ?? []).map((item) => {
                const state = stateByItem.get(item.id)
                const shares = sharesByItem.get(item.id) ?? []
                const hasNonOwnerShares = shares.some((s) => s.role !== 'owner')
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
                    thumbnail: (item as unknown as { thumbnail?: string }).thumbnail ?? '',
                    description: item.description,
                    category: mimeTypeToCategory(item.mime_type, item.is_folder),
                }
            }),
        [rawItems, stateByItem, sharesByItem, userOrgId, userOrgNames]
    )

    const itemsById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems])

    const searchItemViews = useMemo<DriveItemView[]>(() => {
        if (!isSearchActive) return []
        return searchResults.map((sr) => {
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
                thumbnail: '',
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
                    (i) => i.ownerUserOrgId === userOrgId && i.parentId === currentFolderId && !i.trashedAt
                )
            case 'shared-with-me':
                return allItems.filter((i) => i.ownerUserOrgId !== userOrgId && !i.trashedAt)
            case 'recent':
                return allItems
                    .filter((i) => !i.isFolder && !i.trashedAt)
                    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
                    .slice(0, 20)
            case 'starred':
                return allItems.filter((i) => i.starred && !i.trashedAt)
            case 'trash':
                return allItems.filter((i) => !!i.trashedAt)
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

    const previewItem = useMemo(
        () => (previewItemId ? (itemsById.get(previewItemId) ?? null) : null),
        [previewItemId, itemsById]
    )

    const folderTree = useMemo(() => {
        const folders = allItems.filter((i) => i.isFolder && i.ownerUserOrgId === userOrgId && !i.trashedAt)

        function buildTree(parentId: string): FolderTreeNode[] {
            return folders
                .filter((f) => f.parentId === parentId)
                .map((folder) => ({
                    item: folder,
                    children: buildTree(folder.id),
                }))
        }

        return buildTree('')
    }, [allItems, userOrgId])

    const totalStorageUsed = useMemo(() => allItems.reduce((sum, i) => sum + i.size, 0), [allItems])

    const isLoading = !rawItems || !rawShares || !rawStates || !orgUserOrgs

    return {
        allItems,
        itemsById,
        currentItems,
        breadcrumbs,
        selectedItem,
        previewItem,
        folderTree,
        totalStorageUsed,
        isLoading,
        orgMembers,
        stateByItem,
        sharesByItem,
        userOrgNames,
        userOrgEmails,
        rawItems,
    }
}
