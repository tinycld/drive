// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@tinycld/core/lib/org-routes', () => ({
    useOrgHref: () => (path: string, extra?: Record<string, string>) => ({
        pathname: `/${path}`,
        params: extra,
    }),
}))

import { toRow, useSearchActions } from '@tinycld/drive/search-adapter'

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

// Regression guard (C2): selection used to push only `{ item: row.id }`, a
// param nothing in drive reads — usePreviewUrlSync (useDrive.tsx) hydrates
// the preview modal from `file` + `preview: '1'` only. Pinning the exact
// params pushed catches a future drift back to the dead `item` param.
describe('drive useSearchActions', () => {
    it('navigates with the file + preview params the preview modal hydrates from', () => {
        push.mockClear()
        const { result } = renderHook(() => useSearchActions())
        result.current.onSelect({ slug: 'drive', id: 'd1', title: 'Q3 report.pdf' })

        expect(push).toHaveBeenCalledWith({
            pathname: '/drive',
            params: { file: 'd1', preview: '1' },
        })
    })
})
