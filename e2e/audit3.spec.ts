import { test, expect } from '@playwright/test';
import path from 'node:path';

// Audit, pass 3: every named parser auto-detecting in the real browser, the
// compare-selection cap, and the export buttons not yet exercised (explorer PNG,
// comparison PNG).

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);

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

// Reaching the report (not the column mapper) proves the file auto-detected.
const reachesReport = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
};

for (const file of [
  'altusmetrum-telemetrum.csv',
  'perfectflite-pnut.pf2',
  'featherweight-raven-fip.csv',
  'blueraven-app-lr.csv',
  'aim-xtra.csv',
  'featherweight-gps.csv',
]) {
  test(`auto-detects and analyses ${file} in the browser`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(file));
    await reachesReport(page);
  });
}

test('a GPS log shows the recovery (ground track) view with walkback numbers', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('featherweight-gps.csv'));
  await reachesReport(page);
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toBeVisible();
  await expect(page.getByText('Landed from pad', { exact: true })).toBeVisible();
  await expect(page.getByText('Bearing', { exact: true })).toBeVisible();
  await expect(page.getByText('Max drift', { exact: true })).toBeVisible();
  // The canvas exposes a text description of the track for screen readers.
  await expect(page.getByRole('img', { name: /landed .* from the pad, bearing/i })).toBeVisible();
});

test('an Altus Metrum GPS flight also gets the recovery view', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles(fx('altusmetrum-telemetrum.csv'));
  await reachesReport(page);
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toBeVisible();
  await expect(page.getByText('Max drift', { exact: true })).toBeVisible();
});

test('auto-detects a tiny Eggtimer file', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a flight log file').setInputFiles({ name: 'egg.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await reachesReport(page);
});

test('compare selection is capped at six flights', async ({ page }) => {
  await page.goto('/');
  const load = async (name: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };
  for (let i = 1; i <= 7; i++) await load(`cap-${i}.csv`);

  // Tick six; the seventh must then be disabled (the comparison cap is six).
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('checkbox', { name: `Select cap-${i}.csv to compare` }).check();
  }
  await expect(page.getByRole('checkbox', { name: 'Select cap-7.csv to compare' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Compare 6 flights/ })).toBeVisible();
});

test('the explorer exports the current plot as a PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('Save the current plot as a PNG').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/-explore\.png$/);
});

test('the comparison exports its chart as a PNG', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('Save the comparison chart as a PNG').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^compare-.*\.png$/);
});
