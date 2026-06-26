# Contributing

Thanks for your interest! This is a personal hobby project, but issues and PRs
are welcome — especially new altimeter/format parsers and fixes to existing ones.

## Project layout

Debrief is a single, fully static Next.js app (no backend). Everything runs in
the browser.

- `app/` — the Next.js App Router pages, root layout, and global styles.
- `components/` — the UI: drop zone, column mapper, flight report, charts.
- `lib/parsers/` — the format registry. Each parser `detect()`s a file and
  `parse()`s it into a raw flight; `importFlight()` picks the best match.
- `lib/analyze/` — the analysis pipeline (spike rejection, event detection,
  apogee/velocity/descent rates).
- `lib/flight/`, `lib/units`, `lib/share`, `lib/report` — the canonical flight
  model, unit conversions, share-by-link, and text/CSV export.

## Setup

```bash
npm install
npm run dev   # http://localhost:3000
```

## Checks (run before opening a PR)

These mirror CI (`.github/workflows/test.yml`); all must pass.

```bash
npm test            # vitest unit tests (parsers + analysis)
npm run build       # also type-checks the whole app (CI gate)
npm run test:e2e    # Playwright (incl. an axe accessibility audit)
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
