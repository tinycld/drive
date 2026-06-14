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
 *
 * Modifier (toggle/range) selection is deliberately NOT decided here: the
 * modifier flag is not reliably present on the pointerdown event under load
 * (observed on CI — a Ctrl+click whose pointerdown reported ctrlKey:false fell
 * through to `single` and REPLACED the selection instead of extending it). So a
 * modified press is a no-op on press-down and the toggle/range is resolved on
 * the click (release), where the modifier is reliable — see clickAction.
 *
 *   - modifier held → none (resolved on release, where the modifier is reliable)
 *   - already part of a multi-selection → none (preserve it for a potential drag)
 *   - otherwise → single (instant highlight for the common, unmodified case)
 */
export function pressDownAction(
    itemId: string,
    modifiers: SelectionModifiers,
    selectedIds: ReadonlySet<string>
): SelectionAction {
    if (modifiers.meta || modifiers.ctrl || modifiers.shift) return { type: 'none' }
    if (selectedIds.has(itemId) && selectedIds.size > 1) return { type: 'none' }
    return { type: 'single' }
}

/**
 * Selection action for a release/CLICK (onPress) on web. Resolves the cases the
 * press-down deferred:
 *   - meta/ctrl click → toggle (add/remove from the selection)
 *   - shift click     → range (extend from the anchor)
 *   - plain click on a preserved multi-selection → single (collapse to this one;
 *     press-down kept the whole set so a grab could drag it, but this turned out
 *     to be a click, not a drag)
 *   - otherwise → none (press-down already settled the single/plain case)
 */
export function clickAction(
    itemId: string,
    modifiers: SelectionModifiers,
    selectedIds: ReadonlySet<string>
): SelectionAction {
    if (modifiers.meta || modifiers.ctrl) return { type: 'toggle' }
    if (modifiers.shift) return { type: 'range' }
    if (selectedIds.has(itemId) && selectedIds.size > 1) return { type: 'single' }
    return { type: 'none' }
}
