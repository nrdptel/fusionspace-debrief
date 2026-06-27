import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const fixture = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Load two different real flights, then compare them from the recents list. This
// exercises the full multi-flight path: re-parse + re-analyze each saved file,
// align at liftoff, and render the side-by-side table and overlaid charts.
test('compare two flights from the recents list', async ({ page }) => {
  await page.goto('/');

  const load = async (file: string) => {
    await page.getByLabel('Choose a flight log file').setInputFiles(fixture(file));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  };

  await load('altusmetrum-telemetrum.csv');
  await load('featherweight-raven-fip.csv');

  await page.getByLabel('Select altusmetrum-telemetrum.csv to compare').check();
  await page.getByLabel('Select featherweight-raven-fip.csv to compare').check();
  await page.getByRole('button', { name: /Compare 2 flights/ }).click();

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();

  // The engineering metrics are in the table too.
  await expect(page.getByRole('rowheader', { name: 'Max Mach', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Max Q', exact: true })).toBeVisible();

  // Switch which quantity is overlaid across the flights, including the derived
  // engineering channels (Mach, dynamic pressure).
  await expect(page.getByRole('heading', { name: /Altitude/ })).toBeVisible();
  await page.getByRole('button', { name: 'Acceleration' }).click();
  await expect(page.getByRole('heading', { name: /Acceleration \(g\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mach', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mach', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dynamic pressure', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Dynamic pressure \((kPa|psi)\)/ })).toBeVisible();

  // Export the comparison — the chart data, the metrics table, and a PNG.
  const [dataCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save chart data' }).click(),
  ]);
  expect(dataCsv.suggestedFilename()).toMatch(/^compare-.*\.csv$/);
  const [metricsCsv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save metrics' }).click(),
  ]);
  expect(metricsCsv.suggestedFilename()).toBe('compare-metrics.csv');

  // The compare view should be accessible too.
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: /Back to a single flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

// Dropping (choosing) several files at once should import each and jump straight
// into the comparison, no recents round-trip needed.
test('choosing several files at once jumps straight to a comparison', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fixture('altusmetrum-telemetrum.csv'), fixture('featherweight-raven-fip.csv')]);

  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();
});
