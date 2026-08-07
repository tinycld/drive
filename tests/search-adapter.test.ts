import { toRow } from '@tinycld/drive/search-adapter'
import { describe, expect, it } from 'vitest'

describe('drive toRow', () => {
    it('maps a hit to a row with the file name and description', () => {
        const row = toRow({
            id: 'd1',
            name: 'Q3 report.pdf',
            description: 'Board deck',
            is_folder: false,
            mime_type: 'application/pdf',
            size: 1024,
            updated: '2026-08-01',
            highlight: '',
        })
        expect(row).toEqual({
            id: 'd1',
            title: 'Q3 report.pdf',
            subtitle: 'Board deck',
            meta: undefined,
        })
    })

    it('falls back to "Untitled file" when name is empty', () => {
        const row = toRow({ id: 'd2', name: '', description: '', is_folder: true })
        expect(row?.title).toBe('Untitled file')
    })
})
