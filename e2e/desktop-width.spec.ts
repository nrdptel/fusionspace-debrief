import { test, expect } from '@playwright/test';
import path from 'node:path';

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

// Seven of the report's cards are a sentence and one small input — rail exit, drag Cd,
// ejection delay, main-deploy altitude, landing energy, parachute Cd, drogue Cd. Stacked
// full-width they were 1,232 px apiece on a 1440 px screen for a field you type three
// characters into, and 1,031 px of vertical scroll between the tiles and the recovery view.
// Three of the four recovery cards read off the SAME descending mass, so a flyer typed it
// into one and scrolled past two others that had quietly filled in.
test('the report’s figure cards sit side by side on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const lefts = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('div.grid')].find((d) => (d.textContent || '').includes('Landing energy'));
    if (!grid) return null;
    return [...grid.children].map((c) => Math.round(c.getBoundingClientRect().left));
  });
  expect(lefts).not.toBeNull();
  expect(lefts!.length).toBeGreaterThan(1);
  // More than one column: the shared mass and what it unlocks are in view together.
  expect(new Set(lefts!).size).toBeGreaterThan(1);
});

test('…and stack again on a phone, where two columns would not fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles(path.join(__dirname, '../lib/parsers/__fixtures__/altusmetrum-telemetrum.csv'));
  await expect(page.getByRole('heading', { name: /Flight report for/ })).toBeVisible();

  const lefts = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('div.grid')].find((d) => (d.textContent || '').includes('Landing energy'));
    return grid ? [...grid.children].map((c) => Math.round(c.getBoundingClientRect().left)) : null;
  });
  expect(new Set(lefts!).size).toBe(1);
});
