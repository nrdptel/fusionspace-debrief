# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — the comparison overlay shows the events, and a lost search bound is back

Branch restarted from `origin/main` at `cd94d89`; production was serving exactly that SHA at session
start, so there was no gap. Two increments: `cc22793` merged and live, `3571167` on the branch
awaiting CI on PR #19.

### 1. Each flight's events, drawn on the comparison overlay — `cc22793`

The sharpest gap in the previous run's benchmark. `buildComparison()` had every detected event and
kept only `liftoffDetected`; the overlay marked t=0 and nothing else, so *did these two bays do the
same things at the same moments* could only be read off the table a row at a time.

Each flight now carries its events on the shared clock — rebased onto the same liftoff zero the
series were aligned to — and the overlay draws them in that flight's colour. Driven live: one
recording's main at ~93 s against the other's at ~120 s, visible as a gap rather than a subtraction.
Liftoff is deliberately not carried per flight; every flight is aligned there.

Which events are called out comes from `debrief.hiddenEvents`, the same stored answer the
single-flight explorer uses, and the chips that set it are now one `EventChips` component both
surfaces render rather than thirty lines of markup copied.

**The label placement had to be fixed first.** The old rule dropped a line whenever a marker came
within a fixed 64 px of the previous one and wrapped every third label — a guess about text it never
measured, and a wrap that put the fourth crowded label back on the first. With every flight's events
drawn, a burnout landed on a burnout. Labels now take the lowest row whose text has actually run out,
measured with `measureText`. At 390 px the sample comparison uses **four rows** and nothing collides.
This is shared chart code, so the report and explorer got it too — both re-walked, unchanged.

### 2. The burnout search bound survives a withheld speed — `3571167`

The crossing search takes its bound from the velocity peak, and that bound is what keeps the apogee
ejection charge out of the window. A flight whose speed is judged impossible lost it: the judgement
nulled `maxVelIdx` along with `maxVelocity`, the search read that as "no peak" and ran the whole
climb. **4 of the corpus's 14** signed-axial flights are in that state.

The judgement is about the peak's MAGNITUDE; where the trace turned over is a separate fact. Keeping
the index and withholding only the value shrinks the window on those four from 9.2–11.7 s to under
two, and — measured over all fourteen with the overrides merged — **not one reported burnout moves**.

**The test added alongside does NOT guard this**, and says so in as many words: all four flights read
the same either way because their charge is smaller than their motor, and reverting the fix leaves
the suite green (checked). BACKLOG records what a fixture that could guard it would need.

### Done-check

- **Corpus suite green at 104 tests** (was 103), the whole-corpus invariants included.
- **Cold walk** of the built export on all three chart surfaces — comparison, report, explorer —
  plus the comparison journey end to end. Production `/version.json` = `cc22793` after increment 1.
- **Benchmark**: increment 1 closes the top gap the previous run's comparison benchmark named. The
  remaining items from it are unstarted and still in the queue below.
- **BACKLOG corrected** — the event-marker entry is now DONE, and the new bound entry states its own
  missing guard rather than implying coverage.

## Environment notes

- **Git identity defaults to the harness's, not the project's.** It was wrong again this run and had
  to be set before the first commit — `git config user.name "Neer Patel"` and
  `user.email "135655563+nrdptel@users.noreply.github.com"`. Check both every time; a whole session
  of mis-attributed commits is only fixable by rewriting pushed history. Do not paste the wrong value
  into a file to illustrate it — that puts the trace in the repo, which is the thing the invariant
  forbids. (It happened this run and was caught by the closing sweep.)
- **The harness appends an attribution footer to a PR body.** It did on all three PRs and was
  stripped each time, per the ZERO ASSISTANT TRACE invariant. Read every PR body back after posting.
  GitHub also swallows bare `<label>`-style tag text in a body as HTML — write it without the angle
  brackets.
- **`/version.json` answers "which build is live"** — `curl -s https://debrief.fusionspace.co/version.json`.
  An earlier handoff's note that nothing identifies the deployed commit is stale.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. `corpus.test.ts` reports **104 tests**.
- **An ad-hoc corpus sweep gets the wrong answer in TWO independent ways; copy `corpusReads()` and
  `loadForCompare()` out of `corpus.test.ts` rather than rolling one.** (1) A bare `importFlight`
  sweep silently analyses NOTHING for generic-CSV fixtures — they return `kind: 'mapping'` and need
  `buildFlight` — so it prints "0 findings" over ~23 named-parser files while **46** are readable.
  (2) Filtering `expected.json` on `expect.kind === 'flight'` **without merging
  `lib/parsers/corpus-overrides.json`** drops five more: the Kairos sustainer, which the stale
  `expected.json` still calls `mapping` and the committed override calls `flight`, plus the four
  generic-CSV mapper-path flights. Between them these cost a wrong all-clear twice this run and a
  **wrong corpus count published on the methods page** (nine signed-axial flights; it is fourteen).
- **The image's Chromium is the wrong build.** Run `npx playwright install chromium` (~2 min); do not
  set `PLAYWRIGHT_CHROMIUM_PATH`. `playwright.config.ts` throws on a mismatch — trust that error.
- **Do not run the gate while a fan-out is live, and a control run under different load proves
  NOTHING.** 4 cores; a fan-out agent driving its own Playwright puts load near 8, and the e2e suite
  then fails 8, then 78, then 18 tests — a different subset each time. This run that was chased a long
  way: a clean-tree control passed 172/172 and looked like proof the change was at fault, but the
  control had simply run in a quiet window. The same change passed 172/172 once the fan-out was
  stopped. Re-run the control under the SAME load, or stop the fan-out first and re-run both.
- **A `*-tmp.test.ts` probe is picked up by vitest** and inflates the gate's numbers. Delete probes
  *before* the gate run you intend to quote.
- **The Bash working directory persists between calls** and a workflow launch can move it. A
  `rm -f lib/*-tmp.*` ran against the fixtures repo this run and left a probe behind that then
  inflated the gate. Use absolute paths or `cd` explicitly.
- **A piped gate hides its exit code** — echo `${PIPESTATUS[0]}`, not `$?`.
- **CI does not run on a working branch.** `test.yml` fires on push to `main` and on `pull_request`,
  so the PR is what makes CI run. All four PRs this run went green in **~1.5 min (frontend) and
  ~4 min (e2e)**; the previous handoff's "runners stall for 30+ minutes" did not reproduce.
- **`get_check_runs` reports a job `in_progress` for minutes after it has actually finished.** On the
  last PR both jobs completed at 13:09:15 and 13:12:07 and the API was still returning `in_progress`
  at 13:16. Read `completed_at` on the returned records rather than trusting `status` — this cost
  several minutes of waiting for a run that was already green, and nearly produced a wrong
  environment note claiming the runners stall.
- **Playwright's `.click()` can time out on the "Compare N flights" button** while the element is
  present, enabled, in viewport and unobscured (`elementFromPoint` returns the button itself). A
  programmatic `.click()` works and navigates correctly. Likely an actionability/stability check, but
  worth confirming it is not a continuous re-render — that would cost battery on a phone.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

## Pick up first, and why

1. **Use the second recording Debrief already holds.** `Proton-FW_format.csv` reports **Mach 2.64**
   on a flight whose ground truth is **Mach 1.3**; its sibling recording of the same flight reads
   Mach 1.55, and both agree on apogee to the metre. The transonic warning already fires and names
   this reading, so it is caveated rather than silently wrong — but the tile still shows Mach 2.64
   while a cross-check sitting in the same logbook says otherwise. Two dead ends are recorded in
   BACKLOG so they are not walked again (the file is parsed as a Blue Raven, not column-mapped; and
   mapping its `Accel_Z` is unsafe because its convention differs from a real Blue Raven's — the
   Proton rests at 0.0 g, a real Blue Raven's axial axis at −0.99 g).
2. **A dead all-zero accelerometer column reads as a live +1 g trace.** Re-confirmed this run with
   numbers: on a `gravityRemoved` channel the unconditional `+= G0` turns an all-zero column into a
   flat +1 g trace, so `maxAcceleration` reports **9.80665 = 1.0000 g** and `liftoffTWR` **1.0000**
   as MEASURED. **Six** surfaces branch on `accelerationSource === 'device'` and would publish it;
   exactly one (FlightReport) carries a liveness guard, and that is the one the shift defeats,
   because it tests the array AFTER the shift. Latent — 0 of 46 corpus files are all-zero — but the
   guard belongs on the RAW channel at the source, which fixes all six at once.
3. **Give the burnout bound a fixture that can fail.** See BACKLOG: needs a log whose apogee charge
   outreads its motor AND whose speed is withheld. A synthetic must get past the device-velocity
   gate, which rejected a hand-built `velocity` channel outright.
4. **The rest of the comparison benchmark**, unstarted: overlay the raw logged channels (each accel
   axis, gyro, pressure, GPS altitude, voltage) rather than only the five derived ones — the channel
   explorer already does this for one flight, and the comparison is the one surface that does not
   offer it, which is where the "why do these two disagree" question actually gets asked.
5. **Regenerate the two `maxAccel` goldens.** At ±6% they pass before and after a whole 1 g
   correction, so the corpus net cannot catch that class of defect at all.

BACKLOG.md carries the rest, newest first.
