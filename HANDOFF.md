# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — surfaces that looked finished and weren't

Branch restarted from `origin/main` at `e8cbdcc`; the working branch was level with it at session
start (0 ahead, 0 behind, measured after `git fetch --prune`). Focus was **UX and UI**, so the queue
came from an eight-lens audit of the app rather than from the corpus.

Four shipped increments. Every figure below was measured this run.

### The increments

1. **`d89b80a` — the recovery map was a picture, and now it reads.** A `role="img"` canvas with no
   handler on it of any kind, so *"where was it at 40 s, and how far is that from the road"* could
   only be answered by saving KML and opening Google Earth. It reads now by pointer, tap and keyboard
   (arrows step, shift steps ten, Home/End the ends, PageUp/PageDown event to event, Escape clears),
   each leg stroked in the colour of the event that began it, a dot at each event, a key naming them.

   **It deliberately states no altitude, and getting there took two wrong answers.** The first cut
   read `series.altitude[i]` and published **−694 ft AGL at burnout** on the IREC TeleMega — the exact
   instant the Events list correctly prints "—", because `altAt` withholds an ascent altitude where
   the barometric trace contradicts the flight's own speed. The second cut over-corrected to "no
   height before apogee", which then said nothing at a burnout the Events list publishes as
   **1,600 ft** on `altusmetrum-telemetrum.csv`. Same cross-surface disagreement, other direction. A
   map is a plan view; altitude is adjudicated in three places already.

   Folded in from the same review: the map sized itself from `clientWidth` (which includes the card's
   own `p-4`) and so ran **15 px outside its own card** at 390 px; the landing event no longer gets a
   dot, because the ✕ already marks the landing at `stats.landingIndex` rather than the landing
   event's index (**samples 479 and 474** on `featherweight-gps.csv` — two dots, two landing
   positions); `pointercancel` clears, so a thumb scrolling past the map no longer pins a reading
   nobody chose; the readout is no longer a live region (fed from `pointermove` it would have
   announced per pointer sample) — announcements come from an sr-only region only a key or a tap
   writes to.

2. **`94ad1d5` — offline, every address Debrief itself writes fell through to the "not available
   offline" page.** Measured after one online visit with the network cut:

   | address | before |
   |---|---|
   | `/compare/` | 200, real page |
   | `/compare/?ids=abc,def&u=i` | **503, fallback** |
   | `/?u=m` | **503** |
   | `/?open=xyz` | **503** |
   | `/methods/` | 200 |
   | `/methods/?x=1` | **503** |

   Those three are the permalink the app offers under *"give this comparison an address"*, a shared
   link's units, and reading one flight from the compare surface. `caches.match(request)` keys on the
   whole URL; the site is a static export, so the query is read after boot and selects nothing.
   Navigations are keyed on the route now, **on the way in as well as out** — storing under the full
   URL grew a duplicate shell per bookmarked permalink (three `?ids=` sets left four cached
   `/compare/` documents). A route that genuinely isn't cached still answers 503, checked explicitly.

3. **`10f9d84` — the logbook forgot flights and said nothing.** `saveRecent` keeps every noted flight
   plus the most recent `MAX = 12` un-noted ones and prunes on every save. Drop fifteen distinct
   flights: the logbook holds **twelve**, and `flight-01`, `-02`, `-03` are gone, named nowhere. A
   launch day is six files, so **two launch days fill the window and the third eats the first**. The
   escape hatch existed (a noted flight is kept) but was one grey sentence at the foot of the list, in
   the past tense, without the number. Now the heading carries `n/12 un-noted` (amber within two of
   full), a save that prunes names what it dropped with the action that would have kept it, and
   `UNNOTED_MAX` is exported so the copy can't drift from the code.

4. **`64deed1` — a flight dropped anywhere but the dashed box threw the flyer out of the app.** The
   browser's default for a dropped file is to navigate to it, and neither drop target is rendered once
   a report is open. Measured with a real `DragEvent`: `dragover` on the drop zone is cancelled, on
   the footer it is not, on the report body it is not — with **zero** file inputs on that screen. The
   window catches it now; only the column mapper refuses, and says why. Both boxes lost their own drag
   handlers, because leaving them beside the window's ingested a drop that hit the box **twice**.

### What the review caught that the tests didn't

The pre-push agent review paid for itself twice on increment 1, both times on cross-surface honesty —
a number published on a new surface that another surface withholds, and then the mirror-image
over-withholding. Neither was reachable by any assert that existed. **Send the diff out before every
push; the honesty lens is the one that finds things.**

The existing suite paid for itself too: increment 4's first attempt refused drops during `loading`,
and `worker.spec.ts`'s "a slow in-flight analysis does not overwrite a newer load" caught it. A
baseline gate run before touching anything is what made that a finding rather than a mystery.

**Every assert added this run was falsified** — reverted against the code that lacks it and confirmed
to fail naming the case. Two were vacuous on the first try and had to be moved: the "no landing dot"
assert on a fixture with no landing event, and the "no double ingest" assert on a path that never
dropped on the box.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **The image's Chromium is 1194 and Playwright wants 1228.** `npx playwright install chromium` (~2 min).
- **NEVER run `npm run build` while `npm run test:e2e` is in flight.** The build deletes and recreates
  `out/`, which is what the e2e webServer is serving: the run does not fail loudly, it comes back with
  a SHORT COUNT and exit 0 — **122 passed** where a full run is 185. It also kills any hand-started
  `npx serve` pointed at `out/`. If a suite reports fewer tests than the last full run, suspect this
  before suspecting the code.
- **Pipe a gate command and you throw away its exit code.** `npm run test:e2e 2>&1 | tail` reported
  exit 0 over a run whose own summary said "1 failed". Redirect to a file and read `$?`.
- **`npm run build` can crash in webpack's WasmHash** (`TypeError: Cannot read properties of undefined
  (reading 'length')`) and dump ~2 MB of minified bundle into the terminal. `tsc --noEmit` passes
  either side of it. `rm -rf .next` and rebuild — it is a cache flake, not a code error. Do not grep
  that output for "error": the minified bundle matches.
- **A subagent's `*-tmp.*` probe inflates the gate.** Sweep `find . -name "*-tmp.*"` immediately
  before any gate run you intend to quote.
- **A browser in this container cannot reach the deployed site.** `curl` works through the agent proxy;
  Playwright's Chromium gets `ERR_CONNECTION_RESET` on `https://debrief.fusionspace.co`. Walk the
  built export of the SHA you shipped and say that is what you did.
- **`npx serve -s out` SILENTLY SERVES THE ANALYZE PAGE FOR EVERY ROUTE.** Use `-c e2e-serve.json`
  for any manual walk. Verified again this run: `/compare/` is 40,090 bytes, `/` is 53,602.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.

## Pick up first, and why

The eight-lens audit's full output is in `BACKLOG.md`. Ranked by what a flyer loses:

1. **The report has no address, so every in-app link destroys it.** Analyze, Compare, "Read the
   methods →", and the three footer links all leave the report screen, and the report lives only in
   React state — its zoom, label and notes go with it. `?open=<id>` and the `#hash` share link can
   restore one, and neither is offered at the moment of leaving. This is the same one-way door
   increment 4 closed for drops, still open for clicks.
2. **The landing screen has no unit control, and the page's own copy says it does** —
   "switch feet and meters with one click (top-right)" (`app/page.tsx:76`), where the top-right holds
   ThemeToggle and KofiButton. `UnitsControl` mounts only inside a loaded report or comparison, while
   the logbook rows on that very screen print apogee and speed in the current units. Doing it properly
   means lifting the unit choice above `SiteHeader` (a context), which also fixes the audit's separate
   finding that the control sits somewhere different on each surface.
3. **Two files sharing a basename collapse to one logbook entry** (`lib/recents.ts`, `isDup` keys on
   `name` + `formatLabel` only), which also breaks the comparison permalink that names them by id.
   Common in the wild: a logger that writes every export as `data.csv`.
4. **The logbook forgets its sort and its search across a navigation the app performs itself**
   (`RecentFlights.tsx`, plain `useState`), and `useLogbook` has no loading flag, so both surfaces
   paint a false empty state before the first read lands.
5. **`EVENT_COLOR.drogue` and `EVENT_COLOR.main` are the same `#0ea5e9`**, so a dual-deploy flight's
   drogue and main legs are indistinguishable on the new ground track — and on every chart, which has
   always been true. One token, blast radius across the report, the comparison overlay and every
   figure export.

`BACKLOG.md` carries the rest, newest first — including the Blue Raven high-rate merge, which is
still the largest single capability gap and is surveyed in full.

## The fixtures repo

No commit there this run. Nothing this run changed a fixture's contract: the corpus suite is
unchanged, and the corpus was used to *measure* (10 GPS-carrying fixtures, 0 with a lat/lon vs
`series.time` length mismatch) rather than to re-cut anything.
