// The static server the e2e suite runs against, and the one to use for a manual walk of a
// build. It serves `out/` — the same static export Cloudflare Pages serves — and applies the
// security headers from `public/_headers` so a local walk sees what production sends.
//
// It replaces `npx serve`, which could not survive this suite. `serve` opens a ReadStream per
// request and holds the descriptor until the response drains; at ~195 tests against a 4096-fd
// container that reliably ran out PART-WAY THROUGH a run — `EMFILE: too many open files` on a
// chunk request — and every test after the crash failed with `ERR_CONNECTION_REFUSED`. The
// failures all named something else, so the cluster read as a code regression rather than a
// dead web server; diagnosing it meant reading the `[WebServer]` lines each time. The whole
// export is 3.4 MB across 57 files, so this reads each file once and answers from memory:
// one open per file while nothing changes, and the class of failure is gone rather than
// pushed back.
//
// The whole point being a server that does not fall over, EVERY request is answered inside a
// try/catch and the process installs handlers for the errors an http server can still take:
// a request that kills this one is the exact bug it exists to end.
//
// Routing matches the static export's own shape (`trailingSlash: true`, so every route is a
// directory with an `index.html`) and what the incumbent answered, measured address by
// address before the swap:
//
//   /            → out/index.html                 200
//   /compare/    → out/compare/index.html         200
//   /compare     → out/compare/index.html         200   (no redirect; the export has no /compare.html)
//   /index.txt   → out/index.txt                  200
//   /anything.html → 301 to the extensionless path, query string carried through
//   /nope/       → out/404.html                   404
//
// Usage: node scripts/e2e-server.mjs [port]   (default 3000; PORT is honoured too)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../out', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3000);

// Emulated from public/_headers, which is what Cloudflare applies to the deployed site. Only
// the site-wide security block: the Cache-Control rules in that file are deliberately NOT
// emulated, because the incumbent didn't send them either and the offline/PWA specs are
// written against what a run actually sees.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// Content types for everything the export actually contains. An extension that isn't here
// gets no Content-Type at all, which is what the incumbent did (`out/_headers` is served
// bare), and `nosniff` above keeps that from being a security question.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** Files already read, keyed by absolute path, with the stat they were read at. A miss is
 *  cached too (`body: null`), so a 404 storm re-stats rather than re-reads.
 *
 *  Revalidated by mtime+size on every request rather than held for the process lifetime.
 *  Under the suite the export never changes — the build that produced it finished before the
 *  server started — but `npm run serve:out` is the documented way to walk a build BY HAND,
 *  and a rebuild under a running server would otherwise serve a stale `index.html` asking for
 *  hashed chunks that no longer exist. A mixed build reads as an app bug. A `stat` opens no
 *  descriptor, so revalidating costs nothing that matters here. */
const cache = new Map();

async function load(abs) {
  let st = null;
  try {
    st = await stat(abs);
    if (!st.isFile()) st = null;
  } catch {
    st = null;
  }
  const hit = cache.get(abs);
  if (hit && hit.mtimeMs === (st ? st.mtimeMs : null) && hit.size === (st ? st.size : null)) return hit.body;
  let body = null;
  if (st) {
    try {
      body = await readFile(abs);
    } catch {
      body = null;
    }
  }
  cache.set(abs, { body, mtimeMs: st ? st.mtimeMs : null, size: st ? st.size : null });
  return body;
}

/** Whether an absolute path is inside out/. Applied to every candidate rather than only to
 *  the one derived straight from the URL: `${abs}.html` is built AFTER the request path is
 *  normalised, and for a request of `/` it names `out.html` — a sibling of the served
 *  directory, outside the root this is supposed to bound. */
const inRoot = (abs) => abs === ROOT || abs.startsWith(ROOT + sep);

/** Resolve a request path to a file inside out/, or null. Mirrors the export's layout:
 *  an exact file, then `<path>.html`, then `<path>/index.html`. A directory with no
 *  index.html is a miss — nothing in the app or the suite asks for one. */
async function resolveFile(pathname) {
  const abs = resolve(join(ROOT, pathname));
  if (!inRoot(abs)) return null; // path traversal; `resolve` has already normalised `..`
  for (const candidate of [abs, `${abs}.html`, join(abs, 'index.html')]) {
    if (!inRoot(candidate)) continue;
    const body = await load(candidate);
    if (body) return { body, ext: extname(candidate) };
  }
  return null;
}

const server = createServer(async (req, res) => {
  const send = (status, body, ext, extra) => {
    if (res.headersSent) return;
    const type = TYPES[ext];
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      ...(type ? { 'Content-Type': type } : {}),
      'Content-Length': body.length,
      ...extra,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(405, Buffer.from('Method not allowed'), '.txt', { Allow: 'GET, HEAD' });
    }

    let url;
    try {
      url = new URL(req.url, `http://localhost:${PORT}`);
    } catch {
      return send(400, Buffer.from('Bad request'), '.txt');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(400, Buffer.from('Bad request'), '.txt'); // malformed percent-encoding
    }

    // `/x.html` → `/x`, the one redirect the incumbent performed. Nothing in the app links
    // this way; it is here so an address typed by hand behaves the same as it used to. The
    // target is re-encoded and keeps its query — a header value has to be Latin-1 or Node
    // throws `ERR_INVALID_CHAR` and, in an async handler, takes the whole process with it
    // (`/%E6%97%A5.html` was enough), and a clean-URL redirect that drops `?ids=…` silently
    // loses the payload of the permalink being walked.
    if (pathname.endsWith('.html')) {
      const target = new URL(url);
      target.pathname = pathname.slice(0, -'.html'.length);
      return send(301, Buffer.alloc(0), undefined, { Location: target.pathname + target.search });
    }

    const hit = await resolveFile(pathname);
    if (hit) return send(200, hit.body, hit.ext);

    const notFound = await load(join(ROOT, '404.html'));
    return send(404, notFound ?? Buffer.from('Not found'), notFound ? '.html' : '.txt');
  } catch (e) {
    // Answer, and stay up. A 500 on one address is a finding; a dead server is 190 tests
    // failing with `ERR_CONNECTION_REFUSED` and pointing everywhere but here.
    console.error(`e2e-server: ${req.method} ${req.url} →`, e);
    try {
      send(500, Buffer.from('Internal error'), '.txt');
    } catch {
      res.destroy();
    }
  }
});

// A malformed request line or header must not be fatal either.
server.on('clientError', (_e, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  else socket.destroy();
});
process.on('uncaughtException', (e) => console.error('e2e-server: uncaught', e));
process.on('unhandledRejection', (e) => console.error('e2e-server: unhandled rejection', e));

server.listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
});
