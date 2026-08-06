import type { SnapshotVersionRequest } from '@tinycld/app-generated/drive-api'
import { useMutation } from '@tinycld/core/lib/mutations'
import { pb } from '@tinycld/core/lib/pocketbase'

export type SaveDriveVersionInput = {
    itemId: string
    label: string
}

export function useSaveDriveVersion() {
    return useMutation({
        mutationFn: async ({ itemId, label }: SaveDriveVersionInput) => {
            await pb.send('/api/drive/versions/snapshot', {
                method: 'POST',
                body: JSON.stringify({ item: itemId, label } satisfies SnapshotVersionRequest),
                headers: { 'Content-Type': 'application/json' },
            })
        },
    })
}
