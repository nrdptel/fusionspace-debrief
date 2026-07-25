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
  // A second visit, which is the easy case: the worker is in control from the first byte
  // and caches everything it serves. (The hard case — one visit only — is the test below.)
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
  // A second visit, so the worker has served (and cached) the shell and the page's JS.
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

// The promise is "open it once, then use it in the field" — ONE online visit, not two. On a
// first visit the shell, the chunks and the CSS are fetched before the worker exists, so it
// never sees those requests: Debrief used to come up with a browser error page here, which
// is no use to someone who opened it at home and drove somewhere with no signal.
test('comes up offline after a single online visit — no second visit needed', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  // The page hands the worker what it loaded, so wait for the cache to hold the whole shell
  // — the document AND the app's own JavaScript — rather than only the precached sample
  // flight. Waiting for the document alone let the network be cut mid-warm-up, which tests a
  // race rather than the promise; a flyer walking out of signal has minutes, not 200 ms.
  await page.waitForFunction(
    async () => {
      for (const k of await caches.keys()) {
        const urls = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
        if (urls.includes('/') && urls.some((u) => u.endsWith('.js')) && urls.some((u) => u.endsWith('.css'))) return true;
      }
      return false;
    },
    null,
    { timeout: 20000 },
  );

  // No second online visit. Cut the network and reload.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Debrief', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a sample flight' })).toBeVisible();
  // And it still works, not just paints.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'field.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
  await context.setOffline(false);
});

// At the field with no signal, "what does this number mean?" is a real question — so the
// docs have to come up too, and as themselves. They used to fall back to the cached "/",
// which meant the app appeared but showed the home page at the /methods/ URL.
test('the methods and validation pages come up offline, as themselves', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  // The static routes are precached on install (their URLs are stable across builds, unlike
  // the hashed chunks), so wait for them to land rather than visiting them first — EVERY one
  // this test then opens, not just the first. They are fetched in parallel, so /methods/
  // arriving says nothing about /validation/: waiting on one and cutting the network was a
  // race that passed locally and failed on CI, which is the same mistake in test-shaped form
  // as cutting the network mid-warm-up.
  await page.waitForFunction(
    async () => {
      for (const k of await caches.keys()) {
        const cache = await caches.open(k);
        const all = await Promise.all(
          ['/methods/', '/validation/'].map((u) => cache.match(new URL(u, location.href).href, { ignoreVary: true })),
        );
        if (all.every(Boolean)) return true;
      }
      return false;
    },
    null,
    { timeout: 20000 },
  );

  await context.setOffline(true);
  // Neither page has been visited in this browser.
  const methods = await context.newPage();
  await methods.goto('/methods/');
  await expect(methods.getByRole('heading', { name: 'Where the numbers come from', level: 1 })).toBeVisible();

  const validation = await context.newPage();
  await validation.goto('/validation/');
  await expect(validation.getByRole('heading', { name: 'How Debrief is validated', level: 1 })).toBeVisible();
  await context.setOffline(false);
});
