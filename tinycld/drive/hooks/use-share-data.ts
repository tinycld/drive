import { eq } from '@tanstack/db'
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
 * menus). The drive_shares and users collections are small and eager, so
 * subscribing here is cheap and pbtsdb de-duplicates with any other live
 * queries against the same collections.
 */
export function useShareData(itemId: string): ShareData {
    const userId = useAuth().user.id
    const [sharesCollection] = useStore('drive_shares')
    const [usersCollection] = useStore('users')
    const [itemsCollection] = useStore('drive_items')

    const { data: rawShares } = useLiveQuery(query => query.from({ share: sharesCollection }))

    // drive_items is on-demand, so this issues one server fetch for the item.
    const { data: sharedItem } = useLiveQuery({
        query: query => {
            if (!itemId) return null
            return query
                .from({ item: itemsCollection })
                .where(({ item }) => eq(item.id, itemId))
                .findOne()
        },
    })

    // Every user in the single database is a member; names/emails are keyed by
    // users id (the value drive_shares.user now stores).
    const { data: allUsers } = useLiveQuery(query => query.from({ user: usersCollection }))

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
            (allUsers ?? [])
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
        [allUsers, userId]
    )

    const shares = useMemo<ShareEntry[]>(() => {
        if (!itemId) return []
        const emptyAvatar = { avatar: '', avatarCrop: '', avatarColor: '', avatarEmoji: '' }
        // Direct shares only: grant rows have no user, derived rows are shown under their group.
        return (rawShares ?? [])
            .filter(s => s.item === itemId && s.group === '')
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
