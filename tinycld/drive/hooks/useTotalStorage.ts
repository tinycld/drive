import { useQuery } from '@tanstack/react-query'
import type { StorageUsageResponse } from '@tinycld/app-generated/drive-api'
import { pb } from '@tinycld/core/lib/pocketbase'

export interface StorageUsage {
    usedBytes: number
    limitBytes: number
    hasLimit: boolean
}

/**
 * Bytes the current user has stored in this org, plus the org's configured per-user
 * limit. Backed by /api/drive/storage-usage, which sums drive_items + drive_item_versions
 * server-side. Replaces an older approach that summed every loaded drive_item locally —
 * that doesn't work once we stop fetching the whole org.
 */
export function useTotalStorage(): StorageUsage {
    const { data } = useQuery<StorageUsageResponse>({
        queryKey: ['storage-usage'],
        queryFn: () => pb.send('/api/drive/storage-usage', {}),
    })
    return {
        usedBytes: data?.user_used_bytes ?? 0,
        limitBytes: data?.limit_bytes ?? 0,
        hasLimit: data?.has_limit ?? false,
    }
}
