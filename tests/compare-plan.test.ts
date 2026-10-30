import { describe, expect, it } from 'vitest'
import { comparePlan } from '~/tinycld/drive/lib/compare-mode'

const v = (id: string, version_number: number) => ({ id, version_number })

describe('comparePlan', () => {
    it('previews the newer of two versions with changes from the older, in either pick order', () => {
        expect(comparePlan(v('a', 1), v('c', 3), 'none')).toEqual({
            previewId: 'c',
            compare: 'versions',
            fromId: 'a',
        })
        expect(comparePlan(v('c', 3), v('a', 1), 'none')).toEqual({
            previewId: 'c',
            compare: 'versions',
            fromId: 'a',
        })
    })

    it('uses the compare mode when there is no base, or the base is the selected version', () => {
        expect(comparePlan(v('c', 3), undefined, 'current')).toEqual({
            previewId: 'c',
            compare: 'current',
        })
        expect(comparePlan(v('c', 3), v('c', 3), 'previous')).toEqual({
            previewId: 'c',
            compare: 'previous',
        })
    })

    it('previews nothing when nothing is selected', () => {
        expect(comparePlan(undefined, undefined, 'none')).toEqual({
            previewId: undefined,
            compare: 'none',
        })
    })
})
