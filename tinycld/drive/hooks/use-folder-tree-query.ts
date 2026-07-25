import { and, eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'
import { useMemo } from 'react'
import type { FolderTreeNode } from '../types'

interface UseFolderTreeQueryArgs {
    /**
     * Accepted for API symmetry with the original useFolderTree helper,
     * but ignored — useOrgLiveQuery already gates on org context, and
     * the folders list is cheap enough that a "disabled" branch would
     * complicate the call site without measurable savings.
     */
    enabled?: boolean
}

interface FolderRow {
    id: string
    name: string
    parent: string
}

// useFolderTreeQuery is the standalone counterpart to the `folderTree`
// memo inside useDriveItems. Drive's full state tree carries the same
// data already, but external callers (e.g. ChooseFolderDialog mounted
// from @tinycld/calc) don't run that tree — they need a small,
// self-contained source. Returns the same FolderTreeNode[] shape so
// the dialog renderer is unchanged.
//
// Filters: folders only, owned by the current user. Trash state
// is intentionally not joined — moving/copying into a trashed folder
// would surface as a server-side error and is not a real flow.
export function useFolderTreeQuery(_: UseFolderTreeQueryArgs = {}): FolderTreeNode[] {
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userId = userOrg?.id ?? ''

    const [itemsCollection] = useStore('drive_items')

    const { data: folders = [] } = useOrgLiveQuery(
        (query, { userId }) =>
            query
                .from({ item: itemsCollection })
                .where(({ item }) => and(eq(item.is_folder, true), eq(item.created_by, userId)))
                .select(({ item }) => ({
                    id: item.id,
                    name: item.name,
                    parent: item.parent,
                })),
        []
    )

    return useMemo(() => buildFolderTree(folders, userId), [folders, userId])
}

function buildFolderTree(folders: FolderRow[], userId: string): FolderTreeNode[] {
    function build(parentId: string): FolderTreeNode[] {
        return folders
            .filter(f => f.parent === parentId)
            .map(f => ({
                item: toView(f, userId),
                children: build(f.id),
            }))
    }
    return build('')
}

function toView(row: FolderRow, userId: string) {
    // Shape-compatible with DriveItemView for the fields
    // ChooseFolderDialog actually reads (id, name). Other fields default
    // — the dialog never inspects them.
    return {
        id: row.id,
        name: row.name,
        isFolder: true,
        mimeType: '',
        parentId: row.parent,
        owner: userId,
        ownerUserId: userId,
        updated: '',
        size: 0,
        shared: false,
        starred: false,
        trashedAt: '',
        file: '',
        thumbnail: '',
        description: '',
        category: 'folder' as const,
    }
}
