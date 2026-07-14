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

    const calcAction = action('calc.open', {
        isOpener: true,
        isApplicable: i => i.mimeType === xlsx,
    })
    const textAction = action('text.open', {
        isOpener: true,
        isApplicable: i => i.mimeType === docx,
    })

    it('returns the matching opener for an app-backed file', () => {
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [calcAction, textAction])
        expect(result).toBe(calcAction)
    })

    it('returns null for a file with no applicable opener (preview fallback)', () => {
        const result = resolveOpenAction(item('img', { mimeType: 'image/png' }), [
            calcAction,
            textAction,
        ])
        expect(result).toBeNull()
    })

    it('returns null for a folder even if an opener would otherwise match', () => {
        const folder = item('f', { isFolder: true, mimeType: xlsx })
        expect(resolveOpenAction(folder, [calcAction])).toBeNull()
    })

    it('returns the first registered opener when more than one applies', () => {
        const calcA = action('a.open', { isOpener: true, isApplicable: i => i.mimeType === xlsx })
        const calcB = action('b.open', { isOpener: true, isApplicable: i => i.mimeType === xlsx })
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [calcA, calcB])
        expect(result).toBe(calcA)
    })

    it('does NOT auto-launch an action that has no isApplicable predicate', () => {
        const catchAll = action('catch.all', { isOpener: true }) // no isApplicable
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [catchAll])
        expect(result).toBeNull()
    })

    // The reported bug: "Export to PDF" is isApplicable to xlsx/docx but is NOT
    // an opener. Registered before calc/text openers (drive provider loads
    // first), it hijacked tap-to-open and shared the file as a PDF instead of
    // opening the editor. An applicable non-opener must be skipped.
    it('skips an applicable action that is not an opener (export-to-pdf)', () => {
        const exportPdf = action('drive.exportPdf', {
            isApplicable: i => i.mimeType === xlsx || i.mimeType === docx,
        }) // no isOpener
        // Registered BEFORE the real opener, matching the runtime order.
        const result = resolveOpenAction(item('x', { mimeType: xlsx }), [exportPdf, calcAction])
        expect(result).toBe(calcAction)
    })

    it('returns null when only non-opener actions apply', () => {
        const exportPdf = action('drive.exportPdf', { isApplicable: () => true })
        expect(resolveOpenAction(item('x', { mimeType: xlsx }), [exportPdf])).toBeNull()
    })

    it('returns null when the action list is empty', () => {
        expect(resolveOpenAction(item('x', { mimeType: xlsx }), [])).toBeNull()
    })
})
