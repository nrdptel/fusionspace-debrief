import { test, expect } from '@playwright/test';
import { underSizedTargets } from './touchTargets';
import path from 'node:path';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Unpack a zip Debrief wrote, and return the full paths of what was in it, sorted. */
async function unzipToDir(zipPath: string): Promise<string[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'debrief-unzip-'));
  await run('unzip', ['-q', '-o', zipPath, '-d', dir]);
  return (await readdir(dir)).sort().map((f) => path.join(dir, f));
}

/**
 * D4's *done when*, walked in the real app: a flyer assembles two per-stage logs into one timeline
 * whose events read in order across staging, sees which recording each mark came from, and gets a
 * refusal that says why when the two cannot be aligned.
 *
 * Two REAL fixtures stand in for the two stages, because they already have the shape: the Raven
 * reaches 314 m and its apogee 8.9 s after its own liftoff, the TeleMetrum reaches 2,841 m and its
 * apogee 22.4 s after its own — so lined up on the launch they order the way a booster and a
 * sustainer do. Nothing here is synthesised; a hand-built CSV would go through the column mapper
 * instead of a parser and would be testing a different journey.
 */

const fixture = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

/** The lower, shorter flight — the first stage's part of the launch. */
const BOOSTER = 'featherweight-raven-fip.csv';
/** The higher, longer one — the sustainer's. */
const SUSTAINER = 'altusmetrum-telemetrum.csv';

/** Drop both files, then use the logbook's own tick-and-compare to get their ids into an address.
 *
 *  Driven through the app rather than read out of storage: the logbook lives in IndexedDB and its
 *  ids are minted there, so a test that reached in for them would assert against a private shape
 *  instead of the journey a flyer takes to reach a set of two recordings. */
async function idsFor(page: import('@playwright/test').Page, files: string[]): Promise<string> {
  await page.goto('/');
  // A bare name is a fixture; an absolute path is a file the test itself produced — a saved
  // record on its way back in, which is the journey D11 exists for.
  const src = (f: string) => (f.startsWith('/') ? f : fixture(f));
  const shown = (f: string) => (f.startsWith('/') ? path.basename(f) : f);
  for (const f of files) {
    await page.getByLabel('Choose a flight log file').setInputFiles(src(f));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  for (const f of files) await page.getByLabel(`Select ${shown(f)} to compare`).check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();
  await expect(page).toHaveURL(/ids=/, { timeout: 20_000 });
  return new URL(page.url()).searchParams.get('ids') as string;
}

test('two per-stage logs read as one timeline, each mark naming its recording', async ({ page }) => {
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/stitch/?ids=${ids}`);

  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 20_000 });

  const rows = await table.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const c = tr.querySelectorAll('td');
      return { time: c[0].textContent!.trim(), mark: c[1].textContent!.trim(), rec: c[2].textContent!.trim() };
    }),
  );
  expect(rows.length).toBeGreaterThan(5);

  // Every row names the recording it came from — the clause of the *done when* that a single
  // merged timeline could not satisfy.
  expect(new Set(rows.map((r) => r.rec))).toEqual(new Set([BOOSTER, SUSTAINER]));

  // The marks read IN ORDER across the two stages: the stage that flew higher and longer has the
  // later apogee, and the table puts it there.
  const apogees = rows.filter((r) => /apogee/i.test(r.mark));
  expect(apogees.map((a) => a.rec)).toEqual([BOOSTER, SUSTAINER]);

  // Times are whole seconds. A tenth would be a precision the alignment cannot support, and the
  // corpus measurement behind that is in `lib/composite.ts`.
  for (const r of rows) expect(r.time, `"${r.time}" is a whole-second composite time`).toMatch(/^(↳ )?T[+−]\d+ s$/);

  // The composite says out loud that it is the flyer's statement rather than a measurement, and
  // names the method it used.
  await expect(page.getByText(/your statement, not a measurement/i)).toBeVisible();
  await expect(page.getByText(/lined up on the/i).first()).toBeVisible();

  // Nothing merged, asserted on the structure rather than on the prose: the table carries exactly
  // these four columns, and every one of them is a fact about ONE recording. A blended reading
  // would have to arrive as a fifth column or replace the third, and either fails here.
  // `allInnerTexts` returns the RENDERED text, and these are `uppercase` in the design system.
  expect(await table.locator('thead th').allInnerTexts()).toEqual([
    'TIME',
    'MARK',
    'RECORDING',
    'ITS OWN ALTITUDE',
  ]);
});

test('the flyer says which recording flew first, and it orders marks without moving them', async ({ page }) => {
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/stitch/?ids=${ids}`);
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 20_000 });

  const times = () => table.locator('tbody tr td:nth-child(1)').allInnerTexts();
  const before = (await times()).map((t) => t.replace('↳ ', ''));

  // Both stages leave the pad at T+0, so the two liftoffs are simultaneous and the flyer's
  // statement is the only thing that can order them.
  await page.getByRole('button', { name: SUSTAINER, exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('td').nth(2)).toHaveText(SUSTAINER);

  await page.getByRole('button', { name: BOOSTER, exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('td').nth(2)).toHaveText(BOOSTER);

  // …and the alignment did not move. The statement is a label, not a gate: stating it either way
  // gives identical offsets, because every stage leaves the pad together.
  expect(new Set((await times()).map((t) => t.replace('↳ ', '')))).toEqual(new Set(before));

  // It survives a reload — a statement a flyer has to make twice is not remembered.
  await page.reload();
  await expect(page.getByRole('table').locator('tbody tr').first().locator('td').nth(2)).toHaveText(BOOSTER, {
    timeout: 20_000,
  });
});

test('the statement survives reaching the same two recordings the other way round', async ({ page }) => {
  // The two routes to a composite produce different id ORDERS for the same pair: the analyze page
  // builds the address from the order a folder was dropped, the comparison from the order the
  // flyer ticked. The statement was keyed on that order, so saying "this one flew first" and then
  // arriving by the other route asked the flyer the same question again — a control that forgets,
  // which is a named tell.
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  const reversed = ids.split(',').reverse().join(',');
  expect(reversed, 'the two routes really do differ, or this test proves nothing').not.toBe(ids);

  await page.goto(`/stitch/?ids=${ids}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: SUSTAINER, exact: true }).click();
  await expect(page.getByRole('button', { name: SUSTAINER, exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Same two recordings, reached by the other route.
  await page.goto(`/stitch/?ids=${reversed}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  // The PRESSED CONTROL, not the first row. Which recording sorts first can be true by accident —
  // the marks have their own order — so a row assertion here would pass whether the statement was
  // remembered or not. `aria-pressed` is the statement itself, rendered.
  await expect(
    page.getByRole('button', { name: SUSTAINER, exact: true }),
    'the flyer is not asked which one flew first a second time',
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });

  // …and withdrawing it from this side withdraws it on the other, rather than leaving the
  // original order still answering with the old statement.
  await page.getByRole('button', { name: SUSTAINER, exact: true }).click();
  await page.goto(`/stitch/?ids=${ids}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
});

test('the composite saves as records and comes back from them', async ({ page }) => {
  // D11 slice 5 — the last clause of the milestone's *done when*: "a stitched composite keeps its
  // stages". Before this the composite wrote NOTHING: "Copy the timeline" and "Copy a link" were
  // its whole output, while /compare writes five formats and a ZIP for the same flyer. So the one
  // multi-source structure that exists only here left the app as clipboard text, and the flyer's
  // statement of which stage flew first — the thing they know that the files do not — left with it.
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/stitch/?ids=${ids}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: BOOSTER, exact: true }).click();
  await expect(page.getByRole('button', { name: BOOSTER, exact: true })).toHaveAttribute('aria-pressed', 'true');

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save these records' }).click(),
  ]);
  const zipPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'debrief-stages-')), dl.suggestedFilename());
  await dl.saveAs(zipPath);
  await expect(page.getByRole('status').filter({ hasText: /Saved 2 flight records/ })).toBeVisible();

  // Both records name the SAME stage set and exactly one of them claims to have flown first.
  // Read out of the zip, because the file is the only thing that crosses the device boundary.
  const files = await unzipToDir(zipPath);
  expect(files, 'one record per recording').toHaveLength(2);
  const stages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, 'utf8')).stage));
  expect(stages[0]?.set, 'both records name one stage set').toBe(stages[1]?.set);
  expect(stages.filter((s) => s?.first), 'exactly one flew first').toHaveLength(1);

  // Wipe the logbook, so nothing but the two files can supply the statement.
  await page.goto('/');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Delete/ }).click();
  await expect(page.locator('ul[aria-label="Your flights"] > li')).toHaveCount(0);

  // Drop the records back — BOTH AT ONCE, which is the journey: a flyer opens the folder they
  // archived. Dropping them one at a time is a different gesture and restores nothing, because a
  // set of one is not a set; the first version of this test did that and proved nothing.
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(files);
  // Two files assemble a comparison, which is where a drop of two lands.
  await expect(page.getByText(/Comparing 2 flights/)).toBeVisible({ timeout: 30_000 });

  // …then reach the composite the ordinary way, from the logbook.
  await page.goto('/');
  for (const f of files) await page.getByLabel(`Select ${path.basename(f)} to compare`).check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();
  await expect(page).toHaveURL(/ids=/, { timeout: 20_000 });
  const back = new URL(page.url()).searchParams.get('ids') as string;
  await page.goto(`/stitch/?ids=${back}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
  // The record keeps the recording's own stem, so the button is named for the booster's file.
  const boosterRecord = `${BOOSTER.replace(/\.[^.]+$/, '')}-debrief-record.json`;
  expect(files.some((f) => path.basename(f) === boosterRecord), `zip holds ${boosterRecord}`).toBe(true);
  await expect(
    page.getByRole('button', { name: boosterRecord, exact: true }),
    'the flyer is not asked which stage flew first a second time',
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
});

test('a set of one is refused, and the refusal offers the way on', async ({ page }) => {
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  // One id is not a composite. The surface says what would make it one rather than showing an
  // empty table — the state a flyer reaches by editing the address, or by a prune taking a flight.
  await page.goto(`/stitch/?ids=${ids.split(',')[0]}`);
  await expect(page.getByText(/Nothing to assemble yet/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('a flight the logbook no longer holds is a refusal, not a partial composite', async ({ page }) => {
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  // A composite with a stage missing has a hole in it, so — unlike `/compare`, which is right to
  // drop a dead id and carry on — this must not assemble what is left and say nothing.
  await page.goto(`/stitch/?ids=${ids.split(',')[0]},does-not-exist`);
  // Scoped to the page's own content: Next renders an empty `role="alert"` route announcer of its
  // own, so an unscoped role lookup resolves to two elements and fails on strictness rather than
  // on the thing under test.
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText(/hole in the timeline/i);
  await expect(alert).toContainText('does-not-exist');
  await expect(page.getByRole('table')).toHaveCount(0);
  // And it offers the surface that CAN show a partial set, rather than leaving a dead end.
  await expect(page.getByRole('link', { name: /side by side/i })).toBeVisible();
});

test('a comparison of two offers the way on to the composite', async ({ page }) => {
  // The gap a closing cold walk found: a comparison assembled from a DROP carries no `?ids=` in
  // the address, so a flyer who dropped a booster and a sustainer had no route to the composite
  // except starting over from the header. The ids exist on the surface; this is the one click.
  // Through the logbook, because that is where the flights become ADDRESSABLE: a comparison
  // assembled straight from a drop mints synthetic ids, and the link is deliberately absent there
  // rather than pointing at a composite that cannot be assembled.
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/compare/?ids=${ids}`);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 25_000 });
  const onward = page.getByRole('link', { name: /Read them as one timeline/i });
  await expect(onward).toBeVisible();
  await onward.click();
  await expect(page).toHaveURL(/\/stitch\/\?ids=[^,]+,[^,]+/);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });
});

test('an empty composite says what would fill it and offers the one control that does', async ({ page }) => {
  await page.goto('/stitch/');
  await expect(page.getByText(/Nothing to assemble yet/i)).toBeVisible();
  await expect(page.getByText(/two or more recordings of one launch/i)).toBeVisible();
  const action = page.getByRole('link', { name: /Pick flights on Compare/i });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/compare/);
});

// `hasTouch` matters as much as the width, and setting only the width measures a desktop. The 44 px
// floor — both `app/globals.css`'s rule and the `TOUCH_TARGET` token the primitives carry — is
// `@media (pointer: coarse)`, which a Playwright context arms only when `hasTouch` is set. Without
// it this block reports every control as under-sized and none of it means anything.
test.describe('on a phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the composite surface is reachable without knowing it exists, and is thumb-sized', async ({ page }) => {
  await page.goto('/');
  // In the header on every surface — "a feature reachable only by knowing it is there" is a named
  // tell, and the header is where the other two surfaces live.
  const link = page.getByRole('link', { name: 'Assemble' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/stitch/);

  // The shared predicate (`e2e/touchTargets.ts`), not a fifth hand-kept copy. This one used to
  // exclude `footer, nav, header` outright and skip `.touch-area` rather than measuring the hit
  // area it opts into, so the chrome of this route was certified by a sweep that never looked at
  // it — and it measured height only, like every other copy.
  const small = await page.evaluate(underSizedTargets);
  expect(small, `controls under 44 px on /stitch:\n${small.join('\n')}`).toEqual([]);
  });
});

test('the route is precached, so an offline visit does not serve the analyze page at its URL', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  const cached = await page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const cache = await caches.open(k);
      if (await cache.match(new URL('/stitch/', location.href).href, { ignoreVary: true })) return true;
    }
    return false;
  });
  expect(cached, '/stitch/ is precached by the service worker').toBe(true);
});

// The whole app is a static export, and a route that only works in dev is not shipped.
test('the route is a static export', () => {
  const html = readFileSync(path.join(process.cwd(), 'out', 'stitch', 'index.html'), 'utf8');
  expect(html).toContain('One launch, several recordings');
});

// A staged flight's mark timeline is what a cert write-up quotes — which mark, at what time on the
// common clock, off which recording, at what height on that recording's own datum. It was readable
// and nothing else, so the way into a document was to retype it.
test('the composite timeline copies as a real table, on the common clock', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/stitch/?ids=${ids}`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Copy the timeline' }).click();
  // Wait for the ANNOUNCEMENT before reading the clipboard. The copy is async — the control's
  // handler awaits `copyTable` — so clicking and reading in the next statement races the write,
  // and the read comes back with no `text/plain` entry at all. It passed 3/3 locally and both CI
  // jobs on the pull request that added it, then failed twice on a later CI run: a slower runner
  // is all it takes. The status line is the app's own signal that the write finished, which is
  // why every other copy test in this suite waits for it.
  await expect(page.getByRole('status').filter({ hasText: /Copied/ })).toBeVisible();
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out: Record<string, string> = {};
    for (const item of items) for (const type of item.types) out[type] = await (await item.getType(type)).text();
    return out;
  });

  const lines = clip['text/plain'].split('\n');
  const head = lines[0].split('\t');
  expect(head.slice(0, 3)).toEqual(['Time (s)', 'Mark', 'Recording']);
  // The unit rides in the HEADER, not in every cell — a spreadsheet sorts a column of bare
  // numbers and will not sort "1,234 ft".
  expect(head[3]).toMatch(/^Its own altitude \((ft|m)\)$/);
  const body = lines.slice(1).filter(Boolean);
  expect(body.length).toBeGreaterThan(5);
  // Every data row carries a mark and names its recording, and the altitude is a bare number.
  for (const l of body) {
    const c = l.split('\t');
    expect(c[1].length).toBeGreaterThan(0);
    expect([BOOSTER, SUSTAINER]).toContain(c[2]);
    expect(c[3]).toMatch(/^(-?[\d,.]+|—)$/);
  }
  // Both recordings reach the clipboard, which is the whole point of a composite.
  expect(new Set(body.map((l) => l.split('\t')[2]))).toEqual(new Set([BOOSTER, SUSTAINER]));
  expect(clip['text/html']).toContain('<th>Recording</th>');
  expect(clip['text/html']).not.toContain('<span');
});

/**
 * D7 slice 4, walked: each recording's own readings, beside each other, on the surface that knows
 * they are one launch.
 *
 * The composite has held every recording's whole analysis since D4 and surfaced ONE number off
 * it — the burn — so a flyer who wanted the sustainer's own apogee or the thrust-to-weight the
 * booster left the pad at had to leave, open each file on its own, and hold two reports in their
 * head.
 *
 * This reads the NUMBERS, not the headings. A panel with every label and no values is exactly the
 * shape a broken data path takes here — `recordings` is new state, and a stage panel built from an
 * empty array renders the same labels — and it would satisfy any assertion that only counted them.
 */
test('each recording reports its own readings, and they are not merged into one', async ({ page }) => {
  const ids = await idsFor(page, [BOOSTER, SUSTAINER]);
  await page.goto(`/stitch/?ids=${ids}`);

  const panel = page.getByRole('region', { name: /What each recording read on its own/i });
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // One block per recording, each named by its file — the same provenance every timeline row
  // carries, for the same reason.
  for (const f of [BOOSTER, SUSTAINER]) await expect(panel.getByText(f, { exact: false })).toBeVisible();

  // By NAME, through the same `data-stage` / `data-reading` hooks the single-flight grid uses.
  // The Readout's VALUE div, not the whole tile: the tile's text also holds the label and the
  // qualifier under it, and "24.6 s to apogee" sits in the same node as the apogee itself.
  const read = (file: string, label: string) =>
    panel.locator(`[data-stage="${file}"] [data-reading="${label}"] > div:nth-child(2)`).innerText();

  // The two apogees are the two recordings' OWN apogees and are different numbers. If a future
  // change ever merged them, this is the assertion that would go red — and merging is the one
  // thing this surface must never do.
  const booster = await read(BOOSTER, 'Apogee');
  const sustainer = await read(SUSTAINER, 'Apogee');
  for (const [f, t] of [[BOOSTER, booster], [SUSTAINER, sustainer]] as const)
    expect(t, `${f} shows a real apogee, not a blank`).toMatch(/\d/);
  expect(booster).not.toBe(sustainer);

  // The lower, shorter recording really is the lower one — so the panels are attached to the right
  // recordings rather than both showing whichever analysis happened to be first.
  const num = (s: string) => Number((s.match(/[\d,.]+/) ?? [''])[0].replace(/,/g, ''));
  expect(num(booster), `${booster} is below ${sustainer}`).toBeLessThan(num(sustainer));

  // The booster's own thrust-to-weight — a per-stage figure the competitive ledger records as
  // shipped by no tool in the field, and one a flyer previously had to open the file alone to see.
  await expect(panel.locator(`[data-stage="${BOOSTER}"] [data-reading="Burn time"]`)).toContainText(/\d/);

  // A unit switch reaches these numbers, which is what makes them readings rather than strings
  // baked at load time — the bug the state shape was chosen to prevent.
  const before = await read(SUSTAINER, 'Apogee');
  await page.getByRole('button', { name: 'per quantity', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Units per quantity' }).locator('select').first().selectOption('m');
  await expect.poll(() => read(SUSTAINER, 'Apogee'), { timeout: 10_000 }).not.toBe(before);
  expect(await read(SUSTAINER, 'Apogee')).toMatch(/\bm$/);
});

test('the prerendered page does not tell a flyer their composite is missing', async ({ page }) => {
  // Every route here is a static export, so whatever `StitchSurface` renders on its first pass is
  // baked into `out/stitch/index.html` and served before a line of JS runs. It started at `empty`,
  // which prerendered "Nothing to assemble yet — Tick them in the logbook" — so a flyer opening a
  // composite PERMALINK, the address this surface exists to mint, was told their composite did not
  // exist until ~1.4 MB of JS hydrated and the ids in the URL were read.
  //
  // This is the logbook's own shipped defect on a second surface, and it is pinned the same way:
  // by fetching the raw HTML rather than by driving the app, because the app is exactly what
  // covers it up. Falsified by starting the state at `empty` again.
  const res = await page.request.get('/stitch/');
  expect(res.ok()).toBe(true);
  const html = await res.text();

  expect(html, 'the prerender does not claim there is nothing to assemble').not.toContain(
    'Nothing to assemble yet',
  );
  expect(html, 'it says it is looking instead').toContain('Looking for the recordings');
  // And it says so to a screen reader, not only on screen — the whole point of `Loading`.
  expect(html, 'the wait is announced, not merely drawn').toMatch(/role="status"|aria-live/);
});
