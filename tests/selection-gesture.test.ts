import { describe, expect, it } from 'vitest'
import {
    clickAction,
    pressDownAction,
    type SelectionModifiers,
} from '~/tinycld/drive/lib/selection-gesture'

const NO_MODS: SelectionModifiers = { meta: false, ctrl: false, shift: false }
const META: SelectionModifiers = { ...NO_MODS, meta: true }
const CTRL: SelectionModifiers = { ...NO_MODS, ctrl: true }
const SHIFT: SelectionModifiers = { ...NO_MODS, shift: true }

const set = (...ids: string[]) => new Set(ids)

describe('pressDownAction', () => {
    it('selects a single item when nothing is selected', () => {
        expect(pressDownAction('a', NO_MODS, set())).toEqual({ type: 'single' })
    })

    it('selects a single item when pressing an unselected item', () => {
        // Pressing a different item replaces the selection — the common click.
        expect(pressDownAction('b', NO_MODS, set('a'))).toEqual({ type: 'single' })
        expect(pressDownAction('c', NO_MODS, set('a', 'b'))).toEqual({ type: 'single' })
    })

    it('collapses to single when pressing the only selected item', () => {
        // Size 1 — there is no multi-selection to preserve, so behave normally.
        expect(pressDownAction('a', NO_MODS, set('a'))).toEqual({ type: 'single' })
    })

    it('preserves a multi-selection when grabbing one of its members', () => {
        // The whole point: this press may be the start of a drag of all three.
        expect(pressDownAction('a', NO_MODS, set('a', 'b', 'c'))).toEqual({ type: 'none' })
        expect(pressDownAction('b', NO_MODS, set('a', 'b'))).toEqual({ type: 'none' })
    })

    it('toggles with meta/ctrl regardless of current selection', () => {
        expect(pressDownAction('a', META, set())).toEqual({ type: 'toggle' })
        expect(pressDownAction('a', CTRL, set('a', 'b'))).toEqual({ type: 'toggle' })
        // A modifier press on an already-selected member still toggles (removes),
        // never the multi-select-preserve no-op.
        expect(pressDownAction('a', META, set('a', 'b'))).toEqual({ type: 'toggle' })
    })

    it('extends a range with shift', () => {
        expect(pressDownAction('c', SHIFT, set('a'))).toEqual({ type: 'range' })
        expect(pressDownAction('c', SHIFT, set('a', 'b'))).toEqual({ type: 'range' })
    })
})

describe('clickAction', () => {
    it('collapses a preserved multi-selection to the clicked item', () => {
        // press-down preserved {a,b,c}; the click turned out NOT to be a drag,
        // so narrow to just the clicked item.
        expect(clickAction('a', NO_MODS, set('a', 'b', 'c'))).toEqual({ type: 'single' })
    })

    it('does nothing when the clicked item is not in a multi-selection', () => {
        // Single selection or unselected — press-down already settled it.
        expect(clickAction('a', NO_MODS, set('a'))).toEqual({ type: 'none' })
        expect(clickAction('a', NO_MODS, set())).toEqual({ type: 'none' })
        expect(clickAction('z', NO_MODS, set('a', 'b'))).toEqual({ type: 'none' })
    })

    it('ignores modifier clicks (handled on press-down)', () => {
        expect(clickAction('a', META, set('a', 'b', 'c'))).toEqual({ type: 'none' })
        expect(clickAction('a', CTRL, set('a', 'b', 'c'))).toEqual({ type: 'none' })
        expect(clickAction('a', SHIFT, set('a', 'b', 'c'))).toEqual({ type: 'none' })
    })
})
