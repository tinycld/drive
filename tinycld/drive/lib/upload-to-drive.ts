import { captureException } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { pb } from '@tinycld/core/lib/pocketbase'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
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
    /**
     * The stored PocketBase file name — PB sanitizes the upload name and
     * appends a random suffix, so this differs from `finalName` (the
     * user-visible `name` column). Build file URLs from THIS, not
     * `finalName`, or the `/api/files/...` request 404s.
     */
    file: string
}

/**
 * Hook that creates a new drive_items row from an in-memory file body.
 * Mirrors useSaveToDrive's plumbing (FormData upload + drive_shares owner
 * row) but takes the file contents directly instead of copying from an
 * existing PB file URL. Use from packages that synthesize files
 * client-side — e.g. @tinycld/calc creating an empty xlsx workbook.
 *
 * Returns a mutation-style object with `mutate`, `mutateAsync`, `isPending`.
 */
export function useCreateDriveItem() {
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug ?? '')
    const userId = userOrg?.id ?? ''

    return useMutation({
        mutationFn: async (input: CreateDriveItemInput): Promise<CreateDriveItemResult> => {
            if (!userId) {
                throw new Error('User context not ready')
            }

            const parentId = input.parentId ?? ''

            // Listing siblings + deduplicating the name + creating is not
            // atomic, so a concurrent create from another tab/worker can
            // grab the same final name between our list and our insert and
            // trip the (org, parent, name) unique constraint. Retry with
            // a fresh list a few times before giving up. The `used` set
            // grows on each retry to also exclude the name we just lost,
            // which avoids spinning on the same conflict.
            const used = new Set<string>()
            const maxAttempts = 5
            let lastError: unknown = null
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                // Must read network-fresh each retry: the whole point of the loop
                // is to observe a name another tab/worker grabbed since the last
                // attempt. The pbtsdb store would return stale data and defeat
                // the conflict detection, so readCollectionCached is wrong here.
                // biome-ignore lint/plugin/pbtsdb-no-raw-pb-access: deliberate fresh read for concurrent-create detection in the dedup retry loop.
                const siblings = await pb.collection('drive_items').getFullList({
                    filter: pb.filter('parent = {:parent}', {
                        parent: parentId,
                    }),
                    fields: 'name',
                })
                for (const s of siblings) used.add(s.name)
                const finalName = deduplicateName(input.name, used)

                const itemId = newRecordId()
                const size = resolveSize(input.body, input.size)

                const formData = new FormData()
                formData.append('id', itemId)
                formData.append('name', finalName)
                formData.append('is_folder', 'false')
                formData.append('mime_type', input.mimeType || 'application/octet-stream')
                formData.append('parent', parentId)
                formData.append('created_by', userId)
                formData.append('size', String(size))
                // RN's FormData accepts a `{ uri, name, type }` object literal; on
                // web the `file` field is a real Blob/File. We cast to satisfy TS.
                formData.append('file', input.body as unknown as Blob, finalName)
                formData.append('description', input.description ?? '')
                try {
                    // The drive_items create hook (server/register.go) inserts the
                    // owner drive_shares row in the same transaction, so the client
                    // must not also insert one — the unique (item, user) index
                    // would reject it.
                    const record = await pb
                        .collection('drive_items')
                        // biome-ignore lint/plugin/pbtsdb-no-raw-pb-access: multipart FormData file upload — pbtsdb's optimistic transaction can't carry a file blob.
                        .create<{ file: string }>(formData)
                    return { itemId, finalName, parentId, file: record.file }
                } catch (err) {
                    lastError = err
                    used.add(finalName)
                }
            }
            throw lastError ?? new Error('useCreateDriveItem: exhausted name retries')
        },
        onError: err => {
            captureException('useCreateDriveItem', err)
        },
    })
}

function resolveSize(body: UploadBody, explicit: number | undefined): number {
    if (typeof explicit === 'number') return explicit
    if (Platform.OS === 'web' && body instanceof Blob) return body.size
    return 0
}

/** Input for a blank (no-file) drive_items create. */
export interface CreateBlankDriveItemInput {
    /** User-visible name including extension (e.g. "Untitled.docx"). */
    name: string
    /** MIME type — the server's blankfile hook keys off this to attach the skeleton. */
    mimeType: string
    /** Destination folder ID. Empty string = root ("My Files"). */
    parentId?: string
    /** Optional description column. */
    description?: string
}

/**
 * Creates a blank drive_items row with **no file**. The server's blankfile
 * hook (core/server/blankfile) attaches a minimal valid skeleton for the mime
 * type and re-dedupes the name authoritatively (chooseUniqueDriveItemName in
 * drive/server), so the client neither uploads a body nor runs a dedup loop.
 *
 * This is the path for "New document" / "New sheet": the editor opens by
 * itemId and the server-attached file streams in via realtime. Use
 * {@link useCreateDriveItem} instead when uploading real bytes (picker, copy,
 * save-to-drive) — those genuinely need a multipart file part.
 *
 * A plain JSON insert (not FormData), so — unlike the Blob-upload path — it
 * works uniformly across web/iOS/Android (RN Android can't upload a Blob part).
 */
export function useCreateBlankDriveItem() {
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug ?? '')
    const userId = userOrg?.id ?? ''

    return useMutation({
        mutationFn: async (input: CreateBlankDriveItemInput): Promise<{ itemId: string }> => {
            if (!userId) {
                throw new Error('User context not ready')
            }
            const itemId = newRecordId()
            // The server create hook (drive/server/register.go) re-dedupes the
            // name and inserts the owner drive_shares row in the same
            // transaction, and the blankfile hook attaches the skeleton file —
            // so the client sends a bare row: no file, no size, no dedup loop.
            // biome-ignore lint/plugin/pbtsdb-no-raw-pb-access: create hook attaches a server-side file the optimistic store can't carry; the row is read back via realtime.
            await pb.collection('drive_items').create({
                id: itemId,
                name: input.name,
                is_folder: false,
                mime_type: input.mimeType,
                parent: input.parentId ?? '',
                created_by: userId,
                description: input.description ?? '',
            })
            return { itemId }
        },
        // No explicit onError: the wrapper's default toasts AND reports. The
        // previous capture-only handler replaced the default, so a failed
        // create (e.g. a name collision the server refused) left the "New
        // sheet" button silently dead — no toast, no navigation, no clue.
    })
}
