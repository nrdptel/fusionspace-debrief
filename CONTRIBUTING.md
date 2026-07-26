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
