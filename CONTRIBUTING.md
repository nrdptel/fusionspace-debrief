# Contributing

Thanks for your interest! This is a personal hobby project, but issues and PRs
are welcome — especially new altimeter/format parsers and fixes to existing ones.

## Project layout

Debrief is a single, fully static Next.js app (no backend). Everything runs in
the browser.

- `app/` — the Next.js App Router pages, root layout, and global styles. Each
  surface is its own static route: `/` reads one flight, `/compare` lines several
  up from the logbook (`?ids=…`), and `/methods`, `/validation`, `/privacy` are
  the write-ups. A page is a thin shell: chrome plus one client component.
- `components/` — the UI: drop zone, column mapper, flight report, charts.
  `useLogbook` owns the on-device logbook for every surface that shows it, so
  the two flight surfaces can't drift apart about what's in it.
- `lib/parsers/` — the format registry. Each parser `detect()`s a file and
  `parse()`s it into a raw flight; `importFlight()` picks the best match.
- `lib/ingest` — what a *dropped folder* means: which files are flights, which need the
  column mapper, which are a device summary and which can't be used. Both surfaces that
  take a drop read it through this, so they can't disagree about a launch day.
- `lib/reopen` — re-reading a flight the logbook holds, applying a hand-made column mapping
  where it has one. Every surface that reopens a flight goes through it.
- `lib/mapped` — the other half of that pair: turning a mapping the flyer just confirmed into
  an analysed flight and a logbook entry `reopen` can read back. Both surfaces that open the
  column mapper — the analyze page and the comparison — go through it, so they can't drift on
  the format label, the stored mapping shape, or what the entry carries.
- `lib/analyze/` — the analysis pipeline (spike rejection, event detection,
  apogee/velocity/descent rates).
- `lib/flight/`, `lib/units`, `lib/share`, `lib/report` — the canonical flight
  model, unit conversions, share-by-link, and text/CSV export.
- `lib/readings` — the readings a single flight shows on screen, as data. It is a
  sibling of `report`'s `headlineRows` on purpose: the page and the saved report
  format a reading differently but must never disagree about which readings exist,
  and `lib/readings.test.ts` holds the two lists side by side and fails when they
  drift. Add a reading to both, or add it to one and say why in that test.

## Setup

```bash
npm install
npm run dev   # http://localhost:3000
```

## Checks (run before opening a PR)

These mirror CI (`.github/workflows/test.yml`); all must pass.

```bash
npm test            # vitest unit tests (parsers + analysis)
npm run build       # also type-checks the whole repo, tests included (CI gate)
npm run test:e2e    # Playwright (incl. an axe accessibility audit)
```

`test:e2e` runs against the built static export, so `npm run build` has to come first — and it
must not run *during* the suite, which deletes `out/` from under the server. The server is
`scripts/e2e-server.mjs`; `npm run serve:out` starts the same thing by hand for a manual walk of
a build, applying the `public/_headers` security headers so a local walk sees what production
sends.

Next's own build only type-checks what the app imports, so the **test** files were never checked
by the gate and their `FlightMetrics` fixtures had quietly drifted four fields behind the real type —
a fixture that isn't the shape it claims silently stops exercising the readings built from the
fields it's missing. `npm run build` now runs `tsc --noEmit` over the whole repo first (an npm
`prebuild`, ~3 s), so the gate is still the same three commands and a drifted fixture fails it.

## Which build is live

`npm run build` runs `scripts/stamp-version.mjs` first (an npm `prebuild`), which writes
`public/version.json` with the commit being built — `GITHUB_SHA` in CI, `git rev-parse HEAD`
locally, plus a `dirty` flag when the working tree had uncommitted changes. It is generated at
build time and never committed.

So the deployed site can answer what it is serving:

```bash
curl -s https://debrief.fusionspace.co/version.json
```

Comparing content-hashed chunk names against a local build does **not** answer this — an identical
source tree builds to different hashes in CI than it does locally. Both the CDN headers
(`public/_headers`) and the service worker (`public/sw.js`) deliberately keep `/version.json` off
every cache: a stale build marker answers confidently and wrongly, which is worse than not having
one. Offline the request simply fails, which is the honest answer.

**That is true of our headers and NOT true end to end — add a cache-buster when you check.**
Measured 2026-07-31: the deploy for `686f3e3` completed successfully, and a plain
`curl https://debrief.fusionspace.co/version.json` went on answering the previous commit for
about ten minutes, across several attempts. `?cb=$RANDOM` returned the new commit immediately, so
something between the origin and here holds it despite the header. A session that trusts the
plain fetch will conclude its own deploy failed and go looking for a fault that is not there:

```bash
curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"
```

## Adding a parser

Most loggers export a CSV or a labelled text dump. To teach Debrief a new one:

1. Add a module under `lib/parsers/` exporting a `Parser` with:
   - `detect(input)` — return a confidence `0–1` from the header/first lines
     (token-anchored, so a stray word doesn't trigger a false match).
   - `parse(input)` — map the columns/tokens into a `RawFlight` (SI units
     internally: metres, m/s, m/s², Pa, °C, seconds).
2. Register it in `lib/parsers/index.ts` (`PARSERS`).
3. Add a fixture under `lib/parsers/__fixtures__/` and a test asserting the
   headline numbers (apogee, max velocity) against a known-good value.

## Testing parsers — real fixtures

The parser tests run against **real, trimmed flight files** under
`lib/parsers/__fixtures__/` (see its README for sources). Where a manufacturer
summary exists, the asserted apogee/velocity are tied to that ground truth **on
purpose** — when you refresh or downsample a fixture, re-verify the numbers
against the source rather than assuming the old ones still hold.

## Conventions

- Match the surrounding code's style, naming, and comment density.
- Keep commits focused; describe the *why* in the message.
