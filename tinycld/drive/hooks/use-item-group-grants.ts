import { useAuth } from '@tinycld/core/lib/auth'
import { useGroupGrants } from '@tinycld/core/lib/groups/use-group-grants'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { GROUP_ROLE_OPTIONS } from '../lib/share-roles'

/**
 * Group grants on one drive item, ready to spread into GroupShareSection.
 * Core owns the query and the writes; this only says which collection,
 * which item, and how a drive_shares row is built.
 */
export function useItemGroupGrants(itemId: string) {
    const { user } = useAuth()
    const [sharesCollection] = useStore('drive_shares')
    return useGroupGrants({
        collection: sharesCollection,
        roles: GROUP_ROLE_OPTIONS,
        isForResource: row => row.item === itemId,
        buildRow: grant => ({
            ...grant,
            item: itemId,
            created_by: user.id,
        }),
    })
}
