import { test, expect } from '@playwright/test';
import path from 'node:path';

// The whole pipeline in a real browser: load a flight, parse + analyze it
// client-side, and render the report with headline numbers.

test('the sample flight analyzes into a report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  // The report replaces the drop zone; the back-link confirms we're in it.
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  // Headline metric rendered.
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('uploading a file through the input analyzes it', async ({ page }) => {
  await page.goto('/');
  const sample = path.join(__dirname, '../public/samples/sample-altusmetrum.csv');
  await page.getByLabel('Choose a flight log file').setInputFiles(sample);

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Back to the drop zone resets cleanly.
  await page.getByRole('button', { name: /Analyze another flight/ }).click();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
});

test('the channel explorer overlays channels and plots any axis', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();

  await expect(page.getByRole('heading', { name: 'Explore the data' })).toBeVisible();

  // The live stats panel populates for the full flight before any zoom.
  await expect(page.getByText('Across the whole flight')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'mean' })).toBeVisible();

  // Overlay a second channel — velocity's unit differs from altitude's, so it
  // lands on a second (right) axis. This exercises the dual-axis uPlot path.
  await page.getByLabel('Add a channel to the plot').selectOption({ label: 'Velocity' });
  await expect(page.getByText(/Right axis:/)).toBeVisible();
  await expect(page.locator('.uplot canvas').first()).toBeVisible();

  // Put a channel on the X axis (not time) — the path note appears.
  await page.getByLabel('X axis channel').selectOption({ label: 'Altitude (AGL)' });
  await expect(page.getByText(/Plotting against another channel/)).toBeVisible();

  expect(errors).toEqual([]);
});
