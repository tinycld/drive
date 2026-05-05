import { pb } from '@tinycld/core/lib/pocketbase'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useQuery } from '@tanstack/react-query'

interface StorageUsageResponse {
    user_used_bytes?: number
    org_drive_bytes?: number
    org_mail_bytes?: number
    limit_bytes?: number
    has_limit?: boolean
}

/**
 * Bytes the current user has stored in this org. Backed by /api/drive/storage-usage,
 * which sums drive_items + drive_item_versions server-side. Replaces an older
 * approach that summed every loaded drive_item locally — that doesn't work
 * once we stop fetching the whole org.
 */
export function useTotalStorage() {
    const { orgId } = useOrgInfo()
    const { data } = useQuery<StorageUsageResponse>({
        queryKey: ['storage-usage', orgId],
        queryFn: () => pb.send('/api/drive/storage-usage', { query: { org: orgId } }),
        enabled: !!orgId,
    })
    return data?.user_used_bytes ?? 0
}
