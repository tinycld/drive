import * as DocumentPicker from 'expo-document-picker'
import { newRecordId } from 'pbtsdb'
import { useCallback, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { captureException } from '~/lib/errors'
import { formatBytes } from '~/lib/format-utils'
import { performMutations, useMutation } from '~/lib/mutations'
import { pb, useStore } from '~/lib/pocketbase'

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

interface UploadingFile {
    name: string
    status: 'pending' | 'uploading' | 'done' | 'error'
}

interface UseFileUploadOptions {
    orgId: string
    userOrgId: string
    currentFolderId: string
}

export function useFileUpload({ orgId, userOrgId, currentFolderId }: UseFileUploadOptions) {
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
    const folderRef = useRef(currentFolderId)
    folderRef.current = currentFolderId
    const [sharesCollection, itemsCollection] = useStore('drive_shares', 'drive_items')

    const uploadMutation = useMutation({
        mutationFn: async (files: File[]) => {
            setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending' })))

            const storageInfo = await pb.send('/api/drive/storage-usage', {
                query: { org: orgId },
            })
            if (storageInfo.has_limit) {
                const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
                const available = storageInfo.limit_bytes - storageInfo.user_used_bytes
                if (totalUploadSize > available) {
                    throw new Error(
                        `Upload would exceed your storage limit. ` +
                            `${formatBytes(Math.max(0, available))} available, ${formatBytes(totalUploadSize)} needed.`
                    )
                }
            }

            const existing = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: folderRef.current || '',
                }),
                fields: 'name',
            })
            const usedNames = new Set(existing.map(r => r.name))

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                setUploadingFiles(prev =>
                    prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f))
                )

                try {
                    const itemId = newRecordId()
                    const uniqueName = deduplicateName(file.name, usedNames)
                    usedNames.add(uniqueName)
                    const formData = new FormData()
                    formData.append('id', itemId)
                    formData.append('org', orgId)
                    formData.append('name', uniqueName)
                    formData.append('is_folder', 'false')
                    formData.append('mime_type', file.type || 'application/octet-stream')
                    formData.append('parent', folderRef.current)
                    formData.append('created_by', userOrgId)
                    formData.append('size', String(file.size))
                    formData.append('file', file)
                    formData.append('description', '')

                    // File upload requires FormData, so pb.collection() is necessary here
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

                    setUploadingFiles(prev =>
                        prev.map((f, idx) => (idx === i ? { ...f, status: 'done' } : f))
                    )
                } catch (err) {
                    setUploadingFiles(prev =>
                        prev.map((f, idx) => (idx === i ? { ...f, status: 'error' } : f))
                    )
                    captureException('useFileUpload', err)
                    throw err
                }
            }
        },
        onSettled: () => {
            setTimeout(() => setUploadingFiles([]), 3000)
        },
    })

    const uploadFiles = useCallback(
        (files: File[]) => {
            if (files.length === 0) return
            uploadMutation.mutate(files)
        },
        [uploadMutation]
    )

    const triggerFilePicker = useCallback(() => {
        if (Platform.OS === 'web') {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            input.onchange = () => {
                if (input.files?.length) {
                    uploadFiles(Array.from(input.files))
                }
            }
            input.click()
        } else {
            DocumentPicker.getDocumentAsync({ multiple: true }).then(result => {
                if (result.canceled) return
                const files = result.assets.map(
                    asset =>
                        ({
                            uri: asset.uri,
                            name: asset.name,
                            type: asset.mimeType || 'application/octet-stream',
                            size: asset.size ?? 0,
                        }) as unknown as File
                )
                uploadFiles(files)
            })
        }
    }, [uploadFiles])

    const uploadTreeMutation = useMutation({
        mutationFn: async (entries: DroppedEntry[]) => {
            const fileEntries = entries.filter(e => e.file)
            setUploadingFiles(fileEntries.map(e => ({ name: e.path, status: 'pending' })))

            const totalUploadSize = fileEntries.reduce((sum, e) => sum + (e.file?.size ?? 0), 0)
            const storageInfo = await pb.send('/api/drive/storage-usage', {
                query: { org: orgId },
            })
            if (storageInfo.has_limit) {
                const available = storageInfo.limit_bytes - storageInfo.user_used_bytes
                if (totalUploadSize > available) {
                    throw new Error(
                        `Upload would exceed your storage limit. ` +
                            `${formatBytes(Math.max(0, available))} available, ${formatBytes(totalUploadSize)} needed.`
                    )
                }
            }

            // Collect existing names in root folder for deduplication of top-level entries
            const existing = await pb.collection('drive_items').getFullList({
                filter: pb.filter('org = {:org} && parent = {:parent}', {
                    org: orgId,
                    parent: folderRef.current || '',
                }),
                fields: 'name',
            })
            const rootUsedNames = new Set(existing.map(r => r.name))

            // Map directory path -> PocketBase record ID
            const folderIds = new Map<string, string>()

            // Sort entries so directories come before their children
            const sorted = [...entries].sort((a, b) => {
                const aDepth = a.path.split('/').length
                const bDepth = b.path.split('/').length
                if (aDepth !== bDepth) return aDepth - bDepth
                return a.path.localeCompare(b.path)
            })

            let fileIndex = 0
            for (const entry of sorted) {
                const segments = entry.path.split('/')
                const name = segments[segments.length - 1]
                const parentPath = segments.slice(0, -1).join('/')
                const parentId = parentPath ? (folderIds.get(parentPath) ?? '') : folderRef.current

                if (!entry.file) {
                    // Directory entry — deduplicate top-level names only
                    const folderName =
                        segments.length === 1 ? deduplicateName(name, rootUsedNames) : name
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
                            parent: parentId,
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
                    // File entry
                    const currentFileIndex = fileIndex
                    fileIndex++
                    setUploadingFiles(prev =>
                        prev.map((f, idx) =>
                            idx === currentFileIndex ? { ...f, status: 'uploading' } : f
                        )
                    )

                    try {
                        const itemId = newRecordId()
                        const formData = new FormData()
                        formData.append('id', itemId)
                        formData.append('org', orgId)
                        formData.append('name', name)
                        formData.append('is_folder', 'false')
                        formData.append('mime_type', entry.file.type || 'application/octet-stream')
                        formData.append('parent', parentId)
                        formData.append('created_by', userOrgId)
                        formData.append('size', String(entry.file.size))
                        formData.append('file', entry.file)
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

                        setUploadingFiles(prev =>
                            prev.map((f, idx) =>
                                idx === currentFileIndex ? { ...f, status: 'done' } : f
                            )
                        )
                    } catch (err) {
                        setUploadingFiles(prev =>
                            prev.map((f, idx) =>
                                idx === currentFileIndex ? { ...f, status: 'error' } : f
                            )
                        )
                        captureException('useFileUpload.uploadTree', err)
                        throw err
                    }
                }
            }
        },
        onSettled: () => {
            setTimeout(() => setUploadingFiles([]), 3000)
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
                const relativePath = (file as File & { webkitRelativePath: string })
                    .webkitRelativePath
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
        triggerFilePicker,
        triggerFolderPicker,
        uploadNewVersion,
    }
}
