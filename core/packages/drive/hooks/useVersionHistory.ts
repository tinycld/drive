import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '~/lib/mutations'
import { pb, useStore } from '~/lib/pocketbase'

export function useVersionHistory(itemId: string) {
    const [versionsCollection] = useStore('drive_item_versions')

    const { data: versions } = useLiveQuery(
        query =>
            query
                .from({ v: versionsCollection })
                .where(({ v }) => and(eq(v.item, itemId), eq(v.source, 'upload')))
                .orderBy(({ v }) => v.version_number, 'desc'),
        [itemId]
    )

    const restoreMutation = useMutation({
        mutationFn: async (versionId: string) => {
            await pb.send('/api/drive/versions/restore', {
                method: 'POST',
                body: JSON.stringify({ item: itemId, version: versionId }),
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
