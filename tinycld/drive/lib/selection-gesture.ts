/**
 * Pure selection-gesture logic, split out from useFileSelection so the subtle
 * press-down vs. release rules can be unit-tested without a store or hook
 * harness (mirrors how dnd.ts holds the pure drop rules).
 *
 * The core tension this encodes: press-down must select for an instant
 * highlight, but pressing down on an item that's already part of a
 * multi-selection must NOT collapse that selection — the user may be grabbing
 * the whole set to drag it. So a plain press-down on an already-selected item is
 * a no-op, and the "narrow to the one item" collapse is deferred to release
 * (a real click; a drag consumes the pointer so release never fires after one).
 */

/** Which modifier keys were held during the gesture (web only). */
export interface SelectionModifiers {
    /** cmd (mac) — toggles a single item in/out of the selection. */
    meta: boolean
    /** ctrl (win/linux) — same as meta. */
    ctrl: boolean
    /** shift — extends a contiguous range from the anchor. */
    shift: boolean
}

/**
 * The selection mutation a gesture resolves to. The hook maps each variant onto
 * the matching store action; keeping it data lets the decision be asserted
 * directly.
 *   - `none`   — leave the selection untouched
 *   - `single` — select only this item (and make it the detail-panel item)
 *   - `toggle` — add/remove this item from the selection
 *   - `range`  — extend a range from the anchor to this item
 */
export type SelectionAction =
    | { type: 'none' }
    | { type: 'single' }
    | { type: 'toggle' }
    | { type: 'range' }

/**
 * Selection action for a press-DOWN (onPressIn) on web.
 *   - modifier held → toggle / range (these build a selection, never a drag-grab)
 *   - already part of a multi-selection → none (preserve it for a potential drag)
 *   - otherwise → single (instant highlight for the common case)
 */
export function pressDownAction(
    itemId: string,
    modifiers: SelectionModifiers,
    selectedIds: ReadonlySet<string>
): SelectionAction {
    if (modifiers.meta || modifiers.ctrl) return { type: 'toggle' }
    if (modifiers.shift) return { type: 'range' }
    if (selectedIds.has(itemId) && selectedIds.size > 1) return { type: 'none' }
    return { type: 'single' }
}

/**
 * Selection action for a release/CLICK (onPress) on web. Only collapses a
 * multi-selection the press-down deliberately preserved; everything else was
 * already settled on press-down, so this is a no-op. Modifier clicks are handled
 * on press-down and ignored here.
 */
export function clickAction(
    itemId: string,
    modifiers: SelectionModifiers,
    selectedIds: ReadonlySet<string>
): SelectionAction {
    if (modifiers.meta || modifiers.ctrl || modifiers.shift) return { type: 'none' }
    if (selectedIds.has(itemId) && selectedIds.size > 1) return { type: 'single' }
    return { type: 'none' }
}
