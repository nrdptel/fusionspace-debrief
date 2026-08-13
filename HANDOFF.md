# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **One squashed commit, merged** — `d7dee41` (PR #183), carrying D10 slices **5k and 5l**. Both CI jobs were green on it, corpus half included, before the merge. Re-measure before believing anything is live: `git fetch --prune origin`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | Whatever sits on the working branch above `origin/main` — measure it, do not trust this line: `git rev-list --count origin/main..HEAD`. |
| **Sev-1** | **None inherited.** The baseline gate was green before anything was touched: unit 1,381 with the corpus attached, build clean, e2e 327. **Two Sev-1s were FOUND by the opening sweep and one is fixed** (the comparison's apogee cross-check, below); **two more survived refutation and are NOT fixed** — see *The two Sev-1s still open*. |
| **D — capability** | **D10's labelling half is DONE.** `SINKS` reads **24 labelled · 5 carries · 0 todo across 29 rows**, from 18/5/5 across 28. What is left of D10 is (c) and (d): OFFERING the samples, which is the half a flyer can see. |
| **P — product & craft** | **P1: the RENDERED contrast check reaches the states and the themes nothing audited** — 15 audits → 26, over 13 states × 2 themes. And **the design-system audit `MAINTAINING.md` asks for every long run was finally RUN**: 11 divergences, all queued into P1 in `ROADMAP.md`. |

## The corpus sweep, stated plainly

**Ran, and the metric-vs-series sweep found nothing.** `lib/parsers/corpus.test.ts` names its own
count — **9 committed fixtures and 50 corpus recordings** — and the full unit suite finished **1,399
passed across 91 files** with it attached. A throwaway probe also recomputed apogee (50 recordings),
max speed (34), Mach (34), max acceleration (25) and deceleration (24), max-Q (34), rail exit (21),
burnout time/altitude/velocity (39/37/34), drogue/main/whole descent rates (13/11/31), flight and
descent time (29/30), TWR (18) and average boost (25) directly from `analysis.series` and diffed
them against the reported scalars: **no Sev-1**. One low finding came out of it and is in
`BACKLOG.md` (`maxDeceleration` is documented as "most negative" and is only the ascent minimum).

**An empty sweep is a result.** The numbers are here so the next session can tell it apart from a
suite that skipped itself.

## The two Sev-1s still open — take these first

Both were confirmed 3/3 by independent refuters and are the highest-value work waiting. Neither is
in `BACKLOG.md`, on purpose: they are Sev-1s, not ledger entries.

1. **`components/Analyzer.tsx:972` — the "N flights were forgotten to make room" notice reaches only
   `RecentFlights`, which the report (`:831`) and compare (`:869`) early-returns never render.** So
   the logbook prune's IndexedDB deletions happen SILENTLY on every screen a drop actually lands on;
   `CompareSurface.tsx:565` has the identical shape. Repro: drop 13 distinct logs and stay on the
   report — nothing says a flight was deleted, and the pruned rows' labels, notes and read windows
   are already gone. `e2e/logbook.spec.ts:511` only ever sees the notice because it clicks "Analyze
   another flight" after every drop. The same file already hoisted `GroupProposalBanner` out of
   `RecentFlights` (`:874`) for exactly this reason.
2. **`components/Analyzer.tsx:506` — a comparison built by dropping a folder mints synthetic ids
   `${name}-${i}`,** so everything `CompareView` stores about it (label, notes, hand-made column
   order, metric sort, per-flight colours) is filed under a key nothing can read back — and the one
   navigation the screen offers ("Give this comparison an address →") reloads the same flights under
   their real logbook ids, blank. `memoryCarriedForward` is module-level memory the full-page
   navigation kills, and the orphaned entry permanently burns one of `compareMemory`'s 40 slots.
   Repro is in `e2e/compare-page.spec.ts:139-157`'s own journey, one step further.

Two other candidates from the same sweep were **REFUTED** and are recorded at their true severity:
the batch-drop comparison DOES have an address (`Analyzer.tsx:523-526` computes `ids`/`addressable`
from the logbook saves), and the channel explorer's preset ✕ is a one-tap delete but the view is
trivially rebuildable, so it is friction rather than a one-way door.

## What shipped, in order

- **`65fff90` → merged in `d7dee41` — D10 slice 5k, the three exports a flyer WALKS TO.** `.gpx`,
  `.kml` and the landing-coordinate copy. Each placement follows what its reader displays: the tag
  on the track and waypoint names a handheld shows, the sentence in a document-level description
  ahead of them, all three names Google Earth draws, and a trailing parenthetical on the coordinate
  so a paste into a maps app still resolves.
- **`16a7481` → merged in `d7dee41` — D10 slice 5l, the composite and the share link.** Per-row
  provenance off `CompositeMark.synthetic`, set POSITIONALLY, because two logbook rows can share a
  file name. Plus two defects it found: a `check` that read its own implementation file, and the
  timeline card on screen, which carried no claim while sitting above the only notice the route had.
- **`b9380aa` — the comparison stops publishing a spread over apogees it will not read plainly.**
  The Sev-1, plus `(baro)` naming the wrong sensor, `(at least)` having no legend anywhere, and the
  channel explorer publishing a bare apogee. See below.
- **P1's rendered-contrast slice** — audits 15 → 26, over 13 states × 2 themes.

## The one thing to read before anything else

**Falsifying a check is what found everything worth knowing this run, and one of the falsifications
found a blind spot in the checker rather than in the code.**

Injecting `text-zinc-400` (2.51:1) into the logbook note's resting class left the new a11y audit
**green**. The saved note renders where the Save button was, so the click leaves the pointer on top
of it and `hover:text-zinc-900` applies — axe rated the hover value at about 16:1. **A walk that
ends on a click rates whatever the cursor is sitting on.** `page.mouse.move(0, 0)` before the audit
closes it, and the same mutant then reddens. This is the identical blind spot `DESIGN.md` §9 already
records for the SOURCE census (variant-prefixed states are not rated), arriving from the other side.

Eleven mutants were built across the run and every one went red for its own reason. Two of them are
worth copying as a pattern: reverting `RailExit`'s caution to `amber-600` reddens *a marginal rail
exit (light)* while the report, the mapper and the dark run stay green, and reverting the mapper's
live region reddens *nothing mapped yet (light)* while *column mapper (light)* — the ready state that
already existed — passes. **A pair like that is the proof a new walk reaches the STATE and not
merely the route.** Without it, "I added an audit" is unfalsifiable.

## What the opening fan-out returned, and what it cost

Seven investigators and 33 adversarial refuters, 40 agents. Findings that survived 3/3 are above and
in `BACKLOG.md`; **two candidates were killed by refutation**, which is the point of running it that
way. Two operational notes for the next session:

- **This container has 4 CPUs, so the workflow ran 2 agents at a time and took ~80 minutes.** It
  competed with the gate the whole time: one baseline e2e test failed at 15.9 s and passed in 1.5 s
  re-run alone, and a full unit run exited 1 with all 1,390 tests passing on a
  `[vitest-worker]: Timeout calling "onTaskUpdate"`. **Read the counts, not the exit code.**
- **An investigation agent left `probe-refute-tmp.test.ts` in the repo root and it failed
  `npm test`** while `git status` stayed clean — the vitest half of a trap `MAINTAINING.md` records
  for `tsc` only. `npx vitest run lib` scopes to where all 91 test files actually live. Filed.

## The Sev-1, and the three siblings on the same surface

`crossCheck`'s apogee spec had no marker for a qualified apogee, so the agreement panel — the
sentence a flyer reads to decide whether to trust a set — published a spread over numbers the table
beside it tags `(at least)` / `(unproven)` and already refuses to crown. Measured: two intrepid
TeleMetrum recordings print `996 m (at least)` and `1,082 m (at least)` and were reported as an
**8.2%** disagreement between two lower bounds; a Blue Raven reading 9 m (unproven) beside a
StratoLogger's 465 m was reported as **192.0%**.

The flag is fed by `apogeeIsQualified`, the table's own predicate, so the two cannot drift. **The
contributors stay IN the spread rather than being dropped** — a two-recording group would otherwise
fall to one contributor and print no apogee row at all, and a 192% gap is exactly the signal that one
instrument is broken.

Three more of the same shape, all found by pointing the sweep at one surface:

- **`(baro)` named the wrong sensor.** `maxVelocitySource`'s `'baro'` means DERIVED; the altitude it
  came from is `derivedVelocityFrom`. A GPS-differentiated peak was blamed on a barometer on Max
  velocity, Max Mach and Max Q at once. `(GPS)` is its own tag with its own legend, because the two
  fail in opposite directions.
- **`(at least)` had no legend anywhere** — not on screen, not in the Markdown footer, not in the
  HTML notes — while the four tags around it had all three.
- **The channel explorer published a bare apogee**: its stats table takes each plotted channel's max,
  and the max of the altitude IS the apogee.

## Pick this up first

1. **The two Sev-1s above.** Both are one-way doors with real lost work.
2. **P1's next slices are the design-system audit's top three, now queued in `ROADMAP.md`** —
   `app/methods/page.tsx`'s `scroll-mt-12` under a 62 px strip (51 heading ids, and 21 readings link
   into that page, so every `?` a flyer presses lands behind the bar); `/compare`'s hand-rolled
   loading state where §5's `Loading` exists; and `CropControl`'s two raw number inputs where
   `NumberField` is the primitive that owns the refusal behaviour.
3. **D10 (c): offer the mapper sample.** Written and tested since 2026-08-09, held back rather than
   missing. The trap is recorded in `ROADMAP.md`: `lib/samples.test.ts` asserts every single-file
   sample auto-detects as a flight, which a mapper sample cannot do — that needs a second KIND, not
   a loosened assertion.
4. **`COMPETITION.md` row 44's action**, which is also row 43's: `<src>` in the GPX and
   `<ExtendedData>` in the KML carrying the board identity `flight.meta` already holds. One
   increment, two rows resolved. AltosUI puts serial and flight number on every CSV row and in the
   KML document name; both track schemas reserve a provenance field and Debrief uses neither.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own count — **9 committed fixtures and 50 corpus recordings**. A run that cannot say those numbers
did not have a corpus.

## Environment

`npm install` first — `node_modules` arrives empty. Then `npx playwright install chromium`: the image
ships chromium-1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose. It succeeds through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH`
afterwards. Both are standing candidates for the environment's setup script; paying for them every
session is the only reason they are here.

**Four CPUs.** Do not run a heavy fan-out and a gate at the same time and then believe the gate —
re-run any single failure in isolation before reading a line of the diff.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The harness also appends an
attribution footer to a pull request body after posting; read the body back and strip it. It did
this run, and it was stripped.
