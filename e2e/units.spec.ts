import { test, expect } from '@playwright/test';

// Units are chosen per quantity, not as one of two systems: a US club quotes altitude in
// feet and speed in mph, a cert document may want m/s, a drag write-up m/s² over g. The
// choice has to reach every number, the chart axes and every export — a report that says
// mph on screen and ft/s in the file it saved is worse than either.
const read = (page: import('@playwright/test').Page) => page.locator('div.grid').first().innerText();

/** The per-quantity panel's disclosure — a <summary>, so it isn't confused with the
 *  phrase "per quantity" in the page's own how-to copy. */
const panel = (page: import('@playwright/test').Page) =>
  page.locator('summary').filter({ hasText: 'per quantity' });

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
  const selects = page.locator('details select');
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
  await page.locator('details select').nth(1).selectOption('km/h');
  await expect(page).toHaveURL(/[?&]u=/);
  expect(await read(page)).toMatch(/km\/h/);

  // A reload reads it back from the URL…
  await page.reload();
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
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
  await page.locator('details select').nth(1).selectOption('kt');
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('custom');

  // One click back to a familiar system.
  await page.getByRole('button', { name: /Units:/ }).click();
  await expect(page.getByRole('button', { name: /Units:/ })).toContainText('meters');
  const grid = await read(page);
  expect(grid).toMatch(/m\/s/);
  expect(grid).not.toMatch(/\bkt\b/);
});
