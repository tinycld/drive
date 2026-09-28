import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@tinycld/core/lib/auth'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'

export interface ShareEntry {
    id: string
    userId: string
    name: string
    email: string
    role: string
    avatar: string
    avatarCrop: string
    avatarColor: string
    avatarEmoji: string
}

export interface OrgMember {
    userId: string
    name: string
    email: string
    avatar: string
    avatarCrop: string
    avatarColor: string
    avatarEmoji: string
}

export interface ShareData {
    /** Other members of the current org, minus the current user. */
    orgMembers: OrgMember[]
    /** Existing shares for `itemId`. */
    shares: ShareEntry[]
    /** The current user's id, used by ShareDialog to suppress
     *  self-rows and stamp `created_by`. */
    currentUserId: string
    /** Delete a row from drive_shares by share id. */
    removeShare: (shareId: string) => void
    /** Whether the current user may add, change, or remove shares on the item. */
    canManage: boolean
}

/**
 * Loads the data ShareDialog needs without depending on `useDrive()` context.
 * `useDrive()` is only mounted inside the Drive screen tree; this hook is for
 * surfaces that render ShareDialog from elsewhere (the text and calc File
 * menus). drive_shares is on-demand now, and this hook is the whole reason
 * the query is scoped to `itemId`: it exists precisely for the path outside
 * the drive screen, where none of drive's other queries (which already hold
 * a whole-org drive_shares subscription) are mounted to share the cost.
 */
export function useShareData(itemId: string): ShareData {
    const userId = useAuth().user.id
    const [sharesCollection] = useStore('drive_shares')
    const [usersCollection] = useStore('users')
    const [itemsCollection] = useStore('drive_items')

    const { data: rawShares } = useLiveQuery({
        query: query => {
            if (!itemId) return null
            return query
                .from({ share: sharesCollection })
                .where(({ share }) => eq(share.item, itemId))
        },
    })

    // drive_items is on-demand with per-query realtime, so this issues one
    // server fetch for the item and stays subscribed to just that row.
    const { data: sharedItem } = useLiveQuery({
        query: query => {
            if (!itemId) return null
            return query
                .from({ item: itemsCollection })
                .where(({ item }) => eq(item.id, itemId))
                .findOne()
        },
    })

    // Every user in the single database is a member, and a share row can name
    // any of them, so this stays unfiltered by role/id. pbtsdb doesn't pass a
    // fields= param to PocketBase, so .select() here narrows the row shape
    // userNames/userEmails/userAvatars/orgMembers depend on — it does not
    // shrink what comes over the wire.
    const { data: allUsers } = useLiveQuery(query =>
        query.from({ user: usersCollection }).select(({ user }) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            avatar_crop: user.avatar_crop,
            avatar_color: user.avatar_color,
            avatar_emoji: user.avatar_emoji,
        }))
    )

    // Share-picker candidates, separately scoped from allUsers: a share row's
    // user can be anyone (userNames/userEmails/userAvatars must resolve them
    // regardless of role), but a share can only be offered to a non-guest,
    // non-disabled member.
    const { data: memberCandidates } = useLiveQuery(query =>
        query
            .from({ user: usersCollection })
            .where(({ user }) =>
                and(inArray(user.role, ['owner', 'admin', 'member']), eq(user.disabled, false))
            )
            .select(({ user }) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                avatar_crop: user.avatar_crop,
                avatar_color: user.avatar_color,
                avatar_emoji: user.avatar_emoji,
            }))
    )

    const userNames = useMemo(
        () => new Map((allUsers ?? []).map(u => [u.id, u.name || u.email || ''])),
        [allUsers]
    )

    const userEmails = useMemo(
        () => new Map((allUsers ?? []).map(u => [u.id, u.email || ''])),
        [allUsers]
    )

    const userAvatars = useMemo(
        () =>
            new Map(
                (allUsers ?? []).map(u => [
                    u.id,
                    {
                        avatar: u.avatar || '',
                        avatarCrop: u.avatar_crop || '',
                        avatarColor: u.avatar_color || '',
                        avatarEmoji: u.avatar_emoji || '',
                    },
                ])
            ),
        [allUsers]
    )

    const orgMembers = useMemo<OrgMember[]>(
        () =>
            (memberCandidates ?? [])
                .filter(u => u.id !== userId)
                .map(u => ({
                    userId: u.id,
                    name: u.name || '',
                    email: u.email || '',
                    avatar: u.avatar || '',
                    avatarCrop: u.avatar_crop || '',
                    avatarColor: u.avatar_color || '',
                    avatarEmoji: u.avatar_emoji || '',
                })),
        [memberCandidates, userId]
    )

    const shares = useMemo<ShareEntry[]>(() => {
        if (!itemId) return []
        const emptyAvatar = { avatar: '', avatarCrop: '', avatarColor: '', avatarEmoji: '' }
        // Direct shares only: grant rows have no user, derived rows are shown under their group.
        // rawShares is already scoped to itemId by the query.
        return (rawShares ?? [])
            .filter(s => s.group === '')
            .map(s => ({
                id: s.id,
                userId: s.user,
                name: userNames.get(s.user) ?? '',
                email: userEmails.get(s.user) ?? '',
                role: s.role,
                ...(userAvatars.get(s.user) ?? emptyAvatar),
            }))
    }, [rawShares, itemId, userNames, userEmails, userAvatars])

    const unshareMutation = useMutation({
        mutationFn: mutation(function* (shareId: string) {
            yield sharesCollection.delete(shareId)
        }),
    })

    const removeShare = (shareId: string) => unshareMutation.mutate(shareId)

    return {
        orgMembers,
        shares,
        currentUserId: userId,
        removeShare,
        // The drive_shares rules let only the item creator manage shares, so
        // the client offers management to exactly that person.
        canManage: (sharedItem?.created_by ?? '') === userId,
    }
}
