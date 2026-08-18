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
 * EVERY surface that carries a `SectionNav` strip, walked as a set rather than named one at a time.
 *
 * **This test used to name `/methods` alone, and that is exactly how `/changelog` shipped broken.**
 * A third surface took the primitive without its contract — a pinned strip, and `<Section>`s with
 * no clearance class — so every release jumped to on it landed under the strip, and nothing here
 * could see it, because the walk enumerated the surfaces somebody had remembered. It enumerates
 * the STRIPS now: each route is loaded, asked whether it renders a `SectionNav`, and every id that
 * strip links to is jumped to and measured. A fourth surface is covered the day it is added to the
 * list of routes, and a strip that appears on a route already in the list is covered for free.
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
/** The static routes a strip can appear on. The flight report's strip needs a dropped file, so it
 *  keeps its own walk in `e2e/a11y.spec.ts`; these are the ones a stranger reaches by URL. */
const STRIP_ROUTES = ['/methods', '/changelog', '/validation', '/privacy'];

test('every subject jumped to from a pinned strip lands clear of it, on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  let stripsFound = 0;
  let idsChecked = 0;
  try {
    expect(
      await (async () => {
        await page.goto('/');
        return page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
      })(),
      'this context is a touch device — the strip is only at its tallest here',
    ).toBe(true);

    for (const route of STRIP_ROUTES) {
      await page.goto(route);
      // Any strip, however it is labelled. Matching the LABEL is what made this walk specific to
      // one page; matching the primitive is what makes it find the next one.
      const nav = page.locator('nav[aria-label^="Jump to"]');
      if ((await nav.count()) === 0) continue;
      await expect(nav.first()).toBeVisible();
      stripsFound++;

      const hrefs = await nav
        .first()
        .getByRole('link')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('#')));
      expect(hrefs.length, `${route}: the strip lists somewhere to go`).toBeGreaterThan(1);

      // Three targets across the page rather than all of them: the first is above the strip's
      // resting place, and the deep ones are the ones a reader actually jumps to.
      const picks = [hrefs[0], hrefs[Math.floor(hrefs.length / 2)], hrefs[hrefs.length - 1]];
      for (const href of picks) {
        const id = href.slice(1);
        await page.evaluate((target) => {
          window.location.hash = `#${target}`;
        }, id);
        await page.waitForTimeout(250);
        const m = await page.evaluate((target) => {
          const el = document.getElementById(target);
          const strip = document.querySelector('nav[aria-label^="Jump to"]')!;
          const sb = strip.getBoundingClientRect();
          if (!el) return null;
          const eb = el.getBoundingClientRect();
          return { stripH: Math.round(sb.height), stripBottom: Math.round(sb.bottom), top: Math.round(eb.top) };
        }, id);
        expect(m, `${route}: #${id} is an element on the page`).not.toBeNull();
        // At or below the strip's bottom edge. Stated as the same comparison the report's walk
        // makes, so every surface is held to one rule rather than to a number each.
        expect(
          m!.top,
          `${route} #${id} lands clear of the pinned strip (heading at ${m!.top}, strip ${m!.stripH} px ending at ${m!.stripBottom})`,
        ).toBeGreaterThanOrEqual(m!.stripBottom);
        idsChecked++;
      }
    }

    // A walk that found no strip would pass every assertion above and prove nothing — the shape
    // this file has recorded twice about other checks.
    expect(stripsFound, 'routes carrying a pinned strip').toBeGreaterThan(1);
    expect(idsChecked, 'strip targets measured').toBeGreaterThan(4);
    console.log(`pinned-strip clearance: ${stripsFound} strips, ${idsChecked} targets measured`);
  } finally {
    await ctx.close();
  }
});
