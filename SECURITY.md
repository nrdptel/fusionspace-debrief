# Security Policy

This is a hobby project, but security reports are very welcome.

## Reporting a vulnerability

Please **report privately** — do not open a public issue for security problems.

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/nrdptel/fusionspace-debrief/security/advisories/new)

Please include steps to reproduce and the impact you observed. I'll acknowledge
as soon as I can and work on a fix; since this is a side project, response times
are best-effort.

## Scope

Debrief is a fully static, client-side web app: flight files are parsed and
analyzed entirely in your browser and are never uploaded. There is no backend,
no server, and no API.

In scope: the web app itself — the file parsers and analysis, the
share-by-link encoding/decoding (which packs a flight into the URL fragment),
and the static export's security headers (`public/_headers`).

Out of scope: the hosting platform (Cloudflare Pages) — report those to the
vendor. A logger whose numbers Debrief reads incorrectly is a data/parsing bug,
not a security issue — please use the bug-report template for that.

## Known advisories

`npm audit` reports a **moderate** advisory in `postcss`, pulled in transitively
by Next.js. It concerns PostCSS's CSS *stringify* output and only affects
**build-time** processing of CSS. This project builds only its own first-party
Tailwind CSS (no untrusted CSS is processed), so there is no runtime exposure.
There is no fix available in the current Next.js major; it will clear when a
Next.js release bundles a patched PostCSS. Tracked, not a release blocker.
