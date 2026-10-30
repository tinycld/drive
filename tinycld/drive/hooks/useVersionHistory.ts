import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { RestoreVersionRequest } from '@tinycld/app-generated/drive-api'
import { errorToString } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
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
        // .mutate() never throws to its caller, so this is the only place a
        // refused restore (the file is open in an editor) reaches the user.
        onError: err => {
            notify.emit({
                event: 'mutation.error',
                title: 'Version not restored',
                body: errorToString(err),
                data: { operation: 'drive.restore_version', error: errorToString(err) },
            })
        },
    })

    return {
        versions: versions ?? [],
        restoreVersion: restoreMutation.mutate,
        isRestoring: restoreMutation.isPending,
    }
}
