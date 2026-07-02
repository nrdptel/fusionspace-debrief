import { test, expect } from '@playwright/test';

// Desktop content width. The analysis view (where the charts live) should use the
// wider container on large screens, while the landing page / prose stay focused.
// Guards the max-w-7xl report vs max-w-5xl chrome split from silently regressing.

test.use({ viewport: { width: 1440, height: 900 } });

const pageSpills = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('the landing page stays at the focused reading width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  // The upload dropzone (empty state) must not stretch across the wide container.
  const drop = page.getByLabel('Choose a flight log file').locator('xpath=ancestor::*[contains(@class,"max-w-5xl")][1]');
  const box = await drop.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(1040); // ~max-w-5xl (1024) + rounding
  expect(await pageSpills(page)).toBe(false);
});

test('the flight report uses the wider container so the charts get room', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  const canvas = page.locator('.uplot canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // Capped at max-w-5xl the altitude chart was ~942 px; the wider report frees it
  // well past 1024. (Sanity upper bound keeps it from stretching edge-to-edge.)
  expect(box!.width).toBeGreaterThan(1080);
  expect(box!.width).toBeLessThan(1400);
  expect(await pageSpills(page)).toBe(false);
});
