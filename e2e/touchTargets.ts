// The one definition of "a control a thumb has to hit", shared by every sweep that measures
// the §8 touch floor.
//
// It is a module rather than a resemblance because it was a resemblance and they drifted. Two
// copies of this predicate lived in `touch.spec.ts`, hand-kept, and by 2026-08-08 they no longer
// agreed: the analyze sweep carried `header a, footer a, summary` and the compare sweep did not,
// so the same control was a target on one page and invisible on the other. Every fix to one was
// a fix to one.
//
// **Both dimensions, not just height.** Until 2026-08-08 every sweep asked `if (r.height < 44)`
// and never looked at width, so §8's "44 px minimum hit target" was enforced on one axis. WCAG
// 2.5.5 and Apple's HIG both specify a target's SIZE — 44x44 — and a control can only fail the
// width half when it is a link or a label whose text is short, which is precisely the case
// `min-height` alone cannot reach. It hid one real violation for as long as it existed: the
// footer's "Privacy" link at 42x44 on every route in the app.

/** A control found below the floor, as a line a human can act on. */
export interface UnderSized {
  label: string;
  width: number;
  height: number;
}

/**
 * Every control on the page whose hit target is under 44 px in either dimension.
 *
 * Passed whole to `page.evaluate`, so it closes over nothing and takes the floor as its only
 * argument. Returns plain strings sorted worst-first, ready to drop into an assertion message.
 */
export function underSizedTargets(floor = 44): string[] {
  const out: UnderSized[] = [];

  // A checkbox is NOT exempt here, unlike in the CSS. `globals.css` skips checkboxes from the
  // floor because stretching the BOX would draw a giant square — but what a thumb has to hit is
  // the target, and the target is the wrapping <label>. Exempting them from the MEASUREMENT too
  // is why the logbook's compare tick sat at 20x20 with no label at all and nothing caught it.
  //
  // `header a` / `footer a`: the chrome's links are controls that sit outside any <nav> — the
  // brand eyebrow measured 102x16 on a phone, as did the Tip link (59x26).
  // `main a`: the "?" beside each reading opens that reading's definition and renders 6x14 at a
  // phone's type scale; it sits in a grid cell, so no nav selector could ever see it.
  const sel =
    'button, select, summary, [role=button], nav a, header a, footer a, main a, input:not([type=range])';

  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    // A link inside running prose is not a control: 44 px tall mid-sentence would be wrong, and
    // each one has a nav entry or a button beside it doing the same job at full size.
    if (el.tagName === 'A' && el.closest('p, li')) continue;

    // Something deliberately hidden from sight is not a thumb target. The `sr-only` file input
    // behind "Choose flight logs" is the live case: it is clipped to a point but inherits the
    // coarse-pointer `min-height`, so it measures 1x44 and would report as a width failure
    // forever while the <label> a thumb actually hits is full size.
    const cs = window.getComputedStyle(el);
    const clipped =
      cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clip === 'rect(0px 0px 0px 0px)';
    if (clipped || cs.visibility === 'hidden' || cs.display === 'none') continue;

    // A control kept small on purpose expands its HIT AREA with a pseudo-element rather than its
    // box (`.touch-area` in globals.css), so measure what a thumb can hit rather than the ink.
    const box = el.closest('label') ?? el;
    const after = el.classList.contains('touch-area') ? window.getComputedStyle(el, '::after') : null;
    const r =
      after && after.content !== 'none'
        ? { width: parseFloat(after.width), height: parseFloat(after.height) }
        : box.getBoundingClientRect();

    if (!r.width || !r.height) continue; // not rendered at all

    if (r.width < floor || r.height < floor) {
      const text = (el.textContent ?? '').trim().slice(0, 34) || el.getAttribute('aria-label') || '';
      out.push({ label: `${el.tagName} "${text}"`, width: r.width, height: r.height });
    }
  }

  return out
    .sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height))
    .map((u) => `${Math.round(u.width)}x${Math.round(u.height)} ${u.label}`);
}
