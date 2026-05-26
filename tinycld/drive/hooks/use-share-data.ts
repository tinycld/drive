import { eq } from '@tanstack/db'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useCurrentRole } from '@tinycld/core/lib/use-current-role'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'

export interface ShareEntry {
    id: string
    userOrgId: string
    name: string
    email: string
    role: string
}

export interface OrgMember {
    userOrgId: string
    name: string
    email: string
}

export interface ShareData {
    /** Other members of the current org, minus the current user. */
    orgMembers: OrgMember[]
    /** Existing shares for `itemId`. */
    shares: ShareEntry[]
    /** The current user's user_org id, used by ShareDialog to suppress
     *  self-rows and stamp `created_by`. */
    currentUserOrgId: string
    /** Delete a row from drive_shares by share id. */
    removeShare: (shareId: string) => void
}

/**
 * Loads the data ShareDialog needs without depending on `useDrive()` context.
 * `useDrive()` is only mounted inside the Drive screen tree; this hook is for
 * surfaces that render ShareDialog from elsewhere (the text and calc File
 * menus). The drive_shares and user_org collections are small and eager, so
 * subscribing here is cheap and pbtsdb de-duplicates with any other live
 * queries against the same collections.
 */
export function useShareData(itemId: string): ShareData {
    const { userOrgId } = useCurrentRole()
    const [sharesCollection] = useStore('drive_shares')
    const [userOrgCollection] = useStore('user_org')

    const { data: rawShares } = useOrgLiveQuery(query => query.from({ share: sharesCollection }))

    const { data: orgUserOrgs } = useOrgLiveQuery((query, { orgId }) =>
        query.from({ uo: userOrgCollection }).where(({ uo }) => eq(uo.org, orgId))
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

    const userOrgEmails = useMemo(
        () => new Map((orgUserOrgs ?? []).map(uo => [uo.id, uo.expand?.user?.email || ''])),
        [orgUserOrgs]
    )

    const orgMembers = useMemo<OrgMember[]>(
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

    const shares = useMemo<ShareEntry[]>(() => {
        if (!itemId) return []
        return (rawShares ?? [])
            .filter(s => s.item === itemId)
            .map(s => ({
                id: s.id,
                userOrgId: s.user_org,
                name: userOrgNames.get(s.user_org) ?? '',
                email: userOrgEmails.get(s.user_org) ?? '',
                role: s.role,
            }))
    }, [rawShares, itemId, userOrgNames, userOrgEmails])

    const unshareMutation = useMutation({
        mutationFn: mutation(function* (shareId: string) {
            yield sharesCollection.delete(shareId)
        }),
    })

    const removeShare = (shareId: string) => unshareMutation.mutate(shareId)

    return {
        orgMembers,
        shares,
        currentUserOrgId: userOrgId,
        removeShare,
    }
}
