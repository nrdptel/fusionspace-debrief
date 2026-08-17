# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **Shipped to production** | **`92c913e` (#196) — merged and LIVE**, confirmed by fetching `version.json` rather than assumed. **Do not count from this line — measure**: `git fetch --prune origin && git log --oneline origin/main \| head -3`, then `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. |
| **Pending** | **#197, two commits, both tracks, gate green locally and `frontend` green on CI.** Merging it on green is pre-authorised and is the FIRST thing to do next run if it is still open. |
| **Sev-1** | **None inherited** — the baseline gate was green before anything was touched (unit 1,423 across 91 files with the corpus attached, build clean, e2e 354). **Two FOUND. One fixed and live; one MEASURED and deliberately NOT fixed** — see below, and read that entry before touching `padBaseline`. |
| **D — capability** | **D10's OpenRocket design overlay SHIPPED** — the capability its own two lists disagreed about, uncounted for four runs. **Five of the six *done when* capabilities now have a sample. The coarse-GPS flight is the last one.** |
| **P — product & craft** | **P1: the Recovery section stopped deleting itself**, and `EmptyState` adopters 3 → 4. §9 counts at the end of the run: radius drift **0**, off-scale spacing **0**, half-step **42** (shell; 66 in the test), off-scale type **1** (the wordmark floor), card treatments **3**, inverted **10 of 51**, `./ui` importers **40 of 51** (was 39). **Nothing moved the wrong way.** |

## The Sev-1 that is FILED rather than fixed — read this before touching the analyzer

**`lib/analyze/index.ts:409` fabricates a ground datum from three CLIMBING samples, and four real L1
logs file an apogee 67–116 ft low.** `padBaseline` walks forward while a sample stays within 6 m of
the first, then does `baseEnd = Math.max(3, baseEnd)`. On a record that starts already airborne the
loop never advances, so that `Math.max` does not extend a short pad window — it invents one out of
three points on the ascent.

| fixture | raw `Alt AGL (ft)` max | Debrief | error |
|---|---|---|---|
| `discovery-L1` | 2450.3 ft | 2353 ft | −97 ft (−4.0%) |
| `penguin-L1` | 2526.5 ft | 2460 ft | −67 ft (−2.6%) |
| `swiss-cheese-L1` | 2554.2 ft | 2452 ft | −102 ft (−4.0%) |
| `the-gardener-L1` | 2536.7 ft | 2421 ft | −116 ft (−4.6%) |

**It is not fixed because all four candidate repairs were measured and each breaks a different real
log worse than the bug it fixes.** The full table is in `BACKLOG.md`; the short version:

1. `datum = 0` — exact on the four AGL logs, turns a correct **171 ft** MSL reading into **6,220 ft**.
2. a low-percentile floor — within ~0.5% on most, moves a 13,304 ft flight to **12,498 ft**.
3. caveat every approximate baseline — fires on **25 of 59** records, most of which read correctly.
4. believe an `AGL` header — killed by a file carrying BOTH `Alt AGL (ft)` and `TRACKER Alt asl`
   whose altitude Debrief reads off the **asl** column.

What is actually needed is a way to tell an AGL datum from an MSL one **for the column being read**,
which no heuristic can do from inside the record. That is a milestone, not a patch. `expected.json`
asserts no apogee on any of the four, which is why the gate is green over a number that is wrong.

## The finding that should change how the next session reads its own agents

**Three pre-push reviews ran this session and every one found something real** — and in two cases the
worst finding was an honesty error inside an honesty fix, which is now the third consecutive run to
record that shape:

- The parachute-Cd card, whose whole purpose was to stop asserting a terminal rate, **still closed
  with "Assumes the main reached a steady rate" on the very branch that had none.**
- Its caveat said the whole-descent average is *"the faster of the two legs"*. It is
  `legRate(apogee, landing)` — a time-weighted blend lying strictly BETWEEN them. The code comment
  eight lines above had it right and the user-facing sentence did not.
- The design sample's `groundhitvelocity` was the **drogue** rate, because the variable was named
  `landingSpeed`; `optimumdelay` was a typed-in 2.8 s against a seventeen-second coast.

**And an opening-fan-out finding was REFUTED by measurement, which is the other half of the lesson.**
An agent reported that `sm:min-h-0` defeats `globals.css`'s coarse-pointer 44 px floor on the mapper's
selects, with a specificity argument. Measured in a real browser at 834 px with `hasTouch`: **all six
render at exactly 44.0 px.** The floor holds. A whole P-track slice was scoped on that finding and
was not built. **Reproduce before you scope, and reproduce in the state the defect lives in.**

## Checks that could not fail — four found, three shipped by me

1. `parachuteCd(m, A, 0.8v, ρ) > parachuteCd(m, A, v, ρ)` — true of every positive input by the
   definition of the function; green with the whole change reverted.
2. `expect(ParachuteCd.tsx).not.toMatch(/mainDescentRate/)` — the card is handed a number and never
   sees a `FlightMetrics`, so there was nothing there to find.
3. `maxvelocity / maxmach` inside the parser's band — the generator writes
   `maxmach = maxvelocity / SOUND_MS`, so that ratio is identically `SOUND_MS`.
4. The ground-track sweep's `expect(withGps).toBeGreaterThan(0)` — passes on a public clone that
   examined one committed fixture, turning "0 recordings reach this branch" into "no recordings were
   examined". It now asserts a floor of 3 without the corpus and 16 with it, **and prints the count**.

**The replacement for (3) took two mutants to get right**, and that is the transferable part: scaling
the flight's heights and speeds alone freezes `timetoapogee`/`flighttime`/`optimumdelay`, which are
read off a clock the mutant never touched; scaling heights, speeds AND time together freezes
`maxacceleration`, because dv/dt is invariant when both halves are halved. A figure counts as
typed-in only if it is frozen under **both**.

## What shipped, in order

- **`191316f` + `6a05b71` → merged as `92c913e` (#196), LIVE.** The parachute Cd names which descent
  it was read off, and the `.json` gained `landingEnergyBasis`. Over the corpus the whole-descent
  fallback carries **23 of the 38 flights that land inside their own record**.
- **`11e5fd9` (#197, pending)** — the Recovery section says why it has no ground track, instead of
  deleting itself. **It also repaired a link to nowhere**: `FlightReport` adds a *Recovery* nav entry
  on the same condition, pointing at an id that lived on the heading the branch deleted.
- **`e52b0a6` (#197, pending)** — D10's design overlay. Reads **Predicted 5,248 ft against a flown
  5,467 ft**, verified by driving the app.

## Pick this up first

1. **Merge #197 if it is still open.** Both jobs were green on the previous SHA and `frontend` on
   this one; check `e2e` and merge. Then confirm production moved.
2. **D10's LAST capability: the coarse-GPS flight.** Everything it needs now exists —
   `lib/synthetic.ts` has `toSingleLoggerCsv` (a generated flight that PARSES, which the mapper
   samples cannot), and the labelling plumbing is done. That closes D10's *done when*.
3. **P1's remaining audit rows, which this run RE-RANKED by measurement** and the ranking is the
   useful part: row 8 is **already fixed**, row 11 is **refuted and pinned refuted** by
   `e2e/analyze.spec.ts:710`, row 10 is **three-quarters refuted** (the capability exists in four
   places; adopting `DataTable` would delete three measured phone layouts), and row 9 has **shrunk by
   more than half with both its stated reasons now false**. What is genuinely left: **row 7**
   (`SampleTable`'s `text-[11px]` on the caption that TELLS a flyer the table sorts and copies) and
   **the caveat half of row 5** (the explorer plots a `velocityUnusable` trace with the caveat only
   in the stats table below). Two NEW rows worth more than most of the list: **`GroundTrack.tsx`'s
   legend swatch hand-rolled at eight sites in two sizes**, and **six raw `<select>` in four
   geometries with no §5 word** — but read the refutation above before scoping the second.

## The corpus

Attached as a second repository and symlinked, which is the intended path:
`ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm it took by reading the suite's
own counts — **50 corpus recordings**, **59 flights that analyse end to end**, and now **16 GPS
recordings** named by `lib/groundTrackEmpty.test.ts`, which prints its own count for exactly this
reason. A run that cannot say those numbers did not have a corpus.

## Environment

`npm install` first — `node_modules` arrives empty. Then `npx playwright install chromium`: the image
ships chromium-1194, this Playwright wants 1228, and `playwright.config.ts` refuses the mismatch on
purpose. It succeeds through the proxy in about a minute. Do **not** set `PLAYWRIGHT_CHROMIUM_PATH`
afterwards. Both remain standing candidates for the environment's setup script — this is the third
run to pay for them by hand.

**Four CPUs.** The opening fan-out ran 8 agents at 2 concurrent and took ~38 minutes; size it
accordingly. ONE GATE AT A TIME still holds.

**Read the LOG, not the harness's exit status.** A backgrounded `( … ) & sleep 5; echo started`
reports the *launcher's* exit code, and the harness announces "completed (exit code 0)" while the
build is still running. Write the rc to a file and poll for the file. This cost time again this run.

The git identity arrives as the harness vendor's default and must be set per-repo before the first
commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. The harness also appends an
attribution footer to a pull-request body after posting; read the body back and strip it. It did on
#196 and it was stripped. (It did not on the `update` path used for #197.)
