import { captureException } from '@tinycld/core/lib/errors'
import type { FilePreviewSource } from '@tinycld/core/file-viewer/types'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useOrgSlug } from '@tinycld/core/lib/use-org-slug'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { newRecordId } from 'pbtsdb/core'

const MAIL_ATTACHMENTS_FOLDER = 'Mail attachments'

/**
 * Hook that saves a previewable file (e.g. a mail attachment) into the
 * current user's Drive. Returns a mutation-style object with `mutate`,
 * `mutateAsync`, and `isPending`.
 *
 * Files land in a top-level "Mail attachments" folder in the user's Drive.
 * The folder is auto-created on first save. Filename collisions get the
 * standard `(1)`, `(2)`, … suffix.
 */
export function useSaveToDrive() {
    const { orgId } = useOrgInfo()
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug ?? '')
    const userOrgId = userOrg?.id ?? ''
    const [sharesCollection] = useStore('drive_shares')

    return useMutation({
        mutationFn: async (source: FilePreviewSource) => {
            if (!orgId || !userOrgId) {
                throw new Error('Organization context not ready')
            }

            // Fetch the source file (e.g. a mail attachment served by PocketBase)
            // into a Blob so we can re-upload as a Drive item.
            const sourceUrl = pb.files.getURL(
                { collectionId: source.collectionId, id: source.recordId },
                source.fileName
            )
            const resp = await fetch(sourceUrl)
            if (!resp.ok) {
                throw new Error(`Could not download attachment (${resp.status})`)
            }
            const blob = await resp.blob()
            const file = new File([blob], source.displayName, {
                type: source.mimeType || blob.type || 'application/octet-stream',
            })

            // Find or create the "Mail attachments" folder.
            let folderId: string
            const existingFolder = await pb.collection('drive_items').getList(1, 1, {
                filter: pb.filter('org = {:org} && parent = "" && is_folder = true && name = {:name}', {
                    org: orgId,
                    name: MAIL_ATTACHMENTS_FOLDER,
                }),
                fields: 'id',
            })
            if (existingFolder.items.length > 0) {
                folderId = existingFolder.items[0].id
            } else {
                folderId = newRecordId()
                await pb.collection('drive_items').create({
                    id: folderId,
                    org: orgId,
                    name: MAIL_ATTACHMENTS_FOLDER,
                    is_folder: true,
                    mime_type: '',
                    parent: '',
                    created_by: userOrgId,
                    size: 0,
                    description: '',
                })
                await performMutations(function* () {
                    yield sharesCollection.insert({
                        id: newRecordId(),
                        item: folderId,
                        user_org: userOrgId,
                        role: 'owner',
                        created_by: userOrgId,
                    })
                })
            }

            // De-duplicate the filename within the destination folder.
            const siblings = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: folderId,
                }),
                fields: 'name',
            })
            const finalName = deduplicateName(file.name, new Set(siblings.map((s) => s.name)))

            const itemId = newRecordId()
            const formData = new FormData()
            formData.append('id', itemId)
            formData.append('org', orgId)
            formData.append('name', finalName)
            formData.append('is_folder', 'false')
            formData.append('mime_type', file.type)
            formData.append('parent', folderId)
            formData.append('created_by', userOrgId)
            formData.append('size', String(file.size))
            formData.append('file', file)
            formData.append('description', '')
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

            return { itemId, finalName, folderId }
        },
        onSuccess: ({ finalName }) => {
            notify.emit({
                event: 'drive.save_succeeded',
                title: 'Saved to Drive',
                body: `${finalName} is in your "Mail attachments" folder.`,
                durationMs: 4000,
                data: { name: finalName },
            })
        },
        onError: (err) => {
            const reason = err instanceof Error ? err.message : 'Unknown error'
            captureException('useSaveToDrive', err)
            notify.emit({
                event: 'drive.save_failed',
                title: 'Could not save to Drive',
                body: reason,
                durationMs: 6000,
                data: { reason },
            })
        },
    })
}

/**
 * If `name` is already in `used`, append " (1)", " (2)", … before the extension.
 * Mirrors the behavior in drive's primary upload pipeline. Exported for tests.
 */
export function deduplicateName(name: string, used: Set<string>): string {
    if (!used.has(name)) return name

    const dotIdx = name.lastIndexOf('.')
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name
    const ext = dotIdx > 0 ? name.slice(dotIdx) : ''

    for (let counter = 1; counter <= 999; counter++) {
        const candidate = `${base} (${counter})${ext}`
        if (!used.has(candidate)) return candidate
    }
    return `${base} (${Date.now()})${ext}`
}
