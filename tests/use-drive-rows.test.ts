import { describe, expect, it } from 'vitest'
import { buildGridRows, buildListRows, sortDriveItems } from '../tinycld/drive/hooks/useDriveRows'
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

describe('buildListRows', () => {
    const folder1 = item('f1', { isFolder: true })
    const folder2 = item('f2', { isFolder: true })
    const file1 = item('file1')
    const file2 = item('file2')

    it('emits folders then files as a flat list', () => {
        const rows = buildListRows({
            folders: [folder1, folder2],
            files: [file1, file2],
            sortField: 'name',
            sortDirection: 'asc',
        })
        expect(rows.map(r => r.kind)).toEqual(['item', 'item', 'item', 'item'])
        expect(rows[0].item.id).toBe('f1')
        expect(rows[3].item.id).toBe('file2')
    })

    it('preserves a contiguous index across folders + files', () => {
        const rows = buildListRows({
            folders: [folder1, folder2],
            files: [file1, file2],
            sortField: 'name',
            sortDirection: 'asc',
        })
        expect(rows[0].index).toBe(0)
        expect(rows[1].index).toBe(1)
        expect(rows[2].index).toBe(2)
        expect(rows[3].index).toBe(3)
    })

    it('keeps uploading items in the row stream so they render as cells', () => {
        const uploading = item('upl', { uploadStatus: 'uploading' })
        const rows = buildListRows({
            folders: [],
            files: [uploading, file1],
            sortField: 'name',
            sortDirection: 'asc',
        })
        expect(rows).toHaveLength(2)
        // Uploading placeholders are pinned to the end of the file group.
        expect(rows[0].item.id).toBe('file1')
        expect(rows[1].item.id).toBe('upl')
    })
})

describe('sortDriveItems', () => {
    it('sorts by name case-insensitively in natural order', () => {
        const items = [item('File10'), item('file2'), item('apple'), item('Banana')]
        const asc = sortDriveItems(items, 'name', 'asc').map(i => i.id)
        expect(asc).toEqual(['apple', 'Banana', 'file2', 'File10'])
        const desc = sortDriveItems(items, 'name', 'desc').map(i => i.id)
        expect(desc).toEqual(['File10', 'file2', 'Banana', 'apple'])
    })

    it('sorts by size numerically', () => {
        const items = [item('a', { size: 1000 }), item('b', { size: 9 }), item('c', { size: 200 })]
        expect(sortDriveItems(items, 'size', 'asc').map(i => i.id)).toEqual(['b', 'c', 'a'])
        expect(sortDriveItems(items, 'size', 'desc').map(i => i.id)).toEqual(['a', 'c', 'b'])
    })

    it('sorts by updated timestamp chronologically', () => {
        const items = [
            item('new', { updated: '2026-05-22T10:00:00Z' }),
            item('old', { updated: '2020-01-01T00:00:00Z' }),
            item('mid', { updated: '2024-06-15T12:00:00Z' }),
        ]
        expect(sortDriveItems(items, 'updated', 'asc').map(i => i.id)).toEqual([
            'old',
            'mid',
            'new',
        ])
    })

    it('sorts items with empty timestamps last when ascending', () => {
        const items = [
            item('blank', { updated: '' }),
            item('dated', { updated: '2024-01-01T00:00:00Z' }),
        ]
        expect(sortDriveItems(items, 'updated', 'asc').map(i => i.id)).toEqual(['dated', 'blank'])
    })

    it('sorts by owner name', () => {
        const items = [
            item('a', { owner: 'Zoe' }),
            item('b', { owner: 'amir' }),
            item('c', { owner: 'Mona' }),
        ]
        expect(sortDriveItems(items, 'owner', 'asc').map(i => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('does not mutate the input array', () => {
        const items = [item('b'), item('a')]
        const original = items.map(i => i.id)
        sortDriveItems(items, 'name', 'asc')
        expect(items.map(i => i.id)).toEqual(original)
    })
})

describe('buildListRows sorting', () => {
    it('sorts folders and files independently, folders always first', () => {
        const rows = buildListRows({
            folders: [item('zeta', { isFolder: true }), item('alpha', { isFolder: true })],
            files: [item('yankee'), item('bravo')],
            sortField: 'name',
            sortDirection: 'asc',
        })
        expect(rows.map(r => r.item.id)).toEqual(['alpha', 'zeta', 'bravo', 'yankee'])
    })

    it('reverses order when direction is desc, keeping folders first', () => {
        const rows = buildListRows({
            folders: [item('alpha', { isFolder: true }), item('zeta', { isFolder: true })],
            files: [item('bravo'), item('yankee')],
            sortField: 'name',
            sortDirection: 'desc',
        })
        expect(rows.map(r => r.item.id)).toEqual(['zeta', 'alpha', 'yankee', 'bravo'])
    })

    it('keeps uploading placeholders at the end regardless of sort', () => {
        const rows = buildListRows({
            folders: [],
            files: [
                item('zeta'),
                item('upl', { name: 'aaa', uploadStatus: 'uploading' }),
                item('bravo'),
            ],
            sortField: 'name',
            sortDirection: 'asc',
        })
        expect(rows.map(r => r.item.id)).toEqual(['bravo', 'zeta', 'upl'])
    })
})

describe('buildGridRows', () => {
    const folder1 = item('f1', { isFolder: true })
    const file1 = item('file1')
    const file2 = item('file2')

    it('emits section labels and cards', () => {
        const rows = buildGridRows({
            folders: [folder1],
            files: [file1, file2],
        })
        expect(rows.map(r => r.kind)).toEqual(['section', 'card', 'section', 'card', 'card'])
        expect((rows[0] as { title: string }).title).toBe('Folders')
        expect((rows[2] as { title: string }).title).toBe('Files')
    })

    it('skips empty section labels', () => {
        const onlyFiles = buildGridRows({
            folders: [],
            files: [file1],
        })
        expect(onlyFiles.map(r => r.kind)).toEqual(['section', 'card'])
        expect((onlyFiles[0] as { title: string }).title).toBe('Files')

        const onlyFolders = buildGridRows({
            folders: [folder1],
            files: [],
        })
        expect(onlyFolders.map(r => r.kind)).toEqual(['section', 'card'])
        expect((onlyFolders[0] as { title: string }).title).toBe('Folders')
    })

    it('keeps uploading items as cards', () => {
        const uploading = item('upl', { uploadStatus: 'uploading' })
        const rows = buildGridRows({
            folders: [],
            files: [uploading, file1],
        })
        expect(rows).toHaveLength(3)
        expect(rows[0].kind).toBe('section')
        expect(rows[1]).toMatchObject({ kind: 'card', item: { id: 'upl' } })
    })

    it('returns an empty array when there are no folders or files', () => {
        const rows = buildGridRows({ folders: [], files: [] })
        expect(rows).toEqual([])
    })
})
