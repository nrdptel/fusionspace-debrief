/** Shared style tokens — plain constants, deliberately in a module with NO `'use client'`.
 *
 *  A token exported from a client module cannot be read by a server component: Next replaces the
 *  export with a client reference, and interpolating that into a `className` serialises the
 *  reference's throwing stub straight into the served HTML — the class attribute ends up holding
 *  `function(){throw Error("Attempted to call TOUCH_TARGET() from the server…")}` and silently
 *  loses the utility it was meant to add. Tokens live here so both sides can import them.
 *  (Measured in the sibling app, which shipped exactly that in its site header.)
 */

/** A 44 px minimum hit target on a COARSE pointer. 44 px is the Apple HIG / WCAG 2.5.5 figure, and
 *  it is not a nicety here: the stated phone use is a pad check with gloves on. A pointer layout
 *  deliberately keeps its tighter spacing — the two form factors are tuned separately, not
 *  stretched from one layout.
 *
 *  **Keyed on the pointer, not on the viewport width, and that was wrong first.** It was
 *  `min-h-11 sm:min-h-0`, which is a width query: below 640 px every control grew to 44 px whether
 *  a thumb or a mouse was driving it, so dragging a desktop window narrow re-laid out the toolbars.
 *  `DESIGN.md` §8 states the contract as `pointer: coarse` and that is what this now is.
 *
 *  `app/globals.css` carries the same floor over bare `button`, `select`, `[role="button"]` and
 *  `input`, so on those elements this token is a second statement of one rule and they agree by
 *  construction. It earns its keep on the elements that block does NOT reach — `<label>`,
 *  `<summary>`, a plain `<a>` — and on anything rendered by a primitive, where it puts the contract
 *  where the component is rather than in a stylesheet a component author never reads. */
export const TOUCH_TARGET = 'pointer-coarse:min-h-11';

/** The same 44 px minimum in BOTH directions, for a control whose text is one glyph — a ▲/▼
 *  reorder arrow clears the height minimum and still lands at 24 px wide, which is not a target. */
export const TOUCH_TARGET_SQUARE = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';
