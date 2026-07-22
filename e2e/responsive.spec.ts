import { test, expect } from '@playwright/test';
import path from 'node:path';

// Real phone widths. 360px is the most common Android viewport (narrower than
// the 375px iPhone), so it's the honest worst case. Nothing should spill the page
// sideways on any surface — the wide tables (mapper, comparison) are allowed to
// scroll inside their own boxes, but the page must not.

const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
const WIDTH = 360;

test.use({ viewport: { width: WIDTH, height: 760 } });

/** True if the document scrolls horizontally (the failure we're guarding). */
const pageSpills = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('the landing page fits the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the flight report fits the viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the report toolbar keeps the primary actions in view on a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Copy / Share / Print / Units stay directly in view; the many file-format saves move
  // into their own labelled strip (which scrolls aside) instead of stacking four rows
  // deep and burying the flight's own numbers.
  await expect(page.getByRole('button', { name: 'Copy summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await expect(page.getByText('Save a file:')).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the column mapper fits the viewport (wide table scrolls in its box)', async ({ page }) => {
  await page.goto('/');
  const csv =
    'elapsed,height,speed\n' +
    Array.from({ length: 20 }, (_, i) => `${(i * 0.1).toFixed(1)},${i * 5},${i * 3}`).join('\n');
  await page.getByLabel('Choose a flight log file').setInputFiles({
    name: 'a-deliberately-long-mystery-logger-filename.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole('heading', { name: 'Map the columns' })).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});

test('the comparison view fits the viewport (wide table scrolls in its box)', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles([fx('altusmetrum-telemetrum.csv'), fx('featherweight-raven-fip.csv')]);
  await expect(page.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  expect(await pageSpills(page)).toBe(false);
});
