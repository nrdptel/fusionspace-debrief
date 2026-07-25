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
  '/compare/',
  '/methods/',
  '/validation/',
  '/privacy/',
];

/**
 * Store a response only if its body actually arrived whole.
 *
 * `res.ok` says the HEADERS were fine; it says nothing about the body, and a fetch whose
 * stream is cut short still yields an ok response carrying a partial document. Cached, that
 * is worse than caching nothing: the page then loads offline with a complete <head> and a
 * truncated <body> — the right title, `readyState: complete`, and half the content missing —
 * and it stays that way until the cache is replaced. CI caught exactly that shape on a
 * precached docs page (controlled: true, cached: true, complete, correct title, no <h1>),
 * intermittently and never reproducibly, which is what a race on a response body looks like.
 *
 * Reading the body to the end forces the failure to happen HERE, where it can be caught, and
 * comparing against Content-Length rejects a short read that didn't throw.
 */
async function cacheIfWhole(cache, key, res) {
  if (!res || !res.ok || res.type === 'opaque') return null;
  const body = await res.arrayBuffer();
  const stated = res.headers.get('content-length');
  if (stated && Number(stated) !== body.byteLength) return null;
  await cache.put(key, new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
  return body;
}

/**
 * The build's own assets a document names — its script chunks and stylesheet.
 *
 * A cached document is not a page that comes up. Next hydrates every route, and when a
 * route's JavaScript isn't there the App Router swaps the whole page for its error
 * boundary: the flyer at the field gets "Something went sideways" from a document that
 * cached perfectly. Those chunks used to reach the cache only if the router had prefetched
 * the link while online — so the offline promise depended on whether a prefetch had
 * finished, which is a race, and it lost on CI more than once.
 *
 * Read out of the precached HTML rather than from a build manifest: the names are
 * content-hashed and change every deploy, and a manifest is a second list to drift. The
 * document and the chunks it names are cached in the same install, from the same bytes.
 */
function assetUrlsIn(html) {
  const urls = new Set();
  const re = /(?:src|href)="(\/_next\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[1].replace(/&amp;/g, '&'));
  return urls;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One at a time rather than addAll: that rejects the whole batch if any single
      // request fails, which would lose the sample flight to a moved doc page.
      const assets = new Set();
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
            const body = await cacheIfWhole(cache, url, res);
            // A route's document is only half of it — collect the chunks it needs to come up.
            if (body && url.endsWith('/')) {
              for (const a of assetUrlsIn(new TextDecoder().decode(body))) assets.add(a);
            }
          } catch {
            /* offline at install — runtime caching and the page's warm-up pick it up */
          }
        }),
      );
      await Promise.all(
        [...assets].map(async (url) => {
          if (await cache.match(url, { ignoreVary: true })) return;
          try {
            const res = await fetch(url, { credentials: 'same-origin' });
            await cacheIfWhole(cache, url, res);
          } catch {
            /* same as above: a chunk that can't be fetched now is picked up at runtime */
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
            await cacheIfWhole(cache, href, res);
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
  try {
    const cache = await caches.open(CACHE);
    await cacheIfWhole(cache, request, response);
  } catch {
    /* quota, a cut-off body, or an uncacheable request — leave the cache as it was */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // Navigations: serve the cached page immediately where there is one, and refresh it in
  // the background. This used to try the network first and fall back only when the fetch
  // failed, which makes every offline navigation wait for a network attempt to give up
  // before showing a page that was in the cache the whole time. At the field, where every
  // navigation is offline, that was never the right order.
  //
  // (It was also once believed to be the cause of a CI failure on an offline docs page.
  // It wasn't — the page turned out to be loading a *truncated* cached body, see
  // `cacheIfWhole` — but cache-first is the right shape here on its own merits.)
  //
  // The freshness this gives up is one visit: the page loads from cache while the same
  // request goes to the network and updates it, and a deploy also brings a new worker whose
  // install refreshes all of these outright.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, MATCH);
        const network = fetch(request)
          .then((fresh) => {
            putInCache(request, fresh.clone());
            return fresh;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return (await network) || (await caches.match('/', MATCH)) || Response.error();
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
