import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { DriveShares } from '@tinycld/drive/types'
import { useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgSlug } from '~/lib/use-org-slug'

/**
 * Returns the current user's role for a given drive item (spreadsheet).
 * Uses drive_shares for access control.
 */
export function useWorkbookRole(driveItemId: string): DriveShares['role'] {
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const [sharesCollection] = useStore('drive_shares')

    const { data: shares } = useLiveQuery(
        query =>
            query
                .from({ share: sharesCollection })
                .where(({ share }) =>
                    and(eq(share.item, driveItemId), eq(share.user_org, userOrgId))
                ),
        [driveItemId, userOrgId]
    )

    return shares?.[0]?.role ?? 'viewer'
}
