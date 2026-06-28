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

self.addEventListener('install', () => {
  self.skipWaiting();
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
          return (await caches.match(request)) || (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
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
