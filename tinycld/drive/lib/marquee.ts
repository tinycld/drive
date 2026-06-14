/**
 * Pure marquee (drag-to-select / rubber-band) geometry, split out from
 * useMarqueeSelection so the rect math and selection rules can be unit-tested
 * without a DOM, a store, or a hook harness (mirrors how dnd.ts holds the pure
 * drop rules and selection-gesture.ts the pure press/click rules).
 *
 * Everything here works in a single coordinate space — the hook feeds it
 * viewport coordinates (clientX/clientY and getBoundingClientRect), so scroll
 * position and grid layout are already baked into the numbers and this module
 * never has to know about either.
 */

/** A point in some 2-D space (the hook uses viewport coords). */
export interface Point {
    x: number
    y: number
}

/** An axis-aligned rectangle. `right`/`bottom` are exclusive-ish edges; the
 *  intersection test treats a shared edge as non-overlapping (see below). */
export interface Rect {
    left: number
    top: number
    right: number
    bottom: number
}

/** One item's id paired with its on-screen rectangle. */
export interface ItemRect {
    id: string
    rect: Rect
}

/**
 * How far the pointer must travel from the press-down point before a marquee
 * begins. Below this a press-and-release on empty space stays a plain click
 * (which clears the selection) instead of flickering a zero-size box.
 */
export const DRAG_THRESHOLD_PX = 4

/**
 * Build a normalized rect from the two corners of a drag, so the result is the
 * same regardless of drag direction (up-left, down-right, …). `left`/`top` are
 * always the smaller coordinates.
 */
export function normalizeRect(a: Point, b: Point): Rect {
    return {
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        right: Math.max(a.x, b.x),
        bottom: Math.max(a.y, b.y),
    }
}

/**
 * Standard axis-aligned overlap test. A shared edge (the boxes merely touching)
 * counts as NO overlap — using strict inequalities means a marquee that just
 * grazes a tile's edge doesn't grab it, which matches the "the box has to
 * actually cover part of the tile" feel.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/**
 * The selection a marquee resolves to.
 *   - non-additive (plain drag): exactly the items the box currently overlaps,
 *     so shrinking the box drops items it no longer covers.
 *   - additive (cmd/ctrl held at drag-start): the box's overlaps unioned onto
 *     `base` (the selection captured when the drag began), so the marquee adds
 *     to an existing selection without ever removing a base member.
 * Re-evaluated from `base` every frame by the hook — never accumulated — which
 * is what makes the box reversible.
 */
export function marqueeSelection({
    itemRects,
    marquee,
    additive,
    base,
}: {
    itemRects: readonly ItemRect[]
    marquee: Rect
    additive: boolean
    base: ReadonlySet<string>
}): Set<string> {
    const next = additive ? new Set(base) : new Set<string>()
    for (const { id, rect } of itemRects) {
        if (rectsIntersect(marquee, rect)) next.add(id)
    }
    return next
}

/**
 * Whether two selections hold exactly the same ids. The marquee writes a fresh
 * Set into the store on every animation frame; gating that write on a real
 * membership change (rather than Set identity) keeps a slow drag that crosses
 * no tile boundary from re-rendering every visible card ~60×/s.
 */
export function sameSelection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a === b) return true
    if (a.size !== b.size) return false
    for (const id of a) {
        if (!b.has(id)) return false
    }
    return true
}
