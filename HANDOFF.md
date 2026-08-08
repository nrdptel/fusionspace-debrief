# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A harness instruction and the zero-trace invariant are in direct conflict, and one artifact lost.** | This session's harness *requires* an attribution footer on every GitHub post. `MAINTAINING.md` forbids it outright. It was stripped from PR **#149**'s body with `update_pull_request` (which does not re-append it), but **the closing comment on #146 still carries one** — no tool in this session can edit an existing comment. Owner action, one click. Parked in `OWNER-NOTES.md` → *Awaiting the owner*. |
| **Shipped to production** | Nothing new yet this run. `main` is at `367eca6`; `#147` and `#148` landed from elsewhere mid-session, both docs. |
| **Pending on the branch** | **PR #149**, five commits, rebased onto `367eca6` and re-gated after the rebase. **Merging it on green is pre-authorised and is the first thing to do.** |
| **D — capability** | **D11 slice 1 SHIPPED.** A flight saves as a canonical record and opens again as the same flight — 50 corpus recordings and 9 fixtures round-trip to an identical analysis digest. |
| **P — product & craft** | **P9 slices 2 and 3 SHIPPED** (the paragraph breaks; then the measure — 49–66 characters at every width, against 46–76 non-monotonic). **P4 slice 1 SHIPPED** (the touch check measures both dimensions, on six routes). |
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

## Pick this up first

1. **Merge #149 on green.** Nothing this run is reachable by a flyer until then.
2. **D11 slice 2 — the multi-source half, and it is where the milestone gets hard.** Slice 1
   round-trips ONE recording; the *done when* also asks that a flight with two recordings does not
   flatten and a stitched composite keeps its stages. Bundled with it: `analyzedDataCsv`
   (`lib/report.ts:779`) still re-imports as a materially different flight — its derived
   `velocity`/`acceleration` columns are re-read as MEASURED channels, and `dynamic pressure (kPa)`
   claims the pressure role and blocks the recorded `Pressure (Pa)`. **19 of 48 corpus recordings
   shift peak acceleration, worst +41.4%; 16 flip velocity provenance.**
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
   every gate. Three deliberate sweeps beyond the suite, each naming its count: the canonical
   round-trip over **50 recordings** (0 findings, first try); **1 of 50** recordings on the
   spliced-descent path; **13 of 47** reporting a descent rate with no landing — not a defect, since
   all three flags that qualify it were verified reaching their surfaces, but it is the population
   that makes the Sev-1 one file away rather than hypothetical.
2. **Cold walk of the built export** at 390×844 across all six routes, plus the round-trip journey
   driven in the real app on the built SHA.
3. **`COMPETITION.md` rows 35 and 36 added** — the round-trip, where the field's bar was parity and
   what shipped goes past it; and its twin, the version stamp, which is a `GAP` and which AltosUI has.
4. **§9 counts: identical at both ends of the run.** Table at the top. None moved the wrong way.
5. **`BACKLOG.md` read and appended to** — 11 new entries, each with the measurement that makes it
   actionable. No existing entry was invalidated by this run's work.
6. **Both track questions.**
   - **D:** a flyer can save a flight as one file carrying every sample the logger recorded, and drop
     it back into Debrief months later to get the same flight — re-analysed by whatever the methods
     have become, rather than frozen at the version that exported it.
   - **P:** the touch floor is now a measurement of both dimensions on every route instead of one
     dimension on two routes, and it found a violation on all six the moment it could see width; and
     the 12,700-word methods page reads as 87 paragraphs instead of 51 walls, with paragraphs over
     400 words down from 11 to 2.
7. **`ROADMAP.md` updated** — D11 and P4 to IN PROGRESS with what each slice delivered and what is
   left, P9 slice 2 marked shipped with corrected numbers, and two decisions under *Decisions taken
   without the owner* with the alternative rejected in each.
8. **`OWNER-NOTES.md`: zero notes are open without a verdict.** All eight carry verdicts dated
   2026-08-08 from the previous run and none is new, so nothing was owed a verdict this run. One item
   was ADDED to *Awaiting the owner* — the attribution-footer conflict at the top of this file.
