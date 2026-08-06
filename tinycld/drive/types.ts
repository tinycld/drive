import type { FileCategory } from '@tinycld/core/file-viewer/file-icons'
import type {
    CommentMentions,
    DriveItemState,
    DriveItems,
    DriveItemVersions,
    DriveShareLinks,
    DriveShares,
    Users,
} from '@tinycld/core/types/pbSchema'

// The generated pbSchema interfaces are the source of truth for collection
// fields (the migrations already carry the role literal unions), so they are
// re-exported rather than hand-duplicated — a migration-driven field change
// flows through on the next install instead of drifting from a local copy.
export type {
    DriveItemState,
    DriveItems,
    DriveItemVersions,
    DriveShareLinks,
    DriveShares,
    FileCategory,
}

// Roles a public share link can grant. `commentor` = read + comment, no
// edit. `viewer` links are also commentable (the read default).
export type ShareLinkRole = DriveShareLinks['role']

// Roles a direct drive_shares grant can carry. Adds `owner` (full
// control) on top of the link roles.
export type DriveShareRole = DriveShares['role']

export interface DriveItemView {
    id: string
    name: string
    isFolder: boolean
    mimeType: string
    parentId: string
    owner: string
    ownerUserId: string
    updated: string
    size: number
    shared: boolean
    starred: boolean
    trashedAt: string
    file: string
    thumbnail: string
    description: string
    category: FileCategory
    uploadStatus?: 'pending' | 'uploading' | 'done' | 'error'
    uploadLoaded?: number
    uploadError?: string
}

export interface FolderTreeNode {
    item: DriveItemView
    children: FolderTreeNode[]
}

export type ViewMode = 'list' | 'grid'

export type SortField = 'name' | 'owner' | 'updated' | 'size' | 'trashedAt'
export type SortDirection = 'asc' | 'desc'

export type SidebarSection = 'my-drive' | 'shared-with-me' | 'recent' | 'starred' | 'trash'

export type DriveSchema = {
    drive_items: {
        type: DriveItems
        relations: {
            parent: DriveItems
            created_by: Users
        }
    }
    drive_shares: {
        type: DriveShares
        relations: {
            item: DriveItems
            user: Users
            created_by: Users
        }
    }
    drive_item_state: {
        type: DriveItemState
        relations: {
            item: DriveItems
            user: Users
        }
    }
    drive_item_versions: {
        type: DriveItemVersions
        relations: {
            item: DriveItems
            created_by: Users
        }
    }
    drive_share_links: {
        type: DriveShareLinks
        relations: {
            item: DriveItems
            created_by: Users
        }
    }
    comment_mentions: {
        type: CommentMentions
        relations: {
            drive_item: DriveItems
            mentioned_user: Users
        }
    }
}
