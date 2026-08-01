# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D6 SHIPPED.** A flyer who drops two files off one flight is offered the grouping, sees the evidence in words, **says which recording reports the flight**, and accepts or refuses in one press. Its last open item was **refused on a measurement** rather than built. **D7 is the next unstarted D milestone and has not been decomposed.** |
| **P — product & craft** | **P1 IN PROGRESS.** Two cross-check tables now line their digits up, the sixth radius is gone, and `Segmented` went 2 → 3 adopters. Items 3, 5, 7 and 8 remain; item 4's premise was measured and corrected. |

**Everything this run is on the pinned branch and open as ONE pull request, #72.** Under
SHIPPED-MEANS-REACHABLE none of it has reached a flyer yet. Merging it on green is all that is
needed, and merging on green is pre-authorised.

**A Sev-1 was found and fixed, and it is the reason to merge rather than let this sit.** Five real
corpus flights published a drag coefficient and a Mach window computed from a velocity trace the
analysis had already refused — the Kairos booster read **"Mach 9.90 – 23.10"** directly below its
own Max velocity row reading *withheld*.

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all
three green before every push. The corpus was attached throughout — `lib/parsers/corpus.test.ts`
reports **138 tests over 61 manifest fixtures, 41 of them analysed** — so no claim here rests on a
suite that skipped itself.

**Steady state at the end of the run: 999 unit tests over 69 files, build clean, 241 e2e.**
(Baseline at session start was 990 / 239.)

### 1. Sev-1 — a drag coefficient read off a refused velocity (`f267b30`)

`canMeasureDrag` asked about the altitude source and the coast geometry and never about
`velocityUnusable`. Cd is v² in the numerator, so a refused trace does not soften the answer, it
squares the error.

| flight | published Cd | published Mach window | its own headline peak |
|---|---|---|---|
| `issuiuc-kairos` booster | 0.00 | **9.90 – 23.10** | withheld |
| `jimheaney` Swiss Cheese L1 | 2.52 | 0.21 – 0.51 | withheld |
| `jimheaney` Discovery L1 | 1.75 | 0.20 – 0.49 | withheld |
| `jimheaney` Penguin L1 | 0.96 | 0.24 – 0.60 | withheld |

An L1 airframe runs about Cd 0.3–0.75. Rail-exit velocity had the same hole from the other side —
it gated on `velocitySource === 'device'` and never on `velocityUnusable`. **That one is latent,
not live:** all 15 withheld corpus records are barometric. It is reachable because the
absolute-ceiling branch of the implausibility test is not source-gated, unlike the other two.

Both surfaces now say **why** the reading is missing instead of vanishing, and the wording branches
on the recorded reason — a `gap` flight has a hole in the record, not an untrustworthy trace.
`canMeasureRailExit` moved into `lib/rail.ts`; it was two questions hand-rolled in a component with
one of them missing, and there is no component-test path in this repo that could have pinned it.

### 2. The two cross-check tables, and the sixth radius (`30a0c95`)

`GpsApogee` and `DeviceSummary` rendered `font-mono` with proportional digits — on the two surfaces
§6 exists for, where comparing two numbers column to column is the entire job. Suite-wide
`tabular-nums` is **27** against `font-mono` **90**, from 5 against 81 at P1's start.

Bare `rounded` (0.25rem) is a sixth radius no §9 grep sees. **The count was wrong in both
directions and both errors were counting prose:** the standing note said 11, a sweep this run said
15, and the truth is **12 class uses over 6 files**. `rounded` sits inside the word "G**rounded**"
(a heading on `/validation`) and inside a comment about uPlot having "rounded the window".

### 3. D6 — the flyer names which recording reports the flight (`9250757`)

The row control could always change the primary, but only once the flight existed — so the one
moment a flyer is looking at both files was the one moment they could not say.

## Traps this run hit — read these before repeating them

- **A concurrent fan-out turns the unit suite red and it reads as a regression.** The baseline run
  reported `2 failed`, then `4 failed` on an identical re-run — the four largest corpus fixtures
  timing out at vitest's default 5 s while eight subagents and a 114 MB browser download competed
  for CPU. Run alone: **137 passed, 0 failed.** The tell is that the count *changed between
  identical runs*. Gate alone; fan out around it, never across it.
- **`git status` clean is not the same as `cd` clean.** The working directory persists between
  tool calls. A probe that `cd`s into the fixtures repo leaves the next `npm run build` reading
  `/home/user/debrief-fixtures/package.json` and failing with ENOENT, which looks like a broken
  build and is a shell state bug.
- **`\brounded\b` matches inside "Grounded".** Any word-boundary grep for a Tailwind class with no
  suffix will count prose. Use `(?<![-\w])rounded(?![-\w])` and then filter to lines that are
  actually class strings.
- **A character-level common-prefix/suffix scan walks through token boundaries.** Reducing
  `..._HR_04-12...` and `..._LR_04-12...` to what differs gives `H` and `L`, not `HR` and `LR`,
  because both names share the `R`. It reads as a near miss and is the whole answer being wrong.
  Split on separators and compare whole tokens.
- **An e2e assertion on a logbook ROW cannot tell you which recording is primary.** The row carries
  a nested list of every recording by name, so `toContainText('SN1537 HR')` passes whichever one is
  primary. The first version of the D6 journey passed with the flyer's choice thrown away. Assert
  on the "reported by" line, in both directions.
- **Measure a phone with `hasTouch: true` or the numbers are wrong.** The proposal control measured
  20 px tall at a 390 px viewport and 44 px with touch emulation on — `globals.css` floors targets
  under `@media (pointer: coarse)`. The 20 px was a measurement error, not a defect, and would have
  sent a session chasing a fix that was already there.
- **`mcp__github__pull_request_read` with `get_status` reports `pending` / `total_count: 0` forever
  on this repo.** It reads the legacy commit-status API, which nothing here writes. **Use
  `get_check_runs`** — it returns the two real jobs (`frontend`, `e2e`) and is the cheap call. It
  also returns 0 in the first seconds after a push, before the checks are created, which reads
  exactly like the `get_status` failure and is not one; ask again. `actions_list` works too but
  returns about **450 KB** unfiltered, which is most of a context window for two booleans.

## The §9 counts at the end of this run

| count | start of run | end | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 10 | **10** | floor 4, not 1 |
| inverted-type files | 16 | **16** | floor at least 4, not 0 |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 29 | **29** | most of the 46 |
| `Segmented` adopters | 2 | **3** | — |
| bare `rounded` (**not** a §9 metric) | 12 | **0** | 0, and **unguarded** |

**No count moved the wrong way.** One tried to: the proposal banner's new label was `text-xs` and
took inverted files 16 → 17. It is `text-sm` now, which is what §3 asks for on a label beside a
control, and the ratchet is what caught it.

## Pick up first

1. **Merge PR #72.** It carries a Sev-1 fix. Nothing in this run is reachable by a flyer until it
   lands.

2. **D7 needs decomposing — the D-track has no queued milestone.** `ROADMAP.md`'s after-list
   describes it as "deeper honest insight, the stated moat". Decomposing it is one increment's work
   and it IS the work; do not fall back to the defect ledger because the D-track looks empty.
   **D6 leaves it a concrete starting point:** separating *one recording exported twice* from *two
   instruments* is still unsolved, the sync counter cannot do it (measured, below), and the summary
   CSV's serial number is where to look next.

3. **P1's remaining items, in the order the roadmap ranks them.** Item 4's premise was corrected
   this run — `CompareView`'s table is **transposed** and will not collapse onto `SampleTable`, so
   the liftable thing is `SortableHeader` and the sort/copy contract, not a shared table. Items 3
   (three unsanctioned dark surfaces, 32 uses), 5 (the five required states), 7 (39 hand-rolled
   `<button>`) and 8 (17 hand-rolled card sites) are untouched.

4. **The bare-`rounded` conversion is unguarded.** No §9 metric was added, deliberately, because
   §9 is shared with the sibling and `lib/design-system.test.ts` is its executable copy. **A run
   that can push both repos owes the guard.**

5. **A velocity/Mach assertion on every fixture whose manifest row carries one.** Still true, still
   the highest-value corpus work, and this run is fresh evidence for it: the Sev-1 lived exactly
   where the corpus asserts an apogee and nothing else. No fixture asserts a Cd either.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed six `DESIGN.md` §9 edits**, unchanged from the last run, plus
the open seventh question about whether §9's `uiAdopters` grep should read `components app`. The
harness pins only `fusionspace-debrief` and `debrief-fixtures`, so none can be pushed there.

**A `Segmented` hardening is owed too if the sibling has the same primitive:** its root is
`inline-flex` with no wrap and no `max-w-full`, so an unbounded option label scrolls the whole
document sideways. Debrief bounds the label at the call site instead, because the primitive's
signature is shared.

## The fixtures repo

No commit this run; nothing changed a fixture's contract. The seven `corpus-overrides.json` entries
still need removing once `debrief-fixtures` is re-cut.

**Worth adding there**, each with a reason:

- a corpus record holding two genuinely separable burns;
- **a launch day where one flyer's two files were dropped together** — the signal D6 rests on, and
  the corpus cannot demonstrate it at all: every group in it is assembled by the manifest;
- **a velocity/Mach ground-truth column asserted on every fixture whose manifest row carries one**;
- **a Blue Raven pair whose LR file carries a `Sync` column.** `reddit-meraki2-121km`'s does not,
  which is one of the reasons the sync counter was refused as a join key.

## Environment notes

- **Git identity defaults to the harness's.** Set it before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **138 tests**. Far fewer means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. **This
  is paid again every session and belongs in the environment's setup script.**
- **The harness appends an attribution footer to a PR body.** It did again this run. Read the body
  back after posting and strip it — `mcp__github__update_pull_request` with the corrected body.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`.
