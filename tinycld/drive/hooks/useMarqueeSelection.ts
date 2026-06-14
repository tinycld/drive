import type { FlashListRef } from '@shopify/flash-list'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import {
    DRAG_THRESHOLD_PX,
    type ItemRect,
    marqueeSelection,
    normalizeRect,
    type Point,
    type Rect,
    sameSelection,
} from '../lib/marquee'

// How close to the top/bottom container edge the pointer must be (in px) for the
// list to start auto-scrolling, and how many px to scroll per animation frame
// while it's in that band. Kept modest so the box stays controllable.
const EDGE_BAND_PX = 48
const EDGE_SCROLL_STEP_PX = 14

/** The attribute every selectable tile carries so the marquee can find and
 *  measure it (and so a press that starts on a tile can be told apart from a
 *  press on empty space). `dataSet={{ driveItemId }}` on a react-native-web
 *  Pressable renders this. */
export const DRIVE_ITEM_ATTR = 'data-drive-item-id'

interface MarqueeParams {
    /** The file-area element the gesture lives in (web only). */
    containerRef: RefObject<HTMLDivElement | null>
    /** Replace the whole selection (store action). */
    setSelection: (ids: Set<string>) => void
    /** Clear the selection (store action) — fired on a plain empty-space click. */
    clearSelection: () => void
    /** Reads the selection live at drag-start, for additive (cmd/ctrl) drags. */
    getBaseSelection: () => Set<string>
    /** The active FlashList, for edge auto-scroll. */
    scrollRef: RefObject<FlashListRef<unknown> | null>
    /** Disable the gesture entirely (e.g. on mobile breakpoint). */
    enabled?: boolean
}

interface MarqueeResult {
    /** Container-relative rect to draw, or null when not dragging. */
    marqueeRect: Rect | null
    isDragging: boolean
}

interface GestureState {
    /**
     * Press-down point in viewport coords. The anchor is pinned to the *content*,
     * not the viewport: as the list auto-scrolls, the effective anchor shifts by
     * how far it scrolled (see `startScrollOffset`) so the box keeps covering
     * everything swept over — otherwise items would scroll out of the box's
     * fixed top edge and deselect.
     */
    start: Point
    /** List scroll offset at press-down; the anchor compensates for scroll
     *  relative to this. */
    startScrollOffset: number
    /** Latest pointer point in viewport coords (tracks the live mouse). */
    current: Point
    /** Selection captured at drag-start (the union base for additive drags). */
    base: Set<string>
    /** cmd/ctrl held at drag-start → union onto base instead of replace. */
    additive: boolean
    /** Flipped once movement passes DRAG_THRESHOLD_PX. */
    dragging: boolean
    /** Pending animation-frame id, or 0 when none is scheduled. */
    raf: number
}

const INERT: MarqueeResult = { marqueeRect: null, isDragging: false }

/**
 * Drag-to-select (marquee / rubber-band). Web/desktop only — the whole gesture
 * is inert on native, where there's no empty-space drag affordance and it would
 * fight scroll.
 *
 * It listens for a left-button `mousedown` on empty space (anywhere in the file
 * area that isn't a tile), then draws a box and selects every tile the box
 * overlaps, live, as the pointer moves. Hit-testing reads each on-screen tile's
 * `getBoundingClientRect()` in viewport coordinates, so scroll position, the
 * virtualized row set, and the grid's column count are all accounted for for
 * free; the pure math lives in lib/marquee.ts.
 *
 * Conflict with drag-to-move (react-native-drax): a Drax drag only ever starts
 * on a tile, a marquee only ever starts off one, so the start-target guard
 * (`closest('[data-drive-item-id]')`) keeps them from colliding. The listener is
 * registered in the capture phase so a tile's own handlers can't `stopPropagation`
 * it away before the guard runs.
 *
 * Known limitation: only rendered rows are hit-testable, so a box dragged
 * through a region that was never rendered won't select those rows. Edge
 * auto-scroll lets the user bring them into view, where the next frame picks
 * them up.
 */
export function useMarqueeSelection({
    containerRef,
    setSelection,
    clearSelection,
    getBaseSelection,
    scrollRef,
    enabled = true,
}: MarqueeParams): MarqueeResult {
    const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const stateRef = useRef<GestureState | null>(null)

    // Keep the latest action callbacks reachable from the long-lived DOM
    // listeners without re-subscribing them every render.
    const setSelectionRef = useRef(setSelection)
    const clearSelectionRef = useRef(clearSelection)
    const getBaseSelectionRef = useRef(getBaseSelection)
    setSelectionRef.current = setSelection
    clearSelectionRef.current = clearSelection
    getBaseSelectionRef.current = getBaseSelection

    // Read every tagged tile's id + viewport rect. Off-screen (virtualized)
    // rows simply aren't in the DOM, so they're naturally excluded.
    const readItemRects = useCallback((): ItemRect[] => {
        const container = containerRef.current
        if (!container) return []
        const els = Array.from(container.querySelectorAll<HTMLElement>(`[${DRIVE_ITEM_ATTR}]`))
        const rects: ItemRect[] = []
        for (const el of els) {
            const id = el.dataset.driveItemId
            if (!id) continue
            const r = el.getBoundingClientRect()
            rects.push({ id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
        }
        return rects
    }, [containerRef])

    // One animation-frame tick: recompute the selection from the current box and,
    // if the pointer sits in an edge band, scroll the list a step and reschedule
    // itself (so a held-still pointer keeps scrolling + selecting).
    const tick = useCallback(() => {
        const st = stateRef.current
        const container = containerRef.current
        if (!st || !container) return
        st.raf = 0

        const containerRect = container.getBoundingClientRect()
        const list = scrollRef.current

        // Pin the anchor to the content: as the list scrolls away from where the
        // drag began, the anchor's viewport position shifts to match, so the box
        // grows to keep every swept-over item inside it. Vertical only (the list
        // scrolls vertically); X stays put.
        const scrolled = list ? list.getAbsoluteLastScrollOffset() - st.startScrollOffset : 0
        const anchor: Point = { x: st.start.x, y: st.start.y - scrolled }

        const marquee = normalizeRect(anchor, st.current)
        const next = marqueeSelection({
            itemRects: readItemRects(),
            marquee,
            additive: st.additive,
            base: st.base,
        })
        // Only write on a real membership change — a slow drag fires a frame per
        // ~16ms and a new Set identity would re-render every visible card.
        const setSel = setSelectionRef.current
        const getBase = getBaseSelectionRef.current
        if (!sameSelection(next, getBase())) setSel(next)

        // Draw the box in container-relative coords.
        setMarqueeRect({
            left: marquee.left - containerRect.left,
            top: marquee.top - containerRect.top,
            right: marquee.right - containerRect.left,
            bottom: marquee.bottom - containerRect.top,
        })

        // Edge auto-scroll: keep ticking while the pointer is near an edge.
        if (list) {
            const distTop = st.current.y - containerRect.top
            const distBottom = containerRect.bottom - st.current.y
            let delta = 0
            if (distTop < EDGE_BAND_PX) delta = -EDGE_SCROLL_STEP_PX
            else if (distBottom < EDGE_BAND_PX) delta = EDGE_SCROLL_STEP_PX
            if (delta !== 0) {
                const offset = list.getAbsoluteLastScrollOffset() + delta
                list.scrollToOffset({ offset: Math.max(0, offset), animated: false })
                st.raf = requestAnimationFrame(tick)
            }
        }
    }, [containerRef, readItemRects, scrollRef])

    const scheduleTick = useCallback(() => {
        const st = stateRef.current
        if (!st || st.raf) return
        st.raf = requestAnimationFrame(tick)
    }, [tick])

    useEffect(() => {
        if (Platform.OS !== 'web' || !enabled) return
        const container = containerRef.current
        if (!container) return

        const finish = () => {
            const st = stateRef.current
            if (st?.raf) cancelAnimationFrame(st.raf)
            stateRef.current = null
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            document.body.style.removeProperty('user-select')
            setMarqueeRect(null)
            setIsDragging(false)
        }

        const onMove = (e: MouseEvent) => {
            const st = stateRef.current
            if (!st) return
            st.current = { x: e.clientX, y: e.clientY }
            if (!st.dragging) {
                const moved = Math.hypot(e.clientX - st.start.x, e.clientY - st.start.y)
                if (moved < DRAG_THRESHOLD_PX) return
                st.dragging = true
                document.body.style.userSelect = 'none'
                setIsDragging(true)
            }
            scheduleTick()
        }

        const onUp = () => {
            const st = stateRef.current
            // A press-and-release that never became a drag, with no modifier, is
            // a click on empty space → clear the selection (Drive behavior).
            if (st && !st.dragging && !st.additive) clearSelectionRef.current()
            finish()
        }

        const onDown = (e: MouseEvent) => {
            if (e.button !== 0) return // left button only; right-click → context menu
            const target = e.target as Element | null
            if (target?.closest(`[${DRIVE_ITEM_ATTR}]`)) return // press began on a tile → Drax owns it
            // Cancel any in-flight gesture before starting a fresh one.
            const prev = stateRef.current
            if (prev?.raf) cancelAnimationFrame(prev.raf)
            const point = { x: e.clientX, y: e.clientY }
            stateRef.current = {
                start: point,
                startScrollOffset: scrollRef.current?.getAbsoluteLastScrollOffset() ?? 0,
                current: point,
                base: getBaseSelectionRef.current(),
                additive: e.metaKey || e.ctrlKey,
                dragging: false,
                raf: 0,
            }
            // Stop the browser starting a text selection from the empty-space drag.
            e.preventDefault()
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }

        container.addEventListener('mousedown', onDown, true) // capture phase
        return () => {
            container.removeEventListener('mousedown', onDown, true)
            finish()
        }
    }, [containerRef, enabled, scheduleTick, scrollRef])

    if (Platform.OS !== 'web' || !enabled) return INERT
    return { marqueeRect, isDragging }
}
