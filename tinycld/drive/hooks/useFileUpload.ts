import { usePickFiles } from '@tinycld/core/file-viewer/use-pick-files'
import { captureException } from '@tinycld/core/lib/errors'
import { formatBytes } from '@tinycld/core/lib/format-utils'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { useCallback, useRef, useState } from 'react'
import { Platform } from 'react-native'

export interface DroppedEntry {
    path: string
    file: File | null // null = directory
}

function deduplicateName(name: string, existingNames: Set<string>): string {
    if (!existingNames.has(name)) return name

    const dotIdx = name.lastIndexOf('.')
    const base = dotIdx > 0 ? name.slice(0, dotIdx) : name
    const ext = dotIdx > 0 ? name.slice(dotIdx) : ''

    for (let counter = 1; counter <= 999; counter++) {
        const candidate = `${base} (${counter})${ext}`
        if (!existingNames.has(candidate)) return candidate
    }
    return `${base} (${Date.now()})${ext}`
}

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface UploadingFile {
    id: string
    name: string
    parentId: string
    size: number
    loaded: number
    status: UploadStatus
    errorMessage?: string
}

interface UseFileUploadOptions {
    orgId: string
    userOrgId: string
    currentFolderId: string
}

const DONE_AUTO_CLEAR_MS = 3000
const PROGRESS_THROTTLE_MS = 60

// Direct XHR upload — used instead of pb.collection().create() because we need
// xhr.upload.onprogress events to drive the per-file progress bar. PocketBase's
// SDK uses fetch() under the hood, which doesn't expose upload progress.
// React Native's XMLHttpRequest polyfill supports upload progress as well, so
// the same code path works on web and native.
function uploadFormDataWithProgress(params: {
    url: string
    formData: FormData
    authToken: string
    onProgress: (loaded: number, total: number) => void
}): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', params.url, true)
        if (params.authToken) {
            xhr.setRequestHeader('Authorization', params.authToken)
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) params.onProgress(e.loaded, e.total)
        }
        xhr.onload = () => {
            const text = typeof xhr.response === 'string' ? xhr.response : xhr.responseText
            let parsed: unknown = null
            try {
                parsed = text ? JSON.parse(text) : null
            } catch {
                // Non-JSON response — treat as empty success body.
                parsed = null
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(parsed)
            } else {
                const message =
                    parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
                        ? parsed.message
                        : `Upload failed (${xhr.status})`
                reject(new Error(message))
            }
        }
        xhr.onerror = () => reject(new TypeError('Network request failed'))
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
        xhr.send(params.formData)
    })
}

export function useFileUpload({ orgId, userOrgId, currentFolderId }: UseFileUploadOptions) {
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
    const folderRef = useRef(currentFolderId)
    folderRef.current = currentFolderId
    const [sharesCollection, itemsCollection] = useStore('drive_shares', 'drive_items')
    const { pickFiles } = usePickFiles()

    const updateFile = useCallback((id: string, patch: Partial<UploadingFile>) => {
        setUploadingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    }, [])

    const dismissUpload = useCallback((id: string) => {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== id))
    }, [])

    const scheduleClearDone = useCallback((id: string) => {
        setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => !(f.id === id && f.status === 'done')))
        }, DONE_AUTO_CLEAR_MS)
    }, [])

    // Throttled progress writer: at most one update per ~60ms per file, plus a
    // final flush when bytes reach total so the bar always lands on 100%.
    const makeProgressHandler = useCallback(
        (id: string) => {
            let lastUpdate = 0
            return (loaded: number, total: number) => {
                const now = Date.now()
                const isFinal = total > 0 && loaded >= total
                if (!isFinal && now - lastUpdate < PROGRESS_THROTTLE_MS) return
                lastUpdate = now
                updateFile(id, total > 0 ? { loaded, size: total } : { loaded })
            }
        },
        [updateFile]
    )

    const uploadOne = useCallback(
        async (params: {
            id: string
            name: string
            parentId: string
            file: File
        }) => {
            const { id, name, parentId, file } = params
            updateFile(id, { status: 'uploading', loaded: 0 })

            const formData = new FormData()
            formData.append('id', id)
            formData.append('org', orgId)
            formData.append('name', name)
            formData.append('is_folder', 'false')
            formData.append('mime_type', file.type || 'application/octet-stream')
            formData.append('parent', parentId)
            formData.append('created_by', userOrgId)
            formData.append('size', String(file.size))
            formData.append('file', file)
            formData.append('description', '')

            await uploadFormDataWithProgress({
                url: pb.buildURL('/api/collections/drive_items/records'),
                formData,
                authToken: pb.authStore.token ?? '',
                onProgress: makeProgressHandler(id),
            })

            await performMutations(function* () {
                yield sharesCollection.insert({
                    id: newRecordId(),
                    item: id,
                    user_org: userOrgId,
                    role: 'owner',
                    created_by: userOrgId,
                })
            })

            updateFile(id, { status: 'done', loaded: file.size })
            scheduleClearDone(id)
        },
        [orgId, userOrgId, sharesCollection, makeProgressHandler, updateFile, scheduleClearDone]
    )

    const uploadMutation = useMutation({
        mutationFn: async (files: File[]) => {
            const parentId = folderRef.current
            const queued: UploadingFile[] = files.map((f) => ({
                id: newRecordId(),
                name: f.name,
                parentId,
                size: f.size,
                loaded: 0,
                status: 'pending',
            }))
            setUploadingFiles((prev) => [...prev, ...queued])

            const storageInfo = await pb.send('/api/drive/storage-usage', {
                query: { org: orgId },
            })
            if (storageInfo.has_limit) {
                const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
                const available = storageInfo.limit_bytes - storageInfo.user_used_bytes
                if (totalUploadSize > available) {
                    const message =
                        `Upload would exceed your storage limit. ` +
                        `${formatBytes(Math.max(0, available))} available, ${formatBytes(totalUploadSize)} needed.`
                    setUploadingFiles((prev) =>
                        prev.map((f) =>
                            queued.some((q) => q.id === f.id) ? { ...f, status: 'error', errorMessage: message } : f
                        )
                    )
                    throw new Error(message)
                }
            }

            const existing = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: parentId || '',
                }),
                fields: 'name',
            })
            const usedNames = new Set(existing.map((r) => r.name))

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const entry = queued[i]
                const uniqueName = deduplicateName(file.name, usedNames)
                usedNames.add(uniqueName)
                if (uniqueName !== entry.name) updateFile(entry.id, { name: uniqueName })

                try {
                    await uploadOne({ id: entry.id, name: uniqueName, parentId, file })
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Upload failed'
                    updateFile(entry.id, { status: 'error', errorMessage: message })
                    captureException('useFileUpload', err)
                    throw err
                }
            }
        },
    })

    const uploadFiles = useCallback(
        (files: File[]) => {
            if (files.length === 0) return
            uploadMutation.mutate(files)
        },
        [uploadMutation]
    )

    const triggerFilePicker = useCallback(async () => {
        const picked = await pickFiles({ sources: ['documents'], multiple: true })
        if (picked.length > 0) uploadFiles(picked.map((p) => p.file))
    }, [pickFiles, uploadFiles])

    const triggerPhotoPicker = useCallback(async () => {
        if (Platform.OS === 'web') return
        const picked = await pickFiles({ sources: ['photoLibrary'], multiple: true })
        if (picked.length > 0) uploadFiles(picked.map((p) => p.file))
    }, [pickFiles, uploadFiles])

    const uploadTreeMutation = useMutation({
        mutationFn: async (entries: DroppedEntry[]) => {
            const parentId = folderRef.current
            const fileEntries = entries.filter((e) => e.file)
            const queued: UploadingFile[] = fileEntries.map((e) => ({
                id: newRecordId(),
                name: e.path,
                parentId,
                size: e.file?.size ?? 0,
                loaded: 0,
                status: 'pending',
            }))
            setUploadingFiles((prev) => [...prev, ...queued])
            const queuedById = new Map(fileEntries.map((e, i) => [e.path, queued[i]]))

            const totalUploadSize = fileEntries.reduce((sum, e) => sum + (e.file?.size ?? 0), 0)
            const storageInfo = await pb.send('/api/drive/storage-usage', {
                query: { org: orgId },
            })
            if (storageInfo.has_limit) {
                const available = storageInfo.limit_bytes - storageInfo.user_used_bytes
                if (totalUploadSize > available) {
                    const message =
                        `Upload would exceed your storage limit. ` +
                        `${formatBytes(Math.max(0, available))} available, ${formatBytes(totalUploadSize)} needed.`
                    setUploadingFiles((prev) =>
                        prev.map((f) =>
                            queued.some((q) => q.id === f.id) ? { ...f, status: 'error', errorMessage: message } : f
                        )
                    )
                    throw new Error(message)
                }
            }

            // Collect existing names in root folder for deduplication of top-level entries
            const existing = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: parentId || '',
                }),
                fields: 'name',
            })
            const rootUsedNames = new Set(existing.map((r) => r.name))

            // Map directory path -> PocketBase record ID
            const folderIds = new Map<string, string>()

            // Sort entries so directories come before their children
            const sorted = [...entries].sort((a, b) => {
                const aDepth = a.path.split('/').length
                const bDepth = b.path.split('/').length
                if (aDepth !== bDepth) return aDepth - bDepth
                return a.path.localeCompare(b.path)
            })

            for (const entry of sorted) {
                const segments = entry.path.split('/')
                const name = segments[segments.length - 1]
                const parentPath = segments.slice(0, -1).join('/')
                const localParentId = parentPath ? (folderIds.get(parentPath) ?? '') : parentId

                if (!entry.file) {
                    // Directory entry — deduplicate top-level names only
                    const folderName = segments.length === 1 ? deduplicateName(name, rootUsedNames) : name
                    if (segments.length === 1) rootUsedNames.add(folderName)

                    const folderId = newRecordId()
                    folderIds.set(entry.path, folderId)

                    await performMutations(function* () {
                        yield itemsCollection.insert({
                            id: folderId,
                            org: orgId,
                            name: folderName,
                            is_folder: true,
                            mime_type: '',
                            parent: localParentId,
                            created_by: userOrgId,
                            size: 0,
                            file: '',
                            description: '',
                        })
                        yield sharesCollection.insert({
                            id: newRecordId(),
                            item: folderId,
                            user_org: userOrgId,
                            role: 'owner',
                            created_by: userOrgId,
                        })
                    })
                } else {
                    const queuedEntry = queuedById.get(entry.path)
                    if (!queuedEntry) continue

                    try {
                        await uploadOne({
                            id: queuedEntry.id,
                            name,
                            parentId: localParentId,
                            file: entry.file,
                        })
                    } catch (err) {
                        const message = err instanceof Error ? err.message : 'Upload failed'
                        updateFile(queuedEntry.id, { status: 'error', errorMessage: message })
                        captureException('useFileUpload.uploadTree', err)
                        throw err
                    }
                }
            }
        },
    })

    const uploadTree = useCallback(
        (entries: DroppedEntry[]) => {
            if (entries.length === 0) return
            uploadTreeMutation.mutate(entries)
        },
        [uploadTreeMutation]
    )

    const triggerFolderPicker = useCallback(() => {
        if (Platform.OS !== 'web') return
        const input = document.createElement('input')
        input.type = 'file'
        input.setAttribute('webkitdirectory', '')
        input.onchange = () => {
            if (!input.files?.length) return
            const entries: DroppedEntry[] = []
            const dirNames = new Set<string>()
            for (const file of Array.from(input.files)) {
                const relativePath = (file as File & { webkitRelativePath: string }).webkitRelativePath
                if (!relativePath) continue
                const segments = relativePath.split('/')
                for (let depth = 1; depth < segments.length; depth++) {
                    const dirPath = segments.slice(0, depth).join('/')
                    if (!dirNames.has(dirPath)) {
                        dirNames.add(dirPath)
                        entries.push({ path: dirPath, file: null })
                    }
                }
                entries.push({ path: relativePath, file })
            }
            if (entries.length > 0) {
                uploadTree(entries)
            }
        }
        input.click()
    }, [uploadTree])

    const uploadNewVersion = useCallback(
        async (itemId: string, file: File) => {
            const storageInfo = await pb.send('/api/drive/storage-usage', {
                query: { org: orgId },
            })
            if (storageInfo.has_limit) {
                const available = storageInfo.limit_bytes - storageInfo.user_used_bytes
                if (file.size > available) {
                    throw new Error(
                        `Upload would exceed your storage limit. ` +
                            `${formatBytes(Math.max(0, available))} available, ${formatBytes(file.size)} needed.`
                    )
                }
            }

            const formData = new FormData()
            formData.append('item', itemId)
            formData.append('file', file)
            await pb.send('/api/drive/upload-version', {
                method: 'POST',
                body: formData,
            })
        },
        [orgId]
    )

    return {
        uploadFiles,
        uploadTree,
        isUploading: uploadMutation.isPending || uploadTreeMutation.isPending,
        uploadingFiles,
        dismissUpload,
        triggerFilePicker,
        triggerFolderPicker,
        triggerPhotoPicker,
        uploadNewVersion,
    }
}
