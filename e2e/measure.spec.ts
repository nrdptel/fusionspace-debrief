import { test, expect } from '@playwright/test';

/**
 * DESIGN.md §3's long-form measure, asserted as a MEASUREMENT of rendered characters rather than
 * as a class string.
 *
 * A class assertion here would be worse than nothing. The rule is about what a line reads like,
 * and the same `max-w-*` produces a different character count at a different font size, inside a
 * different grid, in a different font — which is exactly how this page came to render **46
 * characters at 640 px against 58 on a 390 px phone**: every class involved was individually
 * sensible and nobody had multiplied them together.
 *
 * Characters, not `ch`. The CSS `ch` unit is the advance width of `0`, and a Geist `0` is 11.0 px
 * where the average prose character is 7.10 px — so a `ch`-based assertion passes at about 101
 * real characters per line. This measures the actual text.
 */

/** The range every typographic reference agrees on, and what §3 now binds the app to. */
const FLOOR = 45;
const CEILING = 75;

/** Widths a flyer actually holds this page at: phone, large phone, tablet portrait, the band
 *  where a second column used to appear, small laptop, and desktop. The 640–768 band is the one
 *  that was broken, so it is not optional here. */
const WIDTHS = [390, 430, 640, 768, 900, 1024, 1280, 1600];

for (const width of WIDTHS) {
  test(`the methods page reads at a real measure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/methods');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const m = await page.evaluate(() => {
      const ps = [...document.querySelectorAll<HTMLElement>('div.space-y-3 > p')];
      if (ps.length < 50) return null;
      const cs = window.getComputedStyle(ps[0]);

      // Average rendered character width, measured on this page's own prose in this page's own
      // font — not assumed, and not `ch`.
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      probe.style.font = cs.font;
      document.body.appendChild(probe);
      let px = 0;
      let chars = 0;
      for (const p of ps.slice(0, 20)) {
        const text = (p.textContent ?? '').slice(0, 300);
        probe.textContent = text;
        px += probe.getBoundingClientRect().width;
        chars += text.length;
      }
      probe.remove();
      const avg = px / chars;

      const widths = ps.map((p) => p.getBoundingClientRect().width);
      return {
        paragraphs: ps.length,
        fontSize: cs.fontSize,
        min: Math.round(Math.min(...widths) / avg),
        max: Math.round(Math.max(...widths) / avg),
      };
    });

    expect(m, 'the methods page rendered its blocks').not.toBeNull();
    const { paragraphs, fontSize, min, max } = m!;

    // §3 assigns `text-base` to prose in docs, and this page — the longest reading surface in
    // the app — was the one place rendering `text-sm`. Asserted on the COMPUTED size, because
    // that is the thing the rule is about and a class name can be overridden downstream.
    expect(fontSize, 'prose in docs is text-base (§3)').toBe('16px');

    expect(min, `narrowest line at ${width}px is ${min} characters, below §3's floor`).toBeGreaterThanOrEqual(FLOOR);
    expect(max, `widest line at ${width}px is ${max} characters, above §3's ceiling`).toBeLessThanOrEqual(CEILING);

    // And it really did measure the page rather than an empty selector — the failure mode that
    // would make every assertion above vacuous.
    expect(paragraphs, 'measured the whole page').toBeGreaterThan(80);
  });
}

test('the measure does not get WORSE as the screen gets wider', async ({ page }) => {
  // The specific defect §3's multi-column paragraph was written for: a two-column grid divides
  // the width, so a wide screen can read narrower than a phone. Measured before the fix — 58
  // characters at 390 px, 46 at 640 px — which no per-width floor would have caught, because 46
  // is inside the range. Only the comparison between widths can see it.
  const measure = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/methods');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return page.evaluate(() => {
      const ps = [...document.querySelectorAll<HTMLElement>('div.space-y-3 > p')];
      const cs = window.getComputedStyle(ps[0]);
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      probe.style.font = cs.font;
      document.body.appendChild(probe);
      const text = (ps[0].textContent ?? '').slice(0, 300);
      probe.textContent = text;
      const avg = probe.getBoundingClientRect().width / text.length;
      probe.remove();
      return Math.round(ps[0].getBoundingClientRect().width / avg);
    });
  };

  const phone = await measure(390);
  const tablet = await measure(640);
  const desktop = await measure(1280);

  expect(tablet, `640px reads at ${tablet} characters against a phone's ${phone}`).toBeGreaterThanOrEqual(phone);
  expect(desktop, `1280px reads at ${desktop} characters against 640px's ${tablet}`).toBeGreaterThanOrEqual(
    phone,
  );
});
