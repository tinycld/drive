// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ params: {} as { file?: string; preview?: string } }))

const setParams = vi.fn()
vi.mock('expo-router', () => ({
    useRouter: () => ({ setParams }),
    useNavigation: () => ({ isFocused: () => true }),
    useLocalSearchParams: () => h.params,
}))

import { usePreviewUrlSync } from '~/tinycld/drive/hooks/usePreviewUrlSync'
import { useDriveUIStore } from '~/tinycld/drive/stores/drive-ui-store'

const previewItemId = () => useDriveUIStore.getState().previewItemId

describe('usePreviewUrlSync', () => {
    beforeEach(() => {
        useDriveUIStore.setState({ previewItemId: null })
    })
    afterEach(() => {
        cleanup()
        h.params = {}
        vi.clearAllMocks()
    })

    // A shared link lands on the preview, and the link is left as it arrived.
    it('opens the preview named by ?file=&preview=1 without rewriting the URL', () => {
        h.params = { file: 'f1', preview: '1' }
        renderHook(() => usePreviewUrlSync())
        expect(previewItemId()).toBe('f1')
        expect(setParams).not.toHaveBeenCalled()
    })

    // `?file=` alone selects nothing to preview.
    it('ignores ?file= without preview=1', () => {
        h.params = { file: 'f1' }
        renderHook(() => usePreviewUrlSync())
        expect(previewItemId()).toBeNull()
    })

    it('writes the params when a preview opens', () => {
        renderHook(() => usePreviewUrlSync())
        act(() => useDriveUIStore.getState().openPreviewItem('f2'))
        expect(setParams).toHaveBeenCalledWith({ file: 'f2', preview: '1' })
    })

    it('clears both params when the preview closes', () => {
        h.params = { file: 'f2', preview: '1' }
        renderHook(() => usePreviewUrlSync())
        expect(previewItemId()).toBe('f2')
        act(() => useDriveUIStore.getState().closePreviewItem())
        expect(setParams).toHaveBeenCalledWith({ file: undefined, preview: undefined })
    })
})
