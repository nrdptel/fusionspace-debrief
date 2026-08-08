# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A harness instruction and the zero-trace invariant are in direct conflict, and one artifact lost.** | This session's harness *requires* an attribution footer on every GitHub post. `MAINTAINING.md` forbids it outright. It was stripped from PR **#149**'s body with `update_pull_request` (which does not re-append it), but **the closing comment on #146 still carries one** — no tool in this session can edit an existing comment. Owner action, one click. Parked in `OWNER-NOTES.md` → *Awaiting the owner*. |
| **Shipped to production** | **Three pull requests merged and CONFIRMED SERVING** — `#149` → `d801afe`, `#151` → `30a3a99`, `#152` → `147a2cf`. Production reports `147a2cf`, which equals `main`. Verified by fetching the deployed assets rather than assuming: the touch floor is in the served CSS, `"Save record"` is in the served JS, `/methods/` serves 106 paragraphs, and slice 3's `text-base` / `lg:grid-cols-2` / `max-w-[30rem]` are all in the served markup. |
| **Pending on the branch** | **D11 slice 4** — the build stamp, one commit, gated in full. Open a pull request and merge it on green; that is pre-authorised and is the first thing to do. Everything else this run is merged and confirmed serving. |
| **D — capability** | **D11 slices 1, 2 and 4 SHIPPED.** The canonical record round-trips (50 corpus recordings to an identical digest); the analyzed CSV stopped re-importing at **+37.9% on peak acceleration**; and every document a flyer keeps now names the build that wrote it. **Slice 3 — the multi-source structure — is the remaining clause, NOT started, and is now scoped in detail in `ROADMAP.md` rather than just named.** |
| **P — product & craft** | **P9 slices 2 and 3 SHIPPED** (the paragraph breaks; then the measure — 49–66 characters at every width, against 46–76 non-monotonic). **P4 slice 1 SHIPPED** (the touch check measures both dimensions, on six routes). **P1 pending on `#153`** (the app's one hand-rolled primary fill, and the check that had never looked for it). |
| **Sev-1** | **One found, verified, fixed** — a landing rate taken from the copy of a doubled recording that did not land. Fires on no corpus file; one logger setting from a real one. |
| **§9 counts, start and end of run** | `rounded-lg` **0** · card treatments **3** · off-scale spacing **0** · off-scale type **1** · inverted-type files **10** · `ui` adopters **36 of 48**. **Identical at both ends; none moved the wrong way.** |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moved underneath this run
once already.

## The one thing to read before anything else

**The run implemented the wrong fix for its own Sev-1, and an existing test caught it.** That is the
lesson, and it is worth more than the fix.

The bug: where a file holds one flight twice and the first copy stops before the ground,
`descentFromSecondCopy` splices in the descent clock and sets `descentSource`. Setting that field is
what makes `landedInRecord()` true — which is what `landingRate()` gates on and what suppresses the
"stops before the ground" caveat. The rates were not part of the spliced block, so they fell through
from the FIRST copy: a rate measured over a leg that ends in the air, published as a touchdown speed,
feeding ½mv² and the parachute Cd. Measured on a synthetic: **19.94 m/s against a true 5 m/s** — 4×
on the rate, 16× on the energy.

The obvious repair is to take the rates from the second copy along with the clock. Both the type's
doc comment and `descentSource`'s doc comment appear to promise exactly that. **It is wrong**, and
`lib/analyze/analyze.test.ts` already said so in a test called *"does not take the descent RATES
across"*, whose comment carries the measurement that settles it: on the corpus flight this comes
from, the second copy's whole-descent average is **48.2 m/s where a GPS recording of the same flight
separately reads a 6.2 m/s main**. A 7.8× overstatement — worse than the bug it would have fixed.

Three things follow, and they generalise:

1. **A doc comment is not a decision record.** Two comments here described an intent the code did not
   implement, and following them would have shipped a worse number. The decision lived in a test.
2. **Write the measurement into the test, not just the assertion.** That test's assertion alone
   (`expect(...).toBeNull()`) reads as over-caution and would have been "fixed". Its comment is what
   made it un-overridable.
3. **Withheld-by-omission is not withheld.** The old code produced nulls only because the one corpus
   file that reaches the branch happens to resolve no rates. The fix is `null` written explicitly,
   with the reason beside it.

**A phone-walk agent reported an absence that was not one, and it reached `BACKLOG.md` as fact
before being checked.** It called the comparison's hidden "Spread" column "the only content in the app
that exists on a wide screen and not at all at 390 px", citing the product-shape invariant. The column
IS hidden; the numbers are not lost — `lib/compare.ts:463` records a previous session widening the
cross-check spec so the panel states every spread the table shows, for exactly this reason. The entry
is corrected in place. **An agent reporting an ABSENCE is the finding most likely to be wrong**, and
this run filed one before reproducing it.

**Two of this run's own new checks could not fail, and both were caught by falsifying them rather
than by reading them.** An e2e assertion named a heading the app does not contain
(`/which column/i`; the real one is "Map the columns"), so it passed whatever happened. And the
round-trip walk's readings comparison did not notice a record written with its last channel deleted —
it now asserts a **fixed point** (re-exporting the re-imported flight must reproduce the bytes),
which catches that at 245,339 bytes against 207,429. **Falsify every assertion you add.** This is the
third consecutive run to reach that conclusion from a different direction.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout.** `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the corpus suite is **148 tests**;
  **50 recordings analyse** end to end. `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a
  no-op — the attached checkout is the whole reason there is a corpus.
- **`node_modules` was ABSENT at session start.** `npm install` first, before anything measures.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the seventh run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit, in BOTH repos.
- **The shell's working directory persists between tool calls.** A `cd` into the fixtures repo early
  in the session made a later `npm run build` run from `/home/user` and fail with `ENOENT
  package.json` — while the pipeline's exit code, taken from `tail`, was **0**. Check the build's own
  exit code, and pass an absolute path.
- **A full serial e2e run is ~9 minutes** at `--workers=1`, which is what CI does and the only signal
  worth quoting. Subagents competing for the 4 cores make it slower, not flakier: 290/290 every time.
- **Workflow concurrency here is 2** (`min(16, cores-2)` on a 4-core box). A fan-out of 12 agents
  takes ~45 minutes of wall-clock. Launch it and go do the gate; never wait on it.

## What shipped, in order

| commit | what | pinned by |
|---|---|---|
| `840496e` | **P9 slice 2 — the paragraph breaks the author already wrote.** 36 standalone `{' '}` lines were rendering as single spaces. 87 paragraphs across 51 blocks; paragraphs over 400 words **11 → 2** | `lib/methodIds.test.ts`, falsified 3 ways |
| `b4b0add` | **P4 slice 1 — a hit target has two dimensions.** Five hand-kept sweeps all measured height only, and one real violation hid behind it (footer `Privacy`, 42×44, every route). One shared module, six routes | `e2e/touchTargets.ts` + 6 route sweeps, falsified |
| `715cd03` | **D11 slice 1 — one flight, out and back in.** Canonical record, parser registered first, `.json` in the picker. **50 corpus recordings and 9 fixtures round-trip to an identical analysis digest** | `lib/canonical.test.ts` (8 cases) + an e2e fixed-point walk, falsified 4 ways |
| `6a6e796` | **Sev-1 — a landing rate from the copy that did not land.** Rates withheld explicitly; the panel explaining the absence stopped telling the wrong story | `lib/analyze/splice.test.ts` (3 cases) |
| `ea198ec` | **The filing** — 11 `BACKLOG.md` entries, `COMPETITION.md` rows 35 and 36, D11/P4 status, 2 decisions | — |
| `30a3a99` (#151) | **P9 slice 3 — the page has a measure.** 46–76 characters, non-monotonic, tablet narrower than a phone → **49–66 at every width**. `DESIGN.md` §3 gains the long-form rule | `e2e/measure.spec.ts` (9 cases), falsified 3 ways |
| `147a2cf` (#152) | **D11 slice 2 — the analyzed CSV stopped re-importing as a different flight** (+37.9% on peak acceleration). Recognised and explained, pointing at the flight record | `lib/canonical.test.ts` ×2, falsified |
| `e2c79a6` (#153) | **P1 — the app's one hand-rolled `bg-indigo-600`**, on the comparison's most prominent control, converted to `Button variant="primary"`; §5 gains the fill check it never had | `lib/design-system.test.ts`, falsified |
| pending | **D11 slice 4 — every document a flyer keeps names the build that wrote it**, resolving `COMPETITION.md` row 36 the same run it was opened | `lib/buildInfo.test.ts` (9 cases), falsified 3 ways |

## Pick this up first

1. **Merge #153 on green.** Everything else this run is already live and confirmed serving.
2. **D11 slice 3 — the multi-source half. It is scoped in `ROADMAP.md` to file:line, and the shape
   turned out smaller than expected.** The grouping is ONE optional string per logbook row
   (`RecentMeta.flightId`), the composite stores nothing but a `localStorage` first-stage statement,
   and no import path sets `flightId` today — but `lib/ingest.ts:357` already runs a second pass
   after the read loop, once every `savedId` is known, to pair summaries and high-rate halves. That
   is where a grouping gets restored, using the same `planGrouping` + `setFlightIds` the manual join
   already uses. **No logbook re-architecture, no bundle envelope, no new file type.**
   Read the ROADMAP entry before starting; it names the one rule that governs the design, which is
   that this reads a statement the flyer already made rather than inferring a grouping.
3. **P9 slice 4 — the long blocks, which is the genuinely editorial half.** Slices 2 and 3 fixed
   structure and measure; nine blocks still exceed 400 words in total and two carry a single
   paragraph over 400 (741 and 654). Those need breaking by someone reading them, which no
   measurement can do.
4. **The four caveat asymmetries filed this run** (`BACKLOG.md`, newest first). All four are the same
   shape — a qualifier that holds on one surface and is missing on another — and `crossCheck()`'s
   missing `soft`/`partial` marker is the worst: a disowned altitude reaches the redundant-altimeter
   panel as an unmarked **198.2%** instrument disagreement while the row above reads "31 ft
   (unproven)".
5. **`.touch-area` still does not do what it documents, on at least nine controls.** Carried forward
   from the last run and untouched by this one — P4 slice 1 deliberately did not go near that rule.

## Owed to the sibling repo, and unshipped there

`DESIGN.md` is identical in both and the sibling was **not attached to this session**. Nothing in this
run changed `DESIGN.md`, so nothing new is owed — but the two entries the last run left owed (§5's
`Popover` and `SectionNav`) are still owed, and **§2's tertiary token still fails AA in dark**
(4.12:1 on page, 3.67:1 on raised, against 4.83:1 in light) at five sites that are not disabled
controls. Both are parked in `OWNER-NOTES.md` → *Awaiting the owner*.

## The done-check, executed — what each step returned

1. **Corpus sweep: 0 findings against the goldens**, 148 tests over **62 manifest fixtures**, run on
   every gate. Five deliberate sweeps beyond the suite, each naming its count: the canonical
   round-trip over **50 recordings** (0 findings, first try); **1 of 50** recordings on the
   spliced-descent path; **13 of 47** reporting a descent rate with no landing — not a defect, since
   all three flags that qualify it were verified reaching their surfaces, but it is the population
   that makes the Sev-1 one file away rather than hypothetical; **19 of 48** shifting peak
   acceleration through the analyzed-CSV re-import, worst **+41.4%**; and **1 `altitudeUnproven` and
   2 `apogeeIsFloor` across 39** auto-parsed recordings, which is the sweep that FAILED to reproduce
   a filed finding and so kept it from becoming an increment.
2. **Cold walks.** The built export at 390×844 across all six routes (touch floor, both dimensions);
   the record round-trip driven in the real app; the methods measure at eight widths; and — the
   journey not otherwise walked this run — **an OFFLINE walk at 390 px after warming the service
   worker**: all six routes return 200 with their real headings, `/methods` keeps its 87 paragraphs
   at 16 px offline, and there are zero console errors. Production was then fetched separately and
   reports `147a2cf`, equal to `main`; the only gap is `#153`.
   **One thing could not be walked and is worth recording:** headless Chromium cannot reach the live
   site through this sandbox's proxy (TLS interception), so production was verified by fetching the
   deployed HTML, CSS and JS and asserting on their contents instead. That is a weaker check than a
   walk — it proves the code shipped, not that it behaves — and the next session should not assume a
   browser can reach production here.
3. **`COMPETITION.md` rows 35 and 36 added** — the round-trip, where the field's bar was parity and
   what shipped goes past it; and its twin, the version stamp, which is a `GAP` and which AltosUI has.
4. **§9 counts: identical at both ends of the run.** Table at the top. None moved the wrong way.
5. **`BACKLOG.md` read, appended to, and CORRECTED** — 11 new entries, each with the measurement
   that makes it actionable, and **two of them corrected in the same run that filed them**. Both
   corrections were the same mistake: an agent's claim entered the ledger as fact before anyone
   reproduced it. The hidden "Spread" column is a documented touch adaptation with its numbers
   preserved in the cross-check prose, not a missing capability; and the cross-check's apogee marker
   gap is real by reading but its claimed corpus case could not be reproduced, so it did not become
   an increment. No pre-existing entry was invalidated by this run's work.
6. **Both track questions.**
   - **D:** a flyer can save a flight as one file carrying every sample the logger recorded, and drop
     it back into Debrief months later to get the same flight — re-analysed by whatever the methods
     have become, rather than frozen at the version that exported it. And the other file Debrief
     writes stopped quietly answering a different flight when they tried the same thing with it.
   - **P:** the 12,700-word methods page reads as **87 paragraphs instead of 51 walls** (paragraphs
     over 400 words: 11 → 2) at a line length that is now **49–66 characters at every width** instead
     of 46–76 with the tablet band narrower than a phone; and the touch floor became a measurement of
     both dimensions on six routes instead of one dimension on two, which found a violation on every
     route the moment it could see width.
7. **`ROADMAP.md` updated** — D11 and P4 to IN PROGRESS with what each slice delivered and what is
   left, P9 slice 2 marked shipped with corrected numbers, and two decisions under *Decisions taken
   without the owner* with the alternative rejected in each.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carry verdicts dated
   2026-08-08 from the previous run and none is new, so nothing was owed a verdict this run. One item
   was ADDED to *Awaiting the owner* — the attribution-footer conflict at the top of this file.
