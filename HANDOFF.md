# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first

| track | where it is |
|---|---|
| **D — capability** | **D7 IN PROGRESS — slices 1 and 3 shipped.** A flyer can now read **every channel their board recorded as numbers**, not the ≤6 the chart happened to be drawing; and the corpus pins **54 quantities over 33 logs** instead of 40 over 33, of which 33 were apogees. Slices **2** (a reading's uncertainty as a measured range) and **4** (stage-aware readings on a composite) remain. |
| **P — product & craft** | **P1 IN PROGRESS — item 4 started.** `DataTable` and `CopyTableButton` exist in `components/ui.tsx`; both cross-check tables are on the first and the window-stats table on the second. **Copyable tables 2 → 6**, and item 4's table sweep is complete. Items **5**, **7** and **8** remain, plus item 4's keyboard clause. |

**Everything this run is on the branch and in one pull request.** See *Where the work is* below.

## What shipped this run

Every increment independently gated: `npm test` · `npm run build` · `npx playwright test`, all three
green before every push. The corpus was attached throughout — `lib/parsers/corpus.test.ts` reports
**138 tests over 61 fixtures, 41 analysed** — so no claim here rests on a suite that skipped itself.

**Steady state at the end of the run: 1,004 unit tests over 69 files, build clean, 243 e2e.**
(Baseline at session start was 1,002 / 241.)

### 1. D7 slice 3 — a tolerance that was absorbing a whole gravity

The corpus asserted **40 quantities and 33 of them were apogees**. It is **54 checked over 33
fixtures** now: `maxVelocity` 3 → 11, `maxAccel` 4 → 10, thirteen logs pinning two or more. (It read 55/34 for
part of the run: one new assert had landed on a `knownIssue` fixture, where the runner returns
before checking anything — see the trap below.)

**The find worth keeping is not the count.** All eight Altus Metrum flights read **exactly
+9.80 m/s² above their own stated peak acceleration — one gravity, zero spread.** That is the
intended convention (Debrief reports specific force, AltOS states its peak net of gravity, and
`/methods` and `DeviceSummary` both say so). The defect was in the **contract**: both accel asserts
carried `tolPct: 6` and the offset simply fitted inside it. One g is 1.2% of an 84 g boost and
**9.4% of a 10.7 g one**, so the tolerance had to be set by the smallest flight anyone wanted to
assert — and **no regression narrower than a gravity could ever trip any accel assert.** An
`Assert` now names its `basis`; the ten that carry one agree to within **0.0796%** and the
tolerance is back to 2%.

### 2. D7 slice 1 — every recorded channel readable as numbers

`MAX_SERIES = 6` is a fact about how many *traces* stay readable, and it was deciding how many
*columns of numbers* a flyer could see. Measured: of the **25 corpus files a parser auto-detects as a flight, 23 carry more
channels than the chart draws**, the richest carries **15**, **119 channels in total** were
unreadable without going back to the chart. Worse than "six" suggests — the table inherited what
was *plotted*, so a fresh Blue Raven LR read showed **1 of 11**. Verified in a browser: **12
columns where there were 2**. `MAX_SERIES` is untouched; six traces is still right for a chart.

### 3. P1 item 4 — `DESIGN.md` §5's "every table is this one", which did not exist

Seven tables, two sortable, two copyable, none keyboard-navigable, **five with no sort and no copy
at all** — including both cross-check tables, which are the two surfaces §6 exists for and the ones
a cert document most wants. `DataTable` takes `{columns, rows}` with `cell` and `text` **separate**,
which is what made it fit: an agreement badge is a coloured chip on screen and has to reach a
spreadsheet as `agree · 0.6%`. `DeviceSummary` and `GpsApogee` are converted and now share one
`agreementText`, so badge and clipboard cannot drift.

### 4. The copy, lifted out of `DataTable` for the tables that cannot be one

The window-stats table holds the min/max/mean a cert document quotes, over the stretch of flight
the flyer zoomed to, and retyping them off the screen was the only way to get them into one. It
**cannot** be a `DataTable` — the channel is a `th scope="row"` and a channel with no samples in the
zoom collapses its row to one `colSpan` cell — and forcing it would add config surface for one
caller, which is how a shared layer stops being used. So `CopyTableButton` was lifted instead and
`DataTable` uses it too. Rows are built at press time, so the copy follows the zoom.

### 5. A flake fixed on its third occurrence

`e2e/compare.spec.ts:434` was racing the navigation the column mapper pushes. `waitForURL` first,
then the heading. 5/5 in isolation and green in the full suite.

### 6. The cold walks

**Phone, 390 px, `hasTouch: true`, offline.** Nothing wrong on the surfaces this run changed: no
horizontal overflow on any route *including the sample table at twelve columns* (it scrolls inside
its own container and leaves the page alone), the channel-scope control renders at 390 px rather
than existing only on a wide screen, the stats copy control is 114×44, and an offline reload still
serves the app. Two pre-existing touch findings filed in `BACKLOG.md` with their measurements —
four unit `<select>`s at 43×44 (one pixel under on width) and 27 elements under 44 px that are
mostly `<label>`s the `pointer: coarse` floor does not reach. **The 27 is an upper bound, not a
defect count:** a label wrapping a 44 px control is still reachable by tapping the control, and
which of the 27 genuinely have no reachable target is unestablished.

**Desktop, tenth use.** A four-file drop lands on "Comparing 4 flights" and the comparison copies
as a real table; zero page errors across the walk. The GPS cross-check copies
`Apogee → 9,459 ft → 9,322 ft → agree · +1.5%`, verdict included.

## Traps this run hit — read these before repeating them

- **This container has 4 CPUs, so a workflow's concurrency cap is 2.** A ten-agent opening fan-out
  serialises into five waves and the browser-driving walks dominate; after ~28 minutes only two
  agents had started and none had returned, and it was abandoned. **Fan out in threes, keep the
  walks separate from the file-reading agents, and never gate across either** — the unit suite
  flakes under CPU contention (last run measured 2 then 4 failures on identical runs, 0 alone).
- **A golden value on a `knownIssue` corpus fixture is DEAD and prints exactly like a live one.**
  `runFixture` returns before `assertGolden`. A `maxVelocity` of **1.0 m/s on a flight that reached
  1,719.4** left the suite green. The runner refuses the combination now, but the general lesson
  stands: before trusting any new assert, set it wrong and watch it fail.
- **A percentage tolerance hides a FIXED offset, and hides it best on big flights.** One gravity is
  1.2% of 84 g and 9.4% of 10.7 g. If a tolerance can never be tightened without a specific
  fixture failing, suspect a systematic offset rather than noise — and check whether the UI already
  says so, because here `DeviceSummary` had been telling flyers "exactly 1 g apart" all along.
- **`git status` clean is not `cd` clean.** Hit again: a `cd /home/user/debrief-fixtures` in one
  probe left the next `sed lib/parsers/…` reading the wrong repo. Prefix with the absolute path.
- **Widening what a table shows breaks locators that were unambiguous.** `/^Altitude/` matched one
  header and now matches "Altitude (AGL)" and "Altitude (raw)". Two existing sample-table tests
  went red on a strict-mode violation, which reads like a regression and is a locator.
- **The harness appends an attribution footer to a PR body.** It did again. Read the body back
  after posting and strip it — `mcp__github__update_pull_request` with the corrected body.
- **`mcp__github__pull_request_read` with `get_check_runs`** is the cheap, working call (`get_status`
  reports `pending`/`total_count: 0` forever on this repo). Unchanged from last run and still true.
- **The §9 bare-`rounded` one-liner counts PROSE unless you filter to class strings.** It read 1 at
  the end of this run and the one hit is `FlightReport.tsx:508`, a comment about uPlot having
  "rounded the window to its axis". The real count is 0. Last run recorded the same trap for the
  word "G**rounded**"; a leading-boundary regex is necessary and not sufficient.
- **`pkill -f e2e-server` matches its own shell** and kills the command that ran it — the tool
  returns exit 144 and whatever followed the `pkill` in that same invocation never ran. Two edits
  were silently lost to this. Put the `pkill` in its own call, or match more narrowly.

## Where the work is

**Pull request #75, `claude/ultracode-maintenance-vjgt9k` → `main`.** CI ran green on both jobs
(`frontend` and `e2e`) for the first two increments — which matters more than the local run,
because `frontend` fetches the pinned **v1.1.0** corpus release while the attached checkout is
**v1.0.0**, so CI is where these new 2% tolerances first met the released corpus. They held.

The fixtures repo has its own branch of the same name with two commits (the new assertions, and
the removal of the dead one).

## The §9 counts at the end of this run

| count | start of run | end | target |
|---|---|---|---|
| `rounded-lg` | 0 | **0** | 0 — a guard, may never rise |
| off-scale spacing | 0 | **0** | 0 — a guard, may never rise |
| hand-rolled card treatments | 10 | **10** | floor 4, not 1 |
| inverted-type files | 15 | **15** | floor at least 4, not 0 |
| off-scale type sizes | 1 | **1** | floor 1 — the shared brand wordmark |
| files importing the primitives | 29 | **31** | most of the 46 |
| `Segmented` adopters | 3 | **4** | — |
| `DataTable` adopters | — | **2** | most of the 5 convertible tables |
| `<table>` in a component | 7 files | **6 files** | — |

**No count moved the wrong way.**

## Pick up first

1. **Nothing is owed from this run except merging #75** if it has not been merged. Check CI on the
   head commit first — the last increment's checks may still have been running.

2. **D7 slice 2 is the one with the most leverage left, and it is now DECOMPOSED FROM MEASUREMENT
   in `ROADMAP.md` — read that before touching it.** The sweep that found the gravity offset also
   measured derived-velocity error across the corpus: barometric peaks run **+2.8%, +3.0%, +9.4%,
   +17.2%, +99.7%** — every one high — against **0.0%** on all eleven device-measured ones. The
   roadmap entry carries the table, the smallest shippable slice, and **three cautions that would
   each make a careless range wrong**: the 0.0% column is self-consistency rather than accuracy;
   the +99.7% file's velocity column is its own altitude differenced; and the ratio's basis
   (speeds vs Mach) has to be named or the range is a wrong claim under a right-looking number.

   **It was deliberately not built this run**, and that is the one judgement call worth
   re-examining. A range published on a headline reading is a safety-relevant number, and
   `MAINTAINING.md` is explicit that one does not get shipped without grounding it properly.
   Starting it with little room left would have meant rushing exactly that. The evidence is
   banked instead, which is a real increment and not a deferral dressed as one.

3. **P1 item 4 has three tables left** — `ColumnMapper`, `StitchSurface` and `ChannelExplorer`'s
   window-stats table, none of which can be sorted or copied. The primitive exists now, so each is
   a small conversion. **Arrow-key cell navigation is still not implemented**, so §5's
   "keyboard-navigable" is only partly delivered; decide whether to build it or amend §5, and
   remember that amending §5 is a change owed to the sibling repo in the same run.

4. **Descent rates are pinned nowhere.** 17 manifest rows carry one and no fixture asserts it;
   `/validation` now says so out loud. That is the cheapest remaining corpus coverage.

5. **A velocity/Mach assertion on every fixture whose manifest row carries one** is now *done* for
   the eleven device-measured ones. The remaining five are barometric and must NOT be asserted
   against the stated figure — that error is a documented physical limitation, not a defect.

## What is owed elsewhere

**`nrdptel/fusionspace-loft` is owed six `DESIGN.md` §9 edits**, unchanged for three runs, plus the
open seventh question about whether §9's `uiAdopters` grep should read `components app`. The harness
pins only `fusionspace-debrief` and `debrief-fixtures`, so none can be pushed there. **A
`Segmented` hardening is owed too** (its root is `inline-flex` with no `max-w-full`).

**`DataTable` is a Debrief-side primitive so far.** `DESIGN.md` §5 names it and both repos carry
§5, so the sibling either wants the same implementation or an explicit note that it does not need
one. A run that can push both repos owes that decision — and the bare-`rounded` guard, still
unguarded from last run.

## The fixtures repo

Two commits this run. **The seven `corpus-overrides.json` entries that predate this run still need
removing once `debrief-fixtures` is re-cut** — and note the file is much larger now (32 entries),
because the new assertions must live there to reach CI at all while the release lags.

**`VERSION` says `v1.0.0` while `corpus.lock.json` pins `v1.1.0`.** Worth resolving: local runs read
the attached checkout, CI reads the release, and the two are not provably the same corpus.

**Worth adding there**, each with a reason, unchanged from last run except the last:

- a corpus record holding two genuinely separable burns;
- **a launch day where one flyer's two files were dropped together** — the signal D6 rests on;
- **a Blue Raven pair whose LR file carries a `Sync` column**;
- **a descent-rate ground truth in a machine-readable column**, so slice 3's remaining gap can be
  closed the way the velocity one was.

## Environment notes

- **Git identity defaults to the harness's** — `Claude <noreply@anthropic.com>`, which the zero-trace
  invariant forbids. Set it in **both** repos before the first commit:
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The corpus arrives as an attached repo.** `ln -sfn /home/user/debrief-fixtures
  lib/parsers/__corpus__`, and the suite then reports **138 tests**. Far fewer means it is not linked.
- **`npm install` is needed at session start**; the container ships without `node_modules`.
- **Chromium: `npx playwright install chromium` from the repo root** (~114 MB, about a minute,
  succeeds through the proxy), then plain `npx playwright test` with NO browser variable set. **This
  is paid again every session and belongs in the environment's setup script.**
- **4 CPUs.** See the fan-out trap above; it reshapes how much parallelism is worth dispatching.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it.
- **Check the deployed build with a cache-buster:**
  `curl -s "https://debrief.fusionspace.co/version.json?cb=$RANDOM"`.
