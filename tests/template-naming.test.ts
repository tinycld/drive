import { describe, expect, it } from 'vitest'
import {
    fromTemplateName,
    isTemplateName,
    TEMPLATE_EXTENSIONS,
    templateDisplayName,
    toTemplateName,
} from '~/tinycld/drive/lib/template-naming'

const DOCX = TEMPLATE_EXTENSIONS.docx
const XLSX = TEMPLATE_EXTENSIONS.xlsx

describe('toTemplateName', () => {
    it('strips the base extension and appends the template extension', () => {
        expect(toTemplateName('Report.docx', DOCX)).toBe('Report.tmpl.docx')
        expect(toTemplateName('Budget.xlsx', XLSX)).toBe('Budget.tmpl.xlsx')
    })

    it('appends when the name has no base extension', () => {
        expect(toTemplateName('Notes', DOCX)).toBe('Notes.tmpl.docx')
    })

    it('is idempotent — never double-suffixes', () => {
        expect(toTemplateName('Report.tmpl.docx', DOCX)).toBe('Report.tmpl.docx')
    })

    it('matches the base extension case-insensitively', () => {
        expect(toTemplateName('Report.DOCX', DOCX)).toBe('Report.tmpl.docx')
    })

    it('trims surrounding whitespace', () => {
        expect(toTemplateName('  Report.docx  ', DOCX)).toBe('Report.tmpl.docx')
    })
})

describe('fromTemplateName', () => {
    it('restores the base extension', () => {
        expect(fromTemplateName('Report.tmpl.docx', DOCX)).toBe('Report.docx')
        expect(fromTemplateName('Budget.tmpl.xlsx', XLSX)).toBe('Budget.xlsx')
    })

    it('strips only one template suffix', () => {
        expect(fromTemplateName('My.tmpl.docx.tmpl.docx', DOCX)).toBe('My.tmpl.docx.docx')
    })

    it('returns a non-template name unchanged', () => {
        expect(fromTemplateName('Report.docx', DOCX)).toBe('Report.docx')
    })
})

describe('isTemplateName', () => {
    it('detects the template convention', () => {
        expect(isTemplateName('Report.tmpl.docx', DOCX)).toBe(true)
        expect(isTemplateName('Report.docx', DOCX)).toBe(false)
        expect(isTemplateName('Report.tmpl.xlsx', DOCX)).toBe(false)
    })
})

describe('templateDisplayName', () => {
    it('strips the whole template suffix for display', () => {
        expect(templateDisplayName('Quarterly Report.tmpl.docx', DOCX)).toBe('Quarterly Report')
    })

    it('leaves a non-template name as-is', () => {
        expect(templateDisplayName('Quarterly Report.docx', DOCX)).toBe('Quarterly Report.docx')
    })
})
