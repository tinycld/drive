import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { RestoreVersionRequest } from '@tinycld/app-generated/drive-api'
import { useMutation } from '@tinycld/core/lib/mutations'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'

// 'system' rows are the hidden copy a restore takes first; the history
// shows the other sources. inArray, not not(eq(...)): pbtsdb compiles not()
// to `!(...)`, which PocketBase's filter parser rejects.
const VISIBLE_SOURCES = ['upload', 'user', 'auto']

export function useVersionHistory(itemId: string) {
    const [versionsCollection] = useStore('drive_item_versions')

    const { data: versions } = useLiveQuery({
        query: query =>
            query
                .from({ v: versionsCollection })
                .where(({ v }) => and(eq(v.item, itemId), inArray(v.source, VISIBLE_SOURCES)))
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

    const renameMutation = useMutation({
        mutationFn: function* ({ versionId, label }: { versionId: string; label: string }) {
            yield versionsCollection.update(versionId, draft => {
                draft.label = label
            })
        },
    })

    return {
        versions: versions ?? [],
        restoreVersion: (versionId: string, opts?: { onSuccess?: () => void }) =>
            restoreMutation.mutate(versionId, { onSuccess: opts?.onSuccess }),
        isRestoring: restoreMutation.isPending,
        renameVersion: (versionId: string, label: string) =>
            renameMutation.mutate({ versionId, label: label.trim() }),
        isRenaming: renameMutation.isPending,
    }
}

export type VersionRow = ReturnType<typeof useVersionHistory>['versions'][number]
