import { useAuth } from '@tinycld/core/lib/auth'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'

export interface ShareEntry {
    id: string
    userId: string
    name: string
    email: string
    role: string
}

export interface OrgMember {
    userId: string
    name: string
    email: string
}

export interface ShareData {
    /** Other members of the current org, minus the current user. */
    orgMembers: OrgMember[]
    /** Existing shares for `itemId`. */
    shares: ShareEntry[]
    /** The current user's id, used by ShareDialog to suppress
     *  self-rows and stamp `created_by`. */
    currentUserOrgId: string
    /** Delete a row from drive_shares by share id. */
    removeShare: (shareId: string) => void
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

    const { data: rawShares } = useOrgLiveQuery(query => query.from({ share: sharesCollection }))

    // Every user in the single database is a member; names/emails are keyed by
    // users id (the value drive_shares.user now stores).
    const { data: allUsers } = useOrgLiveQuery(query => query.from({ user: usersCollection }))

    const userNames = useMemo(
        () => new Map((allUsers ?? []).map(u => [u.id, u.name || u.email || ''])),
        [allUsers]
    )

    const userEmails = useMemo(
        () => new Map((allUsers ?? []).map(u => [u.id, u.email || ''])),
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
                })),
        [allUsers, userId]
    )

    const shares = useMemo<ShareEntry[]>(() => {
        if (!itemId) return []
        return (rawShares ?? [])
            .filter(s => s.item === itemId)
            .map(s => ({
                id: s.id,
                userId: s.user,
                name: userNames.get(s.user) ?? '',
                email: userEmails.get(s.user) ?? '',
                role: s.role,
            }))
    }, [rawShares, itemId, userNames, userEmails])

    const unshareMutation = useMutation({
        mutationFn: mutation(function* (shareId: string) {
            yield sharesCollection.delete(shareId)
        }),
    })

    const removeShare = (shareId: string) => unshareMutation.mutate(shareId)

    return {
        orgMembers,
        shares,
        currentUserOrgId: userId,
        removeShare,
    }
}
