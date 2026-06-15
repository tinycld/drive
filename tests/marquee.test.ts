import { describe, expect, it } from 'vitest'
import {
    type ItemRect,
    marqueeSelection,
    normalizeRect,
    type Rect,
    rectsIntersect,
    sameSelection,
} from '~/tinycld/drive/lib/marquee'

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
    left,
    top,
    right,
    bottom,
})

describe('normalizeRect', () => {
    it('produces the same rect for every drag direction', () => {
        const expected = rect(10, 20, 30, 40)
        // down-right
        expect(normalizeRect({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual(expected)
        // up-left
        expect(normalizeRect({ x: 30, y: 40 }, { x: 10, y: 20 })).toEqual(expected)
        // up-right
        expect(normalizeRect({ x: 10, y: 40 }, { x: 30, y: 20 })).toEqual(expected)
        // down-left
        expect(normalizeRect({ x: 30, y: 20 }, { x: 10, y: 40 })).toEqual(expected)
    })

    it('returns a zero-area rect when the corners coincide', () => {
        expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual(rect(5, 5, 5, 5))
    })
})

describe('rectsIntersect', () => {
    const box = rect(0, 0, 10, 10)

    it('detects partial overlap', () => {
        expect(rectsIntersect(box, rect(5, 5, 15, 15))).toBe(true)
    })

    it('detects full containment (either direction)', () => {
        expect(rectsIntersect(box, rect(2, 2, 8, 8))).toBe(true)
        expect(rectsIntersect(rect(2, 2, 8, 8), box)).toBe(true)
    })

    it('treats a shared edge as no overlap', () => {
        // touching on the right edge / bottom edge / corner
        expect(rectsIntersect(box, rect(10, 0, 20, 10))).toBe(false)
        expect(rectsIntersect(box, rect(0, 10, 10, 20))).toBe(false)
        expect(rectsIntersect(box, rect(10, 10, 20, 20))).toBe(false)
    })

    it('returns false for disjoint rects', () => {
        expect(rectsIntersect(box, rect(20, 20, 30, 30))).toBe(false)
    })

    it('treats a zero-area box on an edge as no overlap', () => {
        // A degenerate box that coincides with an edge fails the strict test. (A
        // 0×0 box strictly *inside* a rect is geometrically contained; the hook
        // never gets there because DRAG_THRESHOLD_PX gates the marquee on real
        // movement before any hit-test runs.)
        expect(rectsIntersect(rect(0, 0, 0, 0), box)).toBe(false)
        expect(rectsIntersect(rect(10, 10, 10, 10), box)).toBe(false)
    })
})

describe('marqueeSelection', () => {
    const items: ItemRect[] = [
        { id: 'a', rect: rect(0, 0, 10, 10) },
        { id: 'b', rect: rect(20, 0, 30, 10) },
        { id: 'c', rect: rect(40, 0, 50, 10) },
    ]
    const empty = new Set<string>()

    it('selects exactly the overlapped items (non-additive)', () => {
        const result = marqueeSelection({
            itemRects: items,
            marquee: rect(5, 5, 25, 15), // overlaps a and b, not c
            additive: false,
            base: empty,
        })
        expect(result).toEqual(new Set(['a', 'b']))
    })

    it('selects a tile on any partial overlap', () => {
        const result = marqueeSelection({
            itemRects: items,
            marquee: rect(9, 9, 11, 11), // just clips a's bottom-right corner
            additive: false,
            base: empty,
        })
        expect(result).toEqual(new Set(['a']))
    })

    it('drops items the box no longer covers when shrinking (non-additive)', () => {
        const wide = marqueeSelection({
            itemRects: items,
            marquee: rect(5, 5, 45, 15), // a, b, c
            additive: false,
            base: empty,
        })
        expect(wide).toEqual(new Set(['a', 'b', 'c']))
        const narrow = marqueeSelection({
            itemRects: items,
            marquee: rect(5, 5, 25, 15), // back to a, b
            additive: false,
            base: empty,
        })
        expect(narrow).toEqual(new Set(['a', 'b']))
    })

    it('unions the overlap onto the base selection (additive)', () => {
        const result = marqueeSelection({
            itemRects: items,
            marquee: rect(45, 5, 55, 15), // overlaps c
            additive: true,
            base: new Set(['a']),
        })
        expect(result).toEqual(new Set(['a', 'c']))
    })

    it('never duplicates a base member the box also covers (additive)', () => {
        const result = marqueeSelection({
            itemRects: items,
            marquee: rect(5, 5, 15, 15), // overlaps a, already in base
            additive: true,
            base: new Set(['a']),
        })
        expect(result).toEqual(new Set(['a']))
    })

    it('retains base members outside the box (additive)', () => {
        const result = marqueeSelection({
            itemRects: items,
            marquee: rect(5, 5, 15, 15), // overlaps a
            additive: true,
            base: new Set(['c']), // c is far from the box
        })
        expect(result).toEqual(new Set(['a', 'c']))
    })

    it('returns the base unchanged with no item rects (additive)', () => {
        const result = marqueeSelection({
            itemRects: [],
            marquee: rect(0, 0, 100, 100),
            additive: true,
            base: new Set(['a', 'b']),
        })
        expect(result).toEqual(new Set(['a', 'b']))
    })

    it('returns an empty set with no item rects (non-additive)', () => {
        const result = marqueeSelection({
            itemRects: [],
            marquee: rect(0, 0, 100, 100),
            additive: false,
            base: new Set(['a', 'b']),
        })
        expect(result).toEqual(empty)
    })

    it('does not mutate the base set', () => {
        const base = new Set(['a'])
        marqueeSelection({ itemRects: items, marquee: rect(45, 5, 55, 15), additive: true, base })
        expect(base).toEqual(new Set(['a']))
    })
})

describe('sameSelection', () => {
    it('is true for the same instance', () => {
        const s = new Set(['a', 'b'])
        expect(sameSelection(s, s)).toBe(true)
    })

    it('is true for equal membership with different identity', () => {
        expect(sameSelection(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    })

    it('is false for a different size', () => {
        expect(sameSelection(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    })

    it('is false for the same size but different members', () => {
        expect(sameSelection(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false)
    })

    it('is true for two empty sets', () => {
        expect(sameSelection(new Set(), new Set())).toBe(true)
    })
})
