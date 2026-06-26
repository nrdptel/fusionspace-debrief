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
