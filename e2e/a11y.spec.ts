import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
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
// A pinned strip that lists eight places and marks none of them is a map with no "you are
// here". The marker is `aria-current="location"` — the token that means a position in a
// document, so a screen reader says "current location" on the one chip that is and nothing
// on the rest — and it agrees with the jump by construction: a heading counts as reached
// once it is at or above the place a jump to it would put it, read off the element's own
// scroll-margin rather than a number written down twice.
test('the section strip says which section you are in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: /Jump to a section/ });
  const marked = nav.locator('a[aria-current="location"]');

  // At the top of the report nothing has been reached, and saying "Worth knowing" there
  // would be a claim about where the reader is that isn't true yet.
  await expect(marked, 'nothing is current before the first heading').toHaveCount(0);

  // Follow each link; the chip you pressed is the one that lights up.
  for (const label of ['Readings', 'Events', 'Explore', 'Flight card']) {
    const link = nav.getByRole('link', { name: label });
    if (!(await link.count())) continue;
    await link.click();
    await expect(marked, `exactly one chip is current after jumping to ${label}`).toHaveCount(1);
    await expect(marked, `${label} is the current section after jumping to it`).toHaveText(label);
  }

  // …and it tracks a plain scroll too, not only a click.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(marked).toHaveCount(1);
});

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

// The logbook's clear-confirm is the app's only irreversible control, and no audit above ever
// renders it: `/` is audited with an EMPTY logbook, so the Clear button is not even on the page,
// and every other audited surface unmounts the list entirely. A panel nothing audits is a panel
// whose contrast, naming and roles nobody checks.
//
// Axe cannot see focus management, so the things that actually make this usable — focus landing
// on the safe control, Escape returning it to the trigger — are asserted in logbook.spec.ts
// instead. This covers what axe CAN see, on a surface it could not previously reach.
test('a11y: the logbook and its clear-confirm', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'audit.csv', mimeType: 'text/csv', buffer: readFileSync(path.join(__dirname, '../public/samples/sample-altusmetrum.csv')) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Delete the one flight/ })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const node = v.nodes[0];
    console.log(
      `\n[${v.impact}] clear-confirm :: ${v.id} — ${v.help}` +
        `\n  nodes: ${v.nodes.length} | ${(node?.target || []).join(' ')}` +
        `\n  html: ${(node?.html || '').slice(0, 140)}`,
    );
  }
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('a chart answers the keyboard, and says what it read', async ({ page }) => {
  // The gap this closes: the chart answered a mouse and, since the touch work, a finger — and a
  // keyboard with nothing at all. `GroundTrack` beside it has had arrow keys since it was built,
  // so this was an inconsistency inside one report as well as a gap against a spreadsheet.
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  const chart = page.locator('[role="img"][tabindex="0"]').first();
  await expect(chart, 'the chart can be focused at all').toBeVisible();

  const legend = page.locator('.u-legend').first();
  const before = (await legend.innerText()).replace(/\s+/g, ' ').trim();

  await chart.focus();
  await expect(chart, 'focus actually lands on it').toBeFocused();
  await page.keyboard.press('Home');

  const after = (await legend.innerText()).replace(/\s+/g, ' ').trim();
  // The SAME legend a mouse user reads — one reading, not a second one rendered elsewhere.
  expect(after, 'the legend filled in from the keyboard').not.toBe(before);
  expect(after, 'and it holds an actual reading').toMatch(/\d/);

  // What a screen reader hears. Only key presses write here, so it is empty until one lands.
  // This chart's own status region — the sibling of the element just focused, so the assertion
  // cannot pass on a reading some other chart or the ground track announced.
  const said = chart.locator('xpath=following-sibling::p[@role="status"]');
  const home = (await said.innerText()).trim();
  expect(home, 'the reading is announced, not only drawn').toMatch(/\d/);

  // Arrow keys move it, End goes to the other end, and the two are different instants.
  await page.keyboard.press('End');
  const end = (await said.innerText()).trim();
  expect(end, 'End reads a different instant from Home').not.toBe(home);

  await page.keyboard.press('ArrowLeft');
  const stepped = (await said.innerText()).trim();
  expect(stepped, 'an arrow key moves off the end').not.toBe(end);

  // Escape clears the reading rather than leaving a stale one announced.
  await page.keyboard.press('Escape');
  expect((await said.innerText()).trim(), 'Escape clears it').toBe('');
});

test('every chart is reachable by keyboard, not just the first', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // Whatever the surface draws, all of it answers the keyboard — a chart that opted out would be
  // exactly the hover-only state §8 forbids, one surface further down the page.
  const charts = page.locator('[role="img"][tabindex="0"]');
  const n = await charts.count();
  expect(n, 'the report draws charts').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const label = await charts.nth(i).getAttribute('aria-label');
    expect(label, `chart ${i} says how to read it with a keyboard`).toContain('arrow keys');
  }
});
