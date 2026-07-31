import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

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
  for (const f of files) {
    await page.getByLabel('Choose a flight log file').setInputFiles(fixture(f));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  for (const f of files) await page.getByLabel(`Select ${f} to compare`).check();
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

  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], select, summary, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // The suite's own conventions (`e2e/touch.spec.ts`): a link inside running prose is not a
      // control — 44 px mid-sentence is wrong — and a control kept small on purpose expands its
      // HIT AREA with a pseudo-element rather than its box.
      if (el.classList.contains('touch-area')) continue;
      if (el.tagName === 'A' && el.closest('p, li')) continue;
      if (el.closest('footer, nav, header')) continue;
      if (r.height < 44) out.push(`${el.tagName.toLowerCase()}: ${(el.textContent || '').trim().slice(0, 30)} ${Math.round(r.height)}px`);
    }
    return out;
  });
  expect(small, `controls under 44 px tall on /stitch:\n${small.join('\n')}`).toEqual([]);
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
