import { test, expect } from '@playwright/test';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

// Automated WCAG 2.0/2.1 A + AA audit of the key pages, in both light and dark
// themes. Any violation logs its impact, page, theme, and a sample node before
// the test fails, so concrete issues are easy to fix.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

/** Run axe over the current page and fail (loudly) on any violation. */
async function audit(page: import('@playwright/test').Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const node = v.nodes[0];
    console.log(
      `\n[${v.impact}] ${where} :: ${v.id} — ${v.help}` +
        `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
        `\n  html: ${(node?.html || '').slice(0, 140)}`,
    );
  }
  expect(violations.map((v) => v.id)).toEqual([]);
}
const PAGES: [string, string][] = [
  ['home', '/'],
  ['privacy', '/privacy'],
];

for (const [name, path] of PAGES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`a11y: ${name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of violations) {
        const node = v.nodes[0];
        console.log(
          `\n[${v.impact}] ${name}/${scheme} :: ${v.id} — ${v.help}` +
            `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
            `\n  html: ${(node?.html || '').slice(0, 140)}`,
        );
      }
      expect(violations.map((v) => v.id)).toEqual([]);
    });
  }
}

// The report view renders a different surface (metrics, charts, export toolbar)
// that the idle-page audits never reach — audit it too.
test('a11y: flight report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const node = v.nodes[0];
    console.log(
      `\n[${v.impact}] report :: ${v.id} — ${v.help}` +
        `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
        `\n  html: ${(node?.html || '').slice(0, 140)}`,
    );
  }
  expect(violations.map((v) => v.id)).toEqual([]);
});

// The column mapper is a wholly different, form-heavy surface the page audits
// never reach — and its per-column Role/Unit selects are exactly where an
// unnamed-control violation hides. Drive a generic CSV to it and audit.
test('a11y: column mapper', async ({ page }) => {
  await page.goto('/');
  const csv =
    'elapsed,height,speed\n' +
    Array.from({ length: 20 }, (_, i) => `${(i * 0.1).toFixed(1)},${i * 5},${i * 3}`).join('\n');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'mystery-logger.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  // Every Role/Unit select must carry an accessible name.
  await expect(page.getByLabel('Role for the elapsed column')).toBeVisible();
  await audit(page, 'column-mapper');
});

// The comparison view (overlay chart, channel toggles, side-by-side table) is
// another surface the report audit never reaches.
test('a11y: comparison view', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await audit(page, 'comparison');
});

// Heading navigation is how a screen-reader user skims a long document, and this report is
// 5,472 px on a desktop and 7,710 px — nine screens — on a phone. Two of its blocks had no
// heading at all: the metric grid, which is the headline numbers and the reason the page
// exists, and the "Worth knowing" warnings, which is where the caveats live. Both were
// styled paragraphs, so skipping by heading went straight past them.
test('a11y: the report’s own sections are reachable by heading', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The headline numbers announce themselves…
  await expect(page.getByRole('heading', { name: 'Readings', exact: true })).toBeVisible();
  // …and so does the caveat block, when the flight has caveats.
  const worth = page.getByRole('heading', { name: 'Worth knowing', exact: true });
  if ((await worth.count()) > 0) await expect(worth.first()).toBeVisible();

  // Every heading in the report body is h2 or h3 — no level is skipped on the way down, so
  // a screen reader's outline matches what a sighted reader sees.
  const levels = await page
    .locator('main :is(h1,h2,h3,h4,h5,h6)')
    .evaluateAll((els) => els.map((e) => Number(e.tagName.slice(1))));
  expect(levels.length).toBeGreaterThan(8);
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1], `heading level jumps from h${levels[i - 1]} to h${levels[i]}`).toBeLessThanOrEqual(1);
  }
});

// The report is nine phone-screens long and carried no in-page links at all, so coming back
// to check one number meant scrolling past everything. The strip only lists sections this
// flight actually has — a baro-only log has no acceleration chart, a log without GPS has no
// recovery — so the assert that matters is that no link points at something absent.
test('the report can be navigated by section, with no link to a section it doesn’t have', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: /Jump to a section/ });
  await expect(nav).toBeVisible();
  const hrefs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs.length, 'the strip lists somewhere to go').toBeGreaterThan(4);

  for (const href of hrefs) {
    expect(href.startsWith('#'), `${href} is an in-page anchor`).toBe(true);
    await expect(page.locator(href), `${href} points at a section that exists`).toHaveCount(1);
  }

  // …and it actually moves: following the last link puts that section in view.
  const last = hrefs[hrefs.length - 1];
  await nav.getByRole('link').last().click();
  await expect(page.locator(last)).toBeInViewport();

  // The negative case, on a barometric log with no GPS: there is no Recovery section, so
  // there must be no link to one. Checked on a DIFFERENT fixture on purpose — the file
  // above carries lat/lon, so an unconditional Recovery link would not be dead there and
  // this assert would pass while the offer was wrong.
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('blueraven-app-lr.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  const baroNav = page.getByRole('navigation', { name: /Jump to a section/ });
  await expect(baroNav.getByRole('link', { name: 'Recovery' }), 'no recovery section, no link to one').toHaveCount(0);
  for (const href of await baroNav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
    await expect(page.locator(href), `${href} points at a section that exists`).toHaveCount(1);
  }
});

// The strip is only a fix for a nine-screen report if it is still there once you are six
// screens down. It pins to the top of the viewport rather than scrolling away — and a
// heading jumped to from a PINNED strip has to land below it, not underneath it, which is a
// scroll-margin the targets carry in app/globals.css. Measured on a phone, where the strip is
// at its tallest (62 px, every link held to the 44 px touch floor) and the report at its
// longest.
test('the section strip stays reachable six screens down, and jumps land clear of it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: /Jump to a section/ });
  const atRest = await nav.boundingBox();
  expect(atRest, 'the strip is on the page').not.toBeNull();

  // Deep into the report — past where the strip originally sat, which is the whole point.
  await page.evaluate(() => window.scrollTo(0, 844 * 6));
  const pinned = await nav.boundingBox();
  expect(pinned!.y, 'the strip is still on screen six screens down').toBeLessThan(8);
  expect(pinned!.y, 'and at the top of it').toBeGreaterThanOrEqual(0);

  // Every link's target lands below the strip, not behind it.
  const hrefs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  for (const href of hrefs) {
    await nav.locator(`a[href="${href}"]`).click();
    const strip = (await nav.boundingBox())!;
    const target = (await page.locator(href).boundingBox())!;
    expect(
      target.y,
      `${href} lands clear of the pinned strip (heading at ${Math.round(target.y)}, strip ends at ${Math.round(strip.y + strip.height)})`,
    ).toBeGreaterThanOrEqual(strip.y + strip.height);
  }
});
