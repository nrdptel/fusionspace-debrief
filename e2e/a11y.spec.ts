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

/**
 * **Every audit in this file except the four-route loop ran in ONE theme**, and `DESIGN.md` §9 is
 * explicit that contrast is measured *"in every theme a visitor can be in"*. `playwright.config.ts`
 * sets no `colorScheme`, so Playwright's default `light` applied to the report, the mapper, the
 * comparison and the logbook — half of what the check is defined as.
 *
 * `emulateMedia({ colorScheme: 'dark' })` renders the dark arm of every `dark:` utility, because
 * `app/globals.css` gives that variant both clauses (the `.dark` class AND `prefers-color-scheme`).
 * The third state §9 names — Dark explicitly CHOSEN — is the same arm reached the other way, and
 * `e2e/audit.spec.ts` already walks the toggle that sets it.
 */
const SCHEMES = ['light', 'dark'] as const;

/** Every state below is reached by a walk, so each one is written once and audited in both
 *  themes. The reach is the point: axe's `color-contrast` sits inside the `wcag2aa` tag this file
 *  has always run, so what was missing was never a checker — it was arriving at the STATE. */
function inBothThemes(
  name: string,
  reach: (page: import('@playwright/test').Page) => Promise<void>,
) {
  for (const scheme of SCHEMES) {
    test(`a11y: ${name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await reach(page);
      await audit(page, `${name}/${scheme}`);
    });
  }
}
const PAGES: [string, string][] = [
  ['home', '/'],
  ['privacy', '/privacy'],
  // Added 2026-08-08. `/methods` is the longest surface in the app — ~12,700 words, a
  // 63-heading outline, three nav landmarks and a sticky strip — and it had never been
  // scanned. It gained most of that structure in the run that added this line, which is
  // exactly when an unscanned page is most likely to have grown a violation.
  ['methods', '/methods'],
  ['validation', '/validation'],
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
inBothThemes('flight report', async (page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible({
    timeout: 60_000,
  });
});

// The column mapper is a wholly different, form-heavy surface the page audits
// never reach — and its per-column Role/Unit selects are exactly where an
// unnamed-control violation hides. Drive a generic CSV to it and audit.
const MYSTERY_CSV =
  'elapsed,height,speed\n' +
  Array.from({ length: 20 }, (_, i) => `${(i * 0.1).toFixed(1)},${i * 5},${i * 3}`).join('\n');

async function openMapper(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'mystery-logger.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(MYSTERY_CSV),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible({ timeout: 30_000 });
  // Every Role/Unit select must carry an accessible name.
  await expect(page.getByLabel('Role for the elapsed column')).toBeVisible();
}

inBothThemes('column mapper', openMapper);

/**
 * The mapper in the state that BLOCKS, which nothing audited: `elapsed` and `height` are guessed as
 * time and altitude, so `ready` is true on arrival and the amber live region renders an EMPTY
 * string — axe has no text to rate. Take the time column away and it says what to set to continue,
 * in the amber that was measured at 3.20:1 before `DESIGN.md` §9's census reached the hue ramps.
 *
 * This is the state a flyer meets when Debrief cannot guess their spreadsheet, so it is the one
 * sentence standing between them and a reading.
 */
inBothThemes('column mapper, nothing mapped yet', async (page) => {
  await openMapper(page);
  await page.getByLabel('Role for the elapsed column').selectOption('ignore');
  await expect(page.getByText('Set a time column and an altitude or pressure column to continue.')).toBeVisible();
});

// The comparison view (overlay chart, channel toggles, side-by-side table) is
// another surface the report audit never reaches.
inBothThemes('comparison view', async (page) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 30_000 });
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
/** One saved flight in the logbook, on the drop zone. Shared by the three logbook states below. */
async function openLogbook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'audit.csv', mimeType: 'text/csv', buffer: readFileSync(path.join(__dirname, '../public/samples/sample-altusmetrum.csv')) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
}

inBothThemes('the logbook and its clear-confirm', async (page) => {
  await openLogbook(page);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Delete the one flight/ })).toBeVisible();
});

/**
 * A flight with a NOTE on it, which nothing audited: this file only ever rendered the un-noted
 * branch, so four treatments never reached the check — the ✎ in its noted `text-indigo-*`, the note
 * text itself, the inline editor with its placeholder and Save/Cancel, and the extra sentence the
 * clear-confirm grows when a note would be lost.
 *
 * Two audits rather than one, because the editor OPEN and the note SAVED are different renders.
 */
inBothThemes('the logbook with a note being written', async (page) => {
  await openLogbook(page);
  await page.getByRole('button', { name: /^Add note for / }).click();
  await expect(page.getByRole('textbox', { name: /note/i }).first()).toBeVisible();
});

inBothThemes('the logbook with a note saved on a flight', async (page) => {
  await openLogbook(page);
  await page.getByRole('button', { name: /^Add note for / }).click();
  const box = page.getByRole('textbox', { name: /note/i }).first();
  await box.fill('J350 on a 54 mm case — dual deploy, drogue at apogee.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('J350 on a 54 mm case')).toBeVisible();
  // **Park the pointer, or this walk rates the HOVER colour.** The saved note renders where the
  // Save button was, so the click leaves the cursor on top of it and `hover:text-zinc-900` applies
  // — measured: with `text-zinc-400` (2.51:1) injected into the resting class the audit stayed
  // GREEN, because what axe read was the hover value at about 16:1. `DESIGN.md` §9 records that
  // the SOURCE census cannot rate variant-prefixed states; this is the rendered check finding the
  // same blind spot from the other side, and one line closes it.
  await page.mouse.move(0, 0);
});

/**
 * A MARGINAL rail exit — a flight-safety caution, and the treatment `DESIGN.md` §9 recorded at
 * 3.20:1 before the census reached the amber ramp. No audit reached it: the bundled sample reads
 * 29.4 m/s at the default 8 ft rail and is never marginal at any rail length. This fixture reads
 * 15.2 m/s at 8 ft — just over the 15 m/s line — and 9.9 at 4 ft, so the state is one select away.
 */
inBothThemes('a marginal rail exit', async (page) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-raven-fip.csv'));
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 60_000 });
  const rail = page.getByLabel('Launch rail length');
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await rail.selectOption('1.219');
  // Assert the STATE before auditing it: a future analysis change that lifts the number past the
  // threshold must fail loudly here rather than quietly audit a page the caution has left.
  await expect(page.getByRole('heading', { name: 'Rail-exit velocity' })).toBeVisible();
  await expect(page.getByText(/That’s on the low side/)).toBeVisible();
});

/**
 * A flight with NO detected liftoff, beside one that has it — the `≈ est. liftoff` caveat on the
 * comparison's column header, and another amber the census reached only after it was widened to
 * the hue ramps.
 *
 * No fixture is in that state: every one that parses yields a liftoff event. So the second file is
 * built here by keeping a real fixture's header and everything from its own apogee onward — a
 * record that begins after the climb, which is a real shape (a flyer crops, or a board wakes late)
 * and the only one that reaches `liftoffDetected === false` through the app's own ingest.
 */
inBothThemes('a comparison including a flight with no detected liftoff', async (page) => {
  const raw = readFileSync(fx('altusmetrum-telemetrum.csv'), 'utf8').split('\n');
  const header = raw[0];
  const rows = raw.slice(1).filter(Boolean);
  const cols = header.split(',');
  const hIdx = cols.findIndex((c) => /height/i.test(c));
  expect(hIdx, 'the fixture still has a height column').toBeGreaterThan(-1);
  let peak = -Infinity;
  let peakAt = 0;
  rows.forEach((r, i) => {
    const v = Number(r.split(',')[hIdx]);
    if (Number.isFinite(v) && v > peak) {
      peak = v;
      peakAt = i;
    }
  });
  const descentOnly = [header, ...rows.slice(peakAt)].join('\n');

  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles([
    { name: 'whole-flight.csv', mimeType: 'text/csv', buffer: Buffer.from(raw.join('\n')) },
    { name: 'after-apogee.csv', mimeType: 'text/csv', buffer: Buffer.from(descentOnly) },
  ]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 60_000 });
  // The state itself, asserted before the audit: without this the walk would quietly rate a
  // comparison of two ordinary flights the day the analyzer starts finding a liftoff here.
  await expect(page.getByText(/est\. liftoff/).first()).toBeVisible();
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

/**
 * **The exported HTML report, RENDERED and audited — the gap `DESIGN.md` §9 recorded and could not
 * close.** That document's palette is written as literal hex in `lib/report.ts`, so it is neither a
 * Tailwind class nor under `components`/`app`: the source census that rates every grey in the app
 * cannot see one character of it. §9 called for "a rendered check — rasterising computed colours
 * onto a 1×1 canvas rather than parsing them, since Chromium reports `lab()`/`oklab()`".
 *
 * **This is that check, and it is cheaper than the one §9 imagined, because axe already does the
 * rasterising.** The `color-contrast` rule is in `wcag2aa`, which every audit in this file already
 * runs; nothing was disabled. The thing that had never happened is opening the FILE. Six e2e sites
 * download this report and every one of them asserts the filename and throws the bytes away.
 *
 * It found three failing rules where §9 recorded two, and disagreed with §9's number for the third:
 * `thead th` and `footer` were `#71717a` on the `#f4f4f5` body (**4.40:1**), and `footer a` was
 * `#6366f1` (**4.06:1**, not the 4.47:1 §9 records — that is the same colour's ratio on WHITE,
 * carried across from the other gap that section names).
 *
 * Served over `file://` deliberately: that is how a flyer opens it out of a cert package, months
 * later, offline. A document whose promise is that it opens anywhere with nothing to fetch should
 * be audited with nothing fetched.
 */
test('a11y: the exported HTML report a flyer files away', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible({ timeout: 60_000 });

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .html' }).click(),
  ]);
  // Saved with a real `.html` name into the test's own output directory, not opened at the raw
  // download path: that temp file has no extension, and Chromium then offers it as a download
  // instead of rendering it — a `file://` goto that "succeeds" onto an empty page, which is how a
  // rendered audit passes over nothing at all.
  const file = testInfo.outputPath('flight-debrief.html');
  await dl.saveAs(file);

  await page.goto(`file://${file}`);
  // The document really is the report, not an error page — otherwise a clean audit means nothing.
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await audit(page, 'exported HTML report (screen)');

  // **And on PAPER**, which is a different palette: `@media print` repaints the body white, so
  // every ratio in the document changes — and each medium hides something the other catches.
  // MEASURED both ways rather than reasoned about: put `#71717a` back on `thead th` and `footer`
  // and the PRINT audit passes while the screen one names 7 nodes (4.40:1 → 4.83:1 on white); put
  // `#6366f1` back on `footer a` and print fails on exactly the one `<a>` (4.06:1 → 4.47:1, still
  // under AA). One audit over one medium would have been a partial answer in both directions.
  await page.emulateMedia({ media: 'print' });
  await audit(page, 'exported HTML report (print)');
  await page.emulateMedia({ media: 'screen' });
});
