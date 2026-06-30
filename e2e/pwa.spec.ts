import { test, expect } from '@playwright/test';

// The launch-site case: install/open online once, then use it in the field with
// no signal. The service worker should let the app come up fully offline.

// A tiny auto-detecting flight (Eggtimer layout) built in memory, so the offline
// analysis test never touches the network for its input.
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

test('analyzes a dropped flight fully offline — the actual field promise', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  // Reload so the controlling worker has cached the shell and the page's JS.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();

  // Cut the network completely — this is the desert, no signal. Note we have NOT
  // analyzed anything online first, so the lazily-loaded analysis Web Worker chunk
  // isn't cached: this exercises the worst case (it must fall back to sync).
  await context.setOffline(true);

  // Drop a flight file (read via the File API — never the network) and it must
  // analyze all the way to a full report: headline metrics and a rendered chart.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'offline-flight.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // The chart JS came from the initial bundle, not a fresh fetch — it must draw.
  await expect(page.locator('.uplot canvas').first()).toBeVisible();

  await context.setOffline(false);
});

test('the sample flight works on a first offline visit (precached on install)', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Offline, and we have NOT opened the sample online first — the install-time
  // precache of the (stable-URL) sample is what makes this work.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Try a sample flight' }).click();
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await expect(page.getByText('Apogee', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await context.setOffline(false);
});
