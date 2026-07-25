// Debrief service worker — makes the app usable offline at the launch site,
// where there's often no signal. Runtime caching only (no precache manifest to
// drift out of date): once the app has been opened online, its shell, code and
// the sample flight are cached, so a later offline visit still works.
//
// Strategy: navigations are network-first (an online visit is always fresh, an
// offline one falls back to the cached page or the app root); other same-origin
// GETs are cache-first (Next's assets are content-hashed, so a new build fetches
// new URLs and old ones are pruned on activate). Cross-origin requests are left
// untouched. The whole point — like the rest of Debrief — is that nothing leaves
// the device; this only stores responses locally so it keeps working without a
// network.

const CACHE = 'debrief-runtime-v1';

// What's worth precaching on install: URLs that are stable across builds, unlike the
// content-hashed app chunks (a manifest of those drifts out of date on every deploy, which
// is why there isn't one).
//  - the bundled sample flight, so "Try a sample flight" works on a first *offline* visit;
//  - every static route's own document. Without them, a route the flyer never visited falls
//    back to the cached "/" — so the app came up, but showing the home page at the
//    /methods/ URL, which is a small lie at exactly the moment someone at the field with no
//    signal wants to look up what a number means.
const PRECACHE = [
  '/samples/sample-altusmetrum.csv',
  '/',
  '/methods/',
  '/validation/',
  '/privacy/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One at a time rather than addAll: that rejects the whole batch if any single
      // request fails, which would lose the sample flight to a moved doc page.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
            if (res.ok) await cache.put(url, res);
          } catch {
            /* offline at install — runtime caching and the page's warm-up pick it up */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

// Warm the cache with what a page actually loaded. The first visit is the problem this
// solves: the shell, the chunks and the CSS are all fetched BEFORE this worker takes
// control, so it never sees those requests and caches none of them — leaving a flyer who
// opened Debrief once at home with nothing offline at the field, which is the one place it
// has to work. Rather than a precache manifest of content-hashed chunk names (which drifts
// out of date on every build), the page tells the worker what it just used; it knows
// exactly. Only same-origin GETs already missing from the cache are fetched, so a warmed
// visit costs nothing. Nothing here leaves the device — it stores Debrief's own static
// assets locally, and never touches a flight log.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const wanted = [];
      for (const raw of data.urls.slice(0, 200)) {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          continue;
        }
        if (url.origin !== self.location.origin) continue;
        if (await cache.match(url.href, MATCH)) continue;
        wanted.push(url.href);
      }
      await Promise.all(
        wanted.map(async (href) => {
          try {
            const res = await fetch(href, { credentials: 'same-origin' });
            if (res.ok) await cache.put(href, res);
          } catch {
            /* offline again, or gone — runtime caching will pick it up next time */
          }
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Cache lookups ignore Vary. Both this host and Cloudflare send `Vary: Accept-Encoding` on
// the shell and the assets, and the copies this worker stores are fetched by the worker —
// whose Accept-Encoding needn't match the page's. With Vary honoured, that mismatch makes a
// cached shell invisible to the very navigation it was stored for, which shows up as an
// offline reload failing with ERR_FAILED even though the cache holds the page. Only one
// representation of each same-origin asset is ever stored, so ignoring Vary can't serve the
// wrong thing.
const MATCH = { ignoreVary: true };

async function putInCache(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  try {
    await cache.put(request, response);
  } catch {
    /* quota or uncacheable request — ignore */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          putInCache(request, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(request, MATCH)) || (await caches.match('/', MATCH)) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, MATCH);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        putInCache(request, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
