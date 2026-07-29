# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — surfaces that looked finished and weren't

Branch restarted from `origin/main` at `e8cbdcc`; the working branch was level with it at session
start (0 ahead, 0 behind, measured after `git fetch --prune`). Focus was **UX and UI**, so the queue
came from an eight-lens audit of the app rather than from the corpus.

Eight shipped commits across seven increments. Every figure below was measured this run.

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

5. **`dcc72f5` — a report had no address, and a flight was re-addressed every time it was saved.**
   Seven in-app links on the report screen — Analyze, Compare (×2), "Read the methods →", Methods,
   Validation, Privacy — and every one of them destroyed the report, because it lived only in React
   state. `?open=<id>` already restored a flight; the mount effect **deleted it from the URL**
   immediately after reading it. Underneath that, `saveRecent` minted a fresh id on every save — and
   a save is what REOPENING a flight does — so clicking a logbook row silently broke every
   `/compare?ids=…` permalink naming it, and /compare fell back to the empty picker without a word.
   Thirteen tests encoded the old behaviour; one asserted the opposite outright ("the id is spent
   once used") and is reversed deliberately.

6. **`18a9627` — the unit switch was not where the page says it is.** `app/page.tsx` says "one click
   (top-right)". Measured at 1440 px: **0** controls on the analyze landing screen, **0** on the
   comparison picker, and on a report **x=479, y=483 — 880 px from the right edge** — over a logbook
   already printing apogee and speed in those units. A `UnitsProvider` above the header on both
   surfaces that show numbers; the two duplicate copies of the reader/writer collapsed into it.

7. **`1a0e0c3` + `b787b8b` — twenty-one readings a flyer could not look up.** No title, no help
   affordance and no link on any tile; the methods page defines all of them across 45 blocks and had
   **zero `id` attributes**. Every block has an anchor now, every reading cites the one that defines
   it, and three checks hold the lists together (a compiler-checked union, plus tests that each id is
   rendered as a heading and that every reading cites one over a fixture pinned to produce all 21).
   The closing cold walk then found the new links at **6x14 px** on a phone — a control at a sixth of
   the touch floor, which `touch.spec.ts` could not see because its selector never reached into
   `main`. Hit area expanded with a pseudo-element; the selector widened.

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

### Three regressions the gate caught, and how each was diagnosed

- **Refusing drops during `loading`** broke `worker.spec.ts`'s "a slow in-flight analysis does not
  overwrite a newer load". Superseding a running analysis is designed behaviour.
- **Twelve tests failing at 30 s** looked exactly like this suite's known load flakiness. The control
  settled it: stash the change, re-run, **189 passed in 2.6 min**. Then bisecting the two halves of
  the change put it on the URL wiring. *A control is worth more than an hour of theories.*
- **`EMFILE: too many open files`** — putting the units provider in the root layout gave every page
  the client bundle, and the extra chunk requests pushed the e2e static server past its
  file-descriptor limit PART-WAY THROUGH a run. Every test after that failed with
  `ERR_CONNECTION_REFUSED`. Found by reading the `[WebServer]` lines in the run log; every test
  failure pointed somewhere else.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **The image's Chromium is 1194 and Playwright wants 1228.** `npx playwright install chromium` (~2 min).
- **The e2e static server runs out of file descriptors as the suite grows, and the container will
  not let you raise the limit.** `ulimit -n` is **4096** and `ulimit -n 65536` returns
  *"cannot modify limit: Operation not permitted"*. At 195 tests, `npx serve` hits
  `EMFILE: too many open files` **twice in a run** — on `out/compare/index.txt` and on a polyfill
  chunk — and every test after the crash fails with `ERR_CONNECTION_REFUSED`. The victim is always
  `worker.spec.ts`'s 200,000-row test, because it is last and the server is most exhausted by then;
  it passes in **10 s when its file is run alone**. Read the `[WebServer]` lines before diagnosing a
  cluster of tail-end failures — every test error points somewhere else. CI is unaffected (GitHub
  runners set a far higher limit) and is the stronger gate here. **The real fix is to stop using
  `serve` for the e2e web server** — it opens a ReadStream per request and does not close them fast
  enough under this suite's concurrency; a ~30-line Node static handler would end this whole class
  of failure, and would also remove the `-s`/`--single` footgun documented below.

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

1. **The report's label and notes still don't survive the round trip.** The report has an address
   now, so a link out and Back comes back to the flight — but `reportLabel` and `reportNotes` are
   per-flight React state cleared on `flight.source`, so the two things a flyer TYPED are the two
   things still lost. The logbook's own per-flight `note` (IndexedDB, `lib/recents.ts`) is the
   precedent, and the id to key them on is now stable.
2. **Two files sharing a basename collapse to one logbook entry** (`lib/recents.ts`, `isDup` keys on
   `name` + `formatLabel` only), which also breaks the comparison permalink that names them by id.
   Common in the wild: a logger that writes every export as `data.csv`.
3. **The logbook forgets its sort and its search across a navigation the app performs itself**
   (`RecentFlights.tsx`, plain `useState`). The audit also filed a false-empty-state flash from
   `useLogbook` having no loading flag — **not reproducible**: sampled every 20 ms across three visits
   with 8 flights at 20× CPU throttle on a 390 px viewport, the list painted first every time. In
   `BACKLOG.md` marked unreproduced rather than fixed.
4. **`EVENT_COLOR.drogue` and `EVENT_COLOR.main` are the same `#0ea5e9`**, so a dual-deploy flight's
   drogue and main legs are indistinguishable on the new ground track — and on every chart, which has
   always been true. One token, blast radius across the report, the comparison overlay and every
   figure export.

5. **A reload now re-parses and re-analyses the flight**, because the report has an address. That is
   the same cost as opening it from the logbook and it is the right trade, but it is new: on a big log
   a refresh is a six-second wait where it used to be instant. Worth a loading state that says which
   flight is coming back.

`BACKLOG.md` carries the rest, newest first — including the Blue Raven high-rate merge, which is
still the largest single capability gap and is surveyed in full.

## The fixtures repo

No commit there this run. Nothing this run changed a fixture's contract: the corpus suite is
unchanged, and the corpus was used to *measure* (10 GPS-carrying fixtures, 0 with a lat/lon vs
`series.time` length mismatch) rather than to re-cut anything.
