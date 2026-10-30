import { and, eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useAuthStore } from '@tinycld/core/lib/stores/auth-store'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'

const WRITE_ROLES = new Set(['owner', 'editor'])

// Mirrors the server's write rule for an item: its creator, or an owner or
// editor share. The server still decides; this only hides actions a user
// cannot take.
export function useCanWriteItem(itemId: string, createdBy: string | undefined) {
    const [sharesCollection] = useStore('drive_shares')
    const userId = useAuthStore(s => s.user?.id)
    const { data: shares } = useMyLiveQuery((query, { userId: me }) =>
        query
            .from({ s: sharesCollection })
            .where(({ s }) => and(eq(s.item, itemId), eq(s.user, me)))
    )
    if (userId && createdBy === userId) return true
    return (shares ?? []).some(share => WRITE_ROLES.has(share.role))
}
