import { test, expect } from '@playwright/test';

// The logbook backup/restore round-trip: export the remembered flights (and their
// notes) to a file, clear the device, then import the file back and prove the
// flight — note and all — returns. Everything stays on-device; the "file" never
// leaves the browser except as a download the user keeps.

function eggtimerCsv(): string {
  const lines = ['T,Alt,VRaw,VFilt'];
  let tms = 0;
  const push = (alt: number, v: number) => {
    lines.push(`${tms},${alt.toFixed(0)},${v.toFixed(1)},${v.toFixed(1)}`);
    tms += 100;
  };
  for (let i = 0; i < 20; i++) push(0, 0);
  for (let i = 0; i < 30; i++) push((i / 30) ** 0.5 * 300, 200 * (1 - i / 30));
  for (let i = 0; i < 80; i++) push(Math.max(0, 300 - i * 4), -20);
  return lines.join('\n');
}

const jsonInput = (page: import('@playwright/test').Page) =>
  page.locator('input[type="file"][accept*="json"]');

test('a logbook can be exported and restored on a cleared device', async ({ page }) => {
  await page.goto('/');

  // Remember a flight and give it a note so the export carries more than a name.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'cert.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  await page.getByRole('button', { name: 'Add note for cert.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for cert.csv' }).fill('H128, L1 cert');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('H128, L1 cert')).toBeVisible();

  // Export the logbook to a file.
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('debrief-logbook.json');
  const backupPath = await dl.path();

  // Wipe the device.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /tap to confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toHaveCount(0);

  // The empty state still offers a restore; importing the backup brings it back.
  await expect(page.getByRole('button', { name: 'Restore it' })).toBeVisible();
  await jsonInput(page).setInputFiles(backupPath);

  await expect(page.getByText('Restored 1 flight.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await expect(page.getByText('cert.csv', { exact: true })).toBeVisible();
  await expect(page.getByText('H128, L1 cert')).toBeVisible();
});

test('importing a file that is not a logbook reports it cleanly', async ({ page }) => {
  await page.goto('/');
  // Get a non-empty list so the header Import button is shown.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyze another flight/ }).click();

  await jsonInput(page).setInputFiles({
    name: 'random.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByText(/No flights found in that file/)).toBeVisible();
  // The existing flight is untouched.
  await expect(page.getByText('a.csv', { exact: true })).toBeVisible();
});

// A season fills the logbook, and sorting alone stops finding a flight: what a flyer
// remembers is the airframe, the launch or the motor. The search covers the file name, the
// logger it came off, and the note they wrote — so it has to reach all three.
test('the logbook can be searched by name, logger and note', async ({ page }) => {
  await page.goto('/');
  // Four flights, which is where the search box earns its place.
  for (const name of ['nike-smoke.csv', 'raven-l3.csv', 'pad-test.csv', 'cert-flight.csv']) {
    await page
      .getByLabel('Choose a flight log file')
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  const rows = page.getByRole('list', { name: 'Your flights' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);

  // A note is part of what's searched, so put a motor on one flight.
  await page.getByRole('button', { name: 'Add note for raven-l3.csv' }).click();
  await page.getByRole('textbox', { name: 'Note for raven-l3.csv' }).fill('M1297 red, windy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const search = page.getByRole('searchbox', { name: 'Search your flights' });
  await search.fill('nike');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('1 of 4')).toBeVisible();

  // The motor from the note finds its flight, and so does the logger name.
  await search.fill('m1297');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('raven-l3.csv');
  await search.fill('eggtimer');
  await expect(rows).toHaveCount(4);

  // Every term has to match, in any order.
  await search.fill('windy raven');
  await expect(rows).toHaveCount(1);
  await search.fill('windy nike');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText(/No flight here matches/)).toBeVisible();

  // And the way back is offered, not just implied.
  await page.getByRole('button', { name: 'Show all 4' }).click();
  await expect(rows).toHaveCount(4);
  await expect(search).toHaveValue('');
});
