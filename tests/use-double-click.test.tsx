// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import type { GestureResponderEvent } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDoubleClick } from '~/tinycld/drive/hooks/useDoubleClick'

const tap = {} as GestureResponderEvent

describe('useDoubleClick', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    function setup() {
        const single = vi.fn()
        const double = vi.fn()
        const settled = vi.fn()
        const { result } = renderHook(() => useDoubleClick(single, double, settled))
        return { press: () => result.current(tap), single, double, settled }
    }

    it('settles a lone click once the double-click window has passed', () => {
        const { press, single, double, settled } = setup()
        press()
        expect(single).toHaveBeenCalledTimes(1)
        expect(settled).not.toHaveBeenCalled()
        vi.advanceTimersByTime(300)
        expect(settled).toHaveBeenCalledTimes(1)
        expect(double).not.toHaveBeenCalled()
    })

    it('never settles the first click of a double-click', () => {
        const { press, single, double, settled } = setup()
        press()
        vi.advanceTimersByTime(150)
        press()
        vi.advanceTimersByTime(1000)
        expect(single).toHaveBeenCalledTimes(2)
        expect(double).toHaveBeenCalledTimes(1)
        expect(settled).not.toHaveBeenCalled()
    })

    it('treats clicks further apart than the window as two single clicks', () => {
        const { press, double, settled } = setup()
        press()
        vi.advanceTimersByTime(400)
        press()
        vi.advanceTimersByTime(400)
        expect(double).not.toHaveBeenCalled()
        expect(settled).toHaveBeenCalledTimes(2)
    })
})
