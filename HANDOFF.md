# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — the unit a number is in, and three claims the record doesn't support

Branch restarted from `origin/main` at `38a9a75`; production was serving exactly that SHA at session
start, so there was no gap. Five increments, all on the branch pending a PR.

### 1. The JSON export declared one unit and emitted another — `a033138`

`jsonConv.acc` converted to g unconditionally while `jsonUnits` declared the flyer's chosen unit, so
picking m/s² produced `units.acceleration: "m/s²"` beside a figure in g. Measured on
`altusmetrum__issuiuc-irec2023-20230621__irec_2023_telemega.csv`: **15.62 exported where the value in
the declared unit is 153.14** — a factor of 9.81, or 32.17 had ft/s² been picked, inside the one
artefact that exists to be machine-read.

**The suite could not have caught it.** Every JSON assert passed `'imperial'` or `'metric'`, and both
name acceleration in g, so the export agreed with them whatever it converted to. Both structured
exports share the one converter, so the flight and comparison documents were fixed together.

### 2. The acceleration chart ignored the per-quantity unit — `24e4590`

The methods page says the choice reaches every number, chart axis and export together. Acceleration
was where it didn't: pick m/s² and the tile read **185 m/s²**, the chart's own accessible description
said "peaking at 185 m/s²", and the heading above the curve said **Acceleration (g)**, plotting ~18.9.
The velocity chart directly above had already switched to mph. The saved `.svg` carried the same fixed
axis, and the data CSV wrote g while the recorded per-axis channels beside it in the same file
followed the choice — so a bundle paired a `.json` in m/s² with a `.csv` in g.

The e2e that covers this already picked m/s² and asserted "the chart axis follows", but only checked
the *velocity* heading, so it passed throughout.

### 3. The JSON logger cross-check read two speeds as accelerations — `019e244`

The cross-check is rendered twice — formatted for the text/Markdown/HTML reports, and as numbers for
the `.json` — and the two decided independently which quantity each metric is. The formatted one
handled all five; the JSON one tested apogee and max velocity and let the rest fall through to the
acceleration converter. Measured: **three corpus files carry a reported speed, all AltimeterCloud, and
every one was wrong** — greeneggs3-1888 burnout **59.83 m/s exported as 6.10**, descent **6.21 as
0.63**; lilnuke4alt-1786 **152.76 → 15.58** and **5.71 → 0.58**; lilnuke4alt-1796 **153.86 → 15.69** and
**5.63 → 0.57**. The agreement percentage was right throughout (computed from SI before either
conversion), so the row read "agree" while the two numbers beside it were a factor of 9.8 apart.

The quantity is decided once now, in a `Record` over the metric union, so a new `ReportedValue` metric
will not compile until it is classified.

### 4. A peak speed differentiated across four missing GPS fixes — `d361cf8`

**The largest of the five.** The guard that withholds a derived peak over a gap tested the *clock*
only. A ground-station GPS log keeps writing a row every second through a dropout — same cadence,
empty altitude field — so the clock ran straight through it.
`fwgps__trf-f1machbuster-jan18__GPS_GS03748` loses four consecutive fixes at t=962.01–965.01 and the
smoothed derivative bridged them: **268.0, 497.0, 496.4, 268.7 m/s** where the climb either side
averages **288 m/s**. **497.0 m/s became the reported peak, and at Mach 1.46 a supersonic reading**,
off four rows the record does not contain. The Blue Raven on the same flight measured **378.9 m/s**.

It arrived **uncaveated**: Mach falls back to the ground speed of sound when the profile at the peak
index is unreadable, but the transonic-crossing search requires a finite one — so this flight reported
Mach 1.46 with `transonicTime` null, and *every* supersonic caveat is gated on that being non-null. No
amber "reads transonic — unconfirmed" block, no Transonic row, while the tile said Mach 1.46 and the
JSON exported `maxMach: 1.461`. One of 46 was in that state; now none are.

The rule counts samples, not seconds: two or more consecutive ascent samples with no altitude,
spanning more than 1.5 s. This file's own clock gap is **4.98 s against a 5·dt bound of 5.0** — it
missed by 20 ms, which is why counting seconds could not express the intent.

**The published accuracy claim moved with it, which is the larger half.** "A GPS-derived peak runs
high — Mach 1.46 against a Blue Raven's measured 1.14, **+28%**" was stated in the transonic warning a
flyer reads, on the methods page, on the validation page, in the metric grid's amber caveat and in the
comparison's mixed-source note. That +28% *was* the artefact. Measured again without it, the one GPS
flight the corpus can still check reads **446.8 m/s against a measured 427.0 — +5%**, and **+9%**
against the tracker's own stated 1,340 ft/s. The two barometric derived speeds on that same flight run
**+23% and +110%**, so the direction holds everywhere and only the size changed. All five surfaces now
state the measured figure.

Three corpus tests asserted on the withdrawn number and were **restated, not loosened**.

### 5. A descent that never reached the ground was reported as a touchdown — `d18f582`

The analyzer already marks no landing, withholds flight time and descent time, and says why. The
descent *rate* went on being published, and every surface read it as a landing: the grid said
"averaged apogee **to landing**", the report row said the same, and the recovery card said "**Touched
down at** X" and squared X into a landing energy — on a panel whose own copy says to compare it
against a club or certification limit. The parachute Cd solved a terminal velocity from it.

**Six of the flights the suite analyses end to end** are in that state. The Kairos sustainer stops
**2,540 m up, 62.8% of its own apogee**, and read "touched down at 148.5 ft/s" directly beside the
warning saying it never reaches the ground; the Proton file stops 2,113 m up (59.1%) and read 71.3
ft/s. The rate is kept and relabelled; the touchdown claim, the landing energy (card, report and
structured export) and the parachute Cd are withheld, and the card stays on the page to say so.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **`npm run fetch-fixtures` returns 401 here.** The companion repo is at `/home/user/debrief-fixtures`:
  `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **The image's Chromium is 1194 and Playwright wants 1228.** Run `npx playwright install chromium`
  (~2 min); do not set `PLAYWRIGHT_CHROMIUM_PATH`.
- **Two different corpus denominators, and they are both right.** `corpusReads()` marks **37**
  fixtures `analysed` end to end, and the suite asserts that. A looser sweep that accepts anything
  `importFlight`/`buildFlight` returns gets **46**. Say which one you mean: a count of 7 over the
  loose set was 6 over the suite's, and the difference was a real fixture (the PerfectFlite AL0 log),
  not a bug.
- **`pkill -f "<pattern>"` kills its own shell** when the pattern appears in the command line running
  it — the Bash tool then returns exit 144 with no output and it reads like a crash. Bracket the first
  character (`pkill -f "[s]erve -c"`) or don't use it.
- **A subagent's `*-tmp.test.ts` probe inflates the gate.** Three appeared mid-run from fan-out agents
  and turned 52 files/664 tests into 53/666. Sweep `find . -name "*-tmp.*"` immediately before any
  gate run you intend to quote, not just at the end.
- **e2e flakes under fan-out load and a control proves nothing.** `compare.spec.ts` "a file a batch
  drop could not read can be mapped" failed once at load 8.56 and passed alone and in a full re-run at
  load 9.53. Re-run the full suite rather than the single test.
- **`/version.json` answers "which build is live"** — `curl -s https://debrief.fusionspace.co/version.json`.
- **CI does not run on a working branch.** `test.yml` fires on push to `main` and on `pull_request`,
  so the PR is what makes CI run.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

## Pick up first, and why

1. **The same-flight splitter cuts at the wrong boundary, manufacturing a landing.** Verified this run
   but NOT fixed. On `blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR`, `nextFlightStart` cuts at
   copy 2's **liftoff** rather than copy 2's **start**, gluing ~2.3 s of copy 2's pre-launch pad onto
   copy 1. Debrief's "landing" event is that pad reading, at file t=122.92, AGL −3.4 ft. Cut the file
   cleanly at t < 122.9 and the correct guard at `lib/analyze/index.ts:1399` fires and withholds
   everything. The false ground is what defeats it. Consequence today: the flight reports
   "descent rate 55 ft/s" where the device's own summary states a **29.0 ft/s** main descent — a 3.6×
   landing-energy error. The main deploy is genuinely absent from both copies (both freeze on a
   4-sample ring covering the whole main leg), so the fix is the cut, not the detector. Increment 5
   does NOT cover this file: it has a landing event, so `landedInRecord` returns true.
2. **The Recovery card claims a landing on a log that ends at apogee.** Verified this run, not fixed.
   `altusmetrum__issuiuc-intrepid2-20220623__telemetrum_data.csv` — 285 samples, 2.84 s, last sample
   **1,081.6 m AGL at 322.1 m/s, still climbing**. `FlightReport.tsx:1073` renders `GroundTrack`
   on `gpsLat && gpsLon` alone; `lib/gps.ts:332` takes the last valid fix as the resting place
   unconditionally. It prints "Landed from pad: 10 ft · Bearing 267° W", draws a landing ✕, says
   "Walk from the pad toward W", and the GPX/KML carry a waypoint literally named **`Landing`**.
   `landedInRecord` from increment 5 is the gate this needs.
3. **The comparison's column headers are unreadable.** `CompareView.tsx:674` clamps them to
   `max-w-[10rem]` with `truncate`, so four recordings of one flight all render as the identical
   string `mercury__altimeterclo` — distinct visible header text 1 of 4, at 1440 px. Picking a reading
   from a column you cannot name is the surface's whole job.
4. **The comparison's Label and Notes are lost on reload** while the panel says "Kept on your device".
   `CompareView.tsx:169-174` — React state only, no localStorage, and the summary shows a ✓ while it
   holds volatile text. It is the caption that rides into the exported bundle.
5. **Apogee is the only primary tile with no provenance sub-label**, and carries no truncation flag —
   on a log the analyzer has already flagged as ending at or before apogee it still reads as flat fact.

BACKLOG.md carries the rest, newest first.
