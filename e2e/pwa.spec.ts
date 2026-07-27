import { test, expect, devices } from '@playwright/test';
import path from 'node:path';

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
// The comparison surface is where a launch day gets read, which is exactly the moment
// there is no signal. Offline it has to do more than render: it has to hydrate and reach
// the on-device logbook, or a flyer at the field is told their logbook is empty.
test('the compare surface works offline, with the logbook it can reach', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });

  // Remember a flight, so there is something for the offline surface to find.
  await page
    .getByLabel('Choose a flight log file')
    .setInputFiles({ name: 'field.csv', mimeType: 'text/csv', buffer: Buffer.from(eggtimerCsv()) });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();

  // Wait for the install to FINISH, not just for this one URL to land — the precached URLs
  // are fetched in parallel, and cutting the network while the rest are in flight interrupts
  // an install that hasn't completed.
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || reg.installing || reg.waiting || !reg.active) return false;
      for (const k of await caches.keys()) {
        const cache = await caches.open(k);
        if (await cache.match(new URL('/compare/', location.href).href, { ignoreVary: true })) return true;
      }
      return false;
    },
    null,
    { timeout: 20000 },
  );
  // …and give the header's link the chance to prefetch the route's own JS, which is what
  // makes the page interactive rather than a static shell.
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  const compare = await context.newPage();
  await compare.goto('/compare/');
  await expect(compare.getByRole('heading', { name: 'Compare flights', level: 1 })).toBeVisible();
  // Hydrated and reading IndexedDB with no network: the flight is there to pick.
  await expect(compare.getByText('field.csv', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('the methods and validation pages come up offline, as themselves', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  // The static routes are precached on install (their URLs are stable across builds, unlike
  // the hashed chunks), so wait for that rather than visiting them first. Waiting on the two
  // URLs this test opens is NOT enough, and CI proved it: the install fetches every precached
  // URL in parallel, so those two can land while the rest are still in flight, and cutting
  // the network there interrupts an install that hasn't finished. The precondition this test
  // actually needs is "the worker has finished installing" — which is what is waited for.
  // (Adding a sixth precache URL widened the gap between the two conditions and turned an
  // ever-green test red twice on CI while passing every local run.)
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || reg.installing || reg.waiting || !reg.active) return false;
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
  // Neither page has been visited in this browser. Both are opened, because whatever went
  // wrong here on CI hit the SECOND one — the first came up fine — and a test that stops at
  // the first proves nothing about the state that mattered.
  //
  // Each assertion carries the page's own account of itself, so a failure on a machine this
  // cannot be reproduced on arrives already diagnosed: was the worker controlling the page,
  // was the document in the cache, and what did the page end up showing?
  const open = async (path: string, heading: string) => {
    const page = await context.newPage();
    await page.goto(path).catch(() => {
      /* a navigation that never resolves is itself the finding — read the state below */
    });
    const diag = await page.evaluate(async (p) => {
      const keys = await caches.keys();
      let cached = false;
      for (const k of keys) {
        const c = await caches.open(k);
        if (await c.match(new URL(p, location.href).href, { ignoreVary: true })) cached = true;
      }
      return {
        controlled: !!navigator.serviceWorker.controller,
        cached,
        readyState: document.readyState,
        title: document.title,
        // The h1s actually on the page. A cached document that loads with the right title
        // and the WRONG h1 is the error boundary — hydration failed, most likely because
        // this route's JS chunk wasn't cached — which looks nothing like a truncated body
        // or a worker that hadn't settled, and the two are indistinguishable without this.
        h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()),
        bodyChars: document.body?.innerText.length ?? 0,
      };
    }, path);
    await expect(
      page.getByRole('heading', { name: heading, level: 1 }),
      `${path} offline — ${JSON.stringify(diag)}`,
    ).toBeVisible();
  };

  await open('/methods/', 'Where the numbers come from');
  await open('/validation/', 'How Debrief is validated');
  await context.setOffline(false);
});

// The whole field promise, end to end, in the state a flyer is actually in: a phone, no
// signal at all, and a launch day already in the logbook from home. Each piece of this is
// covered above; nothing covered the journey, and the journey is the product.
test('a launch day reads and compares on a phone with no signal', async ({ browser }) => {
  test.setTimeout(120_000);
  const fx = (f: string) => path.join(__dirname, '../lib/parsers/__fixtures__', f);
  const ctx = await browser.newContext(devices['Pixel 7']);
  const page = await ctx.newPage();

  // At home, with signal: read two flights, so the logbook holds a launch day.
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20000 });
  for (const f of ['altusmetrum-telemetrum.csv', 'featherweight-raven-fip.csv']) {
    await page.getByLabel('Choose a flight log file').setInputFiles(fx(f));
    await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible();
    await page.getByRole('button', { name: /Analyze another flight/ }).click();
  }
  // Visit the comparison surface once online, as a flyer would before leaving.
  await page.goto('/compare');
  await expect(page.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await ctx.setOffline(true);

  // At the field: open the comparison surface cold and build a comparison with a thumb.
  const field = await ctx.newPage();
  await field.goto('/compare/');
  await expect(field.getByRole('heading', { name: 'Compare flights' })).toBeVisible();
  await field.getByLabel('Select altusmetrum-telemetrum.csv to compare').check();
  await field.getByLabel('Select featherweight-raven-fip.csv to compare').check();
  await field.getByRole('button', { name: /Compare 2 flights/ }).click();
  await expect(field.getByRole('heading', { name: 'Comparing 2 flights' })).toBeVisible({ timeout: 30000 });
  await expect(field.getByRole('rowheader', { name: 'Apogee', exact: true })).toBeVisible();

  // …and read one of them on its own, from the same logbook, still with no signal.
  const one = await ctx.newPage();
  await one.goto('/');
  await expect(one.getByRole('heading', { name: 'Recent flights' })).toBeVisible();
  await one.getByRole('button', { name: /altusmetrum-telemetrum\.csv/ }).first().click();
  await expect(one.getByRole('heading', { name: /Flight report for/ })).toBeVisible({ timeout: 30000 });
  // Nothing about the phone layout pushes past the viewport while doing it.
  const overflow = await one.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the report must not scroll sideways on a phone').toBeLessThanOrEqual(0);

  await ctx.setOffline(false);
  await ctx.close();
});

// A cached document is not a page that comes up. Next hydrates every route, and a route
// whose JavaScript is missing gets swapped for the App Router's error boundary — the flyer
// at the field reads "Something went sideways" off a document that cached perfectly. Those
// chunks used to reach the cache only if the router had prefetched the link while online,
// which is a race, and it is the race that has taken this suite red on CI more than once.
// The worker now reads each precached document for the assets it names and caches those in
// the same install. This asserts that directly, because the symptom is intermittent and the
// cause is not.
test('installing the worker caches the chunks each docs page needs, not just its HTML', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg && !reg.installing && !reg.waiting && !!reg.active;
    },
    null,
    { timeout: 20000 },
  );

  // Read /methods/ out of the cache, take the asset URLs it names, and require every one of
  // them to be cached too — the same list the worker read, checked independently.
  const missing = await page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const cache = await caches.open(k);
      const doc = await cache.match(new URL('/methods/', location.href).href, { ignoreVary: true });
      if (!doc) continue;
      const html = await doc.text();
      const named = [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      if (named.length === 0) return ['NO ASSETS NAMED BY THE DOCUMENT'];
      const out: string[] = [];
      for (const u of named) {
        if (!(await cache.match(new URL(u, location.href).href, { ignoreVary: true }))) out.push(u);
      }
      return out;
    }
    return ['NO CACHED /methods/ DOCUMENT'];
  });
  expect(missing).toEqual([]);
});

// Waiting for the install to finish, not just for the worker to control the page — the
// precache fetches every route in parallel and cutting the network mid-install is how this
// suite has gone red on CI before. Waits on the LAST thing installed, so the whole set is in.
async function precacheReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, {
    timeout: 20000,
  });
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || reg.installing || reg.waiting || !reg.active) return false;
      for (const k of await caches.keys()) {
        const cache = await caches.open(k);
        const all = await Promise.all(
          ['/methods/', '/privacy/', '/methods/index.txt'].map((u) =>
            cache.match(new URL(u, location.href).href, { ignoreVary: true }),
          ),
        );
        if (all.every(Boolean)) return true;
      }
      return false;
    },
    null,
    { timeout: 20000 },
  );
}

test('an offline page is the page its address names, or says it is missing', async ({ page, context }) => {
  await page.goto('/');
  await precacheReady(page);
  await context.setOffline(true);

  // The site is built with trailingSlash, so a server 308s /validation to /validation/.
  // Offline there is no server: this form used to miss the cache and fall through to the
  // shell, which came up as the ANALYZER under the /validation address — the app looking
  // like it worked while showing the wrong page.
  await page.goto('/validation', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'How Debrief is validated', level: 1 })).toBeVisible();

  // And a route that genuinely was never opened says so, names the address, and offers the
  // part of Debrief that does work with no signal — instead of silently showing the home page.
  const res = await page.goto('/some/route/never/visited/', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBe(503);
  await expect(page.getByRole('heading', { name: /isn’t available offline/, level: 1 })).toBeVisible();
  await expect(page.getByText('/some/route/never/visited/')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Debrief' })).toBeVisible();
});

test('an in-app link still navigates offline, instead of landing on the RSC payload', async ({ page, context }) => {
  await page.goto('/');
  await precacheReady(page);
  await context.setOffline(true);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The App Router fetches `/methods/index.txt?_rsc=<per-build buster>` for this. Without
  // that payload cached, the fetch fails, Next falls back to a browser navigation — to the
  // payload URL — and the flyer ends up at /methods/index.txt looking at the home page.
  await page.getByRole('link', { name: /methods/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Where the numbers come from', level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/methods/');
});

// The build marker. The site is a static export on a CDN with content-hashed asset
// names, so without this there is nothing in the served output that says which commit
// is live — and comparing chunk names against a local build does not answer it, because
// an identical source tree builds to different hashes in CI than it does locally.
test('the deployed build says which commit it is', async ({ page }) => {
  const res = await page.request.get('/version.json');
  expect(res.ok()).toBeTruthy();
  const v = await res.json();
  // A marker that cannot identify the build is worse than none, so require the fields
  // rather than accepting whatever the stamp happened to write.
  expect(typeof v.commit).toBe('string');
  expect(v.commit.length).toBeGreaterThan(6);
  expect(v.short).toBe(v.commit.slice(0, 7));
  expect(Number.isFinite(Date.parse(v.builtAt))).toBe(true);
});

test('the build marker is never served from the cache', async ({ page, context }) => {
  // A stale version marker answers "which commit is this?" confidently and wrongly, so the
  // service worker leaves /version.json to the network.
  //
  // The order here is the whole test. Every other same-origin GET is cache-first, so a
  // worker WITHOUT the bypass would cache this response the first time it is fetched — and
  // only then does going offline tell the two apart. Checking straight after page load
  // proves nothing, because nothing requests /version.json during a normal load, so it is
  // absent from the cache either way. (Written the useless way first, and caught by
  // deleting the bypass and watching the test still pass.)
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  const online = await page.evaluate(() => fetch('/version.json').then((r) => r.ok));
  expect(online).toBe(true);

  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const k of keys) {
      const c = await caches.open(k);
      if (await c.match('/version.json')) return true;
    }
    return false;
  });
  expect(cached).toBe(false);

  await context.setOffline(true);
  const offline = await page.evaluate(() =>
    fetch('/version.json')
      .then((r) => (r.ok ? 'served-anyway' : `status-${r.status}`))
      .catch(() => 'network-error'),
  );
  await context.setOffline(false);
  // Offline it simply fails, which is the honest answer — you cannot know what the server
  // is serving while you cannot reach it.
  expect(offline).toBe('network-error');
});
