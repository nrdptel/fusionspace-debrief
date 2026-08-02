# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D8 slice 1 SHIPPED.** A Blue Raven's 500 Hz high-rate half is now read onto the flight its low-rate half recorded — gyro, accelerometer and the board's attitude, peak-preserving, with the standalone refusal untouched. **Slices 2 and 3 remain**, and slice 1 narrowed slice 2: the channels already arrive LABELLED (`Gyro X`, `Accel Z`, `Quat 1`), so what is left there is `ChannelKind` members, the units context, and the "this board did not record it" state. |
| **P — product & craft** | **P1 still in progress, and item 2 is DONE.** Item 5 started on the app's most-hit error surface. Item 2 closed the events grid and then the last three decision-grade numbers, taking inverted files to **13**. Items **7** (hand-rolled buttons, **29** not 39/41), item 4's keyboard clause and item 12's `Panel` remain. |

**Everything this run shipped is MERGED AND LIVE.** Four pull requests — #86, #87, #88, #89 — each
merged on green with `frontend` and `e2e` succeeding, and production verified with a cache-buster
after each. `main` is **`748090f`** and production served exactly that at 06:32:04Z. The branch was
restarted from `main` after every merge.
**Re-measure before believing this**: `git fetch --prune origin` then
`curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`. `main` moves underneath you.

## The one thing to read before anything else

**Two clauses of D8 slice 1 were false premises, and both were found by executing them rather than
reading them.** This is the third run in a row where that has been true, so treat it as the rule:

1. *"`lib/stitch.ts` already aligns recordings on a shared instant, which is the machinery this
   needs."* It is not. Stitch aligns DIFFERENT boards and returns `verified: false` because nothing
   establishes the offset. One board writes both halves off ONE flight clock — all four corpus pairs
   open within **0.062–0.108 s**, the sample phase of 500 Hz against 50 Hz. Reaching for stitch would
   have imported an estimate where an exact value was sitting in the file.
2. *"pinned over both corpus HR files."* There are **five**, and one is a different shape entirely.

**And the obvious implementation was a Sev-1 that a measurement caught before it shipped.**
Resampling 500 Hz onto the 50 Hz clock — what `multiTimebase` already offers, and what a subagent
recommended — loses **69.0%** of `jan18`'s `Accel_Z` peak: 264 g read as 82 g. Measure the reduction
before choosing it.

## The other thing to read before anything else

**The pre-push agent review found four real bugs in my own work, and the tests I had written could
not see three of them.** Do not skip that step, and do not treat your own falsification as
sufficient:

- **The quaternion was not a quaternion.** Reducing its four components independently by extremum
  takes each from a different instant; the merged norm averaged **1.0132** where a unit quaternion is
  exactly 1, and the note beside it said "the board's own attitude solution". **A rate has a peak
  worth preserving; an attitude has none** — |q| is 1 by construction. One reduction is not universal.
- **`railed()` flagged `Quat 1` as a saturated sensor on every corpus file**, because a normalised
  component's maximum repeats for thousands of pad samples. My test asserted that SOMETHING railed,
  which was true, so it stayed green over a fabricated safety warning.
- **The single-candidate pairing fallback would hang one download's stream on another's flight** —
  two files whose own names state launch seconds nine months apart.
- **The note it printed was false on `/compare`**, which never uses the ingested flights: it re-reads
  every flight from the logbook by id. The traces were absent there and gone after any reload.

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all three
green before every push. The corpus was attached throughout, so no claim here rests on a suite that
skipped itself.

### 1. D8 slice 1 — the high-rate half reaches a surface (`c833090`, `36ac3b5`)

Both halves share `Flight_Time_(s)`, so nothing is aligned or estimated; the only shift is the
flight's own re-basing, read out of the low-rate file by `flightTimeOrigin`. Rates are reduced by
per-window extremum so the board's peak survives exactly; the attitude takes one coherent sample per
window. Units are read off the data (`|accel|` pad 0.9935–0.9947 → g; `|quat|` 0.99998–1.00000), and
the vendor's Sept 2025 manual states the same schema.

**No axis is mapped to `accelAxial` or `rollRate`** — `lemiv` rests on X and `jan10` on Z, so the
board is mounted differently in different rockets. That is the whole reason slice 2 is not free.

Every corpus download rails a gyro axis (2,291.5–2,294.1 deg/s), flagged by name with its peak called
a floor. The test is the repeat count, not a rail value: a railed axis writes its maximum 13–6,729
times, an unrailed one once or twice, nothing in between.

### 2. A Sev-1 on the comparison surface (`86e6962`)

The `(baro)` tag was gated on flights DISAGREEING about their source, so it vanished where it matters
most. Two PerfectFlite altimeters in one airframe — the canonical comparison — are both baro:

| surface | what it said |
|---|---|
| metric grid | `2,781 ft/s` · *"Mach 2.52 · at 3,645 ft · derived, which usually reads high at the peak"* |
| comparison | `2,781 ft/s` · `Mach 2.52` |

The bare claim is that a rocket went supersonic. **Max Mach carried no tag on any path.** And a
withheld peak printed as an em dash, indistinguishable from a flight that never had one.

The distinction worth keeping: the old reasoning ("a tag on every cell would be noise") is right
about a COMPARISON and wrong about a CLAIM. What legitimately depends on mixing is the crown, which
moved to `rankBlocked`.

### 3. P1 — the error names its file, and four surfaces leave caption size (`d72288a`, #89)

Six of `Analyzer`'s ten error paths named no file at all. It renders through `ErrorState` now.

Then item 2 took every decision-grade number still below §3's floor: the events grid's main-deploy
height and deployment shock (the numbers a flyer sizes a harness against), `RecordingPicker`'s and
`FlightPicker`'s apogees and speeds (how a flyer decides WHICH recording to trust), and
`GroundTrack`'s walkback distance and bearing (read standing in a field deciding where to walk).
**Item 2 is done** — inverted files 13, and its target of 0 remains unreachable for the reason
`ROADMAP.md` states: a chip-built component is inverted while fully compliant.

### 4. §8's touch floor, and a number of my own I had to correct (#87)

The done-check walk filed "20 controls under 44 px" and it was wrong by 4x — see the traps section.
The honest figure is 3, one of which is fixed; the other two are §10-shared and owed to both repos.

## Traps this run hit — read these before repeating them

- **`ParseInput` requires `bytes`.** A helper that only reads text should take `text: string`, or
  every test call site has to fabricate a buffer.
- **`getByRole('alert')` is ambiguous on `/`** — `ForgetDeviceData` and the logbook's Clear
  confirmation are alerts too. Filter by text.
- **A `role="alert"` assertion about "which file failed" was scoped to the wrong surface.** The
  mapper's no-data branch was ALREADY naming its file properly; the honest e2e asserts the fact
  (the file is named where it is handled), not the surface.
- **The §9 ratchet fires on adoption in BOTH directions.** Adopting `ErrorState` moved `Analyzer`'s
  `text-sm` into `ui.tsx` and its `Card` import with it: inverted files 15 → 16, `Card` 27 → 26,
  `ErrorState` 1 → 2. Not one glyph changed size. Record it as the adoption effect — the repo has
  recorded the reverse direction twice — rather than re-baselining silently or "fixing" it.
- **`Required<RecentFlight>` in `lib/recents.test.ts` refuses to compile when you add a member.**
  That is the guard working; populate the fixture and `normalizeFlight` in the same commit.
- **Vitest's default 5 s timeout** is not enough for a test that parses four 64k–192k-row corpus
  files; pass an explicit timeout as the third argument to `it`.
- **A touch-target sweep has TWO traps, and hitting both reports 119 where the answer is 3.**
  Playwright's default context is `pointer: fine`, so `app/globals.css`'s `@media (pointer: coarse)`
  floor over `button`/`select`/`[role="button"]`/`input` does not apply — 119 becomes **20** with
  `test.use({ hasTouch: true })`. Then `getBoundingClientRect()` is not the tap area:
  `.touch-area` centres a 44×44 `::after` on a control so the target is 44 px while the ink is not,
  and **15 of those 20 are compliant that way** — 20 becomes **5**, of which two are captions above
  inputs that are already floored. **I filed the 20 before catching the second trap, and it merged.**
  `BACKLOG.md` carries the correction; read `::after` as well as the box.
- **The harness appends an attribution footer to a PR body.** It did again on #86. Read the body back
  and strip it — `MAINTAINING.md` warns about exactly this and it is a zero-trace breach on a public
  artifact.

## The §9 counts

| count | start of run | end of run | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 3 | **3** | 3 — a GUARD, may never rise |
| inverted-type files | 15 | **13** | not 0 — see below |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 34 | **34** | most of the 46 |
| `Card` adopters | 27 | **26** | — |
| `ErrorState` adopters | 1 | **2** | — |
| hand-rolled `<button>` outside `ui.tsx` | 29 | **29** | few — and `ROADMAP.md` said 39/41; it is 29 |

**Inverted files went 15 → 16 → 13, and the two moves are different things** — both recorded in
`lib/design-system.test.ts` with their reasons. The rise was the ADOPTION EFFECT: `ErrorState` took
`Analyzer`'s `text-sm` into `ui.tsx` and not one glyph changed size. The fall was REAL: three
surfaces stopped rendering a decision-grade number below §3's floor and glyphs did change size.
A count that cannot tell those apart is the trap §9 documents for the suite-wide ratio. `Analyzer`'s three remaining captions — a file name
inside "Reading …", the help line under it, the amber mapping note — are the "unit, provenance,
caveat" §3 says `text-xs` is FOR. It joins `EventChips`, `RecognizedFormats`, `SiteFooter`,
`FusionSpaceBadge` and `ChannelExplorer` as a file inverted while fully compliant.

## Pick up first

1. **D8 slice 2 — name the orientation channels, and only where the board recorded them.** Narrower
   than the roadmap thought: they already arrive labelled. What is left is `ChannelKind` members for
   gyro/quaternion, units through the units context, and the "this board did not record it" state.
   **The hard part is the one slice 1 refused:** no axis may be mapped to `rollRate` or `accelAxial`
   without knowing the mounting, and the corpus proves the mounting differs. AltosUI names them
   body-frame (`Roll Rate`, `Accel Along`) because the board's own config states the orientation;
   Debrief has no such statement. Either read one from the low-rate file's `Tilt_Angle`/`Roll_Angle`
   agreement, or ask the flyer — the same shape as D1's crop and D3's grouping.

2. **§8's touch floor: two plain `<a>`s remain, and both are owed to BOTH repos.**
   `SiteHeader.tsx:14`'s "Compare" nav link (18 px) and `SiteFooter.tsx:91`'s observance link
   (16 px). §10 makes the header/footer/nav pattern shared and non-negotiable, so fixing them here
   alone forks the suite — this needs a session created with Loft attached. `MethodsPointer`, the
   one that is Debrief's own, is fixed.

3. **P1 item 7 is smaller than the roadmap says.** 29 hand-rolled `<button>` outside `ui.tsx`, not 39
   or 41. Re-measure before budgeting an increment against any P1 number; 8 of 10 were stale.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed six `DESIGN.md` §9 edits**, unchanged for five runs, plus the
question about whether §9's `uiAdopters` grep should read `components app`. Not attempted this run —
the session was created with `debrief` and `debrief-fixtures` only.

**Two `DESIGN.md` §5 edits are still owed to both repos**, deliberately not made one-sided:
- **`Frame` is not listed in §5** though it exists with six adopters.
- **The invented "indigo text" button weight** survives at `RecentFlights.tsx:835`.

**And a third is now owed:** `DESIGN.md` §9's card grep is the only compliance command scoped to
`components` alone; every other one reads `components app`. Currently 0 hand-rolled cards in `app/`,
so the hole is latent rather than live.

Also still owed: the bare-`rounded` guard, and a decision on whether `DataTable` is Debrief-only.

## The fixtures repo

Nothing shipped there this run. **`VERSION` says `v1.0.0` while `corpus.lock.json` pins `v1.1.0`**,
so the attached checkout and the corpus that gates CI are not provably the same — unchanged, and
still the reason any corpus statistic has to be written as a superset or a floor.

**Worth adding, each with a reason:**

- **a SECOND genuinely staged record** — still the highest-value fixture this corpus could gain, and
  the thing standing between the staged burn-time defect and a fix;
- **a baro-less board's log** (Altus Metrum EasyTimer), which the field's leader analyses and Debrief
  refuses outright — see `BACKLOG.md` 2026-08-02;
- a Blue Raven pair whose LR file carries a `Sync` column;
- a descent-rate ground truth in a machine-readable column.

## Environment notes

- **Git identity defaults to the harness's**, which the zero-trace invariant forbids. Set it before
  the first commit: `git config user.name "Neer Patel"` /
  `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`. The full suite then reports **1,024 tests across 70 files**; far fewer
  means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. **This
  is paid again every session and belongs in the environment's setup script.**
- **4 CPUs**, so a workflow's concurrency cap is 2: a five-agent fan-out runs in three waves and took
  ~16 minutes. Dispatch it and do the baseline gate while it runs.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it, and it took ~6 minutes for both jobs.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`.
