import { describe, expect, it } from 'vitest'
import { filterTemplateItems } from '~/tinycld/drive/hooks/use-template-items'
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
