# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **A Sev-1, reproduced and shipped — and the FIRST fix for it was wrong** | **The deployment shock was under-reported by up to nine-fold.** 12 of the 23 shocks the corpus publishes moved, and **11 of the 12 went UP**. Kairos Booster's apogee charge is **84.6 g**; the old code published **22.8 g** from the `.csv` and **1.5 g** from the `.eeprom` — one board, one launch, one charge — and neither number was the charge. `#130`. |
| **The lesson of this run, and it is the whole run** | **My first fix made the reading worse and looked like a 97x improvement.** The obvious defect — a window sized in SAMPLES from the record's median interval — is real and I fixed it. But the second defect underneath it is that **a charge does not fire at the index Debrief detects the deployment at**, so a *tighter* window reads the quiet coast beside the charge and reports that as the shock. The pre-push review caught it. See *The one thing to read before anything else*. |
| **What actually protects this repo** | The pre-push second opinion, again — two independent reviewers found the regression, and a third found that the corpus invariant I wrote to pin the fix **compared three apogees and silently dropped every main**, which is the one event the bracket exists for. A test that skips the case it was written for reads exactly like a pass. |
| **D — capability** | **D9 slice 4, first half SHIPPED.** `lib/parsers/openrocket.ts` now reads the saved trace out of `<databranch>` — 2,580 datapoints across five simulations in the corpus design, columns matched BY NAME. Nothing is drawn yet; the chart half is next and `Chart.tsx`'s shape is recorded below. |
| **P — product & craft** | **P1's measuring instrument was blind, and that is now fixed.** Three of `DESIGN.md` §9's six greps reported **0 against seven live violations** in a fixture. Corrected, they report 3/3/1. Against the real tree **no count moved** — 0 · 3 · 0 · 1 · 10 · 36 of 48 — which is the honest result: the instrument was broken and nothing was hiding behind it. Two greps are still blind, measured, and deliberately left, because the obvious correction makes each worse. |
| **A change owed to the sibling repo** | `DESIGN.md` is carried identically by both repos and a change to one is owed to both **in the same run**. The sibling was not attached to this session, so the §9 correction is **unshipped there**. It is a copy-paste of §9's block plus the two paragraphs under it. |
| **Gate hygiene** | `vitest.config.ts` now sets `testTimeout: 30_000`. A full run had gone red at exactly 5,000 ms on a test that measures 2,433 ms alone, and passed on the next attempt. `#130`. |

**Re-measure before believing any of this**: `git fetch --prune origin`, then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## Environment, established at session start — none of it assumed

- **The corpus was attached and real throughout**: `nrdptel/debrief-fixtures` on disk, symlinked into
  `lib/parsers/__corpus__`. `manifest.csv` carries **62 fixtures**; the digest snapshot covers **50**.
  `FIXTURES_TOKEN` is NOT set, so `npm run fetch-fixtures` is a no-op — the attached checkout is the
  whole reason there is a corpus.
- **The clone is SHALLOW.** Any commit count or file history quoted from it is a window, not a record.
- **Playwright needed `npx playwright install chromium`** (114 MB, ~1 min). **Paid for again every
  session; it belongs in the environment's setup script.** Said for at least the fifth run running.
- **`git config user.name/user.email` arrived as the harness vendor's default** and were set before
  the first commit. A fresh container will NOT have them. This is a zero-trace breach if missed.
- **GitHub appends an attribution footer to every PR body.** It did again on `#130`; stripped by
  reading the body back and re-posting. Do not skip that step.
- **Subagent tooling failed hard, then recovered.** For one whole fan-out every subagent's tool calls
  were rejected by the harness permission layer ("the permission handler returned updatedInput …
  required parameter missing"), so all 8 returned BLOCKED. A one-agent probe minutes later worked.
  **If a fan-out comes back unanimously blocked, re-probe with one agent before concluding anything**
  — and note the agents were right to return BLOCKED rather than NONE, because NONE from a screen
  that examined nothing is the false all-clear this repo keeps warning about.
- **A schema on `agent()` broke all 8 agents** of the first fan-out (StructuredOutput retry cap).
  Plain-text returns with a stated format worked. Prefer the text contract.

## The one thing to read before anything else

**The obvious version of a fix can be worse than the bug, and this run has the cleanest example of it
the repo has produced.**

The deployment shock was read over `round(0.3 / dt)` SAMPLES, `dt` being the median interval of the
whole record. That is a property of the FILE — a board writes the pad slowly and the boost fast, and
AltusMetrum writes the same recording again at a different rate as a second export format — so the
span really covered ran **0.13 s to 8.24 s**. Kairos published 22.8 g and 1.5 g for one charge. All
of that is true, and it is the finding the opening fan-out returned, correctly, as a Sev-1.

**The fix that follows from it is wrong.** Convert the window to ±0.3 s of clock and the numbers
become beautifully self-consistent between exports — and systematically wrong, because:

> **A charge does not fire at the index Debrief detects the deployment at.**

- **Apogee** is the maximum of the altitude trace. Every apogee charge in the corpus fires
  **0.35–0.78 s before it**. stargazer1's is a single **63.2 g** sample at −0.70 s, with the
  barometer visibly disturbed for the second after — the rocket coasting at 14.5 m/s, 0.7 s short of
  a 570 m apogee.
- **Main** is detected from the CHANGE IN DESCENT RATE, which the charge *causes* rather than
  coincides with — the canopy has to open and the rate has to settle before there is anything to
  detect. That lag is **2.0–2.9 s**.

So ±0.3 s at the detected index took stargazer1 from 63.2 g to **0.65 g** and SG1.1's main from
26.5 g to **1.9 g** — understating the snatch a flyer sizes a shock cord against by 14x, in the
direction that looks safe. The old code caught those two only because its window happened to be
seconds wide *on those files*; on Kairos it missed the real 84.6 g charge entirely.

**Both readings were wrong. Only one of them was wrong in a direction that looks like a fix.** The
shipped answer is a bracket of clock that is deliberately lopsided: `[1.0, 1.0]` s at apogee,
`[3.5, 1.0]` s at main, each set past the largest lag measured rather than at it.

**And the test I wrote to pin it was nearly vacuous.** It compared three export pairs and skipped any
pair whose two exports placed the event more than the window apart — which dropped SG1.1's main, the
only main in the set, so it certified three apogees and read as a pass. It now asserts *by name* that
SG1.1's main is among what it compared. Falsified against **both** wrong versions: the original fails
on Kairos apogee, the symmetric attempt on SG1.1 main.

**The generalisable rule.** When a reading is taken *relative to a detected event*, there are two
independent questions — how wide is the window, and **is the event where the thing actually
happened?** Fixing the first while assuming the second is how a correction ships a regression. Ask
of any windowed reading: what detects the centre, and does that detector lag what it is detecting?

## What shipped this run

One pull request, `#130`, two commits.

### 1. The Sev-1 — the deployment shock, read where the charge fired

| reading | before | after |
|---|---|---|
| Kairos Booster apogee, `.csv` | 22.79 g | **84.59 g** |
| Kairos Booster apogee, `.eeprom` | 1.51 g | **84.59 g** |
| lilnuke 1785 apogee | 3.60 g | **32.08 g** |
| lilnuke 1784 apogee | 3.84 g | **32.05 g** |
| irec2023 EasyMega apogee | 5.60 g | **20.15 g** |

12 of 23 published shocks moved by more than 10%; **11 of the 12 went up**. 20 corpus digests
regenerated. `peakAbsInWindow` (a SAMPLE window) is gone and `peakAbsInTimeBracket` replaces it —
the sample-count primitive was the hazard, and it had exactly one caller, which was wrong.

**Verified that nothing but this reading moved**: the committed digest recomputed with `peakAccel`
excluded is byte-identical on every affected flight. That check is worth repeating for any analysis
change — it separates "the digest went red" from "something I did not intend moved".

### 2. A suite timeout the corpus half can finish in

A full run went red on `blueraven.test.ts`'s roll-angle sweep at exactly 5,000 ms; the next run
passed 1,155/1,155; the test measures 2,433 ms alone. 15 declarations already carried a hand-written
60–300 s timeout to escape the stock default and 25 more were left on it. `testTimeout: 30_000`.

**It turned up a live unreachable assert.** The damaged-download sweep allows ONE trial 8,000 ms
inside a test the default killed at 5,000 ms — so its own message, which names the file, the trial
and the byte count that spun, could never fire. A guard now holds the two numbers in a relationship.

## What was REFUTED rather than fixed — read this before re-filing it

An agent filed **`dragLossAltitude` publishing 37,580 m on a 3,576 m apogee** as a Sev-1, on the
reasoning that a drag loss ten times the flight is self-evidently impossible. **It is not.** A rocket
burning out at 447 m/s would coast ~10 km in a vacuum and manages ~3.4 km in air; the difference IS
the drag loss, and it exceeds the apogee on **17 of 28** corpus flights as a matter of ordinary
physics. Measured and dismissed — do not spend an increment on it.

What is real underneath it is much narrower and is filed in `BACKLOG.md`: `coastEfficiency` and
`dragLossAltitude` are quadratic in a possibly-derived burnout velocity and say nothing about it,
while **max Q — twelve lines below them in `lib/readings.ts` — says exactly that**, having been fixed
last run by `#125`. Same one-panel-caveated, one-panel-bare pattern, same file.

## Pick this up FIRST — a Sev-1 candidate, filed unverified

**`lib/explore.ts:193` pushes the `d-velocity` channel with no `velocityUnusable` gate, while
`:210` and `:218` gate Mach and max-Q on exactly that flag.** So the channel explorer's window-stats
table and its *"Copy these stats"* button — whose own comment calls these *"the numbers a cert
document quotes"* — appear to publish a peak speed that `lib/readings.ts:62` and `lib/report.ts:215`
print as *"withheld — …"* on the same flight. That is `analyzedDataCsv`'s already-fixed defect
reappearing on a different surface's clipboard export.

**It was reported by an agent and this run ended before I reproduced it by hand, so it is a claim,
not a finding.** Reproduce it first — this run has already proved twice over that a confident
report can be wrong in both directions. If it holds it preempts the milestone. Full entry, with the
reported repro, at the top of `BACKLOG.md`.

## Pick this up first

1. **D9 slice 4**, still. Scoped in `ROADMAP.md` and not started. What was read this run and is worth
   not re-reading: `components/Chart.tsx` takes `time: Float64Array` plus `series: ChartSeries[]`
   (`{label, values, stroke, width?, axis?}`) and builds `[time, ...series.map(s => s.values)]` at
   `Chart.tsx:282`, so **every series shares one x array** — that is the whole constraint.
   `spanGaps` is not used anywhere yet. `bracketUnsortedX` (`:50`) is the existing precedent for
   synthesising x samples. `lib/parsers/openrocket.ts` already tracks `hasSeries` per run
   (`/<databranch\b/`), so the "does this design carry a curve" question is answered.
2. **The 2 g floor on the shock is applied by four surfaces and skipped by two** (`BACKLOG.md`), and
   never says it exists. `analysisJson` and the device cross-check have no gate where the screen and
   the three documents do — so one report can print `—` in its Events table and a number in its
   cross-check table for the same event.
3. **The shock should have to LOOK like a transient before it is published.** `intrepid2` publishes
   30.4 g off a record that ends mid-boost, where every sample in the bracket reads 29.0–30.4 g — a
   thrust plateau, not a charge. That is a second change to the same reading and wants its own
   corpus validation, which is why it was filed rather than bolted on.

## What shipped after the Sev-1 — one increment on each track

### D9 slice 4, first half — the predicted curve is READ (not yet drawn)

`<flightdata>` carries the ten summary scalars; the curve sits beside them as `<databranch>`, a
`types=` header and one comma-separated `<datapoint>` row per sample. The corpus design holds
**2,580 rows across five simulations, 233–695 each, over 58 columns** (the roadmap said 46 — it is
58, corrected by measurement).

**Columns are matched BY NAME and the trace is dropped when they are not found.** Shipped
OpenRocket 24.12 writes **localized** column names; only unstable 26.x writes stable save keys. So a
design exported from a non-English install states the same columns under different words, and
reading position 1 because that is where `Altitude` sat would draw a confident line off whatever
column happened to be there. `hasSeries` and `series` are separate fields for that reason: *there is
no curve* and *there is a curve I cannot read* are different sentences.

**The file cross-checks the read against itself, and that is the pin.** `maxaltitude` and
`timetoapogee` are attributes written independently of the rows, so the parsed trace's peak has to
agree with the figure the same file states. It does on all five: 50.59 m at 3.48 s, 135.07 at 5.26,
278.66 at 5.42, 316.58 at 7.26, 319.75 at 7.81.

**What that corpus case cannot catch is written into it**: this design's launch site is at elevation
0, so `Altitude` and `Altitude above sea level` are identical over every row (measured: max
difference 0) and pointing the reader at the wrong one leaves it green. A synthetic case covers that
with the site 120 m up and an unrelated column between the two.

### §9's compliance block can see the drift it is written to catch

Given a fixture holding `rounded-2xl`, `rounded-sm`, `rounded-[10px]`, `p-[13px]`, `gap-[18px]`,
`mt-[37px]` and `text-[13px]`, the old block reported **radius 0, spacing 0, type 0**. The corrected
block reports **3, 3, 1**. They read a class ATTRIBUTE's contents now, because matching raw text
made the radius check count the words "rounded" and "Grounded" in prose.

**Still blind, measured, deliberately not changed** — both need the ratchet to move with them and
the obvious correction makes each worse:
- the **card grep** anchors on the literal `rounded-xl border` and scans `components` only, but an
  attribute-reading rewrite reports **0 where the truth is 3** — those treatments are not
  single-line `className` literals;
- the **inverted-file loop** never measures a route. Adding `app/**/*.tsx` takes it **10 → 12**, and
  the two are real: `app/validation/page.tsx` (1/0), `app/privacy/page.tsx` (4/3).

## Not done this run, and why

**The chart half of D9 slice 4 is not built.** The constraint is recorded under *Pick this up
first*: `uPlot` has one x array for every series, so a prediction on its own clock cannot be pushed
into `series[]`, and resampling it onto the flight is forbidden by the slice's own text.

The opening fan-out returned **2 of 8** agents on its first run (the rest lost to the harness fault
above) and a second round was still in flight at the end. So the **phone cold walk, the tenth-use
walk and the honesty surface sweep did NOT run**, and `COMPETITION.md` gained **no row this run** —
which is a standing obligation missed, not a judgement call. Those are owed.

The design-system audit and the P1 scout DID come back, and both are worth reading before touching
P1: item 7's recorded count of 41 hand-rolled `<button>`s measures **18** (of which ~4 are genuinely
convertible), item 2's "16 of 46" is stale against the ratchet's current 10 of 48, and
**`ROADMAP.md:2266` still calls `offline` "the thing to fix first" while `DESIGN.md:308` records
Debrief offline-complete** — a live contradiction with P1's own header. The real item-5 finding is
`loading`: no primitive, four hand-rolled treatments across four files with four different
type/tone/a11y contracts, and `StitchSurface` has no live region at all.
