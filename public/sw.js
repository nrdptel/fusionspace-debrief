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
const ROUTES = ['/', '/compare/', '/stitch/', '/methods/', '/validation/', '/privacy/', '/changelog/'];

//  - each route's RSC payload (`/methods/index.txt`), which is what the App Router asks for
//    when the flyer taps an in-app link rather than reloading. Without it that fetch fails
//    offline, Next falls back to a browser navigation — to the payload URL — and the flyer
//    lands on `/methods/index.txt` looking at the home page. Stable across builds like the
//    documents, so they precache the same way.
// Every sample file, so "offline at the field" includes the demonstrations. Kept in step with
// `lib/samples.ts` by `lib/samples.test.ts`, which reads both and fails when they drift — a
// second sample that is not precached is a button that works at home and not at the range, and
// nothing else in the build would have said so.
const SAMPLE_FILES = [
  '/samples/sample-altusmetrum.csv',
  '/samples/sample-pnut.pf2',
  '/samples/sample-raven-fip.csv',
  '/samples/sample-blueraven.csv',
  '/samples/sample-blueraven.summary.csv',
  '/samples/sample-mapper.csv',
  '/samples/sample-saturated.csv',
  '/samples/sample-gps-tracker.csv',
  '/samples/sample-stage-booster.csv',
  '/samples/sample-stage-sustainer.csv',
  '/samples/sample-design-flight.csv',
  '/samples/sample-design.ork',
];

const PRECACHE = [
  ...SAMPLE_FILES,
  ...ROUTES,
  ...ROUTES.map((r) => `${r}index.txt`),
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

/** The same RSC payload address without the per-build `?_rsc=` cache-buster on the end. */
function stripRscBuster(href) {
  const url = new URL(href);
  url.searchParams.delete('_rsc');
  url.search = url.searchParams.toString();
  return url.href;
}

/** The same address with its trailing slash added or removed, for the cache lookup. */
function altSlashForm(href) {
  const url = new URL(href);
  url.pathname = url.pathname.endsWith('/') ? url.pathname.replace(/\/+$/, '') || '/' : `${url.pathname}/`;
  return url.href;
}

/**
 * The route a navigation is for, without its query — the key every page is cached under.
 *
 * The site is a static export: one HTML document per route, and the query string is read by
 * the app after it boots. `?ids=…` does not select a different document, it tells the
 * comparison which flights to load out of this device's own logbook. So a page keyed on the
 * full URL is keyed on something that isn't part of it.
 *
 * That was not academic. Every in-app address Debrief itself generates carries a query —
 * `/compare/?ids=…&u=i` (the permalink the app offers as "give this comparison an address"),
 * `/?u=m` (a shared link's units), `/?open=<id>` (read one flight from the compare surface)
 * — and offline every one of them missed the cache and got the "not available offline"
 * document, while the bare route beside it loaded fine. The whole promise is that one visit
 * with signal is enough and after that it works at the field with none; these were exactly
 * the addresses a flyer arrives by.
 *
 * Stripping on the way IN as well as the way out keeps one entry per route, so a season of
 * bookmarked permalinks can't quietly become a season of duplicate cached shells.
 */
function routeKey(href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  return url.href;
}

/**
 * An honest answer for a page that isn't in the cache and can't be fetched.
 *
 * Self-contained on purpose: it is served when the network is gone, so it can't reach a
 * stylesheet or a script, and it must not depend on the app booting. It names the address
 * that was asked for, says what is and isn't available, and links to the part of Debrief
 * that IS cached — reading a flight works offline, which is the whole reason the worker
 * exists. Status 503 rather than 200: this is not the page, and a bot or a reload should
 * know that.
 */
function offlineDocument(href) {
  let path = href;
  try {
    path = new URL(href).pathname;
  } catch {
    /* keep the raw string */
  }
  const safe = path.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — Debrief</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1.25rem;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #fafafa; color: #18181b; }
  main { max-width: 34rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; letter-spacing: -.01em; }
  p { margin: 0 0 .9rem; color: #52525b; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em;
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: .3rem; padding: .1rem .35rem; }
  a { display: inline-block; margin-top: .35rem; padding: .6rem 1rem; border-radius: .55rem;
    background: #4f46e5; color: #fff; text-decoration: none; font-weight: 500; }
  @media (prefers-color-scheme: dark) {
    body { background: #09090b; color: #fafafa; }
    p { color: #a1a1aa; }
    code { background: #18181b; border-color: #27272a; }
  }
</style></head><body><main>
<h1>This page isn&rsquo;t available offline</h1>
<p><code>${safe}</code> hasn&rsquo;t been opened on this device while online, so there is no copy of it stored here to show you.</p>
<p>Reading a flight still works with no signal &mdash; Debrief analyses your log on the device and never uploads it. Open Debrief and drop a file in; this page will be here next time you visit it with a connection.</p>
<a href="/">Open Debrief</a>
</main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** `key` is a Request or a URL string — navigations store under their route (see `routeKey`),
 *  everything else under its own request. */
async function putInCache(key, response) {
  try {
    const cache = await caches.open(CACHE);
    await cacheIfWhole(cache, key, response);
  } catch {
    /* quota, a cut-off body, or an uncacheable request — leave the cache as it was */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // The build marker is the one same-origin GET that must never come from the cache.
  // Everything else here is content-hashed or a page whose staleness costs one visit;
  // /version.json exists to answer "which commit is this?", and a cached copy would
  // answer that confidently and wrongly for as long as the cache lived. Left to the
  // network entirely: offline it simply fails, which is the honest answer — you cannot
  // know what the server is serving while you cannot reach it.
  if (url.pathname === '/version.json') return;

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
        // A route's RSC payload is not a page, and nobody navigates to one on purpose — it
        // is where Next's own fallback lands when the payload fetch fails. Serving the
        // cached .txt would render the raw payload; serving the shell would show the wrong
        // page. Send the flyer to the route the payload belongs to, which is where they
        // were going.
        if (url.pathname.endsWith('/index.txt')) {
          return Response.redirect(url.pathname.slice(0, -'index.txt'.length) || '/', 302);
        }
        // Keyed on the route, not on the address the flyer arrived by — see `routeKey`.
        const key = routeKey(request.url);
        const cached = await caches.match(key, MATCH);
        const network = fetch(request)
          .then((fresh) => {
            putInCache(key, fresh.clone());
            return fresh;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const fresh = await network;
        if (fresh) return fresh;
        // The site is built with trailingSlash, so `/methods` and `/methods/` are one page
        // and a server 308s between them. Offline there is no server, so the two forms have
        // to be reconciled here — a typed address or an old bookmark without the slash used
        // to miss the cache and fall through to the answer below.
        const alt = await caches.match(altSlashForm(key), MATCH);
        if (alt) return alt;
        // …and what used to be here was `caches.match('/')`: the home page, served under
        // whatever address was asked for. The app came up, which reads as success, while
        // showing the analyzer at the /methods/ URL — a page lying about which page it is,
        // at exactly the moment someone at the field with no signal wants to look a number
        // up. Say what happened instead.
        return offlineDocument(request.url);
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
        // An App Router link asks for the route's RSC payload with a per-build cache-buster
        // on the end — `/methods/index.txt?_rsc=ZmCQ44b9`. The precached copy has no query,
        // so an exact match misses it and the payload is only ever a network away; offline
        // that fetch fails, Next falls back to a browser navigation to the payload URL, and
        // the flyer lands on `/methods/index.txt`. The buster exists to defeat HTTP caches
        // across deploys, and this cache is rewritten on every install anyway, so matching
        // without it is safe and it is what makes an in-app link work with no signal.
        if (url.searchParams.has('_rsc')) {
          const noBuster = await caches.match(stripRscBuster(request.url), MATCH);
          if (noBuster) return noBuster;
        }
        return Response.error();
      }
    })(),
  );
});
