# Handoff

Overwritten each run. What just shipped, what is part-way through, and what to pick up first.

## This run — units that lied, and four readings the record doesn't support

Branch restarted from `origin/main` at `38a9a75`; production was serving exactly that SHA at session
start, so there was no gap on the way in. Thirteen shipped increments, with record-keeping commits
alongside them, on this run's working branch, via PR #23.

Two themes. **A number labelled with a unit it wasn't in** (1–3), and **a reading published that the
record cannot support** (4–8). Every figure below was measured this run.

### Units

1. **`a033138` — the JSON exports declared one acceleration unit and emitted another.** `jsonConv.acc`
   converted to g unconditionally while `jsonUnits` declared the flyer's choice, so picking m/s²
   produced `units.acceleration: "m/s²"` beside a figure in g: **15.62 emitted where the value in the
   declared unit is 153.14**. Invisible to the suite, because every JSON assert passed `'imperial'` or
   `'metric'` and both name acceleration in g.
2. **`24e4590` — the acceleration chart and the data CSV ignored the per-quantity unit.** With m/s²
   picked, the tile read **185 m/s²**, the chart's own accessible description said "peaking at
   185 m/s²", and the heading above the curve said **Acceleration (g)** over a curve at ~18.9. The
   velocity chart above it had already switched to mph. The e2e covering this picked m/s² and checked
   only the velocity heading.
3. **`019e244` — the JSON logger cross-check divided two speeds by g.** The cross-check renders twice
   and the two copies decided the quantity separately; the JSON one tested apogee and max velocity and
   let the rest fall through to the acceleration converter. **Three corpus files carry a reported
   speed, all AltimeterCloud, all wrong**: burnout **59.83 m/s exported as 6.10**, descent **6.21 as
   0.63**; **152.76 → 15.58**; **153.86 → 15.69**. `agreementPct` is computed from SI before either
   conversion, so the row read "agree" while the numbers beside it were 9.8× apart.

### Readings the record doesn't support

4. **`d361cf8` — a peak speed differentiated across four missing GPS fixes.** The ascent-gap guard
   tested the CLOCK only; a ground-station GPS log keeps writing a row a second through a dropout.
   `fwgps__trf-f1machbuster-jan18__GPS_GS03748` loses four fixes at t=962.01–965.01 and the derivative
   bridged them: **268.0, 497.0, 496.4, 268.7 m/s** where the climb either side averages **288**.
   **497.0 m/s became the headline, at Mach 1.46** — and uncaveated, because `mach` falls back to the
   ground speed of sound while the transonic search needs a finite one, so `transonicTime` was null and
   every supersonic caveat is gated on it. One of 46 flights; now none. The rule counts samples, not
   seconds. **The published accuracy claim moved with it**: "+28% for a GPS-derived peak" was that
   artefact, stated on five surfaces. Measured without it: **+5%** on the speeds (**+8%** on the Mach
   pair, **+9%** against the tracker's own summary), with the barometric derived peaks at **+23%,
   +30% and +110%**.
5. **`83d20b1` — corrected the figures that change published.** A review found the guard sound
   (46/46 sweep, one flight moves, no over-withholding) and six things wrong around it: a withheld peak
   reading "not in this log" (the opposite of true — `maxVelocityWithheld` now says which kind), a
   FOURTH real measured-vs-derived pair the enumeration omitted (**endurance StratoLogger 410.8 vs
   TeleMetrum 315.1 m/s, +30.4%**), a speed ratio printed under a Mach pair's name, a self-contradictory
   comment, a vacuous assert, and two stale citations.
6. **`d18f582` — a descent that never reached the ground was reported as a touchdown.** The analyzer
   already withholds flight time and descent time there and says why; the descent RATE went on being
   published and every surface read it as a landing — "averaged apogee **to landing**", "**Touched
   down at** X", a landing energy squared out of it, a parachute Cd solved from it. **Six flights**:
   the Kairos sustainer stops **2,540 m up, 62.8% of its own apogee**, and read "touched down at
   148.5 ft/s" beside its own warning that the record never reaches the ground.
7. **`4706024` — the Recovery card called the last GPS fix a landing.** On a 2.84 s log whose last
   sample is **1,081.6 m AGL at 322.1 m/s, still climbing**, it printed "Landed from pad: 10 ft",
   "Bearing 267° W", drew a landing cross and said "Walk from the pad toward W" — and the GPX and KML
   carried a waypoint literally named `Landing`.
8. **`5d1d165` — the timeline said "liftoff to landing" whatever the record held.** "**2.6 s liftoff
   to landing**" above a bar with only Boost and Coast. **15 of the 42** corpus flights that render a
   timeline said it without a landing.

6–8 share one predicate, `landedInRecord`, because six surfaces were each deciding it separately.

### Craft

9. **`d476e3b` — apogee was the only primary tile with no qualifier.** On a telemetry log that cuts out
   during boost the peak IS the last sample: **3,548 ft, "2.6 s to apogee"**, still climbing at
   1,057 ft/s. Two corpus flights. The figure is kept and now says "at least this high".
10. **`61ec3c7` — comparison columns all read the same, and both caption panels lied.** Four
    AltimeterCloud recordings of one flight painted the identical `mercury__altimeterclo` — **1 of 4
    distinct**, at both 1440 px and 390 px. Now **4 of 4** at both. Separately, both label/notes panels
    said "Kept on your device" (this app's phrase for localStorage) over pure React state; the
    single-flight report made the same false promise, so both were corrected.
11. **`491f15e` — a phone could not tell two logbook rows apart.** At 390 px the name cell is 188 px and
    all four rows painted `mercury__altimetercloud`. That is the surface you tick flights from.
12. **`9dca573` — three chrome links under the touch floor**, found by the closing cold walk: the brand
    eyebrow **102×16**, Tip **59×26**, the footer project line **358×20**. The CSS comment claimed the
    eyebrow was covered by `nav a`; it lives in a header div. The e2e measured `nav a` too, so it passed
    while seven targets were under the floor. Seven before, four after, all four prose.
13. **`6bbd627` — the saved landing energy didn't say what it came off.** Where a flight lands with no
    deployment change resolved, the figure is the whole descent averaged; the card said so and the
    report printed the joules bare, on the artefact a cert write-up is read from.

**Every assert added this run was falsified** — reverted against the old code and confirmed to fail for
the expected reason. One passed its falsification first time (under m/s² the wrong converter is the
identity) and was rewritten to run two unit choices.

### The landing block — done, and how

**A file boundary was read as a touchdown.** On `blueraven__trf-f1machbuster-jan18 LR` copy 1's trace
freezes at 823.2 ft and the next sample, **0.020 s later, is −3.4 ft**: a step of **41,330 ft/s** on a
flight whose recorded descent ran at 55. That sample is copy 2's pad. From it came a 122.90 s flight
time (which "agrees" with the device's 123.02 by luck) and a published **54.8 ft/s** where the device's
own summary states a **29.0 ft/s** main descent — a **3.6× landing-energy error**.

**The earlier attempt aimed at the wrong layer, and that is why it broke things.** It bounded the
LANDING SEARCH, which is four interacting rules (the near-pad detector, the at-rest tail fallback,
`descentIsInTheRecord`, and the `altClean[n−1] < 5` clause) plus the second-copy splice; two refinements
each fixed one case and broke others. The defect is one layer up, in `nextFlightStart`: the cut between
copies is placed at the **low point of the trough** after the join, and where the join IS the drop, that
hands the first copy the next copy's opening pad samples. The landing detector was doing its job on
samples it should never have been given. Fixed there (`966cf6a`), the landing block is untouched.

The rule: a body released at the record's own peak reaches the ground at √(2gh) and no faster, so a step
into the ground band quicker than that (doubled, for baro headroom) is the recording restarting. Every
multi-segment corpus file trips it and clears the doubled bound by **9.6×, 32× and 315×**; a synthetic
pair's genuine 25 m/s touchdown is **4× inside** it and its cut does not move.

Both copies of jan18 stop 250 m up, so neither holds a landing. It joins the six that already say so —
**the census assert moves 6 → 7**. No landing event, no flight time, no descent time, no landing energy
(`—`, no joules figure anywhere on the page), no parachute Cd; the 51 ft/s it does carry reads
"averaged over the recorded descent — the record stops before the ground, so this is not a landing
speed". **jan10's splice is byte-identical** (10,245 ft, 83.00 s, 64.76 s, `second-copy`) with its cut
163 samples earlier; the Eggtimer anomaly's cut moves one sample, every reading identical.

**The assert that was written first and thrown away is worth more than the one that shipped.** "No
landing may be arrived at faster than a vacuum fall from its own apogee" is the obvious physical
statement and it is **wrong as a test**: a barometer lying on the ground with its charges fired bounces
tens of metres between samples, and the widest genuine landing in this corpus (`stargazer1`, from 17.3 m
of a 570 m flight) arrives at **11.3× that bound**. Rate does not separate a true touchdown from a false
one. The height it was **approached from** does — widest genuine **3.04%** of apogee, next 2.30%,
against jan18's **13.09%** — and the bound is 6%.

**And the synthetic that reproduces it has to have a WANDERING pad between the copies.** The first
version used a dead-flat zero and passed against the old code: with a flat trough the low point *is* the
join, so cutting at either lands in the same place and nothing is handed across. The corpus file reads
−1.0, +0.5, +0.5, −0.1 over its first four samples, and that wander is the whole mechanism.

### Done-check

- **Gate on the branch head: 687 unit tests across 52 files, build clean, 178 e2e.** Sweep
  `find . -name "*-tmp.*"` immediately before any run you intend to quote.
- **Corpus suite green: 111 tests, 61 fixtures on disk.** Two denominators exist and both are right —
  `corpusReads()` marks **37** analysed end to end (what the suite asserts), a looser sweep gets **46**.
  Say which you mean: a count of 7 over the loose set was 6 over the suite's, and the difference was a
  real fixture, not a bug.
- **Cold walk** of the built export at `9dca573`, on a **phone at 390 px, offline** — a journey not
  walked earlier this run. All five changed claims verified; offline reload served and usable; no
  horizontal overflow. It produced increment 12.
- **Benchmark** against the vendor tools: see BACKLOG.
- **BACKLOG**: four entries this run invalidated were corrected, not left to mislead.

## Environment notes

- **Git identity defaults to the harness's.** Wrong again this run; set before the first commit —
  `git config user.name "Neer Patel"` / `user.email "135655563+nrdptel@users.noreply.github.com"`.
- **`npm install` is needed at session start** — the container ships without `node_modules`.
- **`npm run fetch-fixtures` returns 401 here.** `ln -sfn /home/user/debrief-fixtures lib/parsers/__corpus__`.
- **The image's Chromium is 1194 and Playwright wants 1228.** `npx playwright install chromium` (~2 min).
- **A subagent's `*-tmp.test.ts` inflates the gate.** Four appeared mid-run from fan-out agents and
  turned 52 files/664 tests into 53/666. Sweep `find . -name "*-tmp.*"` immediately before any gate run
  you intend to quote — not just at the end.
- **e2e flakes under fan-out load and a control proves nothing.** `compare.spec.ts` "a file a batch drop
  could not read can be mapped" failed once at load 8.56 and passed alone and in a full re-run at 9.53.
  Re-run the full suite, not the single test.
- **`pkill -f "<pattern>"` kills its own shell** when the pattern appears in the command line running it;
  the Bash tool returns exit 144 with no output and it reads like a crash. Bracket the first character.
- **Measuring truncated text needs the painted string, not `innerText`.** `innerText` returns the whole
  name whatever the box does with it, so an assertion on it passes while four columns read identically.
  Measure with the element's own computed font, and across wrapped lines if it wraps.
- **The harness appends an attribution footer to a PR body.** Stripped on #23; read every body back.
- **CI does not run on a working branch** — `test.yml` fires on push to `main` and on `pull_request`.
  Both jobs ran ~1.5 min (frontend) and ~4 min (e2e) all run.
- **A browser in this container cannot reach the deployed site.** `curl` goes through the agent proxy
  fine — `version.json`, the static `/methods` and `/validation` HTML, the JS chunks all fetch — but
  Playwright's Chromium gets `ERR_CONNECTION_RESET` on `https://debrief.fusionspace.co`, with and
  without `proxy: { server: HTTPS_PROXY }`, and the proxy reports no relay failures. So the
  done-check's "walk the deployed URL" is only partly possible: the static pages can be verified by
  fetching them, but the report is client-rendered, so **the live report itself cannot be walked from
  here**. Walk the built export of the SHA you shipped instead, confirm `version.json` matches it, and
  say that is what you did.
- **`npx serve -s out` SILENTLY SERVES THE ANALYZE PAGE FOR EVERY ROUTE.** `-s`/`--single`
  rewrites every path to `out/index.html`, so an ad-hoc walk of `/compare`, `/methods` or
  `/validation` walks `/` instead and looks entirely plausible. Demonstrated:
  `serve -s out` gives `/compare/` = **53,602 bytes, byte-identical to `/`**;
  `serve -c e2e-serve.json` gives **40,090 bytes**, the real page. The e2e suite is NOT
  affected — `playwright.config.ts` serves with `-c e2e-serve.json`, no `-s` — but every
  hand-rolled Playwright probe this run used `-s`. Those only ever loaded `/`, so nothing
  wrong was published, and an assert that a `/compare` test really ran on `/compare` is
  cheap: it asserts on text only `CompareSurface.tsx` emits. **Use `-c e2e-serve.json` for
  any manual walk**, and it gets the security headers too.
- **The clone is shallow**, so any commit count or file history is a window, not the record.

### After the merges — PRs #24 and #25

Four more increments landed on the branch after PR #23 merged, as PR #24: the vendor-tool benchmark
recorded in `BACKLOG.md` with sources; the channel explorer no longer removing channels from its own
menu (eleven entries to five on a Blue Raven, silently) and instead saying why each is blocked; the
cross-check speaking up when two recordings **disagree about whether a charge fired** rather than
emitting no descent row at all; and the report's two unnamed blocks — the metric grid and "Worth
knowing" — getting the headings that make them reachable by heading navigation.

Then PR #25: the report can be **navigated by section**. It runs 5,472 px on a desktop and 7,710 px —
nine screens — on a phone and carried **zero** in-page links, so coming back to check one number meant
scrolling past everything and no section could be linked to. The strip lists only what this flight has
(8 links on a TeleMega with GPS, 7 on a Blue Raven low-rate, 6 on an AltimeterCloud), sits at 46 px on
a phone with every link already at the touch floor, and every section that lacked an anchor has one.

And the events list now **names its clock**. It is on the log's own time base (what the charts are
drawn against) while every reading is seconds-since-liftoff, so on a file whose clock doesn't start at
liftoff the same instant printed two numbers with neither named: **27 of the 45** corpus flights that
carry both disagree by ≥0.5 s, the ground-station GPS log by **960 s** — apogee at 973.0 s in Events
and 13.0 s in the grid. Neither clock moved; the heading says which one it is and where liftoff falls
on it, and the test asserts the arithmetic reconciles rather than that a sentence exists.

And the coast-efficiency sub-line stopped reading as a broken unit. "drag cost 18,282 ft" on a
**6,292 ft** flight is correct arithmetic — the figure is the vacuum coast that burnout speed would
have bought minus what was gained — but **20 of the 31** corpus flights that show it exceed their own
apogee, up to **6.6×** (107,217 ft against 16,206 ft). Named against what it is short OF now, with the
number untouched.

**Falsifying these took two goes each time it mattered, and it is the lesson of the run.** The first attempt made the
Recovery link unconditional and the test still passed, because the fixture it used carries lat/lon so
the link was not dead there. The second time an assert was green while proving nothing — the other was
the explorer's, where the falsification ran the wrong test by name. Falsify against the case the
assert is *about*, and check the failure message names it.

### After the merges — PR #26, and this run's last two increments

PR #26 landed the coast-efficiency wording above. Then two more, on the branch as PR #27:

**`966cf6a` — the landing block** (see above). The largest remaining wrong number in the app, and it
turned out not to be in the landing block at all.

**`d1fb121` — the section strip now pins.** The strip shipped in #25 scrolls away with the page, so it
helped on arrival and not once you were deep in a report that runs **7,907 px — 9.4 screens — at
390 px**. `sticky top-0` rather than `fixed` is how it earns the room it holds: until you have scrolled
past where it already sat it costs nothing. Opaque against the page background (hit-tested at its own
centre while content scrolls beneath it), sideways-scrolling still, gone in print, where every
section is already on the paper. The jump targets
carry a **4.5rem** scroll-margin — sized to the TALLEST the strip gets, 62 px at 390 px where the
coarse-pointer rule holds every link to the 44 px touch floor, not the 42 px desktop average. 3.5rem was
tried first and left a phone's heading 6 px underneath, which the browser walk caught and the first
version of the assert would not have.

## Pick up first, and why

1. **Merge the Blue Raven's high-rate file into its low-rate flight.** The benchmark's top finding and
   the highest-leverage thing available: max acceleration, thrust-to-weight, deployment shock and roll
   rate are permanently blank on the most widely flown modern HPR altimeter, while the numbers sit in a
   sibling file the flyer already has — the cross-check literally prints
   `Max acceleration · 72.9 g · — · not computed`. The multi-file plumbing exists (low-rate + device
   summary pairs today), so this extends a mechanism rather than inventing one. See BACKLOG for the
   full ranked benchmark.
2. **Make the comparison and report captions actually stick.** The copy is honest now; sticky is the
   feature. A comparison's label belongs to its id-set, not to the device, so it needs a key design —
   the logbook's per-flight `note` (IndexedDB, `lib/recents.ts:117`) is the precedent, not localStorage.
3. **Deployment boundaries are parsed and thrown away across four parser families** — see BACKLOG. The
   deploy latches are per-COPY on a file holding its flight twice, and the cut between copies is now
   placed at the join rather than a few samples into the next copy's pad, so that hazard is smaller
   than it was — but it is still per-copy, so read `nextFlightStart` before trusting a latch index.
4. **jan18's main descent is in neither copy.** Both stop at 250 m — right where the main would have
   deployed — so Debrief has no main leg to read and the device's own 29.0 ft/s has nothing to be
   cross-checked against. Worth a look at whether the sibling files for that flight (the Featherweight
   GPS recorded it separately and reads a 50.7 m/s drogue and a 6.2 m/s main) can supply it, which is
   the same multi-file mechanism as (1).
5. **The strip pins, but it does not say where you ARE.** No current-section state, so six screens down
   it lists eight places without marking which one you are in.

BACKLOG.md carries the rest, newest first.

## The fixtures repo

One commit there this run, on the same working-branch name: `expected.json`'s note for
`blueraven jan18 LR` now records what that file does and does not hold — both copies stopping at
250 m (820 ft), above the 696 ft the paired summary states the main fired at, so the main leg is in
neither copy; the summary's −29.0 ft/s main and −55.9 ft/s drogue; the copy join at sample 6244
(250.9 m → −1.0 m in 0.020 s); and the summary file's own mislabelling of a descent RATE as "feet".
Metadata only — no assert changed and the corpus suite is unchanged at 111.
