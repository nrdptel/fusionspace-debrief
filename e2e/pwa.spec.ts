import { test, expect } from '@playwright/test';

// The launch-site case: install/open online once, then use it in the field with
// no signal. The service worker should let the app come up fully offline.

test('the web manifest is linked for installability', async ({ page }) => {
  await page.goto('/');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBeTruthy();
  const res = await page.request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test('the app loads offline after a first online visit', async ({ page, context }) => {
  await page.goto('/');
  // Wait for the service worker to install, activate and take control.
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  // Reload so the controlling worker caches the shell and its assets.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();

  // Now cut the network and reload — it must still come up from the cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
  await context.setOffline(false);
});
