import { describe, expect, it } from 'vitest'
import { computeHasTemplates, filterTemplateItems } from '~/tinycld/drive/hooks/use-template-items'
import { TEMPLATE_EXTENSIONS } from '~/tinycld/drive/lib/template-naming'

const DOCX = TEMPLATE_EXTENSIONS.docx

function row(name: string) {
    return { id: name, name, file: `${name}-stored`, updated: '2026-06-01', thumbnail: '', size: 0 }
}

describe('filterTemplateItems', () => {
    it('keeps only names ending in the template extension', () => {
        const rows = [row('Report.tmpl.docx'), row('Notes.docx'), row('Plain')]
        const out = filterTemplateItems(rows, DOCX)
        expect(out.map(i => i.name)).toEqual(['Report.tmpl.docx'])
    })

    it('rejects substring matches that are not a true suffix', () => {
        const rows = [row('report.tmpl.docx.bak'), row('Good.tmpl.docx')]
        const out = filterTemplateItems(rows, DOCX)
        expect(out.map(i => i.name)).toEqual(['Good.tmpl.docx'])
    })

    it('does not cross extensions', () => {
        const rows = [row('Budget.tmpl.xlsx'), row('Letter.tmpl.docx')]
        const out = filterTemplateItems(rows, DOCX)
        expect(out.map(i => i.name)).toEqual(['Letter.tmpl.docx'])
    })

    it('projects the fields the picker needs', () => {
        const out = filterTemplateItems([row('A.tmpl.docx')], DOCX)
        expect(out[0]).toEqual({
            id: 'A.tmpl.docx',
            name: 'A.tmpl.docx',
            file: 'A.tmpl.docx-stored',
            thumbnail: '',
            updated: '2026-06-01',
            size: 0,
        })
    })
})

describe('computeHasTemplates', () => {
    it('is false while still loading, regardless of count', () => {
        expect(computeHasTemplates(0, true)).toBe(false)
        // Hidden until loaded: even a stale non-zero count stays hidden
        // mid-load so the entry point doesn't flicker in then vanish.
        expect(computeHasTemplates(3, true)).toBe(false)
    })

    it('is false once loaded with no templates', () => {
        expect(computeHasTemplates(0, false)).toBe(false)
    })

    it('is true once loaded with at least one template', () => {
        expect(computeHasTemplates(1, false)).toBe(true)
        expect(computeHasTemplates(9, false)).toBe(true)
    })
})
