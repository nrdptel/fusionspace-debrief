# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — three honesty defects, all on artefacts a flyer acts on

Branch restarted from `origin/main` at `553f517`; production was serving exactly that SHA at session
start, so there was no gap. Three increments: `dc4a7f8` and `e28a435` merged and live, `226aa88` on
the branch awaiting CI on PR #22.

### 1. A column the logger never filled is no longer a measurement — `dc4a7f8`

An accelerometer column of exact zeros is a column the logger wrote and left empty, not a recording
of no acceleration. The gravity-removed normalisation adds a full g to put such a channel on
specific force, so its zeros arrived as a flat **+9.80665**: peak acceleration exactly **1.0000 g**,
boost average **9.80665**, thrust-to-weight exactly **1.00** — all fabricated, all labelled
*measured*. Unflagged, the same column reported a *measured* **0 g**.

**Six** surfaces branch on `accelerationSource === 'device'` and exactly one carried a liveness
check — which tested the array AFTER the shift, so it was the single place it could not work.
Decided at the source now (`hasLiveSamples`), which every surface already handles; the three
defeated copies in `FlightReport` are gone. Latent: no corpus fixture is all-zero.

### 2. The data CSV stated a Mach the rest of the app withholds — `e28a435`

`analyzedDataCsv` computed Mach and dynamic pressure per sample with no `velocityImplausible` gate,
while both its siblings and every headline withhold them. **10 of 46** corpus flights withhold the
speed on screen and **all ten** exported a Mach: **362.4** and **1.79e8 kPa** on the loudest, and
then **1.7, 1.6, 1.3** — the believable ones, which are the dangerous ones, on flights where Debrief
refuses to say "supersonic" anywhere else. Both columns are now omitted entirely; the velocity column
stays, as its trace does on screen.

### 3. The cross-check reported agreement over a shorter list than it shows — `226aa88`

`crossCheck()` covered seven readings while the comparison table displayed twelve. Measured:
**iss-endurance** worst CHECKED spread **26.4%** against **max-Q 53%** (58,017 vs 99,672 Pa — the
structural load case), burn time **193%**, burnout altitude **176%**; the **four-altimeter** group
inside **6.7%** on everything checked while its **tilt** ran 4°/9°/11°; **meraki2** main deployment
**221 s apart**. All five are now checked, with the measured/derived flag carried on the two read at
the burnout instant.

That exposed the sentence: *"agree to within … 193% on burn time"* is not English. The lede is chosen
by the same threshold that colours a row amber, from one shared helper rather than three copies. An
**e2e assertion had been passing on output reading `agree to within 160% on apogee`** — it matched
the phrase as a stand-in for "the narrative is present"; it now asserts the sentence and the right
opening.

### Done-check

- **Corpus suite green**, and every increment measured over the corpus with the overrides merged
  (46 analysable, 14 signed-axial) rather than the 9/23 a naive sweep sees.
- **Cold walk**: the comparison end to end, and the data CSV parsed back column by column.
- **BACKLOG**: three DONE entries with their numbers, plus one new unverified finding (below).

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

1. **A metric only ONE recording carries is dropped from the cross-check in silence.** `crossCheck`
   skips a spec with `contrib.length < 2` — right for "too few to corroborate", wrong when the
   recordings *disagree about whether the thing happened*. On `trf-f1-jan18` the Blue Raven reports a
   whole-descent rate and no main while the Featherweight GPS reports a drogue AND a main, so each
   descent key has count 1 and the panel emits **no descent row at all** — reading as though recovery
   were not covered. Two instruments disagreeing about whether a main deployed is a finding, not an
   absence. **Unverified** — filed from the reconciliation sweep, reproduce before scoping.
2. **Use the second recording Debrief already holds.** `Proton-FW_format.csv` reports **Mach 2.64**
   on a flight whose ground truth is **Mach 1.3**; its sibling reads Mach 1.55 and both agree on
   apogee to the metre. The transonic warning fires and names this reading, so it is caveated rather
   than silently wrong — but the tile still shows Mach 2.64 while a cross-check in the same logbook
   says otherwise. Two dead ends are recorded in BACKLOG so they are not walked again.
3. **The JSON export declares the wrong unit for acceleration.** From the export sweep, unverified:
   `jsonConv.acc` always converts to g while `jsonUnits` declares `L.accel`, so a flyer who picks
   m/s² gets `units.acceleration = "m/s²"` beside a value in g — a factor of 9.8 in a machine-readable
   export. Reproduce before scoping.
4. **Give the burnout bound a fixture that can fail.** See BACKLOG: needs a log whose apogee charge
   outreads its motor AND whose speed is withheld. A synthetic must get past the device-velocity
   gate, which rejects a hand-built `velocity` channel outright.
5. **Regenerate the two `maxAccel` goldens.** At ±6% they pass before and after a whole 1 g
   correction, so the corpus net cannot catch that class of defect at all.

BACKLOG.md carries the rest, newest first.
