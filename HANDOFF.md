# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D7 SHIPPED — all four slices.** Slice 4 landed 2026-08-01: each recording of a staged launch now reports **its own** apogee, peak speed, peak acceleration, thrust-to-weight and burn on `/stitch`, side by side, combined with nothing. **9 recordings across the three staged corpus groups** report figures. `COMPETITION.md` row 23 records that no shipped tool in the field does this from flight logs. **Next: D8 — orientation and high-rate data**, which is NOT YET DECOMPOSED. |
| **P — product & craft** | **P1 IN PROGRESS.** Three §5 primitives that did not exist now do — `Frame`, `NumberField`, `Figure` — and hand-rolled card treatments are **10 → 7** against an honest floor of 4. Items **2**, **5**, **7** and **8** (3 sites left) remain, plus item 4's keyboard clause and item 12's `Panel`. Item **6** is DONE and was already at 0 before the work. |

**Three pull requests, #81 and #82 MERGED AND LIVE, #83 open.** Production was verified serving
**`60d7346`** with a cache-buster. #83 carries the `Figure` conversion and two corrections; its CI
was green on the first of its two commits at the time of writing. **Check
`git log --oneline origin/main..HEAD` before believing anything below reached production.**

## The one thing to read before anything else

**Two of D7's four slices had a FALSE PREMISE, both written from reading the code's intent rather
than running it.** Slice 1's stated first slice was already shipped. Slice 4 said the composite
"describes itself as though it were one motor" — and `lib/composite.ts` says in its own first
paragraph that it **merges nothing**, `Composite` has no metrics field, and `StitchSurface` never
imported `metricTiles`. There was no merged reading to make stage-aware.

The real gap was the opposite: the composite had held every recording's whole analysis since D4 and
surfaced exactly ONE number off it. **Open any decomposition by executing the thing it claims is
missing.**

**And an opening fan-out reported a finding that was half right in a way that would have shipped a
wrong number.** It claimed the corpus's staged flight shows "exactly two burns, thresholds 20/40/60
all agree, corroborated across two boards". Run on `series.acceleration` the same file gives **39
runs**; the corpus test uses `series.axialAccel`, and on that channel it really is two. Both the
finding and its refutation were reproduced before anything was written. **Check which CHANNEL a
claim about acceleration was measured on before acting on it.**

## The other thing to read before anything else

**I filed two findings without reproducing them and both were wrong, in the same direction.** Both
claimed a surface "vanishes" and neither does: `ChannelExplorer` hides its remove control on the
last channel and re-seeds its selection per flight, and `GroundTrack` is only rendered when the
flight has GPS at all. They were caught by trying to reproduce before scoping a fix, which is the
order `MAINTAINING.md` gives and which filing them had skipped. Both are corrected in full in
`BACKLOG.md` rather than deleted. **The agents made the same class of error twice this run and so
did I — treat every "there is no affordance" claim, including your own, as unreproduced until you
have driven it.**

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all three
green before every push. The corpus was attached throughout — `lib/parsers/corpus.test.ts` reports
**142 tests** — so no claim here rests on a suite that skipped itself.

### 1. P1 — `Frame`, the primitive this list has described for two runs and left unbuilt

Six sites shared a bordered-no-background treatment that is not a card and could not become one:
`SampleTable`'s and `ColumnMapper`'s scroll shells, `DataTable`'s, `FlightCard`'s `<canvas>`,
`GroundTrack`'s divided `<dl>` and its `Stat` tile, `FlightReport`'s event tiles. **Card treatments
10 → 7**, floor 4.

`SampleTable` is the proof the missing background is the point: its sticky `thead` is
`dark:bg-zinc-900`, which is exactly `Card`'s default dark fill, so a `Card` would flatten the
header band into the container on the `zinc-950` page. Verified on the built export — the converted
tile computes to `background-color: rgba(0, 0, 0, 0)` in dark mode.

`DataTable` takes the class string rather than the component, because its border is conditional on
`maxHeight`. **The treatment count cannot see a re-hand-roll** — it is a `sort -u`, so a sixth file
writing the identical string would move nothing — so a second assertion holds the treatment to one
file, falsified by putting the string back into `SampleTable`.

### 2. P1 item 6 — the count was 0 before the work, and the real defect was next to it

`ColumnMapper`'s two `variant="primary"` calls are in **mutually exclusive return branches**, so no
flyer ever sees both. The grep behind that entry counted a FILE where a SURFACE was meant. What was
genuinely wrong: an indigo TEXT button hand-rolled beside the real primary — the primary weight's
colour worn as a link. Now `secondary` and `ghost`.

### 3. D7 slice 4 — each stage's own readings, on the surface that knows they are one launch

`stageTiles` in `lib/readings.ts` is a subset of `metricTiles` selected **by label**, so a stage
panel cannot invent a reading, cannot format one differently from the single-flight grid, and cannot
drop a qualifier. Nothing is combined: a booster's apogee is where the booster came down.

Kairos booster reads *Apogee 2,973 m · 332 m/s · 84.6 g · **T/W 5.0:1** · Burn 5.1 s · Burnout
1,012 m* beside its sustainer at *4,045 m · 366 m/s · 9.5 g · Burn 4.8 s*.

The e2e reads the NUMBERS, not the headings — a panel with every label and no values is exactly the
shape a broken data path takes when `recordings` is new state. Falsified by pointing every stage at
the first recording's metrics and watching the two apogees become one string.

### 4. P1 item 12 — `NumberField`, and a bound that was applied silently

§5 gives it a duty no other primitive has and it did not exist; nine inputs hand-rolled it. **The
bound was never missing — it was SILENT.** Type 50,000 ft into the main-deploy check and you got
29,528 with nothing saying why. Six of the seven same-shaped panels are converted.

**The primitive cannot see this from its value**, which is the detail worth keeping: these fields
are controlled by the already-clamped number, so by the time a value arrives it is in range and the
refused figure is gone. The first version read the bound off `value` and was *incapable of ever
firing* — it passed review, `tsc` and a build, and only the e2e caught it.

Two of the four findings against it were reachable and fixed (a rounded cap refused 39.2 in on a
39.370-in bound; the invalid border was under 3:1). **Two were NOT reachable and are recorded as
such rather than banked as fixes** — the render-time reset and the external-change guard are kept
because they are correct, and their comments say plainly that no bug was measured behind them.

### 5. D8 decomposed, and the measurement moved the milestone

**There is no ingestion ceiling**: worst case 901 ms for 36,700 samples over 10.7 MB, top rate
114 Hz. The blocker is that the **192,001-row Blue Raven high-rate file** carrying `Gyro_X/Y/Z`,
`Accel_X/Y/Z` and `Quat_1..4` is REFUSED — correctly, for having no altitude — so the richest
recording in the corpus reaches no surface. And nothing names an orientation channel: everything
beyond altitude/velocity/Mach/Q/acceleration arrives as `r-0`…`r-12`.

### 6. P1 item 12 — `Figure`, and an empty state deleted rather than shipped

`ChartBlock` was declared separately in `FlightReport` and `CompareView`. Both are gone. **An
`empty` prop was written, wired, tested and removed**: `CompareView` filters its channel list to
metrics at least one flight recorded, so the state is unreachable there and the e2e for it could
never have failed.

### 7. Three false claims in the repo, corrected by measurement

`lib/stitch.ts` called `meraki2` an "ordinary SINGLE-stage flight". The fixtures manifest names its
motors: **an O7800 booster and an N3100 sustainer**. `lib/composite.ts` said "no corpus record holds
two separable burns"; one does. `ROADMAP.md` P1 item 3's dark-surface census said "everything else
0"; it is `zinc-800` ×2, `zinc-700` ×1, `zinc-100` ×1, because the sweep enumerated three opacity
forms and could never see a bare shade.

## Traps this run hit — read these before repeating them

- **`git checkout <file>` to undo a falsification reverts the WHOLE file**, including the conversion
  you spent twenty minutes on. It happened here to `SampleTable.tsx` and the loss is silent —
  `git status` simply goes quiet. Undo a falsification with the inverse `sed`, never with `checkout`.
- **A JSX comment cannot sit beside the root element of a `(...)` body.** `{stages.map((s) => (
  {/* … */} <Frame>` is a syntax error, and the message (`TS1005: ')' expected`) points at the line
  AFTER the comment. Cost two builds; hit twice in one run, in `GroundTrack` and `StitchSurface`.
- **A failed `npm run build` leaves `out/` STALE and the e2e then tests the previous code.** The
  suite reported 10 passed / 1 failed against a build that never happened. Read the build's own tail
  before trusting an e2e result.
- **`series.acceleration` is not `series.axialAccel`.** The first is a resultant on some files and
  reads >20 m/s² through a high-drag ascent; counting thrust runs on it gives 39 where the signed
  axial gives 2. Every claim in this repo about "sustained thrust runs" is on `axialAccel`.
- **Two agent findings in one run were confidently wrong in the same direction** — both overstated
  what the corpus supports. Reproduce before scoping; it cost nothing and would have shipped a
  staging detector fitted to one example.
- **The harness classifier intermittently refuses ordinary `grep | sort | uniq` pipelines** and
  refuses `add_repo` for the sibling. Route around with the `Grep` tool or a simpler command; do not
  read a refusal as a repo problem.
- **`pkill -f e2e-server` matches its own shell** and kills the command that ran it (exit 144).
  Unchanged from last run and hit again. Put it in its own call.
- **`mcp__github__pull_request_read` with `get_check_runs`** is the cheap, working call
  (`get_status` reports `pending`/`total_count: 0` forever on this repo).

## The §9 counts

| count | start of run | end of run | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 10 | **7** | floor 4, not 1 |
| inverted-type files | 15 | **15** | floor at least 4, not 0 |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 31 | **32** | most of the 46 |
| `Frame` adopters | — | **6** | — |
| `NumberField` adopters | — | **6** | the 7th is `CropControl`, deliberately not |
| `Figure` adopters | — | **2** files, 4 call sites | — |

**No count moved the wrong way.** Read `files importing the primitives` 31 → 32 carefully: the six
panels that adopted `NumberField` moved it by **zero**, because every one already imported `Card`.
A per-FILE count cannot see six controls being adopted — which is the third time a §9 metric has
measured something other than what it was reached for, and the argument for the per-primitive map
in `lib/design-system.test.ts`.

## Pick up first

1. **D8 slice 1 — read the Blue Raven high-rate file as a SECOND RECORDING of a flight it does not
   itself contain.** Decomposed with its measurements in `ROADMAP.md`. The machinery exists: the
   model is multi-source-ready, `lib/stitch.ts` aligns recordings on a shared instant, and D6's
   filename stamp already pairs `…HR_04-12-2025_12_45_49` with its `…LR_…` sibling to the second.
   **The standalone refusal must survive unweakened** — a file with no altitude is not a flight, and
   that clause is in the slice's own *done when* rather than left to judgement.

2. **The staged burn time is the sharpest unfixed thing this run found, and it is filed with its
   blocker.** `burnTime` on `meraki2` is **23.91 s of which 15.79 s the motor was not burning** —
   two ascent runs, T+0.00–4.46 and T+20.25–23.83, on a stated O7800 + N3100. The ignition is
   unmistakable: signed axial steps −15.7 → +92.7 in one 0.25 s sample, peaks at 549 m/s², speed
   427 → 1,663 m/s. **Do not build a detector on it.** `iss-endurance`, one motor by its manifest,
   produces a second run too (T+5.65–6.95, peak 80.7 m/s²) inside a stretch where the record repeats
   a sample and its altitude goes backwards. One example against one example is fitting. **What
   would settle it:** a second staged record in the corpus, or endurance's second run checked
   against the StratoLogger that flew with it.

3. **P1 item 12 is new and one of its three entries has a SAFETY duty.** Three of `DESIGN.md` §5's
   named primitives do not exist at all — `NumberField`, `Figure`, `Panel` — and nine runs of
   counting adopters never surfaced it, because a primitive with no implementation has no adopters
   to be short of. `NumberField` is the one to take first: §5 gives it the refusal behaviour the
   SAFETY invariant requires, and it is hand-rolled at **9 sites**, each re-deriving its own bound.

4. **`GroundTrack` returns `null` with no GPS fix** (`:466`), so the whole recovery surface does not
   exist rather than being empty, on every baro-only log. P1 item 5's most visible instance.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed six `DESIGN.md` §9 edits**, unchanged for four runs, plus the
open question about whether §9's `uiAdopters` grep should read `components app`. **`add_repo` for it
was attempted this run and REFUSED by the harness classifier**, so this is not a matter of nobody
having tried — a session that can push both repos has to be created with both attached.

**Two `DESIGN.md` §5 edits are now owed as well**, and both are deliberately NOT made here because a
one-sided edit forks a file both repos carry identically:
- **`Frame` is not listed in §5** though it now exists and has five adopters. §9 already sanctions a
  named non-card primitive in prose, which is why building it was in scope; naming it in the
  vocabulary is not.
- **The invented "indigo text" button weight** appears at `ColumnMapper` (fixed) and
  `RecentFlights.tsx:835` (not). It wants either a `Button` variant or a documented fifth weight.

Also still owed: the bare-`rounded` guard, and a decision on whether `DataTable` is Debrief-only.

## The fixtures repo

Nothing shipped there this run. **`VERSION` says `v1.0.0` while `corpus.lock.json` pins `v1.1.0`**,
so the attached checkout and the corpus that gates CI are not provably the same — unchanged, and
still the reason any corpus statistic has to be written as a superset or a floor.

**Worth adding, each with a reason:**

- **a SECOND genuinely staged record**, which is now the single highest-value fixture this corpus
  could gain — it is the thing standing between the staged burn-time defect and a fix;
- a launch day where one flyer's two files were dropped together;
- a Blue Raven pair whose LR file carries a `Sync` column;
- a descent-rate ground truth in a machine-readable column.

## Environment notes

- **Git identity defaults to the harness's** — `Claude <noreply@anthropic.com>`, which the zero-trace
  invariant forbids. Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **142 tests**. Far fewer means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. **This
  is paid again every session and belongs in the environment's setup script.**
- **4 CPUs**, so a workflow's concurrency cap is 2: a three-agent fan-out runs two then one. Keep the
  browser-driving walks in a separate wave from the file-reading agents, and never run the gate
  across either.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`.
