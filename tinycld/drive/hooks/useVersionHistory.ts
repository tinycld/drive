import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { RestoreVersionRequest } from '@tinycld/app-generated/drive-api'
import { useMutation } from '@tinycld/core/lib/mutations'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'

export function useVersionHistory(itemId: string) {
    const [versionsCollection] = useStore('drive_item_versions')

    // drive_item_versions.source is a select field with values
    // ['upload', 'system', 'user'] (drive/pb-migrations/1716200000,
    // 1781500000). 'system' is a hidden snapshot-before-restore; history
    // shows only user-visible versions. inArray of the two non-system
    // values, not `not(eq(...))` — pbtsdb compiles `not()` to `!(...)`,
    // which PocketBase's filter parser rejects with "invalid sign operator".
    const { data: versions } = useLiveQuery({
        query: query =>
            query
                .from({ v: versionsCollection })
                .where(({ v }) => and(eq(v.item, itemId), inArray(v.source, ['upload', 'user'])))
                .orderBy(({ v }) => v.version_number, 'desc'),
    })

    const restoreMutation = useMutation({
        mutationFn: async (versionId: string) => {
            await pb.send('/api/drive/versions/restore', {
                method: 'POST',
                body: JSON.stringify({
                    item: itemId,
                    version: versionId,
                } satisfies RestoreVersionRequest),
                headers: { 'Content-Type': 'application/json' },
            })
        },
    })

    return {
        versions: versions ?? [],
        restoreVersion: restoreMutation.mutate,
        isRestoring: restoreMutation.isPending,
    }
}
