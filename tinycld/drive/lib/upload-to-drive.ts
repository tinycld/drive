import { captureException } from '@tinycld/core/lib/errors'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'
import { newRecordId } from 'pbtsdb/core'
import { Platform } from 'react-native'
import { deduplicateName } from './deduplicate-name'

/**
 * Body of an in-memory file to upload. On web pass a `Blob` or `File`; on
 * native pass a `{ uri, name, type }` literal pointing at a file on disk
 * (e.g. one written via expo-file-system) — that's what RN's FormData
 * polyfill expects.
 */
export type UploadBody = Blob | { uri: string; name: string; type: string }

export interface CreateDriveItemInput {
    /** File contents. */
    body: UploadBody
    /** User-visible name including extension (e.g. "Untitled.xlsx"). */
    name: string
    /** MIME type — used both on the drive_items row and the FormData blob. */
    mimeType: string
    /** Destination folder ID. Empty string = root ("My Files"). */
    parentId?: string
    /** Optional explicit byte size; falls back to `body.size` on web. */
    size?: number
    /** Optional description column. */
    description?: string
}

export interface CreateDriveItemResult {
    itemId: string
    finalName: string
    parentId: string
}

/**
 * Hook that creates a new drive_items row from an in-memory file body.
 * Mirrors useSaveToDrive's plumbing (FormData upload + drive_shares owner
 * row) but takes the file contents directly instead of copying from an
 * existing PB file URL. Use from packages that synthesize files
 * client-side — e.g. @tinycld/sheets creating an empty xlsx workbook.
 *
 * Returns a mutation-style object with `mutate`, `mutateAsync`, `isPending`.
 */
export function useCreateDriveItem() {
    const { orgId } = useOrgInfo()
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug ?? '')
    const userOrgId = userOrg?.id ?? ''
    const [sharesCollection] = useStore('drive_shares')

    return useMutation({
        mutationFn: async (input: CreateDriveItemInput): Promise<CreateDriveItemResult> => {
            if (!orgId || !userOrgId) {
                throw new Error('Organization context not ready')
            }

            const parentId = input.parentId ?? ''

            const siblings = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: parentId,
                }),
                fields: 'name',
            })
            const finalName = deduplicateName(input.name, new Set(siblings.map((s) => s.name)))

            const itemId = newRecordId()
            const size = resolveSize(input.body, input.size)

            const formData = new FormData()
            formData.append('id', itemId)
            formData.append('org', orgId)
            formData.append('name', finalName)
            formData.append('is_folder', 'false')
            formData.append('mime_type', input.mimeType || 'application/octet-stream')
            formData.append('parent', parentId)
            formData.append('created_by', userOrgId)
            formData.append('size', String(size))
            // RN's FormData accepts a `{ uri, name, type }` object literal; on
            // web the `file` field is a real Blob/File. We cast to satisfy TS.
            formData.append('file', input.body as unknown as Blob, finalName)
            formData.append('description', input.description ?? '')
            await pb.collection('drive_items').create(formData)

            await performMutations(function* () {
                yield sharesCollection.insert({
                    id: newRecordId(),
                    item: itemId,
                    user_org: userOrgId,
                    role: 'owner',
                    created_by: userOrgId,
                })
            })

            return { itemId, finalName, parentId }
        },
        onError: (err) => {
            captureException('useCreateDriveItem', err)
        },
    })
}

function resolveSize(body: UploadBody, explicit: number | undefined): number {
    if (typeof explicit === 'number') return explicit
    if (Platform.OS === 'web' && body instanceof Blob) return body.size
    return 0
}
