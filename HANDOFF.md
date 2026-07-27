# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — closed the 1 g accelerometer-convention defect at the channel

Branch restarted from `origin/main` at `7b2f446` (the previous PR was squashed in).

The last run corrected `liftoffTWR` alone by differencing against the pad. The root cause was the
CHANNEL, so the peak g, the boost average, the drag Cd and the accel-ceiling integral were all still
a full g out. This closes it in one place.

**How.** Debrief reports SPECIFIC FORCE everywhere — an accelerometer at rest reads +1 g. AltOS
writes `acceleration` net of gravity, resting at ~0. A `Channel` now carries `gravityRemoved`, the
AltusMetrum parser sets it on both its entry points, and the analyzer adds the g back straight after
the sign flip (order matters: adding first would give −(a+g) on an aft-mounted sensor).

**Why a parser flag and not a measurement.** Two self-calibrating designs were built and rejected
first. Reading the resting value from the altitude's pad window is wrong — on one flight that window
spans 81 samples averaging **27 m/s²**, i.e. the boost, because a rocket is well into its climb
before the barometer has moved the 6 m that ends the baseline. Scanning for the quietest half-second
in the accel itself is sound but reaches only **1 of 10** of these flights: most AltusMetrum records
open at or after ignition and hold no resting stretch at all. Only the importer can know the
convention, which is where the architecture puts format knowledge anyway.

**Effect, measured over the corpus.** All 10 AltusMetrum flights move by exactly +1.00 g on the peak
and the boost average (62.25→63.25 g, 3.24→4.24 g). The 6 AltimeterCloud flights are **untouched** —
the strongest evidence the rule is right, since they were already on the convention. `burnTime`
shifts slightly (sg1.1 2.60→2.69 s) because a gravity-removed trace crosses zero at the velocity
peak while a specific-force one crosses just after, at the end of thrust.

**What this cost, stated plainly.** One corpus regression's expected `burnTime` had to be
re-centred, 2.6 → 2.69. That value was produced by the code rather than sourced — no motor burn time
is recorded for the flight — so it could not arbitrate. The tolerance was NOT loosened and the
guarantee the case exists for (that the reading is the motor, not the 12.99 s apogee charge) is
untouched. BACKLOG asks for the motor's published burn time as real ground truth.

**And the goldens are blind to this class of bug:** the two `maxAccel` asserts pass at ±6% both
before and after a full 1 g correction. Recorded.

## Environment notes

- **Git identity defaults to the harness's, not the project's.** It came up wrong again this run and
  had to be set before the first commit. Check `git config user.name` / `user.email` every time.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. Confirm `corpus.test.ts` reports
  **102 tests** — one that skips itself prints much like one that passed.
- **The image's Chromium is the wrong build and fails silently.** `/opt/pw-browsers/chromium` is
  1194; Playwright 1.61.1 wants 1228. Run `npx playwright install chromium` (~2 min); do not set
  `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` throws on a mismatch — trust that error.
- **`pkill -f "npx serve"` kills its own shell**, because the pattern matches the command line
  running it. The gate exits 144 with no output and looks like a crash. Use `pgrep -af serve` and
  kill by pid, or just don't — Playwright's `reuseExistingServer` handles it.
- **A piped gate hides its exit code** — echo `${PIPESTATUS[0]}`, not `$?`.
- **A `*-tmp.test.ts` probe is picked up by vitest** and inflates the gate's own numbers (55 files /
  652 tests with four probes present, 51 / 648 without). Delete probes *before* the gate run you
  intend to quote.
- **Nothing identifies which commit production is serving.** No `/version.json`, no build SHA in the
  HTML or `sw.js`. The done-check asks for the gap between the SHA you shipped and what is live, and
  it currently cannot be answered except by matching a content-hashed chunk name out of the served
  HTML against a local build. A tiny build-stamped marker would fix this permanently.
- **CI does not run on a working branch.** `.github/workflows/test.yml` fires on push to `main` and
  on `pull_request` only, so the PR is what makes CI run at all. `deploy-cloudflare.yml` fires on
  push to `main`. **Do not merge before CI reports.**
- **The runners in this environment stall** — budget for 30+ minute `in_progress` runs and open the
  PR early. Parse `list_workflow_runs` as JSON; a regex over the raw blob straddles records.
- **The box has 4 cores**, so a parallel fan-out runs about two agents at a time. Six agents took
  longer than the 30-minute harvest window; dispatch three or four, not six.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

## Pick up first, and why

1. **Regenerate the two `maxAccel` goldens against the specific-force reading and tighten them.**
   At ±6% they pass before and after a whole 1 g correction, so the corpus net cannot catch this
   class of defect at all. 84.59 g (Kairos) and 63.25 g (Stargazer1) are the current readings.
2. **Get the motor's published burn time for the AltusMetrum flights.** `burnTime` moved 2.60→2.69 s
   on sg1.1 for a principled reason, but nothing independent pins it — the old value came from the
   code itself. A certified burn time would make a real golden value.
3. **The liftoff threshold is still convention-blind** — `acceleration[i] > 2 * G0` is absolute. It
   now sees a normalised trace on the AltusMetrum family, so its meaning changed there too; check
   whether liftoff moved on any flight and whether the threshold should be relative to the resting
   value.
4. **Should burnout search past the velocity peak?** On a correct specific-force trace the axial
   reading equals g at the velocity peak and only falls through zero after it, outside the current
   search bound — so the accelerometer crossing never fires and the labelled fallback always takes
   over. That is now true for every family, consistently, but it may be leaving a real reading on
   the table.
5. **The drogue leg still starts at apogee, not at deployment** (a 31% gap on a real file).
   Multi-pass: `ChannelKind` has no event kind and `ROLE_TO_KIND` is closed, so every deployment
   boundary in the corpus is parsed and thrown away. BACKLOG lists all five sources.
6. **Pin the four-altimeter descent chord** (0.12% agreement across 4 recordings of one flight) as
   the first descent golden value — `expected.json` still asserts no descent rate anywhere.
7. **CSV export: column selection, a field separator, a comments block.** The read side sniffs the
   delimiter (`lib/csv.ts:11`); the write side hard-codes `,` in three places (`lib/csv.ts:175`,
   `lib/explore.ts:65`, `lib/report.ts:600`), so a comma-decimal-locale flyer gets one column.
8. **The report's file-export strip on a phone** — 861 px of nine controls in a 380 px viewport.

BACKLOG.md carries the rest, newest first.
