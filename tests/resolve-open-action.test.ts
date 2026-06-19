import { describe, expect, it } from 'vitest'
import type { DriveItemAction } from '~/tinycld/drive/lib/item-actions-registry'
import { resolveOpenAction } from '~/tinycld/drive/lib/resolve-open-action'
import type { DriveItemView } from '~/tinycld/drive/types'

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

const noopIcon = (() => null) as unknown as DriveItemAction['icon']

function action(id: string, opts: Partial<DriveItemAction> = {}): DriveItemAction {
    return {
        id,
        icon: noopIcon,
        label: id,
        onPress: () => {},
        ...opts,
    }
}

describe('resolveOpenAction', () => {
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const calcAction = action('calc.open', { isApplicable: i => i.mimeType === xlsx })
    const textAction = action('text.open', { isApplicable: i => i.mimeType === docx })

    it('returns the matching action for an app-backed file', () => {
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [calcAction, textAction])
        expect(result).toBe(calcAction)
    })

    it('returns null for a file with no applicable action (preview fallback)', () => {
        const result = resolveOpenAction(item('img', { mimeType: 'image/png' }), [
            calcAction,
            textAction,
        ])
        expect(result).toBeNull()
    })

    it('returns null for a folder even if an action would otherwise match', () => {
        const folder = item('f', { isFolder: true, mimeType: xlsx })
        expect(resolveOpenAction(folder, [calcAction])).toBeNull()
    })

    it('returns the first registered action when more than one applies', () => {
        const calcA = action('a.open', { isApplicable: i => i.mimeType === xlsx })
        const calcB = action('b.open', { isApplicable: i => i.mimeType === xlsx })
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [calcA, calcB])
        expect(result).toBe(calcA)
    })

    it('does NOT auto-launch an action that has no isApplicable predicate', () => {
        const catchAll = action('catch.all') // no isApplicable
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [catchAll])
        expect(result).toBeNull()
    })

    it('returns null when the action list is empty', () => {
        expect(resolveOpenAction(item('x', { mimeType: xlsx }), [])).toBeNull()
    })
})
