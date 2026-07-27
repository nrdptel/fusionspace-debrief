# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — burnout is read where it actually is, and every surface says how

Branch restarted from `origin/main` at `563c54b`; production was serving exactly that SHA at session
start, so there was no gap to close. Four increments shipped, all merged to `main` and all live:
`d7b1bf8`, `5c552c0`, `8e1c846` (production `/version.json` confirmed at `8e1c846`).

### 1. The burnout crossing was searched for on the wrong side of the speed peak — `d7b1bf8`

The last run's BACKLOG called this RANK 1 and prescribed changing the threshold to `<= G0`. **That
prescription was wrong and would have regressed an honesty guarantee.** The diagnosis held — the
crossing could not fire — but on specific force `dv/dt = a − g`, so `a <= G0` **is** the velocity
peak, identically. Adopting it relabels the velocity-peak proxy as `measured`. Measured proof: on the
two cleanest traces (irec2023 easymega/telemega) `<= G0` fires at t=6.03 s, *the peak sample itself*.

The real defect was the **search bound**. Thrust = drag (`a = 0`) necessarily comes *after* the +1 g
crossing, so ending the search at the peak stopped one instant short of the event. Fixed with a
one-second thrust tail past the peak, **bounded in time, not samples** — a lossy telemetry capture
drops seconds between rows, and as a sample count it reached a crossing five minutes downrange on the
Kairos sustainer.

Gap across the **fourteen** signed-axial flights: **0.05–0.40 s**. `burnoutSource: 'measured'` went
**2 of 14 → 13 of 14** (intrepid2 never crosses); `burnoutAtVelocityPeak` true → false on all **seven** recovered, so burnout velocity is
no longer max velocity printed twice. The seventh — the Kairos sustainer, gap 0.22 s — was missed by
the commit's own measurement and is recorded in BACKLOG with the numbers it moved; the sweep bug
behind the miscount is recorded there too. `burnTime` re-centred: irec2023 5.80→5.88 (**its second logger on
the same flight independently reads 5.88**), kairos 5.06→5.13, sg1.1 2.69→3.09, stargazer1
3.72→3.78. Tolerances unchanged. A new corpus invariant holds burnout to a crossing computed
independently from `analysis.series`; **falsified** — reverting the bound fails it with `the axial
trace crosses zero at t=6.11s but burnout was not read from it`.

### 2. Every reading taken at burnout now says how burnout was located — `d7b1bf8`

`burnoutSource` reached exactly one reader: the JSON export. `burnoutSub`/`burnoutVelocitySub` in
`lib/readings.ts`, imported by `lib/report.ts`. The comparison tags `(speed peak)` **only when the
compared set mixes the two**, matching its existing `baroTag`. Verified live on the comparison
surface: `Burn time | 1 s (speed peak) | 1.6 s | 40%`.

### 3. A checkbox's touch target is now measured, and the compare tick has one — `5c552c0`

Two blind spots hiding each other. `e2e/responsive.spec.ts` ran without `hasTouch`, so
`@media (pointer: coarse)` — the 44 px floor — was **off** for the whole file; it had been measuring
desktop-height controls. And both thumb-target sweeps copied the CSS rule's checkbox exemption into
their own selector. That exemption is right in CSS and wrong in a test: what a thumb hits is the
target, not the box. Measuring it caught the logbook's compare tick at **20×20 px with no label**.

### 4. The card — the one surface that leaves the device — carries provenance — `8e1c846`

**13 of 46** corpus flights put a *derived* speed on a shareable card with the label stripped, and
**nine were supersonic claims** (Mach 2.64, 2.52 ×2, 2.21), every one differentiated out of an
altitude. The grid said "derived" the whole time. The card sub is now fitted to its column too: the
longest string measures **246 px against 250 px**, so it fit by four pixels.

### Done-check

- **Corpus sweep: 46 fixtures analysed, 0 findings.** Every reported headline recomputed against the
  range its own series can produce — apogee, max velocity, max/min acceleration, burnout altitude and
  velocity, and burn time against time-to-apogee.
- **Cold walk** of the built export of `8e1c846`: the report's burnout readings all read `measured`;
  the comparison journey (tick → *Compare 2 flights* → table) drives end to end and shows the
  `(speed peak)` tag on the mixed set only. Production `/version.json` = `8e1c846` = `origin/main`.
- **BACKLOG corrected** where this run invalidated it — see the two "checked and closed" entries.

## Environment notes

- **Git identity defaults to the harness's, not the project's.** Wrong again this run (`Claude
  <noreply@anthropic.com>`); set before the first commit. Check every time.
- **The harness appends an attribution footer to a PR body.** It did on all three PRs and was
  stripped each time, per the ZERO ASSISTANT TRACE invariant. Read every PR body back after posting.
  GitHub also swallows bare `<label>`-style tag text in a body as HTML — write it without the angle
  brackets.
- **`/version.json` answers "which build is live"** — `curl -s https://debrief.fusionspace.co/version.json`.
  An earlier handoff's note that nothing identifies the deployed commit is stale.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`. `corpus.test.ts` reports **103 tests**.
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
- **Do not run the gate while a fan-out is live.** 4 cores; a 3-agent workflow puts load average near
  8 and the e2e suite fails timing-sensitive tests that pass in isolation and pass again once quiet.
  Two failures were chased this run that were pure contention.
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
2. **The burnout search runs unbounded when the speed was withheld.** `maxVelIdx = -1` falls back to
   `apogeeIdx`, so **4 of 14** signed-axial flights search the whole climb — the exact case the bound
   exists to prevent. Latent: all four still find the real motor (burnout 0.77–0.92 s against apogees
   at 9.2–11.7 s). Unchanged by this run's fix.
3. **The card ignores the reading chooser.** `flightCardStats` takes no `hidden` argument and
   `FlightCard.tsx` passes none, so hiding every row in the chooser still leaves all four stats on
   the card. A control that silently does not apply.
4. **A dead all-zero accelerometer column reads as a live +1 g trace** on a `gravityRemoved` parser,
   and reports `maxAcceleration` 0 → 9.81 as *measured*. Latent — 0 of 46 corpus flights trip it —
   but the guard lives on one surface out of six and tests the normalised array rather than the raw
   one, so the flag defeats it.
5. **Regenerate the two `maxAccel` goldens.** At ±6% they pass before and after a whole 1 g
   correction, so the corpus net cannot catch that class of defect at all.

BACKLOG.md carries the rest, newest first.
