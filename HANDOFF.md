# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — burnout is read where it actually is, and every reading taken there says so

Branch restarted from `origin/main` at `563c54b` (production was serving exactly that SHA at session
start — no gap).

### 1. The burnout crossing was searched for on the wrong side of the speed peak — shipped

The last run's BACKLOG called this RANK 1 and prescribed changing the threshold to `<= G0`. **That
prescription was wrong and would have regressed an honesty guarantee.** The diagnosis was right: the
crossing could not fire. But on specific force `dv/dt = a − g`, so `a <= G0` **is** the velocity peak,
identically — adopting it relabels the velocity-peak proxy as `measured`. Measured proof: on the two
cleanest traces (irec2023 easymega/telemega) `<= G0` fires at t=6.03 s, *the peak sample itself*.

The real defect was the **search bound**. Thrust = drag (`a = 0`) necessarily comes *after* the +1 g
crossing, so ending the search at the peak stopped one instant short of the event. Fixed by allowing
a one-second thrust tail past the peak, **bounded in time, not samples** — a lossy telemetry capture
drops seconds between rows, and as a sample count it reached a crossing five minutes downrange on the
Kairos sustainer.

Measured gap across the nine signed-axial flights: **0.05–0.40 s** (stargazer1 0.05, kairos 0.07,
irec2023 0.08/0.09, sg1.2 0.11, sg1.1 0.40). `burnoutSource: 'measured'` went **2 of 9 → 8 of 9**;
`burnoutAtVelocityPeak` went true → false on all six recovered, so burnout velocity is no longer max
velocity printed twice. `burnTime` re-centred: irec2023 5.80→5.88 (**its second logger on the same
flight independently reads 5.88**), kairos 5.06→5.13, sg1.1 2.69→3.09, stargazer1 3.72→3.78.
Tolerances unchanged.

A new corpus invariant holds burnout to a crossing computed independently from `analysis.series`, so
re-narrowing the bound fails the suite. **Falsified**: reverting the bound fails it with
`the axial trace crosses zero at t=6.11s but burnout was not read from it`.

The methods page asserted the exact physics error this fixes ("net acceleration is zero at the peak
and negative after it", "the trace crosses zero exactly where the speed peaks"). Corrected.

### 2. Every reading taken at burnout now states how burnout was located — part-way through

`burnoutSource` existed, was exported to JSON, and appeared on **no human surface**: burn time and
burnout altitude shipped bare on the grid, the report and every text export, so the only reader who
could tell a measured burn time from an inferred one was a machine. Increment 1 made the label
meaningful (2 → 8 measured), which made the gap worth closing.

`burnoutSub`/`burnoutVelocitySub` in `lib/readings.ts`, used by the grid and imported by
`lib/report.ts` for the report rows and every text export. The comparison table tags `(speed peak)`
**only when the compared set mixes the two**, matching its existing `baroTag` pattern — a burn time
read off an accelerometer and one taken at the speed peak are different instants, and lining them up
in a column without saying so reads as like-for-like. The identity note ("the same instant as max
velocity") stays on the burnout SPEED alone, where the number literally duplicates another on the
page; repeating it down three consecutive rows bought nothing.

**Status: shipped.** Full gate green on a quiet box — 51 files / 653 tests, build exit 0, 172 e2e
passed. The e2e run before it failed two timing-sensitive tests under CPU contention; they passed in
isolation and passed again once the fan-out was stopped (see below).

## Environment notes

- **Git identity defaults to the harness's, not the project's.** Wrong again this run (`Claude
  <noreply@anthropic.com>`); set before the first commit. Check every time.
- **The harness appends an attribution footer to a PR body.** It did on PR #10 and was stripped, per
  the ZERO ASSISTANT TRACE invariant. Read every PR body back after posting.
- **`/version.json` exists now and answers "which build is live"** — `curl -s
  https://debrief.fusionspace.co/version.json`. The previous handoff's note that nothing identifies
  the deployed commit is stale; CONTRIBUTING.md documents it.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. `corpus.test.ts` reports **103 tests**
  now (was 102; this run added one).
- **A bare `importFlight` sweep silently analyses NOTHING for generic-CSV fixtures** — they come back
  `kind: 'mapping'` and need `buildFlight`. A sweep that skips them prints "0 findings" over the ~23
  named-parser files while 46 are actually readable. Copy `loadForCompare` out of `corpus.test.ts`.
  This cost a wrong all-clear this run, twice.
- **The image's Chromium is the wrong build.** Run `npx playwright install chromium` (~2 min); do not
  set `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` throws on a mismatch — trust that error.
- **Do not run the gate while a fan-out is live.** 4 cores; a 3-agent workflow puts load average near
  8 and the e2e suite fails timing-sensitive tests that pass in isolation. See BACKLOG › Hardening.
- **A `*-tmp.test.ts` probe is picked up by vitest** and inflates the gate's numbers (52 files / 653
  tests with one present, 51 / 652 without). Delete probes *before* the gate run you intend to quote.
- **A piped gate hides its exit code** — echo `${PIPESTATUS[0]}`, not `$?`.
- **The Bash working directory persists between calls** and a workflow launch can move it. Two
  commands this run ran against the fixtures repo by accident and reported "no tests found". Use
  absolute paths or `cd` explicitly.
- **CI does not run on a working branch.** `test.yml` fires on push to `main` and on `pull_request`
  only, so the PR is what makes CI run at all. It reported green on PR #10 in ~4 minutes this run.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

## Pick up first, and why

1. **Use the second recording Debrief already holds.** `Proton-FW_format.csv` reports **Mach 2.64**
   on a flight whose ground truth is **Mach 1.3**; its sibling recording of the same flight reads
   Mach 1.55, and both agree on apogee to the metre. The transonic warning already fires and names
   this reading, so it is caveated rather than silently wrong — but the tile still shows Mach 2.64
   while a cross-check sitting in the same logbook says otherwise. Two dead ends are recorded in
   BACKLOG so they are not walked again (the file is parsed as a Blue Raven, not column-mapped; and
   mapping its `Accel_Z` is unsafe because its convention differs from a real Blue Raven's).
2. **The burnout search runs unbounded when the speed was withheld.** `maxVelIdx = -1` falls back to
   `apogeeIdx`, so 4 of 14 signed-axial flights search the whole climb. Latent (all four still find
   the real motor) but it is the exact case the bound exists to prevent. BACKLOG has the numbers.
3. **The 44 px touch floor is never tested.** `responsive.spec.ts` runs without `hasTouch`, so the
   coarse-pointer rule is off and every phone-layout assertion measures desktop-height controls.
4. **A dead all-zero accelerometer column reads as a live +1 g trace** on a `gravityRemoved` parser,
   and reports `maxAcceleration` 0 → 9.81 as *measured*. Latent — 0 of 23 corpus flights trip it —
   but the guard is on one surface out of six and tests the normalised array rather than the raw one.
5. **`altAt()` and `series.altitude` disagree about the same instant** — burnout altitude 171.9 m
   against a plotted 774.8 m on one Blue Raven flight, and opposite signs on another. Unverified.
6. **Regenerate the two `maxAccel` goldens.** At ±6% they pass before and after a whole 1 g
   correction, so the corpus net cannot catch that class of defect at all.

BACKLOG.md carries the rest, newest first.
