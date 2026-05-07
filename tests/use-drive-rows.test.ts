import { describe, expect, it } from 'vitest'
import { buildDriveRows } from '../tinycld/drive/hooks/useDriveRows'
import type { DriveItemView } from '../tinycld/drive/types'

function item(id: string, opts: Partial<DriveItemView> = {}): DriveItemView {
    return {
        id,
        name: id,
        isFolder: false,
        mimeType: 'text/plain',
        parentId: '',
        owner: 'me',
        ownerUserOrgId: 'uo1',
        updated: '',
        size: 0,
        shared: false,
        starred: false,
        trashedAt: '',
        file: '',
        thumbnail: '',
        description: '',
        category: 'document',
        ...opts,
    }
}

describe('buildDriveRows', () => {
    const folder1 = item('f1', { isFolder: true })
    const folder2 = item('f2', { isFolder: true })
    const file1 = item('file1')
    const file2 = item('file2')

    it('list mode desktop emits header, then folders, then files', () => {
        const rows = buildDriveRows({
            folders: [folder1, folder2],
            files: [file1, file2],
            viewMode: 'list',
            isMobile: false,
        })
        expect(rows.map((r) => r.kind)).toEqual([
            'list-header',
            'list-item',
            'list-item',
            'list-item',
            'list-item',
        ])
        // index runs across folders + files
        expect((rows[1] as { index: number }).index).toBe(0)
        expect((rows[4] as { index: number }).index).toBe(3)
    })

    it('list mode mobile omits the header', () => {
        const rows = buildDriveRows({
            folders: [folder1],
            files: [file1],
            viewMode: 'list',
            isMobile: true,
        })
        expect(rows.map((r) => r.kind)).toEqual(['list-item', 'list-item'])
    })

    it('grid mode emits section labels and grid items', () => {
        const rows = buildDriveRows({
            folders: [folder1],
            files: [file1, file2],
            viewMode: 'grid',
            isMobile: false,
        })
        expect(rows.map((r) => r.kind)).toEqual([
            'section-label',
            'grid-item',
            'section-label',
            'grid-item',
            'grid-item',
        ])
        expect((rows[0] as { title: string }).title).toBe('Folders')
        expect((rows[2] as { title: string }).title).toBe('Files')
    })

    it('grid mode skips empty section labels', () => {
        const onlyFiles = buildDriveRows({
            folders: [],
            files: [file1],
            viewMode: 'grid',
            isMobile: false,
        })
        expect(onlyFiles.map((r) => r.kind)).toEqual(['section-label', 'grid-item'])
        expect((onlyFiles[0] as { title: string }).title).toBe('Files')

        const onlyFolders = buildDriveRows({
            folders: [folder1],
            files: [],
            viewMode: 'grid',
            isMobile: false,
        })
        expect(onlyFolders.map((r) => r.kind)).toEqual(['section-label', 'grid-item'])
        expect((onlyFolders[0] as { title: string }).title).toBe('Folders')
    })

    it('uploading items are not filtered — they ride through as cells', () => {
        const uploading = item('upl', { uploadStatus: 'uploading' })
        const grid = buildDriveRows({
            folders: [],
            files: [uploading, file1],
            viewMode: 'grid',
            isMobile: false,
        })
        expect(grid).toHaveLength(3)
        expect(grid[1]).toMatchObject({ kind: 'grid-item', item: { id: 'upl' } })
        const list = buildDriveRows({
            folders: [],
            files: [uploading, file1],
            viewMode: 'list',
            isMobile: true,
        })
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ kind: 'list-item', item: { id: 'upl' } })
    })
})
