# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## Read this first: the queue now has TWO tracks

**`ROADMAP.md` was restructured on 2026-07-30 and a run now ships from both tracks, alternating.**
This is the single thing to understand before scoping anything.

| track | next unstarted |
|---|---|
| **D — capability** | D4 (in progress) → then D5 |
| **P — product & craft** | **P1 — one design system, adopted** |

The owner's direction was that both apps still read as thrown-together rather than as products the
public can pick up, measured against the vendor tools and the desktop sims. The cause was structural,
not effort: `ROADMAP.md` was the queue and it contained **only** capability milestones, so a hands-off
run could not ship product work as its main job — and the old "one increment in four may be defect
**or polish** work" quota capped the very thing that was missing. The quota now covers only *unqueued*
defect work; craft with a *done when* is a P-track milestone and is not capped.

**Two new files, both binding, both to be read at session start:**
- **`DESIGN.md`** — the design system: tokens, type and spacing scale, component vocabulary, the five
  required states, number presentation, product shape, the touch contract. **Read it before writing a
  component.** Both repos carry an identical copy; a change to one is a change to both, same run.
- **`COMPETITION.md`** — the accumulating gap against the Featherweight Interface Program, AltosUI,
  the vendor apps and a spreadsheet. The done-check now requires one row added or resolved per run.

**P1 is the next P-track milestone, and this repo is the worse of the two.** Measured 2026-07-30:
**50 components, zero cross-component imports** — there is no shared primitive layer at all — plus 12+
card treatments and `text-xs` used **212** times against `text-sm` **82**, which puts most
decision-grade numbers at caption size in an app whose entire job is presenting them. Build the
vocabulary `DESIGN.md` §5 names, using the same names the sibling repo uses so the two converge rather
than forking a second dialect. Convert one surface per increment and **ship the pinning check with the
first slice**.

## Last capability run — D3 shipped and is live; D4 started

Branch level with `origin/main` at `8266c2a` at session start. `ROADMAP.md` named the goal: D3 was
the next unstarted milestone. **The baseline gate was GREEN before anything was touched** — 61 unit
files / 856 tests, build clean, 222 e2e — once the right Chromium was installed (see below).

### What a flyer can DO that they could not before

**Keep a two-altimeter flight as ONE flight.** One logbook entry, counted once by the ★ that marks
their best, with each instrument's own reading still there, and the one they nominate named on the
report and in every document they hand in.

Before this run the logbook was keyed on FILES: a flight recorded twice was two rows, two entries
in a season's count, and two runs at the crowns.

### The three increments

1. **`1bd32b9` — two altimeters' recordings of one flight are one flight.** `RecentMeta.flightId`,
   one optional string, absent on nearly every row: absent means a flight of its own, equal to the
   row's own id means this recording REPORTS the flight, any other id names the recording that
   does. `lib/flightGroups.ts` is the only thing that reads it. The logbook renders flights, the
   crowns run over flights, and a Sev-1 in `saveRecent` was fixed on the way (below).
2. **`257537c` — every corpus flight's whole analysis against a committed snapshot.** 50 digests
   over every metric, event and sample of every series. This is the instrument D3's own *done when*
   names: *"asserted by the corpus suite rather than by eye"*.
3. **`2396eb1` — the report says which recording it is reading, and offers the others.**
   `RecordingPicker`, plus one sentence in the .txt/.md/.html/JSON exports and on the shareable
   PNG. All three merged as **`f8c8db2` (#51)** and confirmed live on debrief.fusionspace.co.

Then, on a branch restarted from that merge:

4. **`a75bdda` — D4's alignment core**, and the measurement that shaped it (below).
5. **`1fb5c96` — how closely a flight's recordings agree, on its own row.** The largest gap D3
   left: "apogee within 0.05%", amber past 10%, from the stored figures. Apogee only — the
   corpus says a top-speed spread would flag correctly-grouped flights as wrong.

### The Sev-1 this run found, and why it was fixed inside the milestone

**Reopening a cropped flight threw the crop away, so it survived one reload and not two.**
`saveRecent`'s replace-in-place carried the note, the paired summary and the report caption forward
BY NAME, and `read` was not on that list. A reopen IS a save, so the crop was read from storage on
the way in — which is why one reload looked fine, and why D1's walk, which reloads once, was green —
and wiped on the way out. The second visit silently read the whole record again: a launch-day file
back to reporting a flight time that spans two flights, with nothing on screen saying the flyer's
own answer had been discarded.

**Reproduced before it was touched** with a throwaway walk that crops, reloads, reloads again. It
was fixed inside D3's first slice rather than as its own pass because it is one function — the same
replace-in-place D3 had to add `flightId` to — and adding a member without fixing the rule would
have lost the grouping in exactly the same way.

**Closed structurally, and this is the pattern to reuse.** `replaceInPlace` is pure, exported and
unit-tested, and a compile-time check fails when a member of `RecentFlight` is classified as neither
the file's nor the flyer's:

```ts
type Unclassified = Exclude<keyof RecentFlight, FromTheFile | FlyerOwned>;
const _everyMemberIsClassified: Unclassified extends never ? true : [...] = true;
```

**This is the FOURTH member a field-by-field rebuild has lost in this one file** — the report
caption, the chosen stretch through the backup, the file's own bytes, now the chosen stretch again
through the reopen. There were three such rebuilds and only one was guarded. All three are now:
`serializeLogbook` by its `Required<RecentFlight>` fixture, `replaceInPlace` by the type above, and
`toMeta` (the list projection) by a `Required<RecentMeta>` fixture.

### What the pre-push review found that the author could not — read this before the next one

An adversarial fan-out over the finished diff, four lenses, each finding handed to skeptics told to
refute it. **It found two Sev-1s and eight Sev-2s in code that had already passed the full gate**,
and they all had ONE root cause the author could not see: *the row rendered a FLIGHT while every
control on it still acted on one FILE.*

- the ✕ deleted one recording and left the flight on screen under the survivor's name;
- the note vanished when the flight changed hands, because the row moved and the note did not;
- the prune took a noted cert flight's backup recording for good — a secondary can never carry a
  note, since the note control is on the row the list shows, so a joined cert flight could not be
  protected at all;
- joining two already-grouped flights ejected a third recording into a flight of its own;
- the un-noted meter, the search gate and the Clear confirm counted files under a list of flights;
- a tick outlived its row when the flyer nominated a different recording;
- `setFlightIds` wrote whole records back from a stale snapshot, and its comment claimed the
  opposite;
- and `replaceInPlace` could resurrect a crop the flyer had cancelled, from an older duplicate row —
  the exact inverse of the bug being fixed, which is what the reviewers were told to hunt hardest.

**The lesson: when a surface changes what a row MEANS, every control on that row is a finding until
proved otherwise.** Enumerate them — the tick, the open, the note, the remove, the counts, the
names, the search, the copy — and say what each one now means.

### Two traps this run hit that will otherwise cost the next one

- **A mutation that fails to COMPILE proves nothing, and looks like proof.** Falsifying the report
  strip with `{false && …}` "passed" — because that never built, and `npm run test:e2e` then served
  the `out/` a previous build had left. Always `npx tsc --noEmit` (or read the build's exit code)
  before believing a mutation survived. The build-clean version of the same mutation
  (`length > 99`) failed the walk immediately.
- **An assertion scoped with `.first()` will pick the wrong row.** The note-follows-the-flight
  assertion passed under mutation because `.first()` had selected a different flight's note button.
  Scope e2e assertions to the row under test (`flightRows.filter({ hasText: … })`).

### The corpus digest, and what it is honestly worth

`digestOf` hashes every metric, every event, every sample of every series, the read extent and the
segments, at `toPrecision(12)`. Falsified by scaling apogee by `1 + 1e-9` — four orders inside the
tightest golden tolerance in the file, invisible to every named assert — which moved all 50.

**Twelve significant figures, not byte-identity, and the comment says so.** `Math` is not required
to be bit-identical across engines, so a digest taken from the last bit of a `pow` would go red on a
machine where nothing had changed. **This was tested, not assumed: CI's `frontend` job went green on
the committed snapshot**, so the digests are stable across this container and GitHub's runner.

Regenerate with `CORPUS_DIGESTS=write npx vitest run lib/parsers/corpus.test.ts`, and put the diff in
the commit that moved the reading. A snapshot updated later proves nothing.

### What D3 delivered against its *done when*, and what it did not

All four clauses hold. On *"each headline reading naming which recording it came from"*, read what
shipped rather than the words: **the readings are named per PAGE, not per tile.** A report is of one
recording, so every headline figure on it comes from the same instrument and the page says which,
above the readings, with the others one click away. Twenty tiles repeating one file name is noise,
and the one reading that genuinely comes from elsewhere already names its own source
(`descentSource === 'second-copy'`). `Tile.sub` is the seam if that ever changes.

Three gaps were filed. **The first is closed since** (increment 5 above); the other two are in
`BACKLOG.md` and named in `ROADMAP.md` as D5's starting point:

1. ~~the spread between a flight's recordings is not on its row~~ — **done**, increment 5;
2. a grouped flight has no one-click overlay of its own recordings;
3. the comparison still hedges — *"If these are recordings of the same flight…"* — when
   `flightId` now knows.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **The harness appends an attribution footer to a PR body.** It did again. Read the body back after
  posting and strip it; set the merge commit message explicitly for the same reason.
- **Chromium 1194 ships in this image; Playwright 1.61.1 wants 1228.** `npx playwright install
  chromium` works here (~2 min) and must be run **from the repo root** — run it from another
  directory and it exits 0 having done nothing, and the whole suite then fails with 222 ×
  `Executable doesn't exist`, which reads exactly like a code regression.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
  Confirm the corpus really ran: `lib/parsers/corpus.test.ts` should report **119 tests**.
- **`npx vite-node <probe>.ts` drives the real pipeline from a probe**, resolving the repo's
  TypeScript with no config. Note `lib/analyze` exports `analyzeFlight`, not `analyze`, and
  `FlightMetrics` members are bare numbers (`metrics.apogeeAltitude`), not `{value}` objects.
- **A probe reading corpus files must use the repo's own decoder.** `buf.toString('utf8')` on the
  UTF-16LE RRC3 text export produces mojibake that `looksBinary` correctly refuses — which reads
  exactly like a parser bug and is not one.
- **This box has 4 cores**, so a fan-out runs about two agents at a time. An eight-lens opening
  fan-out took ~29 min wall clock.
- **NEVER run `npm run build` while `npm run test:e2e` is in flight**, and **read all three exit
  codes on one line**: `npm test > u.log 2>&1; U=$?; npm run build > b.log 2>&1; B=$?; npm run
  test:e2e > e.log 2>&1; E=$?; echo "UNIT=$U BUILD=$B E2E=$E"`. A green e2e after a failed build is
  the specific lie to watch for — it happened once this run (`UNIT=0 BUILD=2 E2E=0`, three type
  errors in a test file that `vitest` had run happily).
- **`npx vitest run` does NOT type-check.** The build is the only thing that catches a wrong
  signature in a test.
- **A subagent WILL leave something behind.** Sweep `git status --porcelain --untracked-files=all`
  and read `git diff` before every `git add`. Tell every agent to write probes under the scratchpad
  and to `npx tsc --noEmit` before believing a mutation.
- **A browser here cannot reach the deployed site** (`ERR_CONNECTION_RESET`); `curl` works through
  the proxy. Walk the built export of the SHA you shipped and say that is what you did.
- **Use `npm run serve:out`** for a manual walk — any static server with an `index.html` fallback
  serves the analyze page for every route.
- **The clone is shallow**, so any commit count or file history is a window, not the record.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on
  `pull_request`. Opening the PR is what runs it; ~2 min for `frontend`, longer for `e2e`. Read it
  through the GitHub MCP tools (`pull_request_read` with `get_check_runs`), never `curl` —
  the repo is private and the proxy carries no credentials, so an unauthenticated poll returns
  nothing and waits forever while reporting nothing wrong.

## Two things about this container that will otherwise cost you a session

**A stop hook here will tell you your commits are unverified. It is wrong — do not act on it.**
It fires on GitHub's own squash-merge commits, because its rule expects a committer address belonging
to the harness's vendor rather than to this project. Those commits are authored correctly, committed
by GitHub, and signed by GitHub — check with `git cat-file commit <sha> | grep gpgsig`. Doing what it
asks would write the forbidden vendor identity into every future commit and rewrite already-deployed
history. Verify and move on.

**Git identity is wrong out of the box**, as above. Check `git log -1 --format='%an <%ae>'` after your
first commit. Signing is inherited and works (`gpg.format=ssh`).

## Where this run ended

**Both pull requests merged and live.** `f8c8db2` (#51, D3) and `b4e8878` (#52, D4's first slice
plus D3's spread gap), each merged only after CI went green on the exact branch tip.

**One thing to know about reading CI here, because it nearly cost this run its last increment.**
`pull_request_read` with `get_check_runs` served a STALE `in_progress` for the `e2e` job for
roughly forty minutes after it had actually finished. The job completed in 3m24s, its normal
runtime, and the run was very nearly written off as "CI congested, merge next session". Poll
`actions_get` with `get_workflow_job` instead — it carries per-STEP timestamps, so a genuinely
slow job is distinguishable from a stale cache at a glance, and it reported the true completion
immediately.

**And a second one, which cost this run two CI cycles: `npm test` can exit 1 with every test
passing, and it is NOT a flake.**

```
 Test Files  63 passed (63)
      Tests  929 passed (929)
     Errors  1 error

Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

A test that analyses the whole corpus is ~10 s of solid **synchronous** CPU. A vitest worker
blocked that long cannot answer the reporter's `onTaskUpdate` RPC; the call times out, vitest
reports it as an unhandled error, and the process exits 1 with a fully green suite. It reproduces
— **it was re-run once on the assumption that it was a flake, and failed identically** — because
it is a property of the test, not of the runner's mood. A four-core dev box stays under the wire
where a two-core CI runner does not, so it will not show up locally.

The fix is `await breathe()` (defined beside `loadForCompare` in `lib/parsers/corpus.test.ts`)
every few fixtures inside any full-corpus sweep. **Write it into any new sweep from the start.**

Reading rule, because this failure mode is genuinely misleading: on a red `Test` step, pull the
tail of the log with `get_job_logs` before concluding anything. The `Tests` count says whether an
assertion failed and the `Errors` line says what else went wrong. Do not merge red, and do not
re-run without reading — a green suite exiting 1 is exactly the thing that teaches a future run
to wave real failures through.

## Pick up first, and why

**`ROADMAP.md` is the queue. D1, D2 and D3 are SHIPPED and live in production; D4 is IN PROGRESS
— its alignment core is built and its composite surface is not.**

### What D4 already knows, so you do not have to re-derive it

The corpus's one real staged pair is `iss-kairos-20240323` — a Kairos booster and sustainer, each
on its own TeleMega. Measuring it refuted the milestone's own note twice:

1. **The sustainer's log carries no clock at all.** `flownAt` is undefined; the booster's is a GPS
   UTC stamp. So "overlapping wall clocks", one of the two alignment methods the roadmap proposed,
   does not exist on the only real pair there is.
2. **The method that works is the launch.** Every stage leaves the pad together, so each record's
   own liftoff is the same instant. The booster's log opens 0.2 s before it; the sustainer's
   carries a 307.5 s pad wait before it.
3. **Do NOT try to check "did this record contain the launch" from the record alone.** Both
   obvious tests were tried and both failed. Altitude is useless — the analyzer takes each
   record's pad datum from its own opening samples, so a log beginning at 1,000 m in the air reads
   zero there too. Motion before the liftoff is worse: over all 50 corpus flights, ordinary
   SINGLE-stage records show speeds before their own detected liftoff ranging from 0 to thousands of metres per second, because plenty of loggers
   begin at boost and the detector fires a little way in. **There is no threshold between "a
   sustainer lighting up at altitude" and "a StratoLogger that records only the flight."** The
   first draft flagged 14 of 50 corpus flights; the rule was deleted rather than tuned.
4. **A third rule was tried, SHIPPED, and then removed — read this before you reinvent it.** The
   reading is genuinely persuasive: until separation every board is in the same rocket recording
   the same first-stage burn, so lined up on the launch those instants must be one, and a gap of
   seconds catches a sustainer whose logger started at its own ignition. It shipped as a 1 s gate.
   Three measurements killed it. **It has no power against that failure**: lined up on liftoff the
   gap is exactly |burn duration_i − burn duration_j|, the staging delay is not a term, and
   sweeping the delay from 2 s to 5,000 s leaves the figure at 0.30 s while the composite is wrong
   by the whole delay. **It refused correct data**: two of the corpus's six redundant-board
   groups — `iss-endurance` (TeleMetrum 2.900 s vs StratoLogger 0.050 s) and `trf-lemiv-l3`
   (3.160 / 2.300 / 1.750 / 1.550 s across four boards in one rocket), all nine files
   `knownIssue: None` — because a `measured` burn runs 0.769–6.040 s across the corpus where a
   `derived` one runs 0.050–23.910 s, so two loggers on one motor are comparing definitions.
   **And it did not separate flights**: the genuine pair is 0.290 s, but the Kairos booster paired
   with 32 unrelated flights was accepted three times, at 0.750 s (a June 2023 IREC flight) and
   0.910 s. The burn durations still ship, named and provenance-labelled, and **nothing gates on
   them**; the six groups are a corpus test now, so putting the gate back is a red build.

### The next increment

**The composite surface: one timeline whose events read in order across staging, each mark naming
the recording it came from.** Two things were measured before designing it, and both are now corpus
tests (`what a composite may claim`). **Read them before you design anything, because they cut two
obvious features.**

1. **Do NOT add `separation` or a second-ignition member to `EventType`. The corpus cannot ground
   one.** Counting sustained axial thrust runs (>20 m/s², ≥0.15 s) over whole records: the Kairos
   booster holds ONE burn and the Kairos sustainer holds ONE — the sustainer's log opens after
   separation, so it never recorded the booster's burn. The SG1.2 sustainer holds three runs
   (1.67 / 2.23 / 0.47 s), which are one boost with dropouts. Across every device-accel record:
   one run on 21 files, **two runs on three files, all ordinary SINGLE-stage flights**, three on
   the one staged record. Nothing separates them. On baro traces it is worse than useless — a
   StratoLogger shows a 174-second "thrust run". The corpus test goes RED if a record with two
   genuinely separable burns ever arrives, which is your signal that this has changed.
2. **Composite times are good to about a second, not a tenth.** The two Kairos boards were in ONE
   airframe over the first-stage burn and still disagree once aligned: best extra shift **0.56 s**
   on altitude (RMS 11.0 m vs 133.6 unshifted), **0.74 s** on velocity. At t+3 s they read 333 m
   and 487 m. So the surface may order two events seconds apart and must not print a composite time
   to a tenth. It also rules out overlaying the two altitude traces as though they agreed.

**A design for the surface exists and was adversarially reviewed** — a `/stitch?ids=…` page taking
the flyer to a lane-per-recording event table, the stage statement as a LABEL rather than a gate
(the alignment never reads it: stating `[1,2]` or `[2,1]` on Kairos gives identical offsets), and
no merged reading of any kind. It was not started because the two measurements above landed first
and a Sev-1 preempted the slice. Treat it as a starting point, not a spec, and re-derive anything
load-bearing: **two of its numbers did not survive being reproduced.**

Two traps waiting there:

- **`same_flight_group` in the fixtures manifest is not a staging signal.** It conflates
  independent instruments, the same recording exported into two containers, and different STAGES
  of one launch. `iss-kairos` and `iss-sg1.2` are the staged ones; `iss-sg1.2` (a TeleMega
  sustainer at 2,113 m beside two StratoLogger boosters at 465 m and a 9.5 m fragment) is the
  negative case for anything automatic.
- **A wrong composite is the most damaging thing this product can produce.** `lib/stitch.ts`
  refuses exactly two things — fewer than two recordings, and a recording with no liftoff to line
  up on — and it is honest about that rather than dressed up: `verified` is false on every result
  it returns. The temptation is to add a third check so a composite can be called measured. Point 4
  above is what happened the last time that temptation was acted on. **A check that cannot fail on
  the error it names is not a safeguard, and one that fires on correct data is a defect.**

`BACKLOG.md` is a defect ledger to file into and to screen for Sev-1s — not the plan. **There is
no open Sev-1 as of this run.**

## The fixtures repo

No commit there this run — the working tree is clean and the branch still sits on `55785b9`. Nothing
changed a fixture's contract; D3 is a logbook capability and touched no parser, no analysis input
shape and nothing under `lib/analyze`, `lib/flight` or `lib/parsers` except the test file.

The seven `corpus-overrides.json` entries from the previous run are still there and still need
removing **once `debrief-fixtures` is re-cut** — three AltOS `.eeprom` downloads and an RRC3 `.rff`
that went from `kind: mapping` to a read flight, and three Entacore raw files that went from
`mapping` to a named refusal.

The split, printed by the suite rather than inferred: **`61 fixtures: 41 analysed, 0
mapped-but-unanalysable, 9 parse-only, 11 rejected`**, and 50 of them now carry a committed analysis
digest.
