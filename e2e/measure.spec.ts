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

/**
 * The other surface that carries a `SectionNav` strip, and the one that took the primitive
 * without its contract.
 *
 * `SectionNav`'s own docblock says *"targets need a `scroll-margin-top` so a heading lands below
 * the strip rather than under it"*; `app/globals.css` states that clearance once, for the report's
 * eight blocks and — since 2026-08-13 — for `/methods` through `.section-strip-target`. Before
 * that this page carried `scroll-mt-12`, 48 px against a strip that is **62 px on a touch phone**,
 * so a jumped-to heading landed 14 px UNDERNEATH it on all 51 of its heading ids, while 21
 * readings in the app link into this page by id.
 *
 * **Measured on a COARSE pointer, because that is the only place it bit.** `globals.css`'s
 * `@media (pointer: coarse)` block holds every link in the strip to the 44 px touch floor, which
 * is what makes the strip 62 px rather than 42 — and Playwright's default context is a fine
 * pointer at any viewport width, so a walk that only narrows the window measures the wrong strip
 * and passes over the defect.
 */
test('a subject jumped to on the methods page lands clear of the pinned strip, on a phone', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  try {
    await page.goto('/methods');
    const nav = page.locator('nav[aria-label="Jump to a subject on this page"]');
    await expect(nav).toBeVisible();
    expect(
      await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'this context is a touch device — the strip is only at its tallest here',
    ).toBe(true);

    const ids = await page.locator('h3[id]').evaluateAll((els) => els.map((e) => e.id));
    expect(ids.length, 'the page still has a subject list worth jumping into').toBeGreaterThan(20);

    // Three targets across the page rather than one: the first is above the strip's resting
    // place, and the deep ones are the ones a reader actually jumps to.
    for (const id of [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]]) {
      await page.evaluate((target) => {
        window.location.hash = `#${target}`;
      }, id);
      await page.waitForTimeout(250);
      const m = await page.evaluate((target) => {
        const el = document.getElementById(target)!;
        const strip = document.querySelector('nav[aria-label="Jump to a subject on this page"]')!;
        const sb = strip.getBoundingClientRect();
        const eb = el.getBoundingClientRect();
        return { stripH: Math.round(sb.height), stripBottom: Math.round(sb.bottom), top: Math.round(eb.top) };
      }, id);
      // At or below the strip's bottom edge. Stated as the same comparison the report's walk
      // makes, so the two surfaces are held to one rule rather than to two numbers.
      expect(
        m.top,
        `#${id} lands clear of the pinned strip (heading at ${m.top}, strip ${m.stripH} px ending at ${m.stripBottom})`,
      ).toBeGreaterThanOrEqual(m.stripBottom);
    }
  } finally {
    await ctx.close();
  }
});
