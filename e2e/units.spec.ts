import { test, expect } from '@playwright/test';

// Units are chosen per quantity, not as one of two systems: a US club quotes altitude in
// feet and speed in mph, a cert document may want m/s, a drag write-up m/s² over g. The
// choice has to reach every number, the chart axes and every export — a report that says
// mph on screen and ft/s in the file it saved is worse than either.
const read = (page: import('@playwright/test').Page) => page.locator('div.grid').first().innerText();

/** The per-quantity panel's trigger. Matched on its accessible name rather than its text,
 *  so it isn't confused with the phrase "per quantity" in the page's own how-to copy — it was
 *  a <summary> for the same reason until `Popover` (`DESIGN.md` §5) took the hand-rolled
 *  overlay over on 2026-08-08. */
const panel = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'per quantity', exact: true }).first();

async function sampleFlight(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
}

test('a unit can be chosen per quantity, and it reaches every surface', async ({ page }) => {
  await sampleFlight(page);
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('feet');
  expect(await read(page)).toMatch(/ft\/s/);

  // Speed in mph, acceleration in m/s² — neither is in either named system.
  await panel(page).click();
  const selects = page.getByRole('dialog', { name: 'Units per quantity' }).locator('select');
  await selects.nth(1).selectOption('mph');
  await selects.nth(2).selectOption('m/s²');

  const grid = await read(page);
  expect(grid).toMatch(/mph/);
  expect(grid).toMatch(/m\/s²/);
  expect(grid).not.toMatch(/ft\/s/);
  // Altitude was left alone, so it stays in feet — the point of per-quantity.
  expect(grid).toMatch(/ft\b/);
  // The button stops claiming a named system.
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('custom');

  // The chart axes follow — every one of them. Acceleration is checked separately from
  // velocity because it was the quantity that didn't: its heading read "Acceleration (g)"
  // whatever was picked, while the tile beside it and the chart's own accessible
  // description both said m/s², so the curve and the number describing it disagreed.
  await expect(page.getByRole('heading', { name: /Velocity \(mph\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Acceleration \(m\/s²\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Acceleration \(g\)/ })).toHaveCount(0);

  // …and so does the saved report: the file must not disagree with the screen.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save .txt' }).click(),
  ]);
  const stream = await dl.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream!.on('data', (c) => chunks.push(Buffer.from(c)));
    stream!.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream!.on('error', reject);
  });
  expect(text).toMatch(/mph/);
  expect(text).toMatch(/m\/s²/);
  expect(text).not.toMatch(/ft\/s/);
});

test('the choice rides in the URL and is remembered on this device', async ({ page }) => {
  await sampleFlight(page);
  await panel(page).click();
  await page.getByRole('dialog', { name: 'Units per quantity' }).locator('select').nth(1).selectOption('km/h');
  await expect(page).toHaveURL(/[?&]u=/);
  expect(await read(page)).toMatch(/km\/h/);

  // A reload reads it back from the URL… and comes back to the flight, because the report
  // has an address now (`?open=<id>`) rather than evaporating on every navigation. The
  // sample no longer needs re-loading by hand here, which is the point of the address.
  //
  // Waited for generously and deliberately: coming back to a flight means PARSING AND
  // ANALYSING it again, which a reload never used to do because it used to land on an empty
  // drop zone. Under two parallel workers that outran the default 5 s expect deadline, and
  // the failure was the deadline rather than the behaviour — the same trap `worker.spec.ts`
  // records for its own big-log test.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible({ timeout: 20_000 });
  expect(await read(page)).toMatch(/km\/h/);

  // …and a fresh visit with no query string reads it back from this device.
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  expect(await read(page)).toMatch(/km\/h/);
});

test('the feet/metres toggle still works, and clears any override', async ({ page }) => {
  await sampleFlight(page);
  await panel(page).click();
  await page.getByRole('dialog', { name: 'Units per quantity' }).locator('select').nth(1).selectOption('kt');
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('custom');

  // One click back to a familiar system.
  await page.getByRole('button', { name: /Units:/ }).click();
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('meters');
  const grid = await read(page);
  expect(grid).toMatch(/m\/s/);
  expect(grid).not.toMatch(/\bkt\b/);
});

// The unit control used to exist only inside a loaded analysis: mounted at two call sites,
// both below a report or a comparison. So the analyze page's landing screen had none at all,
// the comparison picker had none, and on a report it sat 880 px from the right edge of a
// 1440 px viewport — while app/page.tsx told the flyer to "switch feet and meters with one
// click (top-right)". A promise the page could not keep on any surface, over a logbook whose
// own apogee and speed columns were already being formatted by that choice.
test('the unit control is on every surface that shows a number, and none that does not', async ({ page }) => {
  const unitsButton = page.getByRole('button', { name: /^Units:/ });

  // Before a file is dropped — the logbook's own numbers are already in these units.
  await page.goto('/');
  await expect(unitsButton).toHaveCount(1);
  const idle = (await unitsButton.boundingBox())!;
  expect(idle.y, 'top of the page, where the copy says it is').toBeLessThan(200);
  expect(1440 - (idle.x + idle.width), 'right-hand side').toBeLessThan(450);

  // …and with a flight open, still exactly one, in the same place rather than a second copy
  // buried in the report's toolbar.
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  await expect(unitsButton).toHaveCount(1);
  const loaded = (await unitsButton.boundingBox())!;
  expect(Math.abs(loaded.x - idle.x), 'the control must not move when a flight loads').toBeLessThan(2);

  // The comparison surface, which shows a table of numbers, has it too.
  await page.goto('/compare');
  await expect(unitsButton).toHaveCount(1);

  // The docs pages have no numbers in the flyer's units, so they get no control — and, more
  // to the point, none of the client JS behind it. Shipping it everywhere pushed /methods
  // from 107 kB to 111 kB and the extra chunk requests took the e2e static server past its
  // file-descriptor limit mid-run.
  for (const route of ['/methods', '/validation', '/privacy']) {
    await page.goto(route);
    await expect(unitsButton, `${route} should carry no unit control`).toHaveCount(0);
  }
});
