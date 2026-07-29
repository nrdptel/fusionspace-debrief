import { test, expect } from '@playwright/test';
import path from 'node:path';

// Real phone widths. 360px is the most common Android viewport (narrower than
// the 375px iPhone), so it's the honest worst case. Nothing should spill the page
// sideways on any surface — the wide tables (mapper, comparison) are allowed to
// scroll inside their own boxes, but the page must not.

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const WIDTH = 360;

// `hasTouch` matters as much as the width here. The only Playwright project is
// devices['Desktop Chrome'], which is `hasTouch: false`, so `@media (pointer: coarse)` in
// app/globals.css — the rule that gives every button, select and download link a 44 px
// minimum height — was OFF for this whole file. Every assertion below was measuring
// controls at their desktop height: a layout no phone ever gets, and the one place the
// touch floor could have been caught spilling the page.
test.use({ viewport: { width: WIDTH, height: 760 }, hasTouch: true });

/** True if the document scrolls horizontally (the failure we're guarding). */
const pageSpills = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('the landing page fits the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the flight report fits the viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the report toolbar keeps the primary actions in view on a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Copy / Share / Print / Units stay directly in view; the many file-format saves move
  // into their own labelled strip (which scrolls aside) instead of stacking four rows
  // deep and burying the flight's own numbers.
  await expect(page.getByRole('button', { name: 'Copy summary' })).toBeVisible();
  // The sample is ~850 KB, past what fits in a URL fragment, so the share control names
  // that up front rather than waiting to be pressed — see audit.spec.ts.
  await expect(page.getByRole('button', { name: 'Too big to link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await expect(page.getByText('Save a file:')).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the column mapper fits the viewport (wide table scrolls in its box)', async ({ page }) => {
  await page.goto('/');
  const csv =
    'elapsed,height,speed\n' +
    Array.from({ length: 20 }, (_, i) => `${(i * 0.1).toFixed(1)},${i * 5},${i * 3}`).join('\n');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'a-deliberately-long-mystery-logger-filename.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the comparison view fits the viewport (wide table scrolls in its box)', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

// A comparison whose point is side-by-side, on the device a flyer actually has at the field.
// The metric table used to measure 540 px inside a 358 px box at a 390 px viewport: the first
// flight's column filled the screen and the second started past the right edge, so "compare
// two flights" meant scrolling back and forth a row at a time. The row labels were already
// sticky; what was missing was a phone column budget — the reorder arrows are a pointer
// refinement, the file name doesn't need ten rems, and the cells don't need desktop padding.
// Asserted at this file's 360 px worst case, on the numbers, because a layout drifts silently.
test('two flights’ readings are both on screen on a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fx('altusmetrum-telemetrum.csv'),
    fx('blueraven-app-lr.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();

  const box = await page.evaluate(() => {
    const t = document.querySelector('table')!;
    const scroller = t.closest('div') as HTMLElement;
    const row = [...t.querySelectorAll('tbody tr')].find((r) => (r.textContent || '').startsWith('Apogee'))!;
    const cells = [...row.children].map((c) => c.getBoundingClientRect().right);
    return { box: scroller.getBoundingClientRect().right, first: cells[1], second: cells[2] };
  });
  // Both flights' apogee readings sit inside the scroller without being scrolled to.
  expect(box.first).toBeLessThanOrEqual(box.box);
  expect(box.second).toBeLessThanOrEqual(box.box);
});

// …and the column that doesn't fit is gone rather than cut. Sliced at the viewport edge, the
// Spread column showed the first digit of each percentage — "7" for 79%, "11" for 114% — which
// reads as a number rather than as a fragment. Nothing is lost: the cross-check panel above
// states every one of those spreads in prose.
test('the spread column is absent on a phone rather than cut in half', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    fx('altusmetrum-telemetrum.csv'),
    fx('blueraven-app-lr.csv'),
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Spread' })).toBeHidden();
  // The figures themselves are still on the page, in the panel above the table.
  await expect(page.getByText(/% on apogee/)).toBeVisible();
});

// The page not spilling sideways is necessary and not sufficient: a block can sit inside
// the viewport and still hang out of its own card. The recovery map sized itself from
// `clientWidth`, which includes the card's p-4, so it was drawn 32 px wider than the room
// it had — at 390 px the card ended at x=374 and the canvas ran to x=389, over its own
// border and one pixel short of the screen. The desktop never showed it: the 420 px cap
// bites long before the padding does.
test('the recovery map fits inside its own card, not just inside the screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Recovery' })).toBeVisible();

  const fit = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-describedby="ground-track-readout"]');
    if (!c) return null;
    const card = c.parentElement!.parentElement as HTMLElement;
    const cs = getComputedStyle(card);
    const cb = c.getBoundingClientRect();
    const kb = card.getBoundingClientRect();
    return {
      canvasLeft: cb.left,
      canvasRight: cb.right,
      innerLeft: kb.left + parseFloat(cs.paddingLeft),
      innerRight: kb.right - parseFloat(cs.paddingRight),
    };
  });
  expect(fit, 'the recovery map should render for this fixture').not.toBeNull();
  expect(fit!.canvasRight, `map right ${fit!.canvasRight} vs card inner right ${fit!.innerRight}`).toBeLessThanOrEqual(fit!.innerRight + 0.5);
  expect(fit!.canvasLeft).toBeGreaterThanOrEqual(fit!.innerLeft - 0.5);
  expect(await pageSpills(page)).toBe(false);
});
