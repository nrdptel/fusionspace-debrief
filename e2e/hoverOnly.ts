// The other half of `DESIGN.md` §8's phone contract, and the half nothing measured until now.
//
// P4's *done when* asks for "zero controls under 44 px AND zero states reachable only by hover",
// "pinned by a mobile-viewport e2e that asserts BOTH counts". `touchTargets.ts` has held the first
// count since slice 1. The second was asserted nowhere, and it is the count that has actually cost
// this project defects: D9 slice 3b shipped a design's freshness word — *up to date* / *out of
// date* — into a `title=` attribute and nothing else, so on a phone a flyer could compare against
// a simulation the design had been edited past and never see the warning. It was caught by a
// competitive probe, not by a check.
//
// **What "hover-only" means here, operationally.** A tooltip is not the defect; a tooltip that is
// the ONLY place a fact appears is. So the predicate is narrow on purpose: an element carrying a
// `title` that renders no visible text of its own is stating something a pointer-less reader can
// never get to. An icon button with `aria-label` is deliberately NOT exempt — the label is what a
// screen reader hears, not what a sighted flyer on a phone can reach, and the two failures are
// different. Where an icon genuinely carries the meaning and the `title` only repeats it, the
// right answer is to say so at the call site rather than to widen this.

/**
 * Every visible element whose only statement of a fact is a hover tooltip.
 *
 * Passed whole to `page.evaluate`, so it closes over nothing. Returns plain strings sorted by the
 * tooltip text, ready to drop into an assertion message.
 */
export function hoverOnlyStatements(): string[] {
  const out: string[] = [];

  /**
   * The text of an element a sighted flyer can actually read, walked by hand.
   *
   * **`innerText` was the obvious tool and it is the wrong one here.** Measured 2026-08-09 on the
   * report at 390 px: the sample table's sort button returned `textContent` of `"Time (s)▼"` and
   * `innerText` of `""`, stably, on a button with a non-zero box and a computed `visibility` of
   * `visible`. `innerText` approximates what a rendering engine paints and is free to answer for
   * subtrees it has not laid out; a check that flags four controls which do carry their label is a
   * check nobody will trust twice. So: `textContent`, minus the descendants an eye cannot reach —
   * `display: none`, `visibility: hidden`, and the `sr-only` clip that exists precisely to put text
   * in front of a screen reader and nowhere else.
   */
  const visible = (el: Element): string => {
    let text = '';
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        text += node.textContent ?? '';
        continue;
      }
      if (node.nodeType !== 1) continue;
      const child = node as HTMLElement;
      const cs = window.getComputedStyle(child);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (cs.clipPath === 'inset(50%)' || cs.clip.startsWith('rect(0px')) continue;
      text += visible(child);
    }
    return text;
  };

  for (const el of document.querySelectorAll<HTMLElement>('[title]')) {
    const title = (el.getAttribute('title') ?? '').trim();
    if (!title) continue;

    // Not on screen at all is not a hover-only state — it is no state. `print:hidden` strips a
    // good deal of the interactive chrome, and an accordion's closed panel holds plenty of
    // `title`s that a flyer reaches by opening it.
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;

    // Visible text of its own — the tooltip is then an elaboration, which is what a tooltip is for.
    if (visible(el).trim()) continue;

    // An `<svg>` with a `<title>` child is the accessible name of a graphic, not a tooltip; the
    // browser does not show it on hover, so it cannot be a hover-only state.
    if (el.tagName.toLowerCase() === 'svg') continue;

    out.push(`${el.tagName}${el.className ? '.' + String(el.className).split(/\s+/)[0] : ''} title="${title.slice(0, 70)}"`);
  }

  return out.sort();
}
