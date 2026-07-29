import { describe, expect, it } from 'vitest'
import {
    canDrop,
    type DriveDragPayload,
    isDriveDragPayload,
    movableIds,
} from '~/tinycld/drive/lib/dnd'
import type { DriveItemView } from '~/tinycld/drive/types'

function item(id: string, opts: Partial<DriveItemView> = {}): DriveItemView {
    return {
        id,
        name: id,
        isFolder: false,
        mimeType: 'text/plain',
        parentId: '',
        owner: 'me',
        ownerUserId: 'u1',
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

// Tree:  root
//          ├─ folderA            (id a)
//          │    └─ folderB       (id b, parent a)
//          │         └─ file2    (id file2, parent b)
//          └─ file1              (id file1, parent '')
const folderA = item('a', { isFolder: true, parentId: '' })
const folderB = item('b', { isFolder: true, parentId: 'a' })
const file1 = item('file1', { parentId: '' })
const file2 = item('file2', { parentId: 'b' })

const itemsById = new Map<string, DriveItemView>([
    ['a', folderA],
    ['b', folderB],
    ['file1', file1],
    ['file2', file2],
])

function payload(...ids: string[]): DriveDragPayload {
    return { kind: 'drive-items', ids }
}

describe('isDriveDragPayload', () => {
    it('accepts a well-formed drive payload', () => {
        expect(isDriveDragPayload(payload('file1'))).toBe(true)
    })

    it('rejects foreign payloads (e.g. OS file drags or undefined)', () => {
        expect(isDriveDragPayload(undefined)).toBe(false)
        expect(isDriveDragPayload({ kind: 'other', ids: [] })).toBe(false)
        expect(isDriveDragPayload({ kind: 'drive-items' })).toBe(false)
    })
})

describe('movableIds', () => {
    it('moves a file into a folder', () => {
        expect(movableIds(payload('file1'), 'a', itemsById)).toEqual(['file1'])
    })

    it('moves a file to the root', () => {
        expect(movableIds(payload('file2'), '', itemsById)).toEqual(['file2'])
    })

    it('drops a no-op move (item already in that parent)', () => {
        // file1 already lives at the root.
        expect(movableIds(payload('file1'), '', itemsById)).toEqual([])
        // file2 already lives in folderB.
        expect(movableIds(payload('file2'), 'b', itemsById)).toEqual([])
    })

    it('refuses dropping a folder onto itself', () => {
        expect(movableIds(payload('a'), 'a', itemsById)).toEqual([])
    })

    it('refuses dropping a folder into its own descendant', () => {
        // folderA into folderB (B is a child of A) would orphan the subtree.
        expect(movableIds(payload('a'), 'b', itemsById)).toEqual([])
    })

    it('allows moving a child folder up to the root', () => {
        expect(movableIds(payload('b'), '', itemsById)).toEqual(['b'])
    })

    it('refuses a target that is not a folder', () => {
        expect(movableIds(payload('file1'), 'file2', itemsById)).toEqual([])
    })

    it('filters a multi-selection to only the movable ids', () => {
        // Dragging {file1 (no-op at root), file2, a-into-b is invalid} onto
        // folderB: file1 is a no-op, file2 already there, folderA is an
        // ancestor of B — so nothing moves.
        expect(movableIds(payload('file1', 'file2'), 'b', itemsById)).toEqual(['file1'])
    })

    it('keeps the rest of a selection when one id is the target itself', () => {
        // Dropping {folderA, file1} onto folderA: folderA-onto-itself is
        // dropped, file1 moves in.
        expect(movableIds(payload('a', 'file1'), 'a', itemsById)).toEqual(['file1'])
    })
})

describe('canDrop', () => {
    it('is true when at least one id would move', () => {
        expect(canDrop(payload('file1'), 'a', itemsById)).toBe(true)
        expect(canDrop(payload('a', 'file1'), 'a', itemsById)).toBe(true)
    })

    it('is false for no-ops, self-drops, descendants, and foreign payloads', () => {
        expect(canDrop(payload('file1'), '', itemsById)).toBe(false)
        expect(canDrop(payload('a'), 'a', itemsById)).toBe(false)
        expect(canDrop(payload('a'), 'b', itemsById)).toBe(false)
        expect(canDrop(undefined, 'a', itemsById)).toBe(false)
    })
})
