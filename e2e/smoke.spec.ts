import { test, expect } from '@playwright/test';

// A clean load of the home page: the brand and drop zone render, and nothing
// throws to the console during hydration.
test('home loads cleanly with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { level: 1, name: 'Debrief' })).toBeVisible();
  await expect(page.getByLabel('Flight log drop zone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  expect(errors).toEqual([]);
});

// The parent-brand eyebrow and footer lockup both point at the Fusion Space hub.
test('brand eyebrow links to the Fusion Space hub', async ({ page }) => {
  await page.goto('/');
  const eyebrow = page.getByRole('link', { name: 'Fusion Space' }).first();
  await expect(eyebrow).toHaveAttribute('href', 'https://fusionspace.co');
});

// Privacy is reachable from the footer and renders its own page.
test('privacy page is reachable from the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
});
