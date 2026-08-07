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

import { useSearchActions } from '@tinycld/drive/search-adapter'

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
