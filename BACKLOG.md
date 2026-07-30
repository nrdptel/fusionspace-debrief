# Backlog

**This is a DEFECT LEDGER, not the work queue.** The queue is `ROADMAP.md`. This file was already
right about itself — "not a roadmap; a memory" — but for a long time nothing else was the roadmap, so
a session that treated it as the queue could only ship fixes. It holds 212 entries and not one of them
proposes a capability.

Read it to file into, and to screen for a **Sev-1** — a wrong number on a surface a flyer would act
on, or a one-way door. Those preempt the milestone immediately. Everything else waits its turn under
the one-in-four quota in `MAINTAINING.md`.

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first.

## SEV-1 — none open

- **DONE — multi-flight segmentation mis-read any launch-day file whose flights differ by more than
  2x in apogee.** Every threshold in `nextFlightStart` is measured against the flight in hand now,
  never against the record's own highest flight, and three things a record does that are not a
  landing are named rather than guessed at: a dip that reaches the ground band sooner than free fall
  from that height allows, a climb back above the height already reached (a dropout mid-ascent), and,
  after touchdown, a drifting baseline or a single-sample spike. Pinned by
  `finds the second flight however far apart the two apogees are` over six pairs from 8x to 100x in
  both directions, plus four guard tests, each falsified by mutation. **Two things the original entry
  did not know, both measured this run:** the `ground` band at `:317` carried the same defect and
  patching `high` alone would have turned real corpus logs into false splits — 5% of the corpus
  121 km flight is 3.8 km, so a rocket still that high counted as landed; and the same noise floor
  had Debrief telling the owner of a 19 ft misparsed Blue Raven fragment (13 m of wobble over 34 s)
  that their file held several flights and to go and split it in the vendor software. Corpus diff
  before/after over every record that analyses — 46 of them, the generic-mapper ones included: 44
  byte-identical, the SG1.2 fragment above, and an Eggtimer whose cut moves one sample (0.05 s).
  Original entry:
  `nextFlightStart`
  (`lib/analyze/index.ts:316`) uses `const high = peak * 0.5` where `peak` is the **file's** peak, not
  each flight's own, so a second flight is only detected if it reaches half the biggest flight in the
  file. Measured by transcribing the function verbatim into a standalone probe: `[1000, 2000]` is
  detected; `[1000, 2010]` returns null; so do `[300, 3000]`, `[150, 900]` and `[1200, 400]`. The
  cliff is exactly 2.00x, in both directions. When it misses, liftoff is pinned in the first flight
  (`lib/analyze/index.ts:920`) while apogee comes from a later one, so `timeToApogee`, `burnTime` and
  `flightTime` span two flights and are printed with no caveat (`lib/readings.ts:144`, `:208`). The
  only structural guard, `ascentGapBreaksPeak`, needs a >1.5 s sample gap a continuous download does
  not have. `app/methods/page.tsx:100` tells the flyer the test is "something a rocket cannot do:
  return to the ground and climb again" and never states the half-the-peak condition — which is
  exactly what fails. Shipped coverage is 1.005x, 1.6x and `[300, 500, 250]`, the last sitting exactly
  ON the 0.5 boundary, so the whole failing region is untested. Already observed on real data: the
  18.3 s flight time for a 10,245 ft flight recorded further down this file. Fix, and pin with cases
  beyond 2x in both directions.

## Correctness / honesty

- **The AltOS raw download reads three log formats and refuses the rest, and the rest includes
  EasyMini.** `lib/parsers/altosEeprom.ts` reads log format 1 (TeleMetrum v1, 8-byte records) and
  the 32-byte TeleMega/EasyMega family. The 16-byte family — EasyMini, TeleMetrum v2, TeleMini,
  EasyMotor — is refused by number with a message that names the format and points at AltosUI's CSV
  export. EasyMini is one of the most-flown altimeters in the hobby, so this is the biggest single
  gap left in D2's outcome. It is refused rather than attempted for one reason and one reason only:
  **there is no 16-byte fixture in the corpus**, so a decode of it could not be measured against
  anything, and a misread record layout produces a plausible flight rather than an error. Get one
  `.eeprom` from a 16-byte board WITH the AltosUI CSV export of the same flight and this is an
  afternoon: the record is `{ type, csum, tick, … }` like the others, the barometer is the same
  MS5607 whose coefficients the header already carries, and `groundPressureAgrees` already exists to
  check the layout against the file's own stated ground pressure before anything is returned.
- **Temperature is dropped from an AltOS log format 1 download.** The raw reading and the °C AltosUI
  prints are related by `raw × 0.015 − 295.87` across the one corpus file (310 paired samples, 64 of
  them off by 0.06 °C, which is the CSV's own rounding) — but that is a curve fit, not the sensor's
  transfer function, so it is not shipped. The 32-byte formats DO carry temperature, because it falls
  out of the MS5607's documented compensation and matched AltosUI to 0.05 °C. Resolve it from the
  TeleMetrum v1 hardware's thermistor circuit rather than from more fitting.
- **The RRC3's temperature and battery voltage are in the `.rff` and are not read.** Two auxiliary
  16-bit words per second, at 0x6E8D–0x6F67 and 0x7EDC–0x7EE4 on the corpus file. mDACS displays a
  temperature and a voltage that track them, but neither is a linear function of them (the voltage
  moves in steps of 0.019448 V while the word moves by 1, and the temperature deltas and the word
  deltas do not share a sign consistently), so the calibration is not in this file. The text export
  carries both, which is the workaround.
- **`lib/fileAccept.test.ts` cannot see a parser that detects on CONTENT.** Its sweep greps parser
  sources for `endsWith('.ext')` so that adding a name-anchored parser fails the test until the
  picker offers that extension. Both new binary parsers detect on the file's bytes instead, so
  `.eeprom` and `.rff` had to be added to `FLIGHT_FILE_EXTENSIONS` by hand and nothing would have
  caught it if they had not been. The guard needs a second half — something that knows a parser
  exists for a shape the picker does not name.
- **The default vitest reporter's test count drifts by one or two between identical runs** (835, 836
  and 837 observed on the same tree, every file passing, `Test Files 62 passed` every time; the JSON
  reporter is stable at 826). Some suites build their cases from the corpus at run time. Harmless
  today, but it means a headline test count is not evidence of anything — quote the file count and
  the exit codes. Worth finding which suite varies and pinning it, so the number becomes a signal.
- **Debrief numbers the flights in a download by position; the flyer's altimeter numbers them
  its own way, and the two need not agree.** Benchmarked against how the vendor apps do this
  same job: AltosUI, the Featherweight Interface Program and the Eggtimer Quantum all present
  the flight list *on the device before the download*, so their numbering is the device's own
  and is authoritative — it knows where the flights are because it recorded them. Debrief's list
  is inferred from the trace after the fact, and calls the first flight in the file "flight 1"
  whatever the device called it. A flyer holding an AltosUI window that says "flight 7" and a
  Debrief strip that says "flight 1" has no way to tell whether they are looking at the same
  thing. Two things would close it, both cheap and neither done: where a file's header or a
  column carries the device's own flight number, use it and say so; and where it does not, say
  "the first flight in this file" rather than a bare number that reads like a device's.

- **The vendor apps can do something Debrief structurally cannot: pull ONE flight off the
  device.** That is the whole reason a multi-flight file is unusual for them and ordinary here —
  their users never handle one. Worth stating on the methods page as what Debrief is for, rather
  than leaving the flight list reading as a poor imitation of a device browser.

- **A comparison built from logbook ids re-reads every flight whole**, so a flight a flyer cropped
  joins a comparison uncropped and the comparison's figures disagree with the report's for the same
  flight. `lib/compareFromLogbook.ts` re-analyses from the stored text and never asks for
  `RecentFlight.read`. Threading it is small; deciding what a cropped flight IS on that surface is
  not, and it belongs with D3's "one flight can carry several recordings" rather than in front of
  it. **D3's starting point, with the logbook row below.**

- **DONE — a stretch the flyer chose does not survive a reload.** Kept with the flight as
  `RecentFlight.read`, in seconds on the file's own clock, resolved back to samples against the
  parse this build makes. Forgotten when the flyer reads the whole file again. Original entry: The crop lives in the report's state
  only: `RecentFlight` (`lib/recents.ts:26`) stores the file's text, the hand-made column mapping
  and the caption, and nothing about which stretch of it was read — so a reload, a reopen from the
  logbook, and a comparison built by id all come back to Debrief's own segmentation. "Controls
  that forget" is on the standing tell list, and this is the largest one the crop leaves. It wants
  seconds on the file's own clock rather than sample indices (a re-parse can change the count, and
  a stored index would then point at a different sample), resolved back to indices on reopen —
  `indexAtOrAfter` in `components/CropControl.tsx` is already that search.

- **The logbook row still holds the whole file's apogee after a flight is opened out of it.**
  `saveRecent` writes `apogeeM` from the first analysis, and reading another flight in the same
  file does not revisit it — so a launch day that lists as one row shows flight 1's apogee whatever
  is on screen. Correct as far as it goes (the row is the FILE), but it will read as a
  disagreement once the crop persists, and the two want deciding together.

- **Two flights to the same height in one file are called "the same flight written twice", and there
  is no evidence in the trace that separates them.** `recordedTwice` (`lib/analyze/index.ts`) compares
  the two segments' peaks on one datum and calls agreement within 1% a doubled recording. A launch day
  of five flights no longer trips it — a doubled recording holds exactly two segments — but a day of
  exactly TWO flights to within 1% of each other still does: measured, `[80, 80]` comes back as
  "the same flight written twice … There is no second flight to read." No number is wrong (the first
  flight is read correctly either way) but the sentence is, and it tells the flyer not to look for
  the second flight. What would settle it is outside the altitude column: a wall-clock gap between the
  segments (`flownAt`, or a time channel that jumps), a device summary naming two flights, or the
  flyer's own say-so — which is D1's manual crop. **File it against that milestone rather than
  patching the peak comparison**, which has no more information to give.

- **A download whose FIRST flight is under the segmentation floor is read as one flight, silently.**
  The floor is 100 m, coming down to a quarter of the record's own best and never below 30 m
  (`lib/analyze/index.ts`), so `[30, 95]` and `[60, 90]` now split — but `[20, 3000]` does not, and
  what a flyer then sees is the second flight's apogee against the first flight's liftoff with no
  caveat anywhere in the analysis. The methods page states the limit; the report does not. This is
  the "a record the tool cannot segment confidently says so" half of D1's *done when*, and it wants a
  positive signal — the record ends far from where the analysed flight landed, or the trace holds a
  climb the walk refused — rather than another threshold.

*The six below came out of a four-lens sweep late in the run, each one adversarially verified by a
second agent told to refute it. Two more from the same sweep were fixed on the spot (the comparison
exporting in load order; the Label/Notes panel claiming the caption is lost on reload) and one was
refuted. They are written down rather than fixed because each needs its own gate.*

- **DONE — the privacy page listed 2 of 19 stored keys and said Clear removed all of it.**
  `lib/deviceData.ts` is the single registry now, the page renders itself from it, a test greps
  the source and fails in both directions, and `ForgetDeviceData` is the control that makes the
  promise true. Original entry:
  `app/privacy/page.tsx:55` names local storage once — "Your theme and units" — and `:106` adds
  "No cookies beyond the local theme/units preference described above." The app writes **19**
  `debrief.*` keys: the flyer's typed comparison caption (`compare.captions`), a fingerprint of
  their own file's column headers (`mappings.v1`), and their rocket's parameters (`mass.kg`,
  `dragmass.kg`, `diameter.m`, `chute.m`, `drogue.m`, `rail`, `maindeploy.m`, `delay.s`), plus
  `plotView`, `plotPresets`, `compareChannel`, `hiddenEvents`, `report.hidden`,
  `report.hiddenFigures`, `report.order`, `theme`, `units`. Line 65-66 then says clearing browser
  data "or using the 'clear' control on the recents list" removes all of it — but
  `components/useLogbook.ts:62` clears IndexedDB and `compare.captions` only, so **17 keys
  survive**. A flyer lending a laptop presses Clear and the device still holds their rocket's
  descending mass, body and canopy diameters, rail length, main-deploy altitude and motor delay.
  PRIVACY IS SACRED is the invariant this sits under, and the page is the artifact that states it.

- **DONE — "How this file was read" was on screen and in none of the five exports.** All four
  documents carry it now, under the heading the screen uses, and the JSON under its own key; the
  analysis caveats are headed "Worth knowing" like the screen rather than the ambiguous "Notes".
  Original entry: Every writer in
  `lib/report.ts` renders `analysis.warnings` as the document's Notes section (`:391`, `:463`,
  `:582`, and `analysisJson`'s `warnings` key) and none of them reads `flight.notes` — the parser
  provenance the report shows under that heading (`components/FlightReport.tsx:920`). Measured over
  the corpus: **29 of the flights that analyse end to end carry at least one parser note, and zero
  of those notes reach ANY export.** On the iREC TeleMega file the screen says "Dropped 1135
  row(s) with duplicate timestamps" — 7% of 15,938 rows — and the cert package a flyer hands in
  never mentions it, nor that the altitude is the logger's own AGL channel rather than Debrief's
  reduction. The flyer's TYPED notes ride into every format; the tool's own do not.

- **Files past the comparison cap vanish on `/compare` — never read, never in the logbook, never
  named.** `lib/ingest.ts:131` breaks at the cap, so files after the 6th are never opened and
  appear in no field of `IngestOutcome`. `components/CompareSurface.tsx:165` derives its overflow
  count from what ingest RETURNED rather than from what was dropped, so they are never mentioned.
  Drop 8 logs onto an empty `/compare`: overflow computes to 0, `setNote(null)` runs, and two
  flights are gone from the view AND absent from the logbook — under drop-box copy promising "they
  go into the logbook below on the way through". With 4 already on screen and 10 dropped it is
  worse: the note says "the last 4 stayed in your logbook", and those four were never opened. The
  analyze page reports this correctly ("Showing 6 of 8 files"); the compare surface has no
  equivalent, which is the cross-surface disagreement `lib/ingest.ts` exists to prevent.

- **Methods promises a 2D-fix position is kept; the Featherweight GPS parsers drop it with the
  altitude.** `lib/parsers/featherweightGps.ts:77`. Wants its own gate and a corpus run, because it
  is a parser change on a recovery figure.

- **A batch where nothing parses throws away every per-file reason and gives advice that cannot
  work.** `components/Analyzer.tsx:364`.

- **The "one choice" hide-readings control silently fails across the two surfaces: the same reading
  is keyed on two different labels.** `lib/report.ts:743`. So "what I care about", answered once on
  the flight report, is not what the comparison hides.

- **Max Q is computed from an altitude the analysis refuses to print, and it is the structural
  load case.** `lib/analyze/index.ts:820` builds `airDensity` (and the speed-of-sound profile at
  `:819`) from `altClean`, the raw barometric trace — the very trace `altAt` (`:1031`) exists to
  distrust. Through the transonic push the shock over the static port drives the sensed pressure
  away from the true value, and the trace dives BELOW THE PAD. Measured, at the sample max-Q is
  taken from:

  | file | reported max Q | ρ taken at | altitude the analysis states |
  |---|---|---|---|
  | `irec_2023_easymega` | 212.5 kPa | −293.5 m (ρ 1.2599) | **withheld** |
  | `irec_2023_telemega` | 205.1 kPa | −296.7 m (ρ 1.1548) | **withheld** |
  | `blueraven jan10 LR` | 254.3 kPa | −93.5 m (ρ 1.2021) | 482.5 m |
  | `blueraven jan18 LR` | 83.8 kPa | 774.8 m (ρ 1.1672) | 171.9 m |

  4 of the 46 flights the corpus analyses. The two Blue Ravens are the plainest statement of it:
  for the SAME sample the tile prints an altitude recovered from the logger's inertial channel
  while the density behind the number comes from a different height entirely. On the two IREC
  flights the altitude is withheld as unreadable and the number computed from it is kept — the
  metric grid prints "Max Q 30.8 psi" with no altitude line at all.

  **A fix was written, measured and REVERTED, and the measurement is why.** Rebuilding the
  atmosphere on the altitude `altAt` will state (splitting it into a pure decision + the
  flag-recording wrapper, then mapping it over the series) moved 4 of 46 flights and left 42
  untouched, and it fixes jan18 exactly as predicted — 83.8 → 89.0 kPa. But on jan10 it moves the
  max-Q sample to **t=3.14 s, v=646.5 m/s, at a stated altitude of 11.4 m**: a rocket doing Mach
  1.9 is not 37 ft off the pad, and the tile would print that pairing confidently. And on the two
  IREC flights the reported altitude goes from honestly withheld (`null`) to a stated **−29 m**.
  Both are wrong differently, and more confidently, than what they replace.

  The reason is that `altAt`'s contradiction test only catches a sample that fights the record —
  below the pad, or under a height already reached. A trace that under-reads SMOOTHLY through the
  transonic stretch contradicts nothing and is accepted, so the density follows it down. Closing
  this properly needs an altitude the analysis can defend across that stretch — integrating the
  device velocity from liftoff puts the easymega's max-Q instant at ~1,837 m, where the
  analyzer's own model gives ρ = 1.0231 → 172.6 kPa, i.e. the shipped figure is **+23.1% high**
  (TeleMega +21.6%) — but that is a new method and it needs validating against ground truth
  before a load case is published from it, not bolting on mid-run.

  Two things to carry into that pass: `lib/parsers/corpus.test.ts:1353` pins jan18 at 83.8 kPa,
  the defective value, and will need re-cutting to ~89.0; and the atmosphere is built ~200 lines
  before `altAt` exists (which depends on apogee, liftoff and the velocity), so the fix is a
  reordering rather than a substitution.

- **NOT A DEFECT — the velocity figure is still drawn and exported for a flight whose speed the
  analysis calls physically impossible, and that is deliberate.** Filed by an audit lens as a rank-1
  honesty failure: a figure peaking at 391,797 ft/s riding into the .html report beside a Max
  velocity row reading "—". Checked, and refused on two counts. The trace is kept on purpose —
  `lib/report.ts:628` states it: "the velocity column itself stays, exactly as its trace stays on
  screen, so a mis-scaled column can still be seen and diagnosed" — while the DERIVED figures (Mach,
  dynamic pressure) are withheld everywhere, which is where a believable wrong number would do the
  damage. And the saved report does not print a bare "—": `lib/report.ts:175` emits
  "withheld — the speed this trace gives is not physically possible", the same sentence the grid
  tile carries. A finding is a claim until you have seen it yourself; this one did not survive.

- **`landedInRecord` answers two different questions with one flag, and `descentSource:
  'second-copy'` is where they come apart.** The predicate is `descentSource != null`, and a
  second-copy splice sets that while supplying only `descentTime` and `flightTime`
  (`lib/analyze/index.ts:486`) — the descent RATES still come from the first copy, which by
  construction stopped before the ground (`descentFromSecondCopy` is consulted only where
  `descentIsInTheRecord` already refused to read a landing). So on a doubled file whose first copy
  caught a real descent but ended ≥5 m up, `landedInRecord` is true, no "stops before the ground"
  caveat fires on any surface, and `landingRate` hands that truncated leg to the landing-energy
  card as a touchdown speed. Two questions, one flag: *did the flight reach the ground in this
  record* (true — the second copy shows it, and the CLOCK is honest) versus *was the rate measured
  to the ground* (false). **Latent, not reachable on today's corpus** — the one `second-copy`
  fixture, `blueraven…jan10`, carries no descent rates — which is why it was not fixed blind: a
  safety number should not change on a path no real file exercises. Wants a synthetic or a new
  fixture first, then split the predicate.

- **DONE — Logbook Import silently returned less than Export wrote.** `normalizeFlight`
  (`lib/recents.ts:322`) rebuilds each record field by field and never copies `caption` or
  `summaryText`, both of which `exportLogbook` does write. So a restore drops the report label and
  notes the flyer TYPED and the paired device-summary text — the second half of every cross-check
  panel — and then reports "Restored N flights." Export/Import is the app's own documented way to
  move a logbook between machines and the only insurance against Clear, so a restore that says it
  succeeded and quietly returns less is worse than one that fails. Verified in the code; not yet
  driven in the app.


- **DONE — a main descent rate measured off a record that never reached the ground was published
  bare.** Resolving a main deploy is not landing: the file can stop while the rocket is still under
  canopy, and the leg is then averaged from the deploy to the last sample. **3 of the 37** corpus
  flights analysed end to end are in that state, reading 15.2, 13.1 and 9.4 m/s — the first of them
  50 ft/s, the top of the 20–50 ft/s band the genuinely-landed mains fall in, handed over as a
  touchdown speed. (The 121 km TeleMega reads 43.7 m/s the same way but is a `knownIssue` fixture
  the runner reaches only as parse-only, so it is outside the asserted set.) The neighbouring
  whole-descent tile had carried the caveat since the landing-energy card was written and
  `landingRate` already withheld the touchdown speed, so no landing energy or parachute Cd was ever
  computed from these — the grid and the saved report printed the number anyway. Caveated on both,
  plus the comparison table cell and the cross-check panel; `descentStoppedAloft` now makes the call
  once. The landing-energy card was also explaining the withheld figure WRONGLY on these flights
  ("no landing descent rate was read from this log — it may end at or before apogee", over a log
  with a main leg in it that flew well past apogee).

- **DONE — the comparison cross-checked a main leg that landed against one that stopped in the
  air, and called it corroboration.** **Both** corpus groups whose recordings cross-check a main leg
  are in this state: `iss-endurance-20211030` pairs a StratoLogger that landed (13.4 m/s) with a
  TeleMetrum that stops aloft (15.2), and `trf-lemiv-l3-20250412` pairs a Blue Raven and a
  Featherweight GPS that landed (8.1, 7.5) with a Quantum-FW that stops (9.4). Two different spans of
  the descent, reported as two instruments agreeing — the same mistake the module already documents
  for main-vs-whole (a 121.6% false disagreement), in the half a shared key could still get wrong.
  A `partialLeg` flag now marks it, with its own ‡ footnote on the panel, in the Markdown and HTML
  reports and in the comparison JSON.

- **NOT A DEFECT — the drogue descent rate is published bare on every surface, and that is
  correct.** Filed by an audit lens as the last uncaveated descent reading. It isn't one:
  `drogueDescentRate = legRate(apogeeIdx, mainIdx)` (`lib/analyze/index.ts:1578`) runs between two
  events that are both IN the record wherever the rate exists at all, so the span is the same
  whether or not the file goes on to reach the ground. Checked in both directions before ruling —
  a bare reading is not automatically a missing caveat. Held by a test now, so a later pass does not
  re-file it.

- **The per-fixture corpus `it()` is the one test in the suite with no timeout allowance.** The
  whole-corpus invariants carry explicit 60 s/120 s timeouts; the per-fixture loop
  (`lib/parsers/corpus.test.ts:350`) inherits vitest's 5 s default, and the largest Blue Raven HR
  fixture takes **783 ms alone** — comfortable, until the box is loaded. It blew this run's baseline
  (`Test timed out in 5000ms`) with npm install, a Playwright install and eight agents running, and
  passed in 783 ms on a quiet box immediately after. A load-induced flake that reads exactly like a
  parser regression. Give the loop an explicit allowance.

- **DONE — the coast-efficiency sub-line printed a "drag cost" bigger than the flight.** The figure is
  the vacuum coast the burnout speed would have bought minus what the rocket actually gained, so on a
  fast, draggy flight it legitimately exceeds the whole flight: **20 of the 31** corpus flights that
  show it are over their own apogee, up to **6.6x** — 107,217 ft of "drag cost" beside a 16,206 ft
  apogee, and 18,282 ft beside 6,292 ft. Correct arithmetic that reads as a broken tool. Named against
  what it is short OF now — "18,282 ft short of a drag-free coast" — on the grid and in the saved
  report, with no change to the number.

- **DONE — the events list and the readings printed one instant as two numbers, with neither clock
  named.** Events are on the log's own time base (what the charts are drawn against); readings are
  seconds since liftoff. **27 of the 45** corpus flights that carry both disagree by ≥0.5 s — the
  ground-station GPS log by **960 s** (apogee at 973.0 s in Events, 13.0 s in the grid), the Kairos
  sustainer 335.3 against 27.6, four AltimeterCloud files 13–22 s apart. Neither clock is wrong and
  neither moved: the heading now says which one it is and where liftoff falls on it, shown only where
  the file's clock doesn't already start at liftoff.

- **DONE — a file boundary was read as a touchdown.** `blueraven jan18 LR` published a 122.90 s flight
  time and a **54.8 ft/s** descent rate off a −3.4 ft sample **0.020 s** after its trace was still at
  823.2 ft — the next copy's pad, reached at 41,330 ft/s — against the device's own stated **29.0 ft/s**
  main, a **3.6× landing-energy error**. The defect was in the file-splitting cut, not the landing
  block: the boundary sat at the low point of the trough after the join, handing the first copy the next
  copy's opening pad samples. Both copies of that flight stop 250 m up, so it now withholds the landing,
  the clock and the energy and says why. Census assert 6 → 7.

- **DONE — the section strip scrolls away with the page, and then didn't say where you were.** It now
  pins (`sticky top-0`), which costs nothing until you have scrolled past where it already sat, with a
  4.5rem scroll-margin on the targets sized to the tallest the strip gets (62 px at 390 px, not the
  42 px desktop average). And it marks the section you are standing in with `aria-current="location"`,
  measured against each target's OWN scroll-margin — measuring against the pinned strip's bottom edge
  was off by one section on every jump, because that margin deliberately parks a jumped-to heading
  below the strip. Nothing is current above the first heading. Original entry: measured **5,472 px** at
  1440 px and **7,710 px** at 390 px, with **zero** `a[href^="#"]` anywhere in it. A flyer comes back
  to a saved report to check one number and has to scroll past everything to reach Events, Recovery or
  Explore the data, and cannot link a clubmate to a section. The blocking half is now done — every
  major block has a stable id and a heading, including the metric grid and "Worth knowing", which had
  neither — so what remains is the strip itself: which sections to list (they vary per flight; no
  Recovery without GPS, no Landing energy without a descent rate), and making it work one-handed at
  390 px without eating a screen of its own.

- **DONE — the channel explorer removed channels from its own menu instead of saying why.** On the
  Blue Raven low-rate file, plotting a velocity beside the altitude dropped the Add-channel menu from
  **eleven entries to five** — `Mach`, `Dynamic pressure`, `Batt_Volts`, `Temperature_(F)` and
  `Tilt_Angle_(deg)` gone — under a panel whose own line is "Plot any channel your logger recorded".
  The two-axis limit is real; filtering the menu by it silently was the defect. They stay listed and
  disabled now, each naming what is in the way. The **third axis itself** is still a genuine gap
  against FIP and OpenRocket — see the benchmark entry above.

- **BENCHMARK against the vendor tools, run this session against the live surfaces and their manuals.**
  What theirs has that ours doesn't, on reading ONE flight, worst first. Nothing here asks Debrief to
  simulate, predict or upload; the PerfectFlite DataCap comparison found nothing Debrief lacks.
  - **[L] The Blue Raven's high-rate file is refused, so four of our own headline readings are
    permanently blank on the most widely flown modern HPR altimeter.** Featherweight's own UI treats a
    flight as its three files together (summary + 50 Hz LR + 500 Hz HR). Debrief rejects the HR file
    with guidance, and LR+HR dropped together gives "Only one of those 2 files could be read as a
    flight"; LR alone then says "no accelerometer channel was recorded" and the cross-check prints
    `Max acceleration · 72.9 g · — · not computed`. So max acceleration, thrust-to-weight, deployment
    shock and roll rate are blank while the numbers sit in a sibling file the flyer already has.
    **The multi-file plumbing already exists** — LR + the device summary pairs correctly today and
    produces the cross-check panel — so this extends a mechanism rather than inventing one. Highest
    leverage of anything in this list.

    **Surveyed in full, with measurements, so the next pass starts from facts rather than a plan.**
    Everything below was measured on the real jan18 pair unless marked otherwise; jan10 matches.

    - **The HR file is 18 columns, 93,164 rows, exactly 500.0000 Hz** (dt histogram is single-valued:
      0.002 s × 93,163). The LR file is exactly 50.0000 Hz. Columns: `Year, Month, Day, Time,
      Flight_Time_(s), Sync, Gyro_X/Y/Z, Accel_X/Y/Z, Quat_1..4, Aux_Volts, Current`. Only
      `Flight_Time_(s)` states a unit; every sensor column is unit-less.
    - **Units recovered by measurement and confirmed against the device's own summary.** `Gyro_*` are
      deg/s — `|Gyro_Z|` rails at **2293.5** against the summary's stated `Roll rate at burnout, 2299.0
      deg/sec`, first rail at t=0.304 s against its `Time to gyro overload, 0.4 sec`. `Accel_*` are g —
      max over the burn is **72.98** against `Max motor burn acceleration, 72.9 Gs`, whole-file max
      **279.98** against `Max landing accel, 280.0 Gs`, pad rest 1.000 ± 0.020 g. `Quat_1..4` is a unit
      quaternion (norm 0.99998). `Current` is nonzero on **1 of 93,164 rows**.
    - **The HR file carries NO altitude, NO velocity and NO pressure** — zero of its 18 headers contain
      `alt`, `vel`, `baro` or `press`. That absence is exactly what trips the rejection at
      `lib/parsers/blueraven.ts:122`. A merged flight must take altitude from LR's
      `Baro_Altitude_AGL_(feet)` and velocity from `Velocity_Up`. **12 columns are HR-only**; 6 are
      shared; the other 95 of the LR's 101 are LR-only.
    - **The two files share a zero EXACTLY: 0.000 s offset on `Flight_Time_(s)`.** Both zero at the
      device's own liftoff declaration; the wall clock at t=0 is 10:48:41.699 in both. Checked
      sample-for-sample at t = −1.96, 0, 1, 10, 30 and 60 s: 0.000 ms every time.
    - **…but `buildFlight` rebases each file to its OWN first sample, and they differ.** HR opens at
      raw t = −2.022, LR at −1.960, so after `lib/flight/build.ts:117` the two are **0.062 s apart —
      31 HR samples**. Align on raw `Flight_Time`, never on built time. Measured directly.
    - **Never align on the LR wall clock.** It has only 4,493 distinct stamps for 12,489 rows and
      jitters ±0.06–0.10 s against its own `Flight_Time`. The HR clock has 93,164 distinct stamps for
      93,164 rows and zero drift.
    - **The LR file's second copy is the real hazard.** Its `Flight_Time` keeps counting monotonically
      across the join (−1.96 → 247.8 s, no backward step) while the wall clock jumps back **124.880 s**
      at row 6244. The device Liftoff flag rises TWICE, at t=0.000 and t=124.880. So past LR t≈122.9 the
      same physical instant is +124.880 s on the LR clock. The HR file has no second copy. Any merge
      must be against the FIRST copy only — which the analyzer already isolates (`nextFlightStart`).
    - **LR and HR agree on liftoff to 66 ms**, and that gap is detector latency, not a timebase
      disagreement: the 500 Hz accelerometer sees ignition immediately (threshold-insensitive — 1.2 g
      through 10 g all give t = −0.068 to −0.064 s) while LR cannot resolve better than its 0.02 s
      interval. 66 ms is 3.3 LR samples.
    - **`ChannelKind` has no slot for gyro or quaternion data.** `rollRate` and `accelAxial`/`accelTotal`
      exist; attitude quaternions do not. And a channel whose `values.length !== flight.time.length` is
      **silently skipped** by the explorer (`lib/explore.ts:171-178`) — a ragged merge would vanish with
      no message rather than fail loudly.
    - **The insertion point is wrong for a time series as things stand.** Analysis runs INSIDE
      `ingestFiles` (`lib/ingest.ts:81`), while the summary merge happens AFTER, in `Analyzer.tsx`, and
      nothing re-runs `analyzeAsync`. Scalar `reported` values get away with that because they are only
      read at render time; **a merged channel would leave `r.analysis` stale.**
    - **Resample machinery already exists** — `readChannel`/`resample`/`densest` in
      `lib/parsers/multiTimebase.ts` — but is imported only by `featherweightFip.ts` and
      `entacoreAim.ts`. Nothing in `ingest.ts` or `Analyzer.tsx` sees it.
    - **The corpus contract pins the rejection.** Five Blue Raven HR fixtures are `kind:'reject'`,
      `rejectMatch:'high-rate'`, asserted at `corpus.test.ts:233-237`. Changing the behaviour changes
      the fixtures repo too.
    - **One judgement call worth recording.** MAINTAINING ranks "a second instrument's recording of the
      same flight" as the strongest ground truth, so consuming a sibling file as an INPUT normally
      spends the reference the corpus validates against. That does not apply here: HR and LR are one
      device's two output files, not two instruments — the same relationship LR and the device summary
      already have. The Featherweight GPS recording of the same flight stays an independent check.
  - **[M] Pyro voltages and firing flags are dropped by every parser.** FIP and AltosUI both plot them
    ("verify exactly what the altimeter was firing, when, and why"; "visual indication if the igniters
    fail before being fired"). Debrief's explorer offers Baro AGL, inertial altitude, Velocity_Up,
    battery, temperature and tilt and nothing else; TeleMega's populated `drogue_voltage`,
    `main_voltage`, `igniter_a–d`, `pyro` and `state_name` are equally absent, and the column mapper
    has no role to map them to. "Did the charge fire, when, and did it have continuity?" is the first
    question after any recovery anomaly. See the "deployment boundaries are parsed and thrown away"
    entry below — same root, and it is the blocker for the drogue/main split too.
  - **[M] The Blue Raven's 3-D solution is mapped only as Velocity_Up and Tilt_Angle.**
    `Velocity_DR/CR`, `Inertial_DR/CR_position`, `Future_Angle` and `Roll_Angle` never reach the
    explorer, so downrange distance and lean direction need GPS that many flights don't carry.
  - **[DONE — D2] AltosUI graphs the raw `.eeprom` directly; Debrief refuses it.** Fixed:
    `lib/parsers/altosEeprom.ts` reads the raw download for three log formats, checked pressure-for-
    pressure against AltosUI's own export of the same bytes. An AltOS flyer no longer has to open
    AltosUI first. (AltosUI itself notes telemetry files "produce poor graphs" next to the eeprom.)
  - **[M] No time cursor linking the charts, the sample table and the ground track.** AltosUI's Replay
    shares flight time between map and graph. Debrief has per-chart hover and a table that follows
    zoom, so you cannot step to one instant and read every channel AND the ground position together.
  - **[M] The ground track has no per-phase colour, no hover readout and no measure tool** (AltosUI's
    Map tab has all three, incl. a distance tool). "Where was it at 40 s, and how far is that from the
    road" needs an export to Google Earth today.
    **DONE except the measure tool.** The map was a `role="img"` canvas with no handler on it at all;
    it now colours each leg with the colour of the event that began it (the same `EVENT_COLOR` token
    the charts mark that event with), draws a dot at each event, and reads a fix under the pointer, a
    tap, or the arrow keys — Home/End for the ends, PageUp/PageDown event to event, Escape to clear.
    The readout states the time (on the log's clock, named the way the Events list names it), the
    distance and bearing from the pad, and the phase.
    **It deliberately states NO altitude, and that took two goes to get right.** The first cut read
    `series.altitude[i]` and published **−694 ft AGL at burnout** on the IREC TeleMega — the exact
    instant the Events list correctly prints "—", because `altAt` (lib/analyze/index.ts) withholds an
    ascent altitude where the barometric trace contradicts the flight's own speed. The second cut
    over-corrected to "no height before apogee", which then said *nothing* at a burnout the Events
    list publishes as **1,600 ft** on `altusmetrum-telemetrum.csv` — the same cross-surface
    disagreement, in the other direction. A map is a plan view and the app already adjudicates
    altitude in three places; a fourth surface reproducing `altAt` by eye is what both cuts were.
    Still missing: a **measure tool** (drag between two points for a distance) — the half of AltosUI's
    Map tab this didn't cover — and a bearing/distance between two picked fixes rather than only from
    the pad.

- **`EVENT_COLOR.drogue` and `EVENT_COLOR.main` are the same value** (`#0ea5e9`, sky-500, in
  `lib/eventStyle.ts`), and `EVENT_COLOR.liftoff` is `#6366f1` — byte-identical to the charts' default
  altitude stroke and to what the recovery map used for its own "you are here" marker until this run
  (now a hollow ring in the page ink, because a filled indigo dot read as one more event marker). So
  on a dual-deploy flight the drogue leg and the main leg of the ground track paint identically, and
  their two key swatches are the same blue against different labels. The charts have always had this
  — a drogue and a main draw the same dashed sky line — so fixing it is a one-token change with a
  blast radius across the report, the comparison overlay and every figure export, not a map-local
  patch. Worth doing deliberately; the labels carry the meaning meanwhile.

- **The GPS channels come from the unsliced flight while the analysis series can be sliced.**
  `FlightReport` passes `lat={gpsLat.values}` off the raw `flight`, while `series.time` comes from
  `analyzeFlight(sliceFlight(flight, 0, secondFlightAt), 1)` (lib/analyze/index.ts:606) on a file that
  holds its flight twice. Structurally the track would then span both copies while the time base
  stopped at the cut. **Measured across the corpus: 10 fixtures carry a latitude channel and 0 of
  them mismatch** — every doubled-recording file is a Blue Raven, which has no GPS. So this is a real
  shape with no real file behind it: worth knowing before adding a GPS-carrying doubled log to the
  corpus, not worth a guard that fires on nothing today.
  - **[M] The smoothing width is fixed and a baro-only log gets no acceleration trace at all.** AltosUI
    exposes a filter width ("a larger value smooths the data more") and computes both speed and
    acceleration from barometric data on accelerometer-less altimeters. A StratoLogger or Eggtimer
    flyer gets no acceleration curve and no noise/detail trade.
  - **[S] The channel explorer caps at two distinct units.** Verified: with one ft and one ft/s channel
    plotted, `Batt_Volts`, `Temperature_(F)`, `Mach` and dynamic pressure vanish from the Add-channel
    list. FIP and OpenRocket both put many series of mixed units on one time axis — which is exactly
    the pyro-voltage-against-altitude diagnostic view.
  - **[S] No numeric axis-range entry and no per-axis Y zoom.** Drag zooms X only, with five presets.
    You cannot set an identical window across two reports, or expand a flat 3.7–3.9 V battery trace
    beside a 6,000 ft altitude.

- **A deploy latch is per-COPY, which the "deployment boundaries are parsed and thrown away" entry
  below needs to account for.** Measured on `blueraven__trf-f1machbuster-jan18` LR: `Apo_fired`,
  `3rd_fired` and `4th_fired` each show **three** transitions (0→1, 1→0, 0→1), not one latch,
  because the file holds the flight twice and the second copy re-arms them; `Main_fired` shows one,
  on the final row. So whoever lifts those columns has to decide which copy a flag belongs to —
  which lands in the same-flight splitter, the region the seam entry below says needs its own pass.
  Sequence it that way round.

- **DONE — a peak speed differentiated across four missing GPS fixes was the reported headline, and
  the published accuracy claim rested on it.** The guard that withholds a derived peak over an ascent
  gap tested the clock only; a ground-station GPS log keeps writing a row every second through a
  dropout, so the clock ran straight through four empty altitude fields at t=962.01–965.01 on
  `fwgps__trf-f1machbuster-jan18__GPS_GS03748`. The smoothed derivative bridged them — **268.0, 497.0,
  496.4, 268.7 m/s** where the climb either side averages **288 m/s** — and **497.0 m/s** became the
  peak, at **Mach 1.46**, against the **378.9 m/s** the Blue Raven measured on the same flight. It was
  also uncaveated: `mach` falls back to the ground speed of sound when the profile at the peak index is
  unreadable while the transonic search requires a finite one, so it reported Mach 1.46 with
  `transonicTime` null — and every supersonic caveat is gated on that. One of 46 was in that state;
  none are now. The rule counts samples, not seconds (≥2 consecutive missing ascent samples spanning
  >1.5 s): this file's clock gap is **4.98 s against a 5·dt bound of 5.0**, missing by 20 ms.
  **The claim moved with it.** "A GPS-derived peak runs high — Mach 1.46 against a measured 1.14,
  +28%" was stated in the transonic warning, on the methods page, on the validation page, in the metric
  grid's amber caveat and in the comparison's mixed-source note. Without the artefact the one GPS
  flight the corpus can still check reads **446.8 vs 427.0 m/s — +5%**, and **+9%** against the
  tracker's own 1,340 ft/s; the two barometric derived speeds on that flight run **+23% and +110%**.
  Direction unchanged everywhere, size corrected on all five surfaces.

- **DONE — a descent that never reached the ground was published as a touchdown speed.** The analyzer
  already marks no landing and withholds flight time and descent time on such a record, and says why —
  but the descent RATE went on being published and every surface read it as a landing: "averaged apogee
  **to landing**" in the grid and the report, "**Touched down at** X" in the recovery card, a landing
  energy squared out of it, and a parachute Cd solved from it as a terminal velocity. **Six of the
  flights the suite analyses end to end**: the Kairos sustainer stops **2,540 m up, 62.8% of its own
  apogee**, and read "touched down at 148.5 ft/s" beside the warning saying it never reaches the
  ground; the Proton file stops 2,113 m up (59.1%) at 71.3 ft/s. The rate is kept and relabelled; the
  touchdown claim, the landing energy in card/report/export, and the Cd are withheld, with the card
  staying on the page to explain. Decided once in `landedInRecord`/`landingRate`.

- **DONE — the JSON logger cross-check divided two speeds by g.** The cross-check renders twice and the
  two copies decided the quantity separately: the formatted one handled all five metrics, the JSON one
  tested apogee and max velocity and let the rest fall through to the acceleration converter. **Three
  corpus files carry a reported speed, all AltimeterCloud, all wrong** — burnout **59.83 m/s exported
  as 6.10** and descent **6.21 as 0.63** (greeneggs3-1888); **152.76 → 15.58**, **5.71 → 0.58**
  (lilnuke4alt-1786); **153.86 → 15.69**, **5.63 → 0.57** (lilnuke4alt-1796). `agreementPct` is computed
  from SI before either conversion, so the row read "agree" while the numbers beside it were 9.8× apart.

- **DONE — the JSON exports declared one acceleration unit and emitted another.** `jsonConv.acc`
  converted to g unconditionally while `jsonUnits` declared the chosen unit: **15.62 emitted where the
  value in the declared m/s² is 153.14**. Invisible to the suite because every JSON assert passed
  `'imperial'` or `'metric'` and both name acceleration in g.

- **A file boundary is read as a touchdown, and fixing it is multi-pass — attempted and reverted this
  run.** On `blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR`, copy 1's trace FREEZES at 823.2 ft
  (a 4-sample ring it holds for ~35 s) and the very next sample, **0.020 s later, is −3.4 ft**: a step
  of **41,330 ft/s** on a flight whose descent ran at 55. That sample is copy 2's pre-launch pad, and
  the landing detector takes it — `landing t=124.88, alt=−3.1 ft`, which is exactly the seam. From it
  come `flightTime` 122.90 s (which "agrees" with the device's stated 123.02 by luck) and a published
  descent rate of 55 ft/s where the device's own summary states a **29.0 ft/s** main descent — a
  **3.6× landing-energy error**. The main deploy is genuinely absent from both copies, so the fault is
  the seam, not the detector missing a deploy.
  **What was tried, and why it was reverted.** Bounding the landing search at the first post-apogee
  step faster than free-fall from the flight's own apogee (√(2gh), the same ceiling the descent rates
  already use) fixes jan18 exactly — no landing, and the correct "never reaches the ground" guard
  fires. But the landing block is four interacting rules — the primary near-pad detector, the
  at-rest tail fallback, `descentIsInTheRecord`, and the `altClean[n−1] < 5` "record ends on the
  ground" clause — and a seam concept touches all of them plus the second-copy splice path. Two
  successive refinements (requiring the seam to be one sample wide, isolated on both sides; then
  clamping the whole block to `recordEnd = recordBreak − 1`) each fixed one case and broke others:
  the jan10 second-copy splice lost `descentSource`, and four flights that correctly say "never
  reaches the ground" started claiming a landing. Reverted with the tree green. **Do this as its own
  pass, with the whole landing block in view rather than one rule at a time**, and re-run the jan10
  splice test and the ends-at-rest set as the first check, not the last.

- **The same-flight splitter cuts at copy 2's LIFTOFF instead of copy 2's START, manufacturing a
  landing.** Verified, not fixed. On `blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR`,
  `nextFlightStart` glues ~2.3 s of copy 2's pre-launch pad onto copy 1, so Debrief's "landing" event
  is a pad reading at file t=122.92, AGL −3.4 ft. Truncate the file at t < 122.9 and the correct guard
  at `lib/analyze/index.ts:1399` fires and withholds everything — the false ground is what defeats it.
  Today the flight reports **55 ft/s** where the device's own summary states a **29.0 ft/s** main
  descent: a **3.6× landing-energy error**. The main deploy is genuinely absent from both copies (both
  freeze on a 4-sample ring spanning the whole main leg, 0 samples between wallclock 10:50:09.700 and
  10:50:44.600), so the fix is the cut, not the detector. Note `wholeDescentRate` is not gated on a
  landing being found even after the correct cut — the counterfactual still returned 51.0 ft/s.

- **DONE — the Recovery card claimed a landing on a log that ends at apogee.**
  `altusmetrum__issuiuc-intrepid2-20220623__telemetrum_data.csv` — 285 samples, 2.84 s, last sample
  **1,081.6 m AGL at 322.1 m/s, still climbing**. `FlightReport.tsx:1073` renders `GroundTrack` on
  `gpsLat && gpsLon` alone and `lib/gps.ts:332` takes the last valid fix as the resting place
  unconditionally: "Landed from pad: 10 ft · Bearing 267° W · Max drift 10 ft", a landing ✕ on the
  track, "Walk from the pad toward W (267°)", and GPX/KML waypoints literally named `Landing`.
  `landedInRecord` is the gate this needs.

- **DONE — apogee was the only primary tile with no provenance sub-label and no truncation flag.**
  Fixed by `apogeeIsFloor` + `apogeeSub`, on the grid and in the saved report; two corpus flights
  (intrepid1, intrepid2) now read "at least this high — the log ends at its own peak". Original
  entry below. On the
  truncated TeleMetrum log it reads "APOGEE 3,548 ft / 2.6 s to apogee" as flat fact while the analyzer
  has already raised "The log appears to end at or before apogee". Neighbouring tiles carry 1–2
  provenance chips; the one number everybody copies out carries none.

- **DONE — the cross-check panel reported agreement over a shorter list than the table shows.**
  `crossCheck()` covered seven readings while the comparison table displayed twelve, so the sentence
  a flyer reads to decide whether to trust a set could say "agree" while an unchecked reading
  disagreed wildly. Measured on the corpus's same-flight groups: **iss-endurance** worst CHECKED
  spread **26.4%** against **max-Q 53%** (58,017 vs 99,672 Pa — the structural load case), **burn
  time 193%** and **burnout altitude 176%**; the **four-altimeter** group read every checked metric
  inside **6.7%** — as tight as the corpus gets — while its **tilt at burnout** ran 4°, 9°, 11°
  (**94%**); **meraki2** put main deployment **221 s apart** (36%). Max-Q, burn time, burnout
  altitude, main deploy time and tilt are now cross-checked, with the measured/derived flag carried
  through on the two that are read at the burnout instant.
  Also fixed the sentence itself: with a 193% spread in the list, "the independent readings agree to
  within … 193% on burn time" is not English. The lede is now chosen by the same threshold that
  colours a row amber, from one shared helper rather than the three copies that render it.

- **DONE — a metric only one recording carried was dropped from the cross-check in silence.**
  Reproduced on `trf-f1-jan18`: the Blue Raven reads **54.8 ft/s** over the whole descent with no
  deployment change in its record, the Featherweight GPS resolved a **drogue at 74.6** and a **main at
  20.5**, so each of the three descent keys has one contributor, all three are skipped, and the panel
  emitted **no descent row** — while cross-checking exactly two readings (apogee, time to apogee) with
  no sign anything was missing. The other two same-flight groups in the corpus both get descent rows,
  so it showed only on the pair worth chasing. Keeping the keys apart is still right; what was missing
  is that a disagreement about WHETHER a deployment happened is not the same absence as too few to
  corroborate. `recoveryDisagreement` now states it, and stays quiet when a descent row is already
  checked or the recordings agree. Original entry: `crossCheck`
  skips a spec with `contrib.length < 2`, which is right for "too few to corroborate" but wrong when
  the recordings *disagree about whether the thing happened*. On `trf-f1-jan18` the Blue Raven
  reports a whole-descent rate and no main while the Featherweight GPS reports a drogue AND a main —
  each of the three descent keys has count 1, so the panel emits **no descent row at all** and reads
  as though recovery simply were not covered. Two instruments disagreeing about whether a main
  deployed is a finding, not an absence. (Unverified by me; filed from the reconciliation sweep.)

- **DONE — the data CSV stated a Mach and a dynamic pressure the rest of the app withholds.**
  `analyzedDataCsv` computed both per sample with no `velocityImplausible` gate, while its two
  siblings (`lib/explore.ts:146`, `lib/compare.ts:147`) and the headline metrics all withhold them on
  a speed judged impossible. Measured: **10 of 46** corpus flights withhold the speed on screen and
  **all ten** exported a Mach — sta-carl2 at **362.4** and **1.79e8 kPa**, seb-earlydeploy 4.1, and
  then the dangerous ones, a perfectly believable **1.7, 1.6 and 1.3**. A wrong number that looks
  right is worse than an absurd one, and the CSV is the artefact a flyer pastes into a spreadsheet or
  a cert document. Both columns are now omitted entirely when the speed is withheld; the velocity
  column stays, exactly as its trace stays on screen, so a mis-scaled column can still be diagnosed.

- **The burnout search bound is fixed but UNGUARDED — the corpus cannot hold it.** The crossing
  search takes its bound from the velocity peak, and a flight whose speed is judged impossible used
  to lose that bound entirely: `maxVelIdx = -1` was read as "no peak" and the search ran the whole
  climb, with the apogee ejection charge inside the window the bound exists to exclude. Fixed by
  keeping the peak's INDEX when only its VALUE is withheld — the judgement is about magnitude, and
  where the trace turned over is a separate fact. Measured over all **14** signed-axial flights
  (overrides merged): **not one reported burnout moves**, while the window on the four affected
  files shrinks from the whole climb (9.2–11.7 s) to under ~2 s.
  **What is missing is a test that can fail.** All four flights in that state read the same burnout
  with the bound present or absent, because their charge happens to read smaller than their motor —
  reverting the fix leaves the suite green, verified. Guarding it needs a fixture whose apogee charge
  outreads its motor AND whose speed is withheld. Two ways to get one: add such a log to
  debrief-fixtures, or build a synthetic — note a synthetic must get past the device-velocity
  gate, which rejected a hand-built `velocity` channel outright (`velocitySource` came back `baro`,
  so an implausible spike never reached `maxVelocity`).

- **The thrust-tail fix moved a SEVENTH flight that its own commit did not measure or name, and
  the corpus is FOURTEEN signed-axial flights, not nine.** Found by a review pass after the merge,
  then reproduced. `altusmetrum__issuiuc-kairos-20240323__Kairos-Sustainer-March-TeleMega-Telemetry.csv`
  crosses zero 0.22 s past its speed peak and moved with the rest: `burnoutSource` derived →
  **measured**, `burnTime` 4.62 → **4.84 s**, `burnoutAltitude` 1007 → **1087 m (+7.9%)**,
  `burnoutVelocity` 366.25 → 363.06, `avgBoostAcceleration` 81.03 → 77.27, `coastTime` 22.99 →
  22.77, `coastEfficiency` 0.4442 → 0.4401, `dragLossAltitude` 3801.19 → 3762.66. The reading is
  sound — the axial trace runs 20.99 → 5.93 → −5.63 across those samples, and +80 m in 0.22 s at
  ~364 m/s is self-consistent — and the design constant is untouched, 0.22 s sitting inside the
  quoted 0.05–0.40 s and its 22.77 s to apogee inside the quoted 8.1–34.5 s. Counts corrected in
  `lib/analyze/index.ts`, `app/methods/page.tsx` and `lib/parsers/corpus.test.ts`.
  **The cause is a sweep bug worth not repeating.** Filtering `expected.json` on
  `expect.kind === 'flight'` **without merging `corpus-overrides.json`** drops exactly five files:
  the Kairos sustainer (the stale `expected.json` still calls it `mapping`; the committed override
  says `flight`) and the four generic-CSV mapper-path flights. 14 − 5 = 9, which is why every sweep
  agreed with itself and all of them were wrong. `corpusReads()` in `corpus.test.ts` merges the
  overrides; any ad-hoc sweep must too.

- **A doubled baro speed reads Mach 2.64 on a flight that went Mach 1.3 — caveated, but the tile
  still shows the number.** `generic-csv/genericcsv__trf-lemiv-l3__Proton-FW_format.csv` reads
  **895.4 m/s, Mach 2.64**. Ground truth is **1470.76 ft/s = 448.3 m/s, Mach 1.3**, agreed by the
  Blue Raven device summary, the post-flight report, an L3 certification PDF, a Featherweight GPS and
  the Eggtimer sensors. The sibling recording of the same flight, `Quantum-FW_format.csv`, reads
  525.5 m/s (Mach 1.55). **Both agree on apogee to the metre (3576 m)**, so the altitude is sound and
  only the speed is not.
  **Already handled, in part — do not re-file this as unflagged.** `lib/analyze/index.ts:1877` warns
  at Mach ≥ 0.9 on a baro speed and *names this very reading* ("Mach 2.64 against a measured 1.22"),
  saying it can neither confirm supersonic nor bound the real speed. So the invariant's "name the
  direction and size" is met. What is still open is whether a caveated **Mach 2.64 tile** is the
  right presentation when a second recording of the same flight is in the logbook saying 1.55 —
  a cross-check Debrief holds and does not use here.
  **Mechanism, measured:** the Proton baro trace stalls and catches up through the Mach-1 crossing —
  raw ft AGL t=1.80:620, 1.85:635, 1.90:655, then **1.95:899 (+244 ft in one 0.05 s sample)**,
  2.00:1100. It holds ~500 ft/s while the sibling already shows 1600–2000 ft/s, then repays the whole
  deficit in two samples. Debrief's smoothing has only ~0.2 s of support and cannot span it. Not a
  time-base fault: 634 rows, dt exactly 0.050 s, zero duplicate or non-monotonic timestamps.
  **Two dead ends, recorded so they are not walked again.** (1) These files are NOT column-mapped —
  `importFlight` returns `kind:'flight'`, `format:'blueraven'`, because the reformatting gave Eggtimer
  data Featherweight column names and `findAppHeader` (`lib/parsers/blueraven.ts:34-50`) needs only
  `flight_time` + one marker, and `velocity_up` is a marker. (2) Mapping the file's `Accel_Z` column
  in `blueraven.ts` to re-arm the `velocityBeyondAccel` guard **is not a safe fix**: the Proton's
  `Accel_Z` rests at **0.0** on the pad (gravity-removed) while a real Blue Raven's axial `Accel_X`
  rests at **−0.99 g** (specific force). One hard-coded convention flag is wrong for one of them, and
  it would encode Eggtimer's convention into the Blue Raven parser for the sake of a single file.
- **NOT A DEFECT, checked and closed — the burnout tile and the altitude chart legitimately
  disagree on two Blue Raven flights.** Measured: jan10 burnout tile 482.5 m against a plotted
  −93.5 m at the same index (opposite signs, 576 m apart); jan18 tile 171.9 m against a plotted
  774.8 m (603 m apart). Both are transonic flights where `altAt()` substitutes the logger's own
  inertial solution because the barometric trace contradicts itself through the shock. The
  substitution is right — a boosting rocket is not 93 m underground — and it is disclosed:
  `lib/analyze/index.ts:1929` warns in as many words that "the altitude chart still shows the
  barometric trace as recorded, and you can plot the inertial one against it in the explorer."
  Only 2 of 46 corpus flights diverge at all. Do not "fix" the chart to match the tile; the baro
  curve is a real recording and plotting a substituted value as though it were measured would be
  the actual defect.
- **Liftoff moved one sample on two flights when the accel channel went onto specific force, and
  `liftoffTWR` moved with it — measured, understood, and the NEW figure is the right one.** Recorded
  so a later pass does not "fix" it back. The gate is `acceleration[i] > 2 * G0`, an absolute test on
  a trace that shifted by +9.807. Pre-shift margin below the gate at the sample before liftoff:
  **stargazer1 0.98 and sg1.1 2.46 m/s²** — the only two flights the shift could cross; the other
  eight flagged sit 16.02–20.11 below and could not. Liftoff moved sg1.1 idx 24→23 (t 0.24→0.23 s)
  and stargazer1 idx 14→13 (0.14→0.13 s), and TWR followed because its window hangs off `liftoffRef`:
  sg1.1 **8.11 → 7.90**, stargazer1 **4.29 → 4.23**. On specific force `> 2 g` means one g of net
  climb, which is what the threshold is meant to say; on the old gravity-removed trace it silently
  meant two. So the later-firing old reading was the wrong one. Note 4.29 appears only in commit
  7b2f446's message and on no shipped page.
- **Two recordings of one flight disagree about whether it went supersonic.** `iss-endurance-20211030`:
  the TeleMetrum reads 315.1 m/s (Mach 0.93), its StratoLogger on the same flight reads 410.8 m/s
  (Mach 1.19) — 23.3% apart, straddling Mach 1. Apogee agrees to 0.5% (2841 vs 2828 m). The corpus
  already has a case for "a speed differentiated out of an altitude reads high"; this is the same
  mechanism landing on the wrong side of a threshold a flyer reads as a yes/no.

- **Deployment shock moved on every AltusMetrum flight and the shipped change did not measure it.**
  Found by a review pass AFTER the merge, then reproduced directly. `peakAccel` is
  `peakAbsInWindow(acceleration, …)` — an ABSOLUTE magnitude — so putting the trace on specific
  force moves it by **±1 g depending on the sign of the window's dominant sample**, not +1 g.
  Measured, before → after: intrepid2 29.44 → 30.44, sg1.1 apogee 24.03 → 25.03 but its main
  27.46 → **26.46**, irec2023 6.60 → 5.60, stargazer1 62.25 → 63.25. Worst case, a *different sample
  is selected entirely*: endurance apogee **1.47 → 0.58 g (−61%)** and its main **0.67 → 1.36 g
  (+103%)**. AltimeterCloud is unchanged on all six, as it should be. The new figures are on the
  right convention — a shock is the force the airframe felt, and near apogee the old trace carried a
  −1 g free-fall baseline that inflated |a| — but this was shipped unmeasured and belongs in the
  validation page with these numbers.
- **DONE — an accelerometer column that was never filled is no longer a measurement.** A dead
  column (every sample exactly zero) was reported as `accelerationSource: 'device'`, and on a
  `gravityRemoved` channel the unconditional `+= G0` turned its zeros into a flat +9.80665. Measured
  before the fix: flagged channel `maxAcceleration` **9.80665 = 1.0000 g**, boost average
  **9.80665**, `liftoffTWR` **1.0000** — all fabricated, all labelled measured; an unflagged one
  reported a *measured* **0 g** peak. Six surfaces branch on `accelerationSource === 'device'` and
  exactly one carried a liveness check, which tested the array AFTER the shift and so was the one
  place it could not work. Now decided at the source (`hasLiveSamples`, `lib/analyze/index.ts`): a
  dead column reads as no accelerometer at all, which every surface already handles, and the three
  defeated duplicate checks in `FlightReport` are gone. Still latent — 0 of 46 corpus fixtures are
  all-zero — so no corpus number moves.

- **Two more absolute tests that the normalisation moved, both latent:** `maxDeceleration` requires
  `signedAccel[maxDecIdx] < 0`, so a flight whose worst reading sits between −1 g and 0 now reports
  no deceleration at all — kairos-sustainer is **1.95 g** from that cliff (−2.95 → −1.95). And the
  clip gate `maxAcceleration > G0` exists to reject a near-zero quiet channel, a premise that is a
  fact about the RAW trace; a flagged channel resting at 0 now peaks above 1 g by construction. The
  saturation test itself is offset-invariant (it compares against the trace's own max), so clipping
  detection is unaffected — verified false→false on all ten.
- **`peakAccel` equals `maxAcceleration` exactly on two flights** (stargazer1 63.25 g, sg1.1
  25.03 g), i.e. the "apogee shock" window is selecting the boost peak rather than a deployment
  transient. Pre-existing, not caused by the convention change (62.25/24.03 before), but a
  deployment shock that equals the whole flight's peak acceleration is not a deployment shock.

- **DONE (differently) — the burnout zero-crossing was unreachable, but the proposed `<= G0` fix was
  wrong and would have regressed the honesty guarantee.** The diagnosis held: the crossing could not
  fire. The prescription did not. On specific force `dv/dt = a − g`, so `a <= G0` **is** the velocity
  peak, identically — adopting it would have relabelled the velocity-peak proxy as
  `burnoutSource: 'measured'`, which is exactly the "one sample, two labels" dishonesty the comment at
  `lib/analyze/index.ts` already fought once. Measured: on the two flights whose trace is cleanest
  (irec2023 easymega/telemega) `<= G0` fires at t=6.03 s, *the velocity-peak sample itself*.
  The real defect was the SEARCH BOUND. Thrust = drag (`a = 0`) necessarily comes *after* the +1 g
  crossing, so ending the search at the peak stopped one instant short of the event. Measured gap
  across the nine signed-axial flights: 0.05–0.40 s (stargazer1 0.05, kairos 0.07, irec2023
  0.08/0.09, sg1.2 0.11, sg1.1 0.40). Fixed by allowing a one-second thrust tail past the peak,
  bounded in time rather than samples. `measured` went 2 → 8 of 9; `burnoutAtVelocityPeak` went true →
  false on all six recovered flights, so `burnoutVelocity` is no longer `maxVelocity` under a second
  label. Corpus `burnTime` re-centred: irec2023 5.80→5.88 (its second logger independently reads 5.88),
  kairos 5.06→5.13, sg1.1 2.69→3.09, stargazer1 3.72→3.78. Tolerances unchanged.

- **The burnout search runs UNBOUNDED on any flight whose speed was withheld as implausible.**
  `lib/analyze/index.ts:1180` sets `maxVelIdx = -1` when `velocityImplausible`, and the bound reads
  that as "no velocity peak" and falls back to `apogeeIdx` — so both the boost-peak search and the
  crossing search span the whole climb, the exact case the bound exists to prevent. Measured over the
  corpus (via the mapper path — a bare `importFlight` sweep silently skips these and reports zero):
  **4 of 14 signed-axial flights**, all generic-CSV — discovery-L1, penguin-L1, swiss-cheese-L1,
  the-gardener-L1. Latent today, not a wrong number: on all four the first crossing after the boost
  peak is the real motor (burnout 0.77–0.92 s against apogees at 9.2–11.7 s). It becomes a wrong
  number the moment such a file carries an ejection charge larger than its motor peak, and the
  `apogeeIdx - burnoutIdx < 2` backstop is two samples — 0.02 s on a 100 Hz logger. Unchanged by the
  thrust-tail fix (when `velPeakEnd == apogeeIdx` the old and new loop ranges are identical).
- **The drag Cd halved on the AltusMetrum family, and that is the correction landing.**
  `lib/drag.ts:108` takes `dragPerMass = -a`, which is drag only when `a` is specific force; on the
  old gravity-removed trace it was `D/m + g`, overstating drag by a full gravity. Measured after
  normalisation: irec2023 easymega **0.63 → 0.35**, sg1.2 **1.80 → 0.97**, kairos sustainer
  **0.92 → 0.44**. **Do NOT add a second `+G0` in drag.ts** — the double-count lived in the channel
  and is now gone. The old figures were the wrong ones.
- **`lib/drag.ts:105,109,113` — the Cd sample filters are absolute** (`v < vFloor`,
  `dragPerMass > 0`, `cd > 3`), so shifting the trace moves which samples qualify, wildly: the
  sample count went **147 → 527** on sg1.1 and **6 → 466** on stargazer1. The reported
  velocity/Mach window for the Cd read changes even where Cd itself barely does. Worth making the
  window explicit rather than a by-product of three thresholds.
- **The accel-ceiling integral is now CORRECT and must be left alone.** `((a0+a1)/2 - G0)*step`
  assumes specific force, which the channel now is; removing that `-G0` "to stop double-counting"
  would re-break every logger that was always on the right convention. The double-count lived in the
  channel. Note **no corpus flight currently reaches this code** (all ten have
  `velocitySource === 'device'`), so it is unguarded by the corpus.

- **The 1 g convention fix landed at the channel; the goldens could not arbitrate it.**
  `maxAccel` asserts sit at 83.6 ±6% (Kairos) and 62.3 ±6% (Stargazer1); the corrected readings are
  84.59 and 63.25, so **both pass either way** — the tolerance is wider than the whole defect. Those
  values were almost certainly copied from the device's own tool, which shows the gravity-removed
  figure, so they encode the OLD convention. Worth regenerating them against the specific-force
  reading and tightening the tolerance, or the net stays blind to a repeat.
- **`burnTime` moved on the AltusMetrum family and nothing independent pins it.** sg1.1 went
  2.60 → **2.69 s** because a gravity-removed trace crosses zero where dv/dt = 0 (the velocity peak)
  while a specific-force one crosses slightly later, at the end of thrust. The corpus regression's
  2.6 was itself produced by the code, not sourced — no motor designation or certified burn time is
  recorded in `manifest.csv` for it. **Ground truth wanted:** the motor's published burn time for
  these flights would settle it and would make a real golden value.
- **Several AltusMetrum flights now fall back to the velocity peak for burnout** (`burnoutAtVelocityPeak`
  flips to true on endurance, sg1.1 and intrepid1). That is not new behaviour, it is the behaviour
  every specific-force logger already had: on a correct trace the axial reading is still positive at
  the velocity peak (it equals g there), so the "falls through zero" search finds nothing inside its
  search bound and the labelled fallback takes over. Worth asking whether the burnout rule should
  search past the velocity peak on a specific-force trace rather than always landing on the fallback.

- **RANK 1 NEXT — the 1 g convention error is FIXED ONLY FOR TWR; four more readings still carry it.**
  This run corrected `liftoffTWR` by differencing against the pad. The root cause is the channel, so
  every other consumer of the same AltusMetrum trace is still a full g low, measured:
  - **`avgBoostAcceleration`** (`lib/analyze/index.ts:~1699`) — Stargazer1 **3.24 g reported vs 4.24
    true (+31%)**, sg1.2 4.54 vs 5.54 (+22%), sg1.1 4.59 vs 5.59. A *larger relative* error than TWR
    on low-thrust flights, and it feeds the report and the JSON export.
  - **`maxAcceleration`** (`~:985`) — Kairos **83.6 vs 84.6**, Endurance 18.8 vs 19.8. Note the
    corpus golden value `maxAccel 83.6 ±6%` was written FROM the buggy reading, and its tolerance is
    wide enough to hide the correction either way — it cannot arbitrate.
  - **The drag Cd** (`lib/drag.ts:108`) — the gravity branch keys off `accelerationSource === 'device'`,
    which records only that a channel existed, not its convention. On an AltusMetrum coast
    `a = −(drag/m + g)`, so `−a` overstates drag by g: Cd **1.799 → 0.968 (×1.86)** on sg1.2,
    **0.637 → 0.369 (×1.73)** on irec telemega. This is the number a flyer takes to a sim.
  - **The accel-ceiling integral** (`~:1074`) subtracts G0 from the same trace, so on AltusMetrum
    gravity comes off **twice**; the ceiling then collapses below the coast floor and `:1087-1092`
    silently discards it — while naming "logged net of gravity" as a possible cause. The pipeline
    already suspects this and says nothing.
  **The proper fix is one change, not four:** normalise the channel to specific force once (a
  parser-set convention flag, or a resting-value normalisation applied to `acceleration`/`signedAccel`
  where a pad stretch exists), after which TWR's local differencing becomes redundant. Deliberately
  not attempted in the same pass as the TWR fix — it moves `maxAcceleration` on nine flights and
  deserves its own corpus diff.
  **Also note the family contradicts itself:** `altusmetrum__reddit-meraki2-121km__Mega38-1_TeleMega.csv`
  falls through to the GENERIC mapper, which picks up `accel_x/y/z` rather than the `acceleration`
  column — so it rests at 1.001 g and is on the *right* convention. One AltusMetrum flight is
  correct and nine are not, purely by which code path claimed the file.
  **And the regression net cannot catch it:** `lib/parsers/corpus.test.ts:83` guards only
  `liftoffTWR >= 1`, which a T/W − 1 reading satisfies for any rocket above 2:1.

- **The liftoff threshold is convention-blind in exactly the way TWR was** (fixed this run for TWR
  only). `lib/analyze/index.ts:~820` detects liftoff as `acceleration[i] > 2 * G0` — an absolute
  threshold on a channel whose zero point differs by a full g between loggers. On a specific-force
  channel that means 2 g of net thrust; on a gravity-removed one it means **3 g**. Demonstrated on
  a synthetic: the same motion under the two conventions detects liftoff at different samples and
  moved the reported TWR by **0.93** before the fix isolated it. Same cure — threshold on the
  reading's rise above its own resting value.
- **Nothing carries an accelerometer's CONVENTION, and that is the architectural hole under the TWR
  bug.** `lib/flight/types.ts:32` — a `Channel` has kind/label/unit/values and no provenance or
  convention flag; `lib/flight/build.ts:129` applies only `u.toCanonical(v)`, a pure linear scale
  (only temperature has an offset). So the analyzer cannot know whether an accel channel is
  specific force or gravity-removed. `lib/flight/reported.ts:117` already models this exact
  distinction as `isGravityConvention` — but for the DEVICE-SUMMARY cross-check, on the wrong side
  of the pipeline. This run sidestepped it by differencing against the flight's own pad, which needs
  no flag; the flag is still the better long-term answer, and would recover the **3 AltusMetrum
  flights now withheld** because their records start too late to contain a resting stretch.
- **AltusMetrum's own specific-force channel is in the file and never mapped.**
  `lib/parsers/altusmetrum.ts:88,153` map only `acceleration` (gravity removed); the same rows carry
  `accel_x` reading 9.78–9.86 m/s² at rest — the real specific force. Mapping the body axes would
  give a true resultant AND fix the withheld flights. Two entry points, same omission.
- **Every deployment boundary in the corpus is parsed and thrown away, so the drogue-leg definition
  cannot currently be fixed.** `lib/flight/types.ts:8` has no deployment/event `ChannelKind` and
  `ROLE_TO_KIND` (`lib/flight/build.ts:118`) is closed, so these are all dropped at parse time:
  Blue Raven `Apo_fired`/`Main_fired`/`Apo_Volts`/`Main_Volts` (`lib/parsers/blueraven.ts:125`);
  AltusMetrum `state_name`, which is *required to detect the format* then never mapped
  (`lib/parsers/altusmetrum.ts:25` vs `:81`) — **9 corpus files carry the drogue/main boundary as
  literal text**; RRC3's `Events` column, used only to filter rows then dropped
  (`lib/parsers/missileworksRrc3.ts:97`); PerfectFlite's `Drogue At:`/`Main At:` preamble lines
  (`lib/parsers/perfectflite.ts:34` matches only `^Apogee:`). This is why the 31% apogee-vs-deploy
  gap is a multi-pass job: a new kind + role + per-parser mappings must land before the analysis can
  move the boundary at all.
- **Prefer the deploy VOLTS edge over the fired latch on Blue Raven.** On
  `blueraven__trf-f1machbuster-jan18` the `Apo_Volts` continuity drop is at **t=27.32 s** while the
  `Apo_fired` latch lags **1.5 s** to 28.82 s — and the device's own summary states "Time to Apo
  channel fire, 27.3 sec", matching the volts. Unverified by me; from a reading pass.
- **`deviceSummary.ts:75` has no key for a stated drogue or main descent rate**, so the corpus's
  only device-stated drogue figure (Blue Raven jan18 summary, lines 29/31: drogue −55.9, main −29.0
  ft/s) is discarded — the exact ground truth the drogue-boundary question needs.

- **RANK 1 NEXT: `liftoffTWR` may be a full 1.0 low on every AltusMetrum flight, against a rule the
  code itself cites.** `lib/analyze/index.ts:1556` computes `liftoffTWR = mean(acceleration)/G0`,
  which is thrust-to-weight only if `acceleration` is *specific force* (a sensor at rest reads
  **+1 g**). **Verified at the file level:** the AltusMetrum `acceleration` column reads **−0.00 on
  the pad** (`SG1.2-Sustainer-November-TeleMega.csv`, first five rows), i.e. it is kinematic —
  gravity already removed — where JollyLogic reads 0.993 g, AltimeterCloud −1000 mG and Blue Raven
  −0.99 g at rest. If that column reaches `liftoffTWR` unnormalised the reading is exactly
  **T/W − 1**. Reported figures against that: Stargazer1 3.26:1 (4.26 true), Kairos 5.29:1 (6.29),
  Endurance 2.43:1 (3.43) — and the code's own comment cites the **5:1 rail-departure rule**, so the
  error is in the direction that makes a safe flight look unsafe. **NOT yet verified through the
  pipeline** — check whether `acceleration` is normalised to specific force between the parser and
  the metric before believing the numbers. This is a pure-corpus sweep (no flyer input), so it is
  checkable today. Same root cause is claimed for the drag Cd (`lib/drag.ts:108`, gravity branch
  keyed off `accelerationSource`, which only records that an accel *channel* existed) with inflation
  factors ×1.47 to ×10.97 across 8 AltusMetrum flights — also unverified through the pipeline.
- **The corpus has a descent ledger nobody has lifted.** `manifest.csv` carries a
  `stated_descent_rates` column populated on **9 of 61** rows (mercury ×6, blueraven jan18,
  fwgps, entacore ×3), and `expected.json` asserts **only** apogee ×17, maxVelocity ×3, maxAccel ×2
  — **no descent contract exists anywhere**. Strongest single item found: the PerfectFlite pair
  `perfectflite__issuiuc-intrepid3tf2-20230305__AL0/AL1` is **two independent StratoLogger SLCFs on
  one flight** whose stated drogue rates are **68.7 vs 68.8 ft/s — 0.15% apart** — with the devices'
  own leg boundaries in the header (Drogue At 26.95 s, Main At 236.30 s) and a stated main of
  19.1 ft/s. That is golden-value quality and it is the ground truth the descent method needs.
  Blue Raven jan18 states drogue −55.9 / main −29.0 ft/s and has a Featherweight GPS recording of
  the same flight — the one fixture with both a device figure and a second instrument on the same
  legs. **Caveat found while reading it:** the drogue channel fires ~12.4 s after apogee, so an
  apogee→main chord (77.6 ft/s) and a deploy→main chord (59.4 ft/s) are different questions, and
  the device's −55.9 matches the latter. Any descent contract has to say which boundary it means.
- **DONE — the saved report substituted the whole-descent average into landing energy without the
  caveat the screen carries.** Both halves are closed: the substitution itself is gated on
  `landingRate`, which is null where the record never reached the ground (so six flights that were
  publishing a touchdown energy now publish none), and where the flight DID land with no deployment
  change resolved, the report row now carries the same basis the card shows. Both surfaces read the
  one `landingRateIsWholeDescent` helper rather than repeating the condition. Original entry:
  `lib/report.ts:77` and `:1103` both did `m.mainDescentRate ?? m.wholeDescentRate`
  for `landingEnergyJoules`, while `components/LandingEnergy.tsx:48-49` set a `wholeDescent` flag and
  said so on screen. Energy goes as v², so where the whole-descent average is well above the main
  rate the exported document overstates the joules by that ratio squared — on the document a cert
  write-up and a club energy limit are read from. Same substitution, caveat on one surface only.
- **CORRECTED — the AltimeterCloud "13.6–16.7% error" is the DEVICE disagreeing with itself, not
  Debrief being wrong.** Recorded earlier this run the wrong way round; this supersedes it. Each
  Mercury file states an apogee, an apogee time, a landing height and a landing time, so its own
  stated `Descent velocity` can be checked against its own header: `1786` chord **6.437** vs stated
  **5.707 (−11.3%)**, `1796` chord **6.446** vs stated **5.625 (−12.7%)**, `1888` chord **5.373** vs
  stated **6.208 (+15.5%)**. Debrief reads **6.49 / 6.49 / 5.17** — i.e. **+0.8% / +0.7% / −3.8%
  against the raw chord**. On the two four-altimeter flights Debrief is accurate to under a percent
  and the device summary is the outlier. **Consequence for the ground-truth hierarchy:** "the
  device's own stated summary figure" is NOT unconditionally stronger than the file's own data for
  a descent rate — on this firmware it is demonstrably worse. Check a stated figure against the
  file's own apogee/landing header before treating it as truth.
- **The highest-confidence descent number in the corpus: four altimeters, one flight.** Group
  `ac-lilnuke-4altimeter` (`1784/1785/1786/1796`) puts apogee at 756.7–756.8 m @11.43–11.49 s and
  landing at 128.6–128.8 s on all four, giving an apogee→landing chord of **6.441–6.449 m/s — a
  0.12% four-way spread**. That is a golden value waiting to be written, and `expected.json`
  currently asserts **no descent rate on any fixture** (only apogee ×17, maxVelocity ×3,
  maxAccel ×2). Pin it.
- **A drogue leg does not start at apogee, and that alone explains a big divergence.** On
  `blueraven__trf-f1machbuster-jan18` the drogue channel (`Apo_fired`) fires **12.4 s after
  apogee**; the rocket free-falls at ~156 ft/s until it does. Measured apogee→main the leg is
  **77.6 ft/s**; measured drogue-deployment→main it is **59.4 ft/s**, against the device's stated
  **−55.9**. So Blue Raven times its drogue leg from DEPLOYMENT and Debrief times it from APOGEE —
  a definitional gap that moves the number by 31% and is nothing to do with smoothing. Several
  loggers write their own deployment events and can be read directly for the boundary: MissileWorks
  RRC3 writes inline `Drogue`/`Main` event rows, PerfectFlite StratoLogger states `Drogue At` /
  `Main At` in its header. **Decide which boundary Debrief means, say so on the methods page, and
  pin it — before touching the smoothing.**
- **Do not trust a device summary that contradicts its own header.** Beyond the Mercury firmware
  split above, `fwgps__trf-lemiv-l3` states "Vertical velocity at landing, −2 ft/sec", which is a
  post-touchdown GPS artefact rather than a main descent rate.
- **The descent-rate/chord divergence: mechanism found, and the window hypothesis is now also
  disproved.** Reproduced the sweep exactly — **9 of 26 corpus legs disagree with their own chord
  slope by >5%** (TeleMetrum drogue +16.4%, SG1.1 main +11.0% / drogue +6.2%, lemiv-l3 main
  +10.8%, fwgps jan10 drogue −21.3%, Kairos whole +5.2%, meraki2 LR drogue −22.7%, eggtimer
  drogue −60.6%, jan18 LR whole −6.6%). **Hypothesis tested and disproved:** `lib/analyze/index.ts:1310`
  sizes the 0.6 s descent smoother with `windowFor(dt, 0.6)` off the GLOBAL median dt while the
  very next lines compute `descentDt` for exactly that reason — and **13 of 35 analysable
  fixtures** carry an inflated window as a result, up to **12x** (7.0 s of real time on
  `fwgps__trf-lemiv-l3`, 6.1 s on two EasyMega files). Sizing it from `descentDt` instead makes the
  divergence **worse — 9 legs become 10** (fwgps drogue −21.3% → −28.9%, and it moves the leg
  boundaries: TeleMetrum drogue 107.0 s → 151.0 s, because `mainIdx` is picked off the same
  smoothed series). Reverted rather than shipped. **The window bug is still real and worth fixing
  on its own terms** — it just is not what causes the chord gap.
  **What the decomposition does point at**, per-leg, comparing chord / sample-mean / time-weighted
  mean of the velocity series: on SG1.1 the sampling is even (max gap 0.10 s, 1–2% of the leg) and
  the sample mean (12.26, 8.48) matches the chord (12.72, 8.52) — yet the *reported* figures are
  13.51 and 9.46, above both. So the gap is not weighting and not gaps: it is that `descent` is a
  **centred** moving average of `baroVel`, so samples within ±half a window of a leg boundary
  already blend the leg either side of it. Both legs are biased toward each other, worst exactly at
  deployment. The lemiv-l3 main leg is **1.7 s against a 0.6 s window** (+10.8%) and SG1.1's main is
  18.2 s (+11.0%) — the two shortest main legs are the two worst main-leg errors. Next pass:
  exclude a half-window at each end of a leg before averaging, or read a leg shorter than ~2x the
  window as its chord slope outright, and judge the result against the three device figures above.
- **`baroVel` is not always barometric, and two things downstream claim it is.**
  `lib/analyze/index.ts:644-647` documents "a barometric vertical velocity, always" but assigns
  `velocity` verbatim when `velocitySource === 'baro'` — which on a baro-only altimeter that ships
  a velocity column is the DEVICE's column, not a derivative of the altitude it is checked against.
  `lib/compare.ts:325-330` then states the cross-check's premise as "altitude-derived on every
  logger (no source mix)", which is false on that path. Unverified against a specific fixture —
  found by reading, not reproduced.
- **`signal.ts:148` — `derivative` writes a literal `0` on a duplicate timestamp**, and `0` is
  finite so `mean` counts it as a real sample, pulling a leg rate toward zero with no warning
  (`medianDt` filters duplicates out, so nothing else notices). Unreproduced on a real fixture.
- **The free-fall ceiling is applied to the main leg using the APOGEE altitude**
  (`lib/analyze/index.ts:1384,1391`), so a main leg on a 3 km flight is capped at ~242 m/s rather
  than the ~60 its own deploy altitude would give — the guard meant to catch derived-signal
  artefacts is several times too loose on the leg most likely to have one.
- **The recompute sweep's remaining wave-2 flags, triaged but not chased.** After the burnout fix,
  the exact-identity checks (`timeToApogee == burnTime + coastTime`, `flightTime == toApogee +
  descentTime`, leg durations vs `descentTime`) come back **clean across 46 fixtures**. Two classes
  of flag remain and were judged not-bugs: (a) **PHYS-DV** — comparing `avgBoostAcceleration ×
  burnTime` against `burnoutVelocity` diverges by up to +85% on the 121 km flight, which is drag and
  gravity loss over a long boost, not an error; the check needs a drag term before it can accuse
  anything. (b) **TWR** — reported thrust-to-weight differs from a naive 20-sample average off the
  pad on 7 flights, but replicating the code's own 0.2 s window reproduces the reported figure
  exactly (endurance TeleMetrum: 2.430 both ways, dt = 0.1 s so the window is *2 samples*). The
  reported number is right; what is worth a look is that a 0.2 s window on a 10 Hz logger averages
  two samples, so TWR there rests on very little and says so nowhere.
- **A reported descent rate can disagree with its own leg's drop-over-duration by −58% to +17%, and
  the cause is NOT sample weighting.** Swept all 46 analysable corpus fixtures, comparing each
  reported leg rate against the chord slope of the leg it names —
  `(alt[from] − alt[to]) / (t[to] − t[from])`, which is what "average descent rate" means and what
  descent rate × descent time has to equal. **10 of 38 legs disagree by more than 5%**, three of
  them on `knownIssue` files. Worst offenders (reported vs chord): TeleMetrum endurance drogue
  **22.51 vs 19.34 m/s (+16.4%)**; SG1.1 TeleMetrum main **9.46 vs 8.52 (+11.0%)** and drogue
  **13.51 vs 12.72 (+6.2%)**; lemiv-l3 Blue Raven main **8.13 vs 7.34 (+10.8%)**; fwgps jan10
  drogue **50.73 vs 64.47 (−21.3%)**; Kairos whole **10.98 vs 10.44 (+5.2%)**.
  `legRate` averages the smoothed `descent` series with a plain **sample-count** `mean`, so the
  obvious hypothesis was uneven sampling (the TeleMetrum leg carries gaps from 0.02 s to 3.98 s, a
  199x spread, and the analysis already warns loggers drop their rate after nose-over).
  **That hypothesis was tested and is wrong** — swapping in a time-weighted trapezoidal mean moved
  the TeleMetrum leg from +16.4% to +17.0% and flipped meraki2's drogue from −26.5% to +11.6%,
  fixing nothing. The change was reverted rather than shipped on a disproved rationale. Remaining
  suspects, in order: `descent` is a 0.6 s moving average of `baroVel` (a smoothed *derivative*),
  which is unreliable across multi-second gaps; and short legs (the lemiv-l3 main is **1.7 s**
  against a 0.6 s window) are dominated by the smoothing. **Nothing pins these numbers** —
  `expected.json` asserts only apogee, maxVelocity and maxAccel, so no golden value guards a
  descent rate at all, which is exactly why this survived. Next pass needs a ground truth to judge
  against (a device's own stated descent rate, or a second recording of the same flight) before
  changing the method; a descent rate is what a flyer sizes a parachute against, so it is the
  rank-1 damage case and must not be changed on a guess.
- **`altClean` vs `altAt` — the distinction that caused the coast-efficiency bug still lives only
  in a comment.** `altAt(i)` is the *corrected* ascent altitude (falls back to the logger's inertial
  solution where the baro trace contradicts itself, NaN where nothing can stand in); `altClean[i]` is
  the raw spike-cleaned sample. Every reported altitude uses `altAt`; coast efficiency used
  `altClean` and disagreed with the burnout altitude printed beside it (fixed, `f48bc17`). Two
  consumers still read `altClean` on purpose — `lib/analyze/index.ts:1082` (`coastGain` → the
  `coastFloor` speed bound) and `:1119` (`climbFromPeak`) — because both are *guards that detect the
  barometer contradicting itself* and would be circular on a repaired trace. That reasoning is
  correct but undocumented outside this line; a future session will re-derive it. Worth either a
  named helper (`rawAltForGuard`) or a comment at each site.
- **The independent-recompute sweep has more metrics to cover.** Recomputing a reported metric from
  `analysis.series` and diffing corpus-wide found max-Q last run and coast efficiency this run.
  Covered so far: apogee, max velocity, Mach, max/min acceleration, coast efficiency, burnout
  velocity, max-Q, transonic crossing, time-to-apogee — 46 fixtures, no remaining unexplained flags.
  **Not yet swept:** rail-exit velocity, landing energy, drag Cd, `peakRollRate`/`rollRevolutions`,
  `liftoffTWR`, `avgBoostAcceleration`, and the drogue/main descent legs.
- **A descent noise spike can exceed the reported apogee on the altitude chart.** On
  `blueraven__trf-lemiv-l3__BlRv_SN1537_LR_…csv` the spike-cleaned series peaks at **3,676.0 m at
  t=30.16 s** — 4 s after apogee, descending at 22 m/s — against a reported apogee of **3,586.1 m**
  (2.4% higher). Apogee detection is right to ignore it; the samples around it scatter ±80 m
  (3,554 → 3,593 → 3,676 → 3,519) and the cleaner leaves them. But the chart shows a peak higher
  than the headline number beside it, which reads as the headline being wrong. Either the cleaner
  should catch a post-apogee excursion this far above the apogee, or the chart should say why.

- **Max-Q was being read off deployment transients, and one flight reported a load case 117x
  the real one.** Found by sanity-checking a new file's numbers against first principles: a
  ground-station GPS log reported 3.0 kPa where the ascent peak was 1.5. The rule was the peak
  of ½ρv² over the *whole record*, and q squares the speed — so a velocity that swings hard
  NEGATIVE counts as airspeed, and the place that happens is the deployment transient. Six of
  the 34 corpus flights that report a max-Q took it from such a sample: 47,321.8 kPa against an
  ascent peak of 404.1 on the 121 km flight (v = −8,970 m/s), then 401.4→60.3, 266.3→83.8,
  230.0→103.4, 218.6→99.7, 3.0→1.5. Max-Q is presented as "the structural load case … a real
  design point", so this was a wrong number where a flyer sizes an airframe. It now reads over
  the same window as the peak speed it comes from — liftoff to apogee, climbing — which is
  where the load case has always lived; 27 of the remaining 33 are unchanged to within 0.1%,
  and a record with no ascent gets no max-Q at all. **Worth noticing about the method:** the
  bug was invisible to every golden-value assert, because no fixture asserted max-Q. What
  caught it was comparing a reported metric against an independent recomputation from the same
  series — a shape worth reusing on the other derived readings.

- **Debrief was confirming supersonic flight off a GPS-derived speed, and the corpus refutes
  the reasoning.** A Mach-1 crossing was flagged unconfirmed only for a *barometric* speed, on
  the argument that nothing distorts a GPS through the transonic region the way a shock over a
  static port distorts a barometer. True, and beside the point: the error in a GPS speed comes
  from differentiating a coarse, lagging altitude. Both corpus GPS flights that a second
  instrument also recorded run HIGH — Mach 1.46 (1,631 ft/s at 0.7 Hz) where a Blue Raven on
  that same flight measured Mach 1.14 (1,243 ft/s at 50 Hz), and 1,466 ft/s at 2.1 Hz where
  the tracker's own summary states 1,340. +28% and +9%. A crossing is now confirmed only by a
  speed the device measured. The caveat also had to change sensor: the old wording explained a
  pressure port and then offered GPS as the thing that would settle it, which told a GPS flyer
  a wrong story ending in a recommendation this refutes. `derivedVelocityFrom` carries which
  altitude a derived speed came from, and the sentence branches on it everywhere it appears.

- **"A derived peak reads softer" — it reads HIGH, on four corpus pairs out of four.** The
  comparison flags a cross-check mixing a measured value with an altitude-derived one, and told
  the flyer to "read that agreement as the looser bound". Derived over measured, same flight:
  1.31 (Blue Raven vs ground-station GPS), 1.05 (Blue Raven vs tracker GPS), 2.10 (vs Proton
  baro), 1.23 (vs Quantum baro). None soft. The word told a flyer to treat an inflated figure
  as a floor, and to read a spread that one side inflates as if it bounded the disagreement
  from below — it does the reverse. Corrected on the comparison screen, in the Markdown, text
  and HTML exports, in both the footnote and the "(baro)" legend, and pinned by a corpus
  regression pair by pair. **Also still true and unchased:** the same "softer" framing survives
  in the *file-level* provenance sentences ("Velocity was derived from altitude, so it is a
  smoothed estimate") — accurate, but it would be stronger for saying which way the peak errs.

- **A real corpus file could not be analysed at all, and the corpus test stepped around it.**
  The Featherweight GPS *ground-station* export states no elapsed time anywhere — its only
  clock is DATE + TIME — so the column mapper had no time base to offer and the Analyze button
  never enabled. The roles it did guess were the wrong end of the radio link: `GS Lat/Lon/Alt`
  come first in the row, so a receiver sitting in the field would have been read as the flight.
  Now a named parser reading the TRACKER columns off a wall-clock time base; apogee 6,264 ft
  against the Blue Raven's stated 6,295.75 on the same flight (0.50%), and 6,286 ft from the
  committed fixture (0.16%). The corpus entry was `kind: mapping` with no asserts and the
  suite's mapping branch skips analysis when there is no `time` role — so it passed, in green,
  having examined nothing. **Worth a sweep:** how many other `kind: mapping` fixtures are being
  skipped that way rather than asserted.

- **Open, and now cheap: let a clock column be the time base in the generic mapper.** The
  ground-station parser has `clockSeconds`/`dayNumber` and the midnight-rollover rule already;
  lifting them into `lib/flight/build` would let ANY file whose only clock is a wall clock
  analyse — a shape common in phone-app exports. Not done in the same pass because no corpus
  file needs it any more (the one that did now has a named parser), and a capability with no
  real file behind it is worth building deliberately rather than as a rider.

- **Noticed while sweeping the GPS files, not chased:** the ground-station export carries
  `HORZV`/`VERTV`, GPS Doppler velocities and a genuine measurement — better data than the
  altitude differentiated. Not read, because the unit is not stated anywhere in the file and
  541 is as plausible in ft/s as in mph for that flight. A documented unit (or a file whose
  numbers settle it) would make it the honest velocity source for these logs, and would fix the
  +31% at its root rather than caveating it.

- **A 5.79% apogee error that the flight's own record can diagnose, and the device's summary
  confirms the size of it to 0.9 m.** Found by sweeping every corpus file that carries a device
  summary against Debrief's independent read. Four metrics, and one outlier: a PerfectFlite
  log reads **4,957.0 m** where the device states **4,685.7 m** — a **271.3 m** gap, where
  every other apogee in that sweep agrees to **0.04%** or better. The diagnosis is in the same
  file: it is one of the logs Debrief already says "doesn't appear to start on the pad", and
  its record comes to rest **270.4 m** above where the record begins. **The 271.3 and the 270.4
  are the same number.** The log started in the air, so every height in it carries that offset;
  subtracting it gives **4,686.6 m**, which is **0.9 m** from the device's own figure.
  **What shipped is the sentence, not the shift.** Debrief names the offset, says a rocket at
  rest is on the ground so that resting height is where the ground actually is, and tells the
  flyer to subtract it. It does not apply it, for two reasons worth keeping: only one corpus
  file carries a summary to check a correction against, and **a reading corrected until it
  matches the cross-check meant to test it is agreement dressed up** — the same principle that
  kept the +1.00 g acceleration convention un-"fixed".
  **The next move, fully measured:** the rule "where the baseline is already doubted AND the
  record comes to rest, take the ground from the resting end rather than the opening samples"
  uses no device number and would move apogee on the corpus files listed by the sweep
  (AL0 −270 m, xprs2015 −307, endurance −94, eggtimer-aris +32, missileworks-stacarl2 +40,
  sg1.1 +3). AL0 is the only one with an external check and it improves 300-fold. Shipping it
  wants a second corroborated file — a GPS altitude on one of the others would do it.

- **Four corpus flights had no flight time and Debrief never said why.** Followed directly
  from the at-rest landing work: those records hold the whole descent — long enough to
  satisfy the vacuum test — and then stop with the rocket still 2.0% to 7.5% of its own apogee
  up, one of them **307 m**. Withholding the landing is right. Saying nothing about it is not:
  the Flight time and Descent time tiles were simply absent, surrounded by warnings about
  ground baselines and sample rates that explain something else entirely, so the flyer's only
  clue was a gap where a number should be. **A withheld number has to say why it is withheld —
  that is the spine, and this was four files failing it.** The note now names the height:
  "the lowest it gets after apogee is 307 m above the pad, 7.5% of this flight's own apogee",
  and says the record does not settle whether that is the log stopping early or the
  barometer's zero drifting over a long descent — because it doesn't. It is suppressed on a
  doubled recording whose second copy supplied the descent, where it would no longer be true.
  Now asserted on all four, and the assert fails on all four with the note removed.

- **Per-recording assembly, within one file — shipped, and a different device checks it.** The
  Blue Raven jan10 file holds one flight twice: the copy that starts on the pad is cut 3.3 s
  after apogee, and the copy that runs to the ground starts in the trough with no pad of its
  own. On the file's shared datum (the previous entry) the second copy peaks at 10,267 ft
  against the first's 10,245, so it is the same flight — and Debrief now reads the descent
  clock from it. **The check is a separate instrument:** a Featherweight GPS recorded the same
  flight and times the descent at **64.40 s** against the spliced **64.76 s** — 0.36 s apart,
  on two devices, one of them assembled from two copies. Flight time is composed rather than
  taken (time-to-apogee from copy 1 plus descent time from copy 2), so it adds up by
  construction. `descentSource` is on the metrics, on the tile, in the saved report and in
  `debrief.flight/1`; the whole corpus sweep moves exactly two rows and no apogee anywhere.
  **The clock comes across; the RATES do not.** A descent time needs two instants both copies
  agree on. A rate needs the deployment structure between them, and the second copy resolves
  no main here — so the whole descent would average into **48.2 m/s** published under the
  label a flyer sizes a parachute against, while the GPS recording of that same flight reads a
  50.7 m/s drogue and a **6.2 m/s** main. Refusing to carry the rate is the whole difference
  between assembling a flight and inventing one.
  **Found on the way, and it was my own bug before it was a feature:** the first cut of the
  "the record ends at rest, so it landed" fallback dropped the near-the-ground requirement
  entirely, and made Debrief report a landing for a record that **stops 307 m in the air**
  (xprs2015). At rest is not enough — a landing is a return to the ground, and the ground is
  where the record started. Four corpus records end at rest between **2.02% and 7.47%** of
  their own apogee above the pad; the two that are read end at **0.23%** and **0.25%**, nearly
  nine times inside the closest refusal. Whether those four are a barometer's zero wandering
  or a log simply stopping is not something the record settles, so the claim isn't made. All
  four are now a corpus test, and it fails on every one of them with the bound removed.
  **Found from this pass and fixed next — see below.**

- **A "main descent rate" was being reported on flights where no main deployment was ever
  detected, and it reached the comparison as a false 121.6% disagreement.** Followed straight
  from the splice above. Where no deployment splits the descent, the whole apogee-to-landing
  average was written into `mainDescentRate` — over the corpus, **18 of 25** descending flights,
  with figures from **17.0 to 148.5 ft/s** against a **20–50 ft/s** band for the seven that
  genuinely resolved a main. *(The on-screen tile already softened the label to "Descent rate"
  when no drogue leg existed, so this was less visible than I first wrote it up; the surfaces
  that carried it unqualified were the comparison table, the cross-check and the JSON.)*
  **The concrete wrong number is on the comparison**, which is where it matters most: the
  trf-lemiv-l3 flight has four recordings, three of which resolve a main and read 24.6, 26.7
  and 30.9 ft/s over the leg after it, while the fourth resolves none and reads 71.3 ft/s over
  the whole descent. In one row that is a **121.6% spread** — the same four files agree on the
  *drogue* to **2.1%**. The panel was accusing four instruments of disagreeing when they had
  measured different things. `wholeDescentRate` is now its own reading, cross-checked only
  against its own kind, with its own row, report line and JSON field, and the landing-energy
  and parachute-Cd cards say when the speed they used is a whole-descent average.
  **The invariant that holds it:** a reported main descent rate must have a detected main
  deployment behind it — 25 corpus fixtures fail that with the old behaviour.

- **Debrief was telling two Blue Raven owners their file held more than one flight, and it
  held one.** Both corpus Blue Ravens are a download written twice, and the note they got —
  "read the others by splitting the file, or export them separately from your altimeter's
  software" — is advice that hands the flyer the same flight again. **The discriminator the
  backlog has been asking for is the apogee, measured against ONE datum**, and the datum is
  what the earlier attempt got wrong: it is one altitude column, so the second copy neither
  needs nor may take a baseline of its own from the trough between the copies. Re-measured
  that way over every multi-segment corpus file:

  | file | segment peaks on the file's datum | apart |
  |---|---|---|
  | Blue Raven jan10 | 10,245 ft → 10,267 ft | **0.21%** |
  | Blue Raven jan18 | 6,296 ft → 6,296 ft | **0.00%** |
  | Eggtimer anomaly | 4,661 ft → 8,969 ft | **92.43%** |

  The bound is 1% — five times the widest genuine agreement, ninety times inside the pair that
  must be refused — and a file with no quiet pad window has no datum to share and is refused
  before the peaks are compared, which disqualifies the Eggtimer twice over. Refusing falls
  back to the older sentence, which is never a wrong number, only a less useful one. Now a
  corpus regression naming all four multi-segment files and what each should say.
  **The number that makes this worth the pass:** on the file's datum, jan10's *second* copy
  peaks at **10,267 ft** against the device's own stated **10,266 ft**. The reverted experiment
  read 10,723 ft from that same segment — the 456 ft was the trough baseline, not the flight.
  **Which unblocks the assembly:** that second copy holds a complete descent (65.3 s of fall
  against a 25.3 s vacuum minimum, down to 20 ft) for a flight whose first copy is cut 3.3 s
  after apogee. Taking the ascent from the copy with the pad and the descent from the copy with
  the ground is now a splice on a shared datum rather than a guess, and it can only fill in
  readings that are withheld today — apogee and the climb come from copy 1 either way.

- **Found by the cold walk: the different-days panel named two dates beside three columns.**
  Comparing a launch day where only some files carry a date, the panel read "The files date
  these on different days — 30 Oct 2021 (…), 11 May 2024 (…)" over a three-flight table, and
  left the reader to wonder what the third one said. It states the count now — "the other file
  states no date, so it is not evidence either way" — on the screen, in the Markdown and in
  the HTML. A file with no date is not evidence in either direction, which is the same honesty
  as the caveat beside it, and it was being left implicit.

- **A peak roll rate of 179.99 deg/s on five real files, and it was the roll ANGLE.** Found
  while checking whether an AltimeterCloud export deserves a named parser: the generic mapper
  reads a column called `roll` as a rate, which is right for a logger that writes one
  roll-rate column and wrong for anything that solves an attitude — there `pitch`, `roll` and
  `yaw` are Euler angles and the rates are in `gyro_x/y/z`. Every AltimeterCloud file in the
  corpus reported 179.99 deg/s, which is the largest value a ±180° angle column can hold and
  a *completely plausible* rocket roll rate. A wrong number that looks right is the worst
  kind. **The discriminator is the siblings, not the name:** pitch and yaw mean nothing as
  rates, so their presence settles what roll is. Those files now report no roll rate at all —
  which axis of a three-axis gyro is the roll axis is logger-specific, and saying nothing is
  the honest answer — while the one genuine corpus roll-rate channel (a TeleMega at
  2,000 deg/s on the 121 km flight) is untouched. **Still open, from the same look:** an
  AltimeterCloud export still goes through the mapper by hand though Debrief reads it well
  (apogee to 0.0% on five files), and its `bmp_temp(x100)` column would read 100× high if it
  were ever populated. A named parser is the fix for both, and the header is distinctive
  enough to detect on.

- **Debrief was reporting Mach 4.08 on a flight that reached 4,661 ft.** Found while measuring
  whether the multi-flight chooser was unblocked (it isn't — see below). The Eggtimer
  early-deploy anomaly read a barometric peak of **4,483 ft/s** over a 4,661 ft apogee, shown
  as a headline with a transonic caveat but shown. Its sister file reading 2,671 ft/s over
  958 ft (the ARIS in-air breakup) did the same. The existing guards missed both: the absolute
  bound ("beyond any rocket") lets Mach 4 through, and the accelerometer bracket needs an
  accelerometer, which neither file has. **The check they fail is against the flight's own
  climb:** from the peak-speed point a drag-free coast gains v²/2g and drag only takes from
  that, so what the flight actually gained as a fraction of that vacuum coast is what drag
  cost. Measured across **33 corpus flights it spans 6.3%–81.7%** — wide and continuous — and
  **those two sit at 0.1%**. The bound is 1%: six times below the lowest genuine reading, ten
  times above the two refused, and stated with that basis rather than as a bare threshold. It
  applies only to a *derived* speed, where velocity and altitude are one channel disagreeing
  with itself; a device speed and the altitude are two instruments and that is a cross-check,
  not a guard. Three files now withhold; no genuine reading moved.
- **The multi-flight chooser is still blocked, and the new guards make that concrete.** The
  backlog's note said what would unblock "read the other flights in this file": a test that
  separates a second flight from a second spike. Ran every segment of every multi-flight
  corpus file through the analysis with the vacuum guards in place, and they point the WRONG
  way. On the Eggtimer anomaly, the **documented baro artefact (segment 1, 8,696 ft) trips
  zero guards** while the real flight (segment 0, 4,661 ft) trips one; on the Blue Raven the
  copy with no pad window trips zero while the correct copy trips two. A chooser built on
  "which segment looks cleanest" would hand the flyer the artefact. Physical coherence is not
  the discriminator — a smooth artefact is smoother than a real flight with a spike in it.

- **"Burnout velocity" and "Max velocity" were the same number under two labels, and nothing
  said so.** Followed from the cross-check sweep: on every AltimeterCloud file Debrief's
  burnout velocity equals its max velocity *exactly* — 62.83/62.83, 156.91/156.91,
  159.42/159.42 — because without a signed axial accelerometer burnout is taken at the
  velocity peak, so the two readings are one instant. The event was already provenance-
  labelled `derived` in the model; the *readings* were not, so a report showed two rows with
  the same figure, which reads as two measurements agreeing. `burnoutSource` is now on the
  metrics, the tile and the report row say "at the velocity peak — the same instant as max
  velocity", and `debrief.flight/1` carries it. The device's own summary puts burnout
  2.7–5.0% below its peak speed on those same files: that gap is two definitions of the
  instant, not two readings of a speed, and it is the reason this was worth naming.

- **Settled the open question about the AltimeterCloud acceleration gap: it is a convention,
  and the cross-check now says so.** The backlog has carried "decide which the cross-check
  should compare and say so" for a while. Measured across every corpus file that carries a
  device summary: Debrief reads 316.76, 314.07 and 314.76 m/s² against the device's 306.95,
  304.26 and 304.96 — **+1.00 g on every one, to two decimals**. An accelerometer at rest
  reads 1 g; Debrief reports that specific force (the g the airframe felt, which is the number
  a structures check wants) and the device reports acceleration net of gravity. **Decided:
  keep Debrief's convention and name the difference — do not adjust either figure into the
  other**, because a cross-check that quietly closes its own gap is agreement dressed up.
  Shown as a bare 3.2%, it teaches a flyer to discount the panel; named, two independent reads
  landing exactly one gravity apart is a corroboration stronger than the percentage. On the
  screen, in the .txt/.md/.html, and as `gravityConvention` in `debrief.flight/1` (additive,
  present-and-false elsewhere so a consumer checks a key it knows). **Noticed while sweeping,
  not chased:** an AltimeterCloud's own `burnoutVelocity` differs from Debrief's by 5.0% on
  one file and 2.7–3.6% on the others while `maxVelocity` agrees to 0.0% on all of them — the
  device and Debrief are picking a different instant for burnout, not reading a different
  speed.

- **An 18.3-second flight time for a 10,245 ft flight, and the fix I nearly shipped for it was
  a regression.** The Blue Raven that holds one flight twice cuts its first copy at apogee, so
  the "landing" the detector finds is the record restarting — 0.08 s after the peak — and
  Debrief reported an 18.3 s flight time, a 0.08 s descent and (before the ceiling above) a
  16,495 ft/s descent rate off it. **The obvious fix — read the copy that runs to the ground —
  was built, measured, and reverted:** it moved the apogee from 10,245 ft to **10,723** against
  the device's own stated **10,266 ft** and the GPS's 10,409, because the second copy begins at
  the trough with no quiet pad window to take a ground baseline from. Trading a right apogee
  for a right descent is not a trade worth making. **What shipped instead** is the vacuum
  argument in time: a body cannot fall from h in less than √(2h/g), so a record ending sooner
  than that after apogee holds the climb and not the fall. No landing is marked, and the
  flight time, descent time and descent rates that hang off it are withheld with a note saying
  how far short the record stops. Swept: three corpus files, and the only real number lost is
  the 18.3 s fabrication (the other two were already null or a 19 ft partial capture). The
  climb is untouched on all of them. **Still open:** the second copy of that Blue Raven file
  holds a genuine descent that nothing reads — the honest end state is probably to take the
  ascent from the copy with the pad and the descent from the copy with the ground, which is
  per-recording assembly within one file and wants its own pass.

- **Debrief was printing a 16,495 ft/s "main descent rate" on a real corpus file, and two
  more besides.** Found by sweeping every corpus flight's descent legs rather than by a
  report: a Blue Raven read **16,495 ft/s**, an Eggtimer **8,303 ft/s** and another
  **749 ft/s** — Mach 15, Mach 7.5 and Mach 0.67, each printed under the label a flyer sizes
  a parachute against. Every one passed the whole suite, because the only bound on a descent
  rate was *relative*: "main is slower than the drogue". All three flights have no drogue leg,
  so there was nothing to be slower than, and no absolute check existed at all. The cause is
  the leg rate being a **mean** of the derived descent speed, which a discontinuity in the
  altitude record destroys (a segment boundary, a pressure glitch, a logger resuming on
  another baseline). **The fix is an exact physical ceiling, not a tolerance:** the rocket is
  at rest at apogee, so nothing after it exceeds √(2·g·h) — the same energy argument the
  coast-efficiency read already uses in the other direction, with no drag model, no mass and
  nothing to tune. Swept: exactly those three legs are withheld (with a note saying why) and
  **no other corpus reading moves at all**; the fastest genuine reading, 148 ft/s, sits
  against a 924 ft/s ceiling. Now a standing corpus invariant, and a unit test that reports
  1,037 m/s without the guard. **Noticed on the way and not chased:** the same Blue Raven file
  also reports an 18.3 s flight time for a 10,245 ft flight, which the same vacuum argument
  refutes (the fall alone is ≥ 25.2 s) — it is the multi-flight segmentation cutting the
  record short, and it deserves its own pass.

- **Per-stage assembly: measured the obvious detector first, and the corpus refutes it.** The
  corpus does hold genuine two-stage pairs — `iss-kairos-20240323` (booster TeleMega +
  sustainer TeleMega telemetry) and `iss-sg1.2-20231118` (booster StratoLogger + sustainer
  TeleMega) — so the North Star's "stitch per-stage logs into one composite" has real files to
  work from. The obvious signature is that two stages of one flight *track each other through
  the boost and then diverge at separation*, where redundant altimeters track all the way and
  different flights never track. Measured on the liftoff-aligned shared grid, with an
  agreement band of 10% of the smaller peak: **staged kairos tracks to 6.1 s, staged sg1.2 to
  1.0 s — but the redundant endurance pair separates at 0.7 s, and two genuinely different
  flights (endurance vs euroc-stacarl2, both ~9,300 ft) track to 56.1 s.** No separation at
  all. The confound is liftoff alignment: two altimeters that detect liftoff half a second
  apart are hundreds of feet apart through a 1,000 ft/s boost, which swamps the signal the
  test is looking for. **What would unblock it:** align on something sharper than each
  device's own liftoff event (the boost's own acceleration onset, or a cross-correlation of
  the two altitude traces) before asking whether they agree; and separation is probably better
  found in the *booster's* record — its own thrust ending while the composite keeps climbing —
  than in a comparison of two. Not built: guessing here would put a wrong "these are two
  stages of one flight" in front of a flyer, which is the same failure as the clock verdict
  above.

- **A golden assert on a mapper fixture looked armed and wasn't — found by deliberately
  writing a wrong one.** Added the corpus's first numeric assert for a generic-mapper file
  and, checking it could fail, set the value to 750 ft against a 666 ft read. The suite
  stayed green: `runFixture`'s mapping branch ran the pipeline, checked the invariants and
  the device's own reported apogee, then `return`ed before the `fx.assert` loop, so every
  `assert` block on a `kind: "mapping"` fixture was silently ignored. The generic mapper is
  half of the "universal" promise and several corpus files go through it, so those flights
  could drift their numbers freely. The assert loop is shared by both paths now, and re-
  running the wrong value fails as it should.
- **Checked Debrief's apogee against every corpus file's own raw maximum, and the answer is
  a validation-page fact rather than a bug.** Across **40 flights**, Debrief lands within 1%
  of the file's biggest altitude sample on **31**, and where it differs it is almost always
  *lower* — by design, because it measures from the pad baseline the log establishes before
  liftoff and rejects single-sample spikes. The worked example is now on the validation page:
  **Jolly Logic's own official sample flight**, the manufacturer's published file, states 681
  ft; Debrief reads 666 ft; and all 15 ft is accounted for — 9 ft of pad baseline (that column
  averages 8.6 ft over its 100 pre-liftoff samples) and ~6 ft of spike (the 681 sample at
  t=12.25 s sits between neighbours of 665 and 670 ft, in a trace scattering ~5 ft). Flight
  time matches the device exactly (48.8 s vs 49 s). The corpus now asserts 666 ft — the read
  the method can defend. **Not chased:** `missileworks-rrc3__xprs2015` reads 1.52% *above* its
  own altitude column, the only meaningfully positive gap, because its altitude comes from
  the pressure column rather than the stated one; worth a look if that parser is touched.

- **Measured whether the readings could tell one flight from two, and they cannot — so the
  planned fix was refuted and the copy was fixed instead.** The open question below was
  whether a wrong device clock could produce a confident, wrong "these are different
  flights", and the proposed shape was to let the measurements answer back: two recordings
  agreeing on apogee, time-to-apogee and speed while their dates sit a decade apart is a
  story about a broken clock. Swept it over the corpus first, and the corpus says no.
  **Every pair of recordings of genuinely different flights, cross-checked: 8 of 154 agree on
  apogee within 8%, the closest to 0.55% — tighter than 6 of the 17 pairs that really are one
  flight, and tighter on time-to-apogee (0.55 s) than 4 of them.** `iss-endurance` against
  `euroc-stacarl2` — different rockets, different continents, years apart — agrees to 0.55% on
  apogee, 0.55 s on the climb and 5.6% on speed. A flight to 3,000 ft looks like another
  flight to 3,000 ft. Building the counter-test would have shipped a confident wrong verdict
  of the opposite kind. **What shipped instead**, on all four comparison surfaces: the panel
  no longer asserts "These are different flights" as a fact — it says the files date them on
  different days, **names which file states which day** (so the odd clock is findable rather
  than merely rumoured), and carries one caveat naming the single thing that would make the
  reading wrong. The validation page records the sweep with its numbers. `debrief.comparison/1`
  gains `statedBy` and `caveat`, additively. **Still open:** nothing checks whether two
  recordings *without* dates could be one flight, and on the evidence above the numbers can't
  be what answers it.

- **Swept the corpus for a "different flights" verdict a wrong device clock could have
  caused, and found none — but only by luck, so here is the evidence.** `differentFlightDays`
  refutes the same-flight hypothesis when two files state launch days more than 36 h apart,
  and one corpus file states a day that is a decade off (`SG1.1-Booster-October-TeleMetrum`
  says 2013-04-27, for a flight ISSUIUC files under 2023-10-01). Ran every stated date in the
  corpus against the redundant-recording groups: **13 of the files state a date**, and no pair
  of recordings of one flight is refuted. Two reasons, and neither is a guard. The
  decade-wrong TeleMetrum's companion recording of that same flight is a PerfectFlite
  StratoLogger, whose export states no date at all — and with fewer than two stated days the
  question stays open by design. The two Featherweight-GPS/Blue-Raven pairs each state the
  same calendar day from different clocks (`2026-01-10T14:55:28` logger vs
  `2026-01-10T22:55:30` UTC — eight hours apart, same day), and where a launch straddles
  midnight between a local clock and UTC the 36-hour slack absorbs it.
  **What this means:** put a second dated recording beside a logger with a dead backup cell
  and Debrief will state, confidently and wrongly, that two recordings of one flight are
  different flights. The clock is refutable evidence like any other, and today nothing
  refutes it: the year range (1990–2100) can't see a clock that is merely ten years out. The
  honest shape is probably to let the *measurements* answer back — two recordings agreeing on
  apogee, time-to-apogee and max speed while their files' dates sit a decade apart is a story
  about one broken clock, and saying so is more useful than either verdict alone. Deliberately
  not built in this pass: it changes what a verdict means, which needs its own increment.
- **A multi-flight file was being cut in the wrong place, and it can hide a third flight
  entirely.** The boundary between two flights in one download was taken at the first sample
  below a "back on the deck" band — but that band is 5% of the *file's own highest* flight,
  so on a lower flight it sits well up the descent. The result: the first segment ended
  before the rocket landed, and the next one started 20 m in the air, taking its pad baseline
  from a rocket still coming down. On a synthetic launch day of 300/500/250 m that 20 m error
  put the third flight's climb below the "really flew" bar and **the third flight vanished**.
  The cut is now the *trough* between the two — the first sample of the low stretch — which
  gives the first flight its touchdown and the next one the quiet window its baseline is
  measured from. No corpus number moves (the two real multi-flight files are one flight
  recorded twice); the synthetic is the evidence, and it is now a test.
- **Prototyped “read the other flights in this file”, measured it, and did not ship it.**
  With the boundary fixed, a splitter that turns a file into the flights it holds is a
  twenty-line function, and the feature is obvious: let the flyer open flight 2 instead of
  being told to split the CSV by hand. Run over the corpus, three files split — and one of
  them shouldn't. The Eggtimer early-deploy anomaly file splits into 4,661 ft (the real
  flight) and **8,696 ft**, and the corpus's own ground truth says what that second one is:
  "apogee (~8974 ft) is an inflated baro spike per the OP", corroborated in-thread against
  external barometer, GPS and IMU graphs. The other two splits are genuine (a Blue Raven that
  recorded one flight twice). Offering a chooser would therefore put a documented artefact in
  front of a flyer *as a flight* one time in three, so the prototype was deleted rather than
  left in the tree uncalled. **What would unblock it:** a test that separates a second flight
  from a second spike — the existing physical guards are the place to look, since that file
  trips them (its in-file velocity spikes to 32,380 ft/s) and the two genuine ones don't.
  Note the detector is unchanged and already finds this boundary; today it makes Debrief read
  the first flight, which on that file is the right answer.
- **The GPS cross-check I had just shipped was itself capable of a wrong number with a green
  badge — found by chasing the disagreement it flagged.** On the sg1.1 booster it read
  “GPS 2,434 ft, barometer 2,502 ft, agree 2.7%” while noting the peaks were 34 s apart.
  Plotting the raw columns showed why: that receiver's altitude solution lags the flight
  completely — it sits at pad level (33 m) through the entire boost and coast while the
  barometer climbs past 2,450 ft, then drifts *up* to 772 m at t=46 s, under drogue, and is
  still reading 361 m with the rocket on the ground. Its peak landing within 3% of the true
  apogee is a coincidence. Two fixes, both from first principles rather than tolerances:
  **(1) a height needs a 3D fix** — four satellites, because the receiver solves x, y, z and
  its own clock bias; three gives a position on an *assumed* altitude, which is not a
  measurement. Costs nothing on the corpus (all four good flights are bit-identical) and does
  not rescue sg1.1 on its own, but it is right. **(2) agreement is judged on *when* as well as
  how high** — apogee is one instant, so recordings that put it further apart than the flight
  allows did not see the same one, and the badge reads “not the same peak” instead of a
  percentage. Corpus invariant asserts the pairing both ways. **Still open:** nothing detects
  a lagging GPS solution *as such* — sg1.1's altitude column is unusable and only the time
  test catches it; a receiver that lagged by less than the tolerance would still read as
  corroboration.
- **Found by using the app cold on a launch day's files: the cross-check was offering a 201%
  “agreement” between flights the files date years apart.** The panel's framing (“if these
  are recordings of the same flight…”) is a conditional, so it was never false — but it burnt
  the most prominent panel on a hypothesis the record itself refutes, and a 201% agreement
  figure is noise dressed as a measurement. Debrief has had the stated launch dates since the
  flownAt work, and now uses them: two or more files dating the flights more than ~36 h apart
  refutes one-flight, and the panel becomes “Flight to flight — these are different flights,
  the files date them 30 Oct 2021, 11 May 2024 — so what follows is how far apart they are.”
  Deliberately generous, because one recording can stamp UTC while another stamps a logger's
  wall clock and an evening launch straddles midnight; with fewer than two stated dates the
  question stays open. The Markdown and HTML exports carry the same framing, asserted.
  **Next:** nothing checks whether two recordings *without* dates could be one flight; the
  same-flight corpus groups are all identified by hand in the fixtures, not by the app.
- **A GPS altitude was in the file all along and Debrief was throwing it away.** AltOS writes
  a second `altitude` column right after the GPS position — the receiver's own — and the parser
  explicitly skipped it as a duplicate. It is now carried as a second altitude recording
  (`altitudeGps`), with the satellite count (`satellites`) beside it, and its apogee is stated
  next to the barometric one as a cross-check. Never merged: the analysis stays on the baro
  channel, which doesn't jump metres between fixes. Two qualification rules, both measured
  rather than tuned: **a fix needs satellites** — with none AltOS repeats its last position, and
  the endurance TeleMetrum holds its pad position and 218 m through the entire boost while the
  barometer climbs past 2,400 m (masking drops 112 of 228 ascent samples on that flight and
  leaves its apogee unchanged) — and **the record must come back down from its peak**, because a
  rocket returns to the ground. Of 7 AltOS corpus flights with GPS, 5 state an apogee (Δ −2.7%,
  −1.7%, −1.5%, +1.5%, +6.5%) and 2 are withheld: a 20-fix log and a 2.5-second telemetry
  capture that would have claimed 0 ft and 20 ft against 3,253 ft and 3,547 ft flights.
  **Worth chasing:** on sg1.1 the two agree on the height (−2.7%) but put the peak 33 s apart —
  the flight already known for a 54% device disagreement. The report says so where the times
  diverge, but nothing yet reconciles it.
  **Swept the obvious follow-on and there is nothing there:** the Featherweight GPS tracker
  files would matter more, since they are GPS-primary and a held fix would corrupt the
  altitude the analysis itself rides on — but both corpus GPSTrk files carry `FIX=3` on every
  row (174/174 and 404/404), so there is no held sample to mask. The only `FIX=0` rows in the
  family are 14 of 1,669 in a *ground-station* log, a different layout Debrief doesn't read as
  a flight. No change made. Still open: no other parser carries a GPS altitude yet.
- **Fixed, and the earlier diagnosis was wrong.** The jimheaney L1 logs reading Mach 0.9–1.65
  on ~2,450 ft apogees are not a startup transient: the baro trace genuinely climbs 900 ft in
  0.72 s while the same file's accelerometer reads a 20 g boost that can only account for
  ~430 ft/s. Two channels of one flight, one of them wrong. What separated it — where three
  attempts at a *threshold* on this artefact had failed — is that the accelerometer bounds the
  speed from above (∫(a−g)dt from liftoff, every g credited as vertical — the tilt term is
  what makes it generous; drag is already in the reading) and the
  unpowered coast bounds it from below (√(2gΔh) from the end of thrust to apogee). Both are
  inequalities from the flight's own record, not tolerances. Swept over the corpus the two
  bracket the speed on all 22 flights with an accelerometer, and only these four read outside
  their bracket (150%, 220%, 380% and 400% of the ceiling); every flight where a device velocity
  settles the truth sits at 88–138%. The ceiling is used only where the coast corroborates it,
  which is what keeps a Jolly Logic sample flight (ceiling 2 ft/s against a 666 ft apogee — a
  channel on another convention, or too coarse to integrate) from accusing its own barometer.
  Still open in the same area: those four flights report no speed at all. The bracket is named
  in the warning; stating a number off the same channel was tried next and does not hold up —
  see the entry below.
- **Measured, and it does not support a reported number: an accelerometer-integrated
  velocity.** The obvious next step after bounding the speed was to state it — integrate
  (a−g) from liftoff, the way AltosUI and the Blue Raven tools do. It has a free, exact
  self-test: the vertical velocity must come back to zero at apogee, because that is what
  apogee means, so the residual there IS the accumulated drift. Swept over all 22 corpus
  flights with a device accelerometer: it closes to within 7% on the six AltimeterCloud
  flights and −13% on the 121 km TeleMega — and where it closes it agrees with the device's
  own reported velocity to 2–6% (540 vs 541, 533 vs 515, 223 vs 212, 527 vs 550, 553 vs 523,
  199 vs 206 ft/s), so the method is right where it applies. Everywhere else the residual is
  −44% to −135% (one Jolly Logic channel −9,485%). **The four jimheaney flights that report no
  speed today are at −44%, −52%, −63% and −77%, so this would not rescue them.** The mechanism
  is the same tilt term that makes the bound generous: an axial reading credited as vertical,
  integrated over a long coast, walks off. Bounding the speed is what this channel supports;
  stating it is not. Don't retry without a tilt/attitude channel to project the axis with.
  (While measuring this: the shipped comment and both doc pages claimed the ceiling was
  generous partly because "drag cost nothing". Wrong — an accelerometer measures drag, which
  is why the running sum falls again through the coast. The generosity is the tilt term alone.
  Corrected in the same change.)
- Found by driving the app, not by a test: a withheld velocity was still being printed
  per-sample in the event legend and all four exports, so the headline read "—" while
  burnout read 1,932 ft/s. Fixed for all three withholding guards at once. Worth checking
  the same way wherever else a metric is withheld but a *series* stays plotted — the
  Mach and dynamic-pressure channels already gate on the flag, but nothing enforces that
  a new surface will.
- Reconciliation regression now covers 6 of the corpus's 15 same-flight groups (17 files).
  The rest are single-analysable-recording groups, deliberate device disagreements, or
  known issues — but a *velocity* agreement assert is still missing, because trf-lemiv-l3's
  Proton recording reads 2,938 ft/s against the group's 1,401–1,724, so it would fail today.
- Two recordings of the Stargazer 1.1 *booster* genuinely disagree by 54% on apogee
  (TeleMetrum 2,502 ft vs StratoLogger 1,435 ft) — and each device's own summary states
  its own figure, so Debrief reproduces both faithfully. A real device disagreement worth
  surfacing, not a bug; do not add it as a reconciliation regression.
- Diagnosed and fixed: the Blue Raven jan10 LR file holds one flight recorded twice, so the
  merged record put apogee 39.6 s after liftoff; it now reads 18.2 s against the GPS's 19.3 s.
- Fixed, and it wasn't liftoff detection: trf-lemiv-l3's four recordings spread 23.6–28.2 s on
  time to apogee. The Blue Raven's 50 Hz baro trace swings ±250 ft for most of a second when
  the drogue charge vents the bay, and the plain highest sample landed on a 12,060 ft noise
  peak 3.7 s after the flight's own (device) velocity had gone negative — the wide cousin of
  the ejection spike the median filter is built for. Apogee is now looked for only up to the
  onset of a sustained descent; the group reads 11,731 / 11,734 / 11,766 / 12,001 ft and
  23.60 / 23.75 / 24.30 / 23.90 s, asserted as a reconciliation regression (spread 0.70 s).
  Two measured gates keep it off sound flights: three seconds of continuous negative velocity
  before it counts as a descent (half a second pulled a 121 km flight's apogee 28 s early on
  one transient dip), and no clamping above the troposphere, where a baro trace has stopped
  being a height at all — that same 121 km log swings 163,000–206,000 ft with no trend.
- **Fixed, and the way in was a bound after three thresholds had failed.** On the Blue Raven
  jan18 flight the barometric altitude *over*-reads through the supersonic push, so burnout
  reported 2,495 ft where the flight's own inertial speed record allows under 900. The running
  maximum can't see it — the trace never goes backwards — and the entry below records three
  attempts to threshold the discrepancy, all abandoned. What works is not a tolerance at all:
  over any stretch a rocket's **mean climb rate cannot exceed the fastest it was going during
  it** (the mean value theorem), and where the speed is measured the fastest it was going is in
  the file. So the height gained since liftoff is capped by (peak speed so far) × (time since
  liftoff), with the same 3%-of-apogee band the floor guard uses to absorb barometric wander.
  Swept over the corpus: exactly **one event on one flight** exceeds the cap — that burnout, by
  495 m against a 58 m band — while the worst sound flight sits at 28% of its own band, so the
  separation is 9× on one side and 3.5× on the other rather than a tuned edge. The reading now
  comes from that device's inertial altitude (564 ft, against ∫v dt ≈ 460 ft), accepted only
  because it satisfies the bound the barometer failed. Gated on a *measured* velocity: a
  barometric one is this very trace differenced, so the cap would test the trace against itself
  — asserted by a test. Standing corpus invariant added (it fails on the old code: 495 m > 58 m).
- **The original entry, kept for the reasoning that got here.** On the
  Blue Raven jan18 flight the barometric altitude *over*-reads through the supersonic push:
  it climbs 98 → 592 → 1,784 → 2,605 ft between t=0.24 s and 0.74 s (an implied 3,570 ft/s)
  while the same device's inertial velocity peaks at 1,239 ft/s, then plateaus near 2,800 ft
  for seconds with the rocket still doing 900 ft/s. So burnout is detected correctly (at the
  velocity peak, 0.74 s) but its altitude reads 2,542 ft where the flight's own velocity
  record allows about 460 ft (∫v dt). The monotonicity guard only sees altitude going
  *backwards*, so it doesn't fire.
  **Measured, and it does not support a threshold — don't try again without reading this.**
  With a measured velocity, the altitude climbed from liftoff and ∫v dt over the same stretch
  are the same quantity, so the disagreement between them looked like a rigorous test. Swept
  over every corpus flight with a device velocity, the worst disagreement on the ascent is
  845% (RRC3 xprs2015), 443% (the jan18 flight), 218%, 189% (endurance TeleMetrum), 188% and
  185% (the two irec2023 recordings) … down to 17%. Flights whose numbers are demonstrably
  right sit among the worst. The artefact is *ubiquitous* through the transonic push rather
  than special to one file, so no global bar separates a broken read from a sound one.
  What that implies: an altitude read off a barometer at a supersonic instant is inherently
  soft on every such flight, which is a caveat-and-cross-check problem, not a withholding
  threshold. The ∫v dt comparison would make a good *surfaced* cross-check (two recordings
  side by side, the flyer decides) — which is the shape this product already uses for the
  logger's own reported figures.
  Three attempts at a threshold on this artefact failed this way in one session (a detrended
  Hampel filter, a monotone-envelope lower bound, and this integral bound); the two guards
  that did ship work because they test something a rocket physically cannot do (be below its
  pad; have negative vertical velocity while climbing), not because they tuned a tolerance.
  Postscript: the *speed* half of the same artefact did yield to a bound, because a speed can
  be bracketed from both sides at once (see the jimheaney entry above) where an altitude at a
  single instant cannot. The distinction is worth keeping: bracket a quantity, don't threshold
  a discrepancy.
- **Built the Blue Raven downrange/crossrange channels, measured them, and reverted.** The
  roles and kinds went in cleanly (`velocityLateral` as a speed, `distanceLateral` as a
  length, the same shape as the inertial altitude) and the columns mapped — but the data
  isn't a clean speed or distance. `Inertial_DR_Position` reads 0 on the pad and a sane
  −21…−53 ft around apogee, then rails past ±32000 on 51 of 2,843 samples (2%): int16
  wraparound. `Velocity_DR` swings to −820 ft/s on a flight whose *vertical* peak is
  698 ft/s. Surfacing those as measured downrange figures would have put a 32,750 ft
  downrange position and a supersonic sideways speed in front of a flyer, so nothing shipped.
  **Two hard results from measuring it, so the next pass starts ahead:**
  (1) *The position columns are FEET, settled against ground truth rather than assumed.* On the
  trf-lemiv-l3 flight, recorded by both a Blue Raven and a Featherweight GPS, √(DR²+CR²) at
  apogee is 6,236 against the GPS summary's stated 5,480.90 ft distance at apogee — 1.14×,
  ordinary drift for an inertial solution over a 28 s ascent, where reading them as metres
  would be 3.73× and absurd.
  (2) *A rail guard is NOT enough, so the accelerometer-saturation analogy does not transfer.*
  Blanking |value| ≥ 32000 was tried and reverted: the surviving samples still reach
  ±31,993 ft on a 12,000 ft flight, because a wrapping counter sweeps the whole range rather
  than sitting at the limit. 51 of 2,843 samples rail on one flight and 146–149 of 9,655 on
  the other, but the contaminated *band* is wider than that.
  What would actually work: detect the wrap as a discontinuity between consecutive samples
  (~65,536 counts if that's the modulus — unverified) and either unwrap the counter or withhold
  the stretch, checked against the GPS distance at apogee on the lemiv pair, which is the one
  flight where an independent number exists. The Velocity_DR/CR columns stay out either way:
  they reach 1,516 ft/s sideways against a 1,401 ft/s vertical peak and nothing in the corpus
  says what they're in.
- Fixed: the intrepid3tf2 AL1 recording read a main descent of 2 ft/s against its AL0
  partner's 57 ft/s. Diagnosed by driving it — the log loses power at 1,876 ft, 1.3 s after
  its main fires at 1,877 ft, so the "rate" was 26 samples at the very end of a truncated
  record. Each descent leg now gets the same test the whole descent already had, against the
  height that leg started from: read it only where the record shows it dropping more than a
  tenth of that. AL1's drogue leg (16,206 → 1,877 ft) still reads 69 ft/s; no other corpus
  figure moved. Still open in that pair: neither AL0 nor AL1 says anywhere that the record
  ENDS IN THE AIR — no landing, no flight time, a last sample at 891 and 1,876 ft. That is
  worth a warning of its own; a flyer reading "descent —" deserves to be told the log stops
  mid-flight rather than left to infer it.

- An AltimeterCloud export's own peak acceleration sits exactly 1 g below Debrief's
  read on all five corpus files (31.3 G vs 32.3 G, etc.) — the device reports
  acceleration net of gravity, Debrief reports the specific force the accelerometer
  measured. Both defensible; decide which the cross-check should compare and say so.
- A named Jolly Logic AltimeterThree parser — a very common consumer altimeter — still
  wants doing; the generic mapper now reads its axes correctly, but a named parser would
  carry the device's identity and its own summary. Needs the real app's header names,
  since the corpus fixture's were normalised when it was extracted from the official .xlsx.
- Checked, not a bug: three corpus files where Debrief's max acceleration sits far under
  the manifest's "max |Acc|" (Jolly Logic 9.0 g vs 19.14 g; jimheaney Discovery 23.8 vs
  39.2; The Gardener 23.5 vs 42.2). In each the file's peak is at deployment (t=7.2 s)
  or landing (t=107 s), not in the boost — Debrief reads boost acceleration and reports
  deployment shock separately, which is right. The manifest's ground truth is the naive
  whole-file maximum; worth correcting in the fixtures repo.
- Checked, not a bug: the `Lyrid-04252021` SRAD log reads 171 ft AGL against a manifest
  "6220 ft", which is MSL — its altitude record genuinely spans only the top 183 ft of a
  truncated capture, and Debrief now says so (no pad baseline, no clear ascent).
- Done: dropping a device summary alongside its log now feeds the summary's figures into the
  cross-check as the device's side, paired on the rocket name the summary states (which the
  app also puts in the log's file name). A Blue Raven pair reads Apogee 4,035 ft device vs
  4,036 ft Debrief and Max velocity 700 vs 698 ft/s. One gap left in the same area: the
  pairing is within one drop only — a summary dropped on its own still just explains itself,
  and can't attach to a flight already open or in the logbook. (Checked, not a gap: a figure
  the summary states but Debrief withholds already shows as "24.1 g / — / not computed", so
  the device's reading isn't lost.)
- Measured, and deliberately NOT built: a date role for the column mapper, so a generic CSV
  could carry its launch date the way the three named parsers now do. Zero of the corpus's
  generic CSVs have a date column (jimheaney ×4: Time/Acc/Alt/Temp; Lyrid: 30 IMU columns, no
  date; Proton and Quantum FW-format: Flight_Time only; Eggtimer: T/Alt/Veloc). It would fire
  on no real file here, which is worse than nothing — revisit when a dated generic export
  turns up, and note that Y/M/D roles would also need guarding against a "Day" column that
  means something else.
- **Done (D2):** the AltOS `.eeprom` and the RRC3 `.rff` are read directly now, each measured
  sample-for-sample against the vendor's own export of the same bytes. What remains is the
  **Entacore AIM `.bin`/`.xtra`**, and it is blocked on ground truth rather than on effort. The
  `.xtra` is a Boost serialization archive (`serialization::archive` header, then a
  variable-length record stream carrying float32 timestamps and a repeating 3.3 constant); the
  `.bin` is a 4 MB raw flash snapshot, a tagged variable-length stream with a recurring
  `81 0b .. 81 0c ..` framing. Both are identifiable and neither is decodable with confidence:
  the corpus has a flight-summary SCREENSHOT for these files and no per-sample export, and
  Entacore's founder called the `.xtra` partially corrupt in the source thread. **Do not attempt
  this without one of: the AIM XTRA software's CSV export of one of these exact flights, or
  Entacore's record layout.** Every raw download that shipped in D2 had the vendor's own reading
  of the same bytes to check against, and a binary decoder that cannot be checked produces a
  plausible flight out of misaligned bytes rather than failing loudly. The files are recognised
  and named today (`lib/parsers/rawDownload.ts`), which is the part that could be done honestly.
- Checked, no finding: coast efficiency (height gained burnout→apogee over the drag-free
  v²/2g) is above 1 on nothing in the corpus — 29 flights report one and the highest is 82%
  (an AltimeterCloud flight). A value over 1 would mean the burnout velocity, burnout altitude
  and apogee aren't from one instant of one flight, so it's now asserted as an invariant with
  real headroom rather than left to be noticed by eye.
- The launch day now reaches the comparison too (column header, the compare Markdown and the
  compare JSON), which increment 4 had left out — it went to the report, the flight's exports
  and the logbook only. Worth a habit: when a value lands on "every surface", the comparison
  view is the one that gets forgotten, because it reads a different type (`CompareFlight`, not
  `RawFlight`).
- Fixed: `velocitySource: 'device'` used to mean only "the file had a velocity column", so a
  baro-only logger's filtered derivative read as measured — 9 corpus flights, including an
  Eggtimer at 4,483 ft/s on a 4,661 ft apogee (Mach 4.08) and another at 2,671 ft/s on 958 ft,
  plus the StratoLogger pair at Mach 2.52. A column is measured only where the file carries an
  accelerometer, a GPS fix, or the device's own inertial altitude (which a Blue Raven low-rate
  file has without the accelerometer). Corpus split moved from device 30 / baro 15 to device 21
  / baro 24; every relabelled flight now gets the transonic caveat, and no headline number
  changed. Still open: the same reasoning says a GPS-only *altitude* can't yield a measured
  acceleration (already withheld) — but a GPS velocity is Doppler and IS a measurement, which
  the code now trusts on the presence of a latitude channel alone. If a logger ever writes
  lat/lon without a Doppler speed, that would be too generous.

## Craft & product feel

- **Two footer links sit under the touch floor on a phone, and `touch.spec.ts` does not see
  them.** Measured at 390 px with `hasTouch: true` (which is what makes the
  `@media (pointer: coarse)` rule in `globals.css` apply — without it every control measures
  small and the reading is worthless): `Privacy` is **42x44**, two pixels under on width, and
  `ADA.gov →` is **59x16**. The `Read the methods →` link is 136x18 and is deliberately exempt —
  the CSS says so, because a link inside a paragraph must not become 44 px tall. The first two
  are in the footer's navigation row, which the same comment says IS a target row and is padded
  rather than sized; the padding just does not quite reach. Everything else on the logbook, the
  clear-confirm and the comparison clears the floor, and none of the three overflows 390 px.

- **DONE — `Clear` wiped the noted flights the same screen promises are kept, on a double-click.** The confirm is a separate control now, counts what will go, names the noted ones, and offers the backup; it still takes them, because an explicit Clear is not the prune, but it says so. Original entry: `clearRecents`
  (`lib/recents.ts:291`) is a bare `objectStore.clear()` with no `note` filter, while `saveRecent`'s
  prune deliberately keeps every noted entry and the header copy says a noted flight "stays for
  good". The confirm is a second click on the same button in the same place — so a double-click on
  `Clear` destroys the whole logbook, its notes, its captions and its hand-made column mappings,
  with no undo and no prompt to Export first. It is the only irreversible control in the app.

- **DONE — a drop onto a LOADED comparison replaced the set instead of adding to it.**
  `components/CompareSurface.tsx:144` calls `load(ids, true)` with only the new drop's ids; nothing
  reads the ids already in `?ids=`. Drop four logs, then the other two of the launch day → a
  comparison of 2, the first four gone from the view and from the address. Drop just one more and
  it falls to the picker entirely. Adding the rest of a launch day is the one thing this surface is
  for, and the mapper path on the same screen (`addToIds`) already appends correctly.

- **DONE — the comparison's Label, Notes and column ORDER were lost on a navigation the surface
  itself offers.** All of it is kept on this device now, keyed by the SET of flights and carried
  forward onto a set that grew — adding today's sixth log to the five lined up is the same
  write-up. The order turned out to be worse off than the caption: it did not even take a reload to
  lose, because `CompareSurface` renders `CompareView` only in its `ready` state and a drop puts it
  into "Reading the flights…", which unmounts the view. Original entry:
  `components/CompareView.tsx:168` holds them as bare `useState` blanked whenever `syncKey` changes,
  and nothing persists them — while the panel's copy says they are kept. This is the same defect
  the report's label and notes had before they moved into the logbook entry, and the fix has a
  precedent to copy.

- **DONE — the comparison exported in load order while the screen showed the flyer's order.** All
  three document writers take the ARRANGED comparison now, so the write-up matches the screen it
  was made from and the figures beside it in the same bundle. Verified by reverting one call site:
  the saved HTML came back in load order and the assert failed naming its own case. Original entry:
  `components/CompareView.tsx:404` hands the raw `comparison` to `compareMarkdown`/`compareJson`/
  `compareHtml`, which each destructure `comparison.flights`, while the on-screen table, the metrics
  CSV, the clipboard copy and the SVG figures all use the reordered list. So a flyer who drags the
  columns into the order their write-up needs gets a different order in the saved document.

- **PARTLY DONE — the logbook has no batch selection.** Copying it out is done: `Copy table`
  puts what is on screen — sort and search included — on the clipboard through the same
  `copyTable` the report's readings, the sample table and the comparison share. What remains is
  the selection half. Original entry:
  `components/RecentFlights.tsx:166` — `toggle(id)` is the only mutator of the selection, one id per
  click; there is no select-all, no shift-click range, and no "compare everything this search
  matched". A season's logbook is a table a flyer would want to sort, filter and paste into a
  cert document, and the readings table on the report already knows how to copy itself.

- **The comparison forgets its column sort and its manual column order.**
  `components/CompareView.tsx:111` — the only two controls on that surface not remembered; the
  channel, the hidden readings and the rest all persist.


- **DONE — the two things a flyer TYPES were the two things a report lost.** The report has an
  address now, so a link out and a Back come back to the flight — but `reportLabel` and
  `reportNotes` were per-flight React state cleared on `flight.source`, and they ride into every
  text, Markdown, HTML and JSON export and the printed card, so losing them costs a cert write-up
  its title. Kept with the flight in the logbook (`caption`, keyed on the id that is now stable),
  seeded back on open, and the panel's copy — which honestly said "Held for this view only" —
  now says they are kept, because they are. Two bugs were underneath it: `saveRecent` rebuilds the
  record on every save and dropped `caption` (the same trap `note` and `summaryText` each have an
  explicit comment about — reopening wiped it the SECOND time, not the first), and a 400 ms debounce
  alone loses whatever was typed in the last 400 ms, which on a short label is all of it, so leaving
  the field flushes immediately.

- **DONE — twenty-one readings a flyer cannot look up, and a methods page nothing could link to.**
  Every reading in the grid is a term of art — "Coast efficiency", "Max Q", "Thrust-to-weight",
  "Tilt at burnout" — and `MetricGrid.tsx` carried **no `title`, no `aria-label` and no link**, on any
  of them. `app/methods/page.tsx` defines all of them in 45 blocks across 790 lines and had **zero
  `id` attributes**, so there was nothing to point at even if they had. Learning what a number meant
  was: leave the report (which then had no address to come back to), open the methods page, and read
  down it. Every block has a stable anchor now, every reading cites the one that defines it, and the
  two lists are held together three ways — `MethodId` is a union of the canonical list so a typo
  won't compile, and unit tests check that every id is rendered as a heading, that every reading
  cites one, and that the fixture exercising them produces all 21.
  **Still open:** the tooltip on the reading chooser (`ReadingChooser.tsx`) is still `title={label}`
  — a verbatim copy of the visible text for 20 of the 21 entries. It now has somewhere to point.

- **DONE — the unit control only existed inside a loaded analysis, while the page said it was
  top-right.** `UnitsControl` was mounted at two call sites, both below a report or a comparison.
  Measured at 1440 px: the analyze landing screen had **0** unit controls, the comparison picker
  **0**, and on a report the button sat at **x=479, y=483 — 880 px from the right edge** — against
  `app/page.tsx`'s own "switch feet and meters with one click (top-right)". Meanwhile the logbook on
  that landing screen was already printing apogee and speed in those units, with no way to change
  them. The choice is now owned by a `UnitsProvider` above the header on both surfaces that show
  numbers, the control sits in the header (**x=1044, y=46**), and the two duplicate copies of the
  reader/writer — one in `Analyzer`, one in `CompareSurface` — collapsed into it.
  **The first attempt put the provider in the root layout, and that was wrong twice over.** It gave
  `/methods`, `/validation` and `/privacy` a unit control over pages with no numbers on them, took
  them from 107 kB to 111 kB of client JS, and the extra chunk requests pushed the e2e static server
  past its file-descriptor limit **mid-run** — `EMFILE: too many open files`, killing the last five
  tests with `ERR_CONNECTION_REFUSED` and looking exactly like flakiness. `SiteHeader` takes the
  control as a slot now and stays a server component; the docs pages are byte-for-byte what they were.
  **Still open:** on a report that runs 7,000 px the control is at the top, so changing units deep in
  one means scrolling up. The section strip is already sticky and could carry it.

- **DONE — the report had no address, so all seven in-app links on its own screen destroyed it.**
  Measured on a loaded report at 1440 px: `main`/`header`/`footer` carry **7** same-origin links —
  Analyze, Compare (×2), "Read the methods →", Methods, Validation, Privacy — and the report lives
  only in React state, so clicking any of them and pressing Back lands on an empty drop zone. The
  flight survives in the logbook; the report's zoom, label, notes and per-quantity unit overrides do
  not, and nothing in the URL says which row to reopen. `?open=<id>` already restored a flight — the
  mount effect read it and then **deleted it from the URL**, which is exactly what left the address
  blank. Kept now, set when a save lands, cleared by "Analyze another flight". Back, a reload and a
  bookmark all come back to the flight.
  **And the id it names is stable now, which was a second bug underneath.** `saveRecent` minted a
  fresh id on every save, and a save is what REOPENING a flight does — so clicking a logbook row
  silently re-addressed the flight and broke every `/compare?ids=…` permalink that named it. Measured:
  two flights dropped, permalink taken, flight one reopened → its id changed and the permalink fell
  back to the **empty picker**, with no word about the flights it could not find. A save is a replace
  in place, so it keeps the address it replaces.
  **Still open:** `/compare?ids=…` falls back to the picker in silence whenever an id doesn't
  resolve — a cleared logbook, or a link opened on another device. It should say which ids it
  couldn't find, the way the analyze page says "That saved flight could no longer be read."
  And the report's **label and notes still don't survive** the round trip; they are per-flight React
  state cleared on `flight.source`. The logbook's own `note` is the precedent for making them stick.

- **DONE — a flight dropped anywhere but the dashed box threw the flyer out of the app.** A
  browser's default action for a dropped file is to NAVIGATE TO IT, and Debrief had exactly two
  drop targets: `DropZone` on the idle screen and the compact box on `/compare`. Neither is
  rendered once a report is open. So the most natural gesture on that screen — "read this one,
  here's the next" — released the file on the altitude chart and left for a page of raw CSV,
  taking the report, its zoom, its label and its notes, none of which have an address to come
  back to. Measured with a real `DragEvent`: `dragover` on the drop zone came back
  `defaultPrevented: true`, on the footer `false`, and on the report body `false` — with **zero**
  file inputs and no drop zone anywhere on that screen. The window catches it now
  (`components/useWindowFileDrop.ts`): the default is prevented for any drag carrying files, so a
  stray drop is a no-op at worst, and the file is read wherever it lands. The column mapper is the
  one phase that refuses — a new file would discard the mapping in progress — and it says so
  rather than swallowing the drop silently. Both boxes lost their own drag handlers in the same
  change: left in place beside the window's, a drop that hit the box was ingested **twice** (the
  falsification produced `["first.csv","second.csv","third.csv","third.csv"]`).

- **DONE — the flight card honours the reading chooser.** It took no `hidden` argument at all, so
  hiding a reading everywhere else still left it on the one artifact that leaves the device. Wired
  through `visibleRows`, with the label trap the note predicted: the card prints "Max accel" (four
  stats share its width) while the chooser stores the grid's "Max acceleration", so a `CardStat` now
  carries `reading` — the canonical label — beside the one it draws, and filters on that. A test
  holds every card stat's `reading` against the grid's labels so the two cannot drift.
- **Playwright cannot click the "Compare N flights" button** even though it is present, enabled, in
  the viewport and unobscured — `document.elementFromPoint` at its centre returns the button itself,
  and a programmatic `.click()` navigates correctly to `/compare?ids=…`. A 30 s actionability timeout
  with all of those true usually means the element never settles. Worth confirming it is not a
  continuous re-render on the compare page: that would be invisible on a desktop and cost battery on
  a phone at the pad.

- **The comparison surface named the one file most worth adding and gave you nothing to press.**
  Drop a launch day's folder on `/compare` and anything Debrief doesn't auto-detect got
  "needs its columns mapped, which happens on the analyze page" — while the heading said
  "Comparing 2 flights" for a three-file drop. The affordance already existed: `CompareView` has
  taken `mappable` + `onMapFile` since the analyze page's batch drop learned this, and the
  comparison surface simply never passed them. The mapper opens in place now and the mapped
  flight is appended to the comparison's own address. `lib/mapped` is the shared half that was
  missing — the pair to `lib/reopen`.

- **Three ways an offline page showed you a different page, all of which read as success.**
  `/validation` without its trailing slash fell through to the shell and came up as the
  analyzer under that address; tapping an in-app link fetched the route's RSC payload
  (`/methods/index.txt?_rsc=…`, which the buster kept out of the cache), failed, and Next's own
  fallback landed the flyer on `/methods/index.txt`; and the last-resort fallback was the home
  page served under whatever was asked for. Now: both slash forms looked up, payloads
  precached and matched without the buster, and an honest 503 that names the address. **Still
  open from the same look:** Next's prefetcher fires against a dead network on every render, so
  an offline session logs a steady stream of `net::ERR_FAILED` — harmless, but it is noise in
  the one console a bug report would come from.

- **"Share link" was always enabled and failed on an ordinary 220 KB log** — a share link
  carries the whole file in the URL — and the failure named "Save chart", which is not a button
  on the page. The answer is worked out when the report opens (the same gzip, once per flight
  instead of once per press) and the control says it: "Too big to link". Deliberately not
  disabled — a disabled button on a phone has no hover to read and does nothing on a tap.

- **The column reorder did not exist on a phone**, `hidden sm:flex`, so a comparison could only
  be put in a deliberate order with a pointer; and a *loaded* comparison had no `<h1>` at all,
  because the surface's own heading was replaced by an h2 when the flights arrived. Both found
  by measuring the loaded view at 390 px, which no test had ever done — every touch test on
  that surface stopped at the picker.

- **Still open, and a real design call rather than a bug: the report's file-export strip is
  861 px of controls in a 380 px viewport.** Nine saves behind a 32 px fade, so `Save bundle`
  and `Figure: light` are undiscoverable on a phone. The current shape is a considered
  trade — a horizontal strip keeps the flight's numbers high instead of four stacked rows —
  and the honest fix is neither: one "Save…" control opening a sheet that lists all nine with
  what each is for. That wants a sheet component the app doesn't have yet.

- **Unresolved, needs a second look: "Copy summary" showed no "Copied ✓" on an emulated phone**
  while the same click works on the desktop viewport and in the existing e2e test. Either the
  clipboard write is being denied without hitting the catch, or the confirmation is rendering
  somewhere a phone never sees. Worth ten minutes with a real device profile before assuming
  it is only a headless-permissions artefact.

- **Closed the other half of the OpenRocket plot-tab benchmark, and the corpus said the
  crowding is the normal case rather than an edge one.** Debrief drew every flight event on
  the explorer's plot; OpenRocket lets you pick. Measured the collision before building
  anything — for each corpus flight, the tightest gap between two consecutive markers as a
  fraction of the plotted span (a label needs roughly 6% to itself):

  | | |
  |---|---|
  | flights with two markers inside 6% of the span | **28 of 30** |
  | tightest of all | **0.10%** — burnout→apogee on a 99 s record |
  | most common colliding pair | liftoff→burnout, on 20 of them |

  So this is not about a rare four-events-in-six-seconds flight: the boost is a few seconds
  inside a record that runs for minutes on nearly every log. One chip per event type the
  flight actually has, everything on until the flyer says otherwise (so a logger that starts
  reporting a new event type shows it without anyone opting in — the store holds what is
  *hidden*), kept on this device.
  **Found while testing it, and worth more than the feature:** the markers are drawn on the
  canvas, so the chart's accessible name said what channels were plotted and *nothing* about
  what was called out on them — a screen reader got no hint the events existed at all. The
  name now lists whichever are marked, which is also the only honest way to assert the toggle
  works.
  **And the same one-word-two-meanings trap as the built-in views, on the same screen:** the
  sample table's "Jump to" row already has a button reading *Burnout* that scrolls the table
  to that sample. Two buttons, one word, different jobs. The chip stays one word (the "Events"
  label and the colour dot beside it say which row it belongs to) and its *accessible* name
  carries the action — "Stop marking burnout on the plot" — so assistive tech isn't offered
  two identical Burnout buttons a few centimetres apart. Worth noting the pattern: this is
  twice in one run that adding a control to the explorer collided with an existing word.

- **Found by the cold walk on a phone: a panel that opened off the side of the screen.** The
  per-quantity units popover is anchored to the right of its trigger, which is right on a
  desktop — there is room to its left — and wrong at 375 px, where the trigger sits at
  x=102–201 and a 240 px panel therefore ran from **−39 px** to 201. The 39 px that fell off
  the left is the whole label column: "Altitude", "Speed", "Acceleration", "Temperature",
  "Pressure". **Nothing that watched the document could see it** — `scrollWidth` stayed at
  375, because an element overflowing to the *left* creates no scroll. The existing phone
  tests check tap-target size and document overflow, and both were green through this.
  Anchored to the viewport below `sm` now (12 px each side, measured 12→363), unchanged above
  it, and the regression test asserts the panel's box AND that each label row starts at x ≥ 0
  — it reports "panel starts at x=-39" with the fix removed.

- **Seven cards on the report are a sentence and one small input, and a desktop was giving
  each of them 1,232 px.** Measured: rail exit, drag Cd, ejection delay, main-deploy altitude,
  landing energy, parachute Cd and drogue Cd, stacked full-width, took **1,031 px of vertical
  scroll** on a 1440 px screen for fields you type three characters into — the "desktop that
  wastes half the width" tell, exactly. They are two responsive grids now (two across from
  `lg:`, one on a phone): **7,292 px → 6,906 px**, phone unchanged. The layout is the smaller
  half of it. Three of the four recovery cards read off the *same* descending mass, so a flyer
  typed it into one and scrolled past two others that had quietly filled in; side by side, the
  shared figure and everything it unlocks are in view at once. **Still open:** the report is
  still 6,900 px of one column on a desktop — the charts, events, explorer and card are each
  full-width in sequence. Whether that wants a two-column reading layout or its own surfaces
  is a product decision, not a CSS one.

- **Found by the cold walk, immediately after the fix that caused it.** Making two flights fit
  on a 360 px phone left the Spread column sliced at the viewport edge — showing the first
  digit of each percentage: "7" for 79%, "11" for 114%. A cut-off number does not read as a
  fragment, it reads as a number, which is worse than not showing the column at all. It is
  hidden below `sm:` now, and nothing is lost: the cross-check panel directly above states
  every one of those spreads in prose. Asserted. The lesson is the smaller one: **a fix that
  makes something fit should be looked at, not just measured** — the assertion I wrote
  (both flights' cells inside the box) was true while the screen was still wrong.

- **The surface called "Compare flights" could not take a flight.** Found by looking at the
  picker cold: a flyer landing on `/compare` with a launch day's folder was told to go to the
  analyze page, drop it there and come back. The one action the page is named for was the one
  it couldn't do — and its own source comment claimed "dropping files here is offered", so
  the code was already documenting a thing that wasn't built. It has a drop area now
  (deliberately compact, not the analyze page's hero: here adding files is a step towards a
  comparison, not the headline), and it is shown whether or not the logbook already has
  enough, because a flyer with a season logged still arrives with today's folder. Two or more
  readable files go straight to the comparison at its own address; one lands in the logbook
  and says so; anything left out is named with a reason. **The reading of the folder is now
  one shared `lib/ingest`** — which files are flights, which need the mapper, which are a
  device summary, which can't be used — so the two surfaces that take a drop can't drift
  apart about what a launch day holds.

- **The comparison surface could not show two flights at once on a phone — on the one surface
  whose entire point is side by side.** Found by looking at a 390 px screenshot rather than at
  a test: the first flight's column filled the width and the second started past the right
  edge. Measured: the metric table was **540 px inside a 358 px box**. The row labels were
  already sticky, so this wasn't "you lose your place" — it was that a comparison of two was
  a comparison of one, a row at a time. Three things were spending a phone's width on desktop
  habits: the ◀▶ reorder arrows (a pointer refinement, ~52 px per column), a 10 rem file-name
  budget, and desktop cell padding. Below `sm:` those become no arrows, 5 rem and half the
  padding — **382 px**, so both flights' readings are on screen at once, and only the Spread
  column (which the cross-check panel above states in prose anyway) is a scroll away.
  Asserted at 360 px, on the measured cell positions, since a layout like this drifts quietly.

- **Found by looking at the app rather than at the tests: the charts were plotting the file,
  not the flight.** Swept every corpus flight for how much of the plotted axis is actually
  flight (liftoff → landing). Median **97%** — so the naive version of this worry is wrong and
  most files are fine — but the tail is severe: `Kairos-Sustainer-March` is **20% flight, with
  307.7 s of pad wait in front of a 76 s flight**, and three more sit at 28%, 28% and 67%. On
  those, four fifths of every chart is a rocket standing still and the boost is a sliver you
  cannot read, worst of all on a phone. The compare surface had solved this a long time ago
  (`gStart = max(gStart, -1.5)`) and the single-flight report had not — one model, two
  surfaces, different answers. The report's three charts now open on the flight, the saved
  SVG figures and the shareable card are framed the same way (a document has to say what the
  page said), and the zoom row gained a **Flight** preset, renamed *Full* to *Full record*,
  and now reports which view is showing instead of being four buttons with no state.
  **Nearly shipped a bad bug doing it:** setting the window through uPlot's `scales.x.range`
  pins the axis, because that callback runs on every `setScale` and not only when the scale
  auto-ranges — so the charts silently swallowed every zoom and every preset. Caught by the
  e2e assertion on the preset's own active state, and the test now drags, checks the view
  moved, and double-clicks back. **Still open:** the explorer's chart is not framed this way
  (its x axis can be a channel rather than time, so "the flight" isn't a window there), and
  on a long descent the velocity plot's y-scale is set by the boost, which leaves the 55 ft/s
  under canopy as a flat line — a log scale or a per-phase y-range is the honest fix and
  needs its own pass.

- **The saved report was missing six readings the screen shows.** Chasing why the flight
  report can't reorder its readings (two parallel lists, see Feature depth) turned up the
  reason those lists were worth unifying: `headlineRows` — which feeds the .txt, .md, .html
  and the copied table — never carried **avg acceleration, thrust-to-weight, coast
  efficiency, peak roll rate, revolutions or battery low**, all of which the tiles show. A
  flyer reading the thrust-to-weight off the page and saving a Markdown write-up got a
  document without it. They are in now, with the context the tiles carry ("over the boost",
  "off the pad", "drag cost 5,109 ft", "3.7 V at rest") rather than as bare numbers. **The
  two lists are still two lists** — this closed the gap that mattered, not the duplication
  that caused it; unifying them is what would let the report's readings be reordered too.
- Same rule, one surface over: the comparison's structured export gave `crossCheck` spread
  percentages with nothing to say the files date those flights years apart — so a consumer of
  `debrief.comparison/1` would read a flight-to-flight difference as an agreement, which is
  the exact misreading the screen was fixed to prevent. It now carries `sameFlight`
  (`unknown`, or `different-flights` with the stated launch days) and a disclaimer that
  follows the verdict. Additive, so the contract is unbroken.
- The GPS cross-check shipped on screen but not into any export — so the document a
  flyer files said less than the page it came from, which is exactly what a certification
  package can't afford. It's in the .txt, .md and .html reports now, in the same shape as the
  logger's-own-summary cross-check beside it, and in the structured `debrief.flight/1` as
  `gpsApogee` / `gpsApogeeTime` / `gpsAscentFixes` / `gpsApogeeAgreement` — the last of those
  because a consumer reading only the two numbers cannot tell corroboration from coincidence.
  The keys are present and null on a flight with no GPS, so a reader checks a key it knows.
  The rule this run produced: **a cross-check that isn't in the export isn't finished.**
- The comparison chart reset to altitude on every comparison — so a flyer comparing a
  season's boosts clicked past it every single time. It remembers the channel now, on this
  device, the same way the explorer remembers how it was set up. Worth sweeping for other
  controls that forget: the comparison's sort and manual column order still reset per
  comparison, which is arguably right (they're about *those* flights) but has never been
  thought about deliberately.
- **Drove the field journey end to end and it holds — now asserted.** A phone, no signal at
  all, and a launch day already in the logbook from home: open `/compare` cold, tick two
  flights, get the comparison, then open one of them on its own from the same logbook. Every
  piece of that was already covered; the journey was not, and the journey is the product. It
  is one test now, including that nothing in the report pushes past a 390 px viewport while
  doing it.
- **FOUND, after three wrong theories, and it was a real user-facing bug rather than a flaky
  test.** The offline docs spec had been failing on CI about one run in three — always
  `/validation/`, always after `/methods/` came up fine, never reproducible locally. Three
  theories were tried and shipped (a worker still installing; a navigation hanging on a dead
  network; a truncated cached body); each is a genuine improvement and none was the cause.
  Instrumenting the assertion is what ended it. The failure now reads:
  `{"controlled":true,"cached":true,"readyState":"complete","title":"How Debrief is validated — Debrief","h1s":["Something went sideways"],"bodyChars":227}`
  — **"Something went sideways" is `app/error.tsx`.** The document was cached and served
  fine; the page then *hydrated into Next's route error boundary* because the route's own
  JavaScript wasn't there. A flyer who opened Debrief at home and drove out of signal would
  find the methods and validation pages — the two the offline promise names — showing an
  error. **Cause:** a route's JS reaches the cache when the router prefetches its link, and
  the App Router prefetches on *viewport entry*; the docs links live in the footer, below the
  fold. So the promise quietly depended on how far the flyer had scrolled. Those links and
  the header's surface links now prefetch on render. **Belt and braces, if it ever recurs:**
  the docs routes could be made to survive without hydrating at all (their only client
  components are the theme toggle and the tip button), so a missing chunk costs a control
  rather than the page. Lesson worth keeping: **three guesses cost more than one instrumented
  failure** — when a failure won't reproduce, spend the increment on making it explain itself.
- **Third diagnosis, also not the cause on the evidence so far: the worker could cache a
  truncated response body.** The instrumentation added on the second attempt paid
  for itself immediately — the next CI failure arrived reading
  `/validation/ offline — {"controlled":true,"cached":true,"readyState":"complete","title":"How Debrief is validated — Debrief"}`.
  Worker controlling, document cached, page *complete*, correct title, and no `<h1>`. That is
  not a race on the worker or a hanging fetch: it is a cached copy with a whole `<head>` and
  a cut-off `<body>`. `res.ok` describes the HEADERS; a fetch whose stream is cut short still
  yields an ok response carrying a partial document, and `cache.put` will happily store it —
  after which the page loads broken offline, for good, until the cache is replaced. Every
  cache write now reads the body to the end (so the failure happens where it can be caught)
  and rejects a short read against `Content-Length`. **Honest status:** this explains the
  evidence exactly and is right regardless — caching a truncated document is worse than
  caching nothing — but it has never reproduced locally, so watch the next few CI runs before
  calling it closed. The two earlier theories (a worker still installing; a navigation
  hanging on a dead network) were both wrong as *causes*; both fixes are worth keeping on
  their own merits, and the wrong causal claim left in the navigation comment is corrected.
- **Second diagnosis, also wrong as a cause: the service worker was serving navigations
  network-first.** After the precondition fix below, `/validation/` *still* failed to come up
  offline on CI — same assertion, same shape, and still never reproducible locally (three
  full CI-shaped runs, `--repeat-each` sweeps, and a check that the static server issues no
  redirects for those routes). So the precondition was not the cause. What is: the navigation
  handler tried the network first and fell back to the cache **on failure** — which is only
  sound if "offline" means `fetch()` rejects promptly, and it doesn't always. A request made
  with no network can sit pending, and then the page hangs loading a document that was in the
  cache the whole time. It also explains the shape of the failure exactly: the first offline
  navigation came up, the second hung. Navigations are now served from the cache when there
  is a copy, with the network refreshing it in the background — which at the field, where
  *every* navigation is offline, was the right order anyway. The freshness given up is one
  visit, and a deploy brings a new worker whose install refreshes those routes outright. The
  test now carries the page's own account of itself into the failure message (controlled?
  cached? readyState? title?) so the next one on a machine I can't reproduce on arrives
  already diagnosed.
- **CI went red twice on a test that had been green for a session, and the cause was a
  precondition I had already fixed once in a weaker form.** The offline docs spec waits for
  the routes it opens to be in the cache, then cuts the network — but the install fetches
  every precached URL in parallel, so the two it checks can land while the rest are still in
  flight. Adding `/compare/` as a sixth precache URL widened that gap, and `/validation/`
  started failing to come up offline on CI (twice, including the retry) while passing every
  local run and every isolated `--repeat-each` sweep. The precondition an offline test needs
  is not “the URLs I open are cached” but **“the worker has finished installing”** — the
  registration has no `installing` or `waiting` worker — which is what both offline specs now
  wait for. Fourth instance of this shape of test bug; the rule is now stated in the spec
  itself. Honest caveat: it never reproduced locally, so this is a closed gap that matches the
  regression's timing exactly, not a proven repair — watch the next few CI runs.
- **Measured the field claim rather than assuming it, and it holds — with one gap that
  didn't.** The largest analysable corpus file (11 MB, 36,701 rows, a Blue Raven low-rate
  log) goes from drop to full report in **1.2 s** unthrottled, **4.3 s** at 4× CPU throttle
  and **6.0 s** at 6× (phone-class); the sample table opens in 134/330/446 ms and scrolls in
  ~250 ms at every rate. Nothing needs optimising — the analysis already runs in a worker and
  the table is virtualised. What did need work is the *wait*: six seconds of a bare
  "Reading…" reads as stuck and gets tapped again, so it now names the file, states its size
  where that is why it's slow, moves, and repeats the one thing a long wait might make a
  flyer wonder about ("nothing is being sent anywhere"). While there: the report's
  horizontally-scrolling "Save a file" strip clipped a button mid-word at the viewport edge
  with nothing to say there was more, and now fades. (The 15 MB high-rate Blue Raven file is
  a deliberate rejection, not a performance case.)
- **A privacy tell in the copy, of all places.** The Blue Raven high-rate rejection said
  "*Upload* the low-rate file" — in a tool whose entire promise is that nothing is uploaded.
  Now "Drop the low-rate file instead". Worth a grep in any new copy.
- **Benchmarked the comparison surface against a spreadsheet and found the obvious thing
  missing: you could not copy the table.** Six download buttons and no paste — so a flyer
  putting a launch day into the club sheet, an email or a cert document had to save a CSV,
  find it, open it and copy it, for something a spreadsheet has done since 1985. Both
  surfaces now have **Copy table**, writing `text/html` (a real table, so Sheets, Excel, Word
  and mail clients land it in cells) and `text/plain` (tab-separated) in one clipboard write,
  with a plain fallback and a stated failure when a browser refuses. Added to the single
  flight as well as the comparison so it isn't a one-off on one surface.
- **Found by using the app cold on a phone, which is the only way this one shows up.** The
  column mapper — the first screen for every logger Debrief doesn't auto-detect, i.e. the
  "universal" half of the promise — is a four-column table, and at 390 px the Sample column
  rendered 53 px past the right edge inside a scroller with no sign it was there. The sample
  values are how a flyer tells one column from another, so the one thing the screen exists to
  support was the thing off screen. Below `sm:` each column is now a card (name, its actual
  values, then the two controls) and from `sm:` up it is the same table as before — one set of
  markup, so no control has a second copy of its accessible name in the DOM. The role/unit
  selects were 26 px and are now 44 on a phone. Asserted by a test that fails on the old
  markup with the box coordinates in the message.
- **Fixed on a phone, and it was hiding the one thing the row is for.** A logbook row put the
  file name, the logger badge, top speed, apogee and the date on one flex line; at 390 px the
  name is the only thing that can shrink, so it truncated to nothing and the date and ✕ ran off
  the edge — a launch day's logbook where no flight can be told from another. The name now has
  the line to itself below `sm:` with everything that describes it wrapping under, and the row
  is unchanged on a pointer (`sm:contents` puts the two halves back). While there: the ✎ and ✕
  buttons were 28 px and the header's nav links 29 px, both under the 44 px floor this repo
  already holds itself to — the existing check only ran on `/` with a flight open, where the
  logbook isn't shown, so nothing was measuring them. The check now also runs over `/compare`,
  where the logbook *is* the page, and asserts nothing overflows the viewport.
- Removed a real mechanism for "offline reload fails even though the page is cached": both
  this host and Cloudflare send `Vary: Accept-Encoding` on the shell, and the copies the
  service worker stores are fetched by the worker, whose Accept-Encoding needn't match the
  page's — so a cached shell could be invisible to the navigation it was stored for. Cache
  lookups now pass `ignoreVary`. Stressed 12x by cutting the network the instant the document
  was cached: 12/12 come up and run. (Honest caveat: the one ERR_FAILED that started this was
  seen once and never reproduced on demand, so the mechanism is removed rather than proven
  guilty.)
- CI caught a race my local runs didn't, in an offline spec I had just written: the five
  static routes are precached in *parallel*, so waiting for `/methods/` to land says nothing
  about `/validation/` — cut the network there and the second page falls back to the cached
  root. Passed locally every time, failed on CI twice (including the retry). Third instance
  today of the same test-shaped mistake: **an offline test must wait for every URL it will
  open, not the first one.** Worth a convention if a fourth appears.
- Solved, and it was never the app: three full e2e runs "failed" 39, 45 and 83 of 121 today
  with no code change either side. With traces kept on local failures the answer was one line
  — `net::ERR_CONNECTION_REFUSED`: the dev server had died mid-run. Cause: driving the app by
  hand starts `npx serve` in the background, Playwright's `reuseExistingServer` adopts it
  instead of starting its own, and when that background job is reaped the suite loses its
  server. Three consecutive 121/121 runs once no stray server is around. Lesson for the next
  session: kill any hand-started `serve` before running the suite, and read the trace before
  believing a flake. (Local runs now keep a trace and a screenshot on failure; they used to
  keep neither, since `on-first-retry` never fires with no local retries.)
- Fixed: a batch drop that yields exactly **one** readable flight now carries the note on the
  report itself ("Only one of those 3 files could be read as a flight… Left out: …"), not just
  in the comparison view. It prints with the report but deliberately stays out of the flight's
  own exports, which describe the flight rather than the folder it arrived in.
- Fixed, and the cause wasn't control: the worker DID claim the page (controller=true right
  after `ready`), but on a first visit the shell, chunks and CSS are all fetched before it
  exists, so it never saw those requests — the cache held one entry (the precached sample)
  and an offline reload had nothing to serve. Debrief needed TWO online visits to work
  offline, against a promise of one. The page now hands the worker the same-origin resources
  it actually loaded (from the Performance API, so no manifest to drift against hashed chunk
  names) and the cache fills to 18 entries in ~200 ms. Both PWA e2e specs had encoded the bug
  as a workaround (`await page.reload()` "so the worker caches the shell"), which is why they
  passed; the new spec does one visit only, and fails without the fix.
- Fixed: offline, a route never visited used to fall back to the cached `/` — the app came up
  but showed the home page at the /methods/ URL. All four static routes are precached on
  install (their URLs are stable across builds, unlike the hashed chunks), so the methods and
  validation pages now come up offline as themselves; verified by visiting them with no signal
  in a browser that had never opened them. Install also fetches each precache entry
  individually now, where `addAll` would have lost the sample flight to one moved document.

- Three e2e selector clashes this run came from adding the same phrase to the page's own
  how-to copy that a test used to target a control (`per quantity`, `Show the samples`).
  Worth a convention: target controls by role/summary, never by a bare phrase.
- Checked, and this was stale: the only `waitForTimeout` left in the suite is worker.spec's
  poll interval inside a "hold the invariant open for 6 s" loop, which is a deliberate poll
  rather than a race. No spec waits a fixed time for something to settle any more.

- Columns can now be put in a deliberate order (◀ ▶ per column, buttons rather than drag
  handles so a thumb and a keyboard both reach them); ordering by a metric and ordering by hand
  take over from each other, and both feed the chart legend and every export. Filtering is
  still absent and now looks like the wrong idea at this size: the comparison caps at six
  flights, so there is nothing to filter — what a bigger set would need is picking WHICH six
  from the logbook, which the logbook's own search now does.
- Links inside prose stay 16–20 px tall on a phone, which is right — but check the few
  that act as navigation without living in a `<nav>` (the "Read the methods →" call to
  action, say) and move them into one.

## Hardening

- **DONE — two e2e tests asserted they had navigated using a heading that exists on the page they
  navigated FROM.** The report screen renders its own "Where the numbers come from" card
  (`components/MethodsPointer.tsx:16`), and both Back-to-the-report tests used that heading as
  proof they had reached `/methods/`. It matched instantly, before the click had navigated at all,
  so the `goBack()` after it unwound the wrong history entry and left the page on `/` — or on
  `about:blank`, measured. Reproduced under `CI=1` (one worker, one retry): **flaky in 3 of 5
  runs**, and it took PR #36's CI red where the identical code had gone green the run before. The
  repo had already met this twice and misread it both times — the deadline was raised to 20 s and
  a comment recorded the cause as re-analysis outrunning the clock, which is why the runs that
  "passed" took 29 s. They wait on the ADDRESS now: 5 of 5 clean, in 5 s.

- **`analyze.spec.ts:1116` ("a flight dropped anywhere is read") is flaky under `CI=1`** — seen
  once in a full single-worker run, passing on the retry. Not yet diagnosed; it drops three files
  through synthetic `DragEvent`s and asserts the logbook holds exactly those three, so a save that
  has not landed when the last assertion reads IndexedDB is the obvious suspect. The Back-to-report
  flake above turned out to be a real defect in the test's precondition rather than a timing
  wobble, so this one deserves the same treatment rather than a raised timeout.

- **DONE — a dropped FOLDER could not be read at all, on the gesture the ingest layer is named for.**
  `components/useWindowFileDrop.ts:75` reads only `dataTransfer.files`; nothing in the repo calls
  `webkitGetAsEntry()` or `dataTransfer.items`, and no file input sets `webkitdirectory`. The
  methods page tells flyers to "drop a launch day's folder at once" and `lib/ingest.ts` is written
  around what a dropped folder means, but the drop yields one unreadable directory entry and the
  app blames the folder for not being a flight log. Verified by search; not yet driven in a browser.

- **The uPlot instance is destroyed and rebuilt on changes that are not the data.**
  `components/Chart.tsx:374` — the effect whose cleanup calls `plot.destroy()` depends on `series`,
  `markers` and `fmt` among others, so sorting the table, moving a column, toggling an event chip or
  switching channels tears the chart down and builds a new one. On a long log that is the whole
  render cost paid for a UI change that moved no samples.


- **DONE — three of the six waits said "Reading the file…", and a failure was never announced.**
  `phase:'loading'` was entered six times and only three carried a file name. One of the silent ones
  is now the path a **reload and a Back** take, because a report has an address — and coming back
  means parsing and analysing the flight again, six seconds on a phone with an 11 MB log. An unnamed
  six-second wait reads as stuck and gets tapped again. The reopen names the flight (and the logbook
  read before it), and a batch drop says how many files and how much rather than "the file". The
  error banner gained `role="alert"`: it replaces a status line a screen reader was following, so
  arriving silently meant the wait simply stopped with nothing said.

- **DONE — `worker.spec.ts`'s big-log test raced its own precondition.** It dispatched the second
  drop on `[aria-label="Flight log drop zone"]`, which is on screen only while the app is idle or
  loading — so whenever the 200,000-row analysis finished first there was nothing to dispatch on and
  it timed out at 30 s waiting for an element that had correctly gone away. It failed in three of
  five full runs once the suite got slower. It no longer needs the element (a drop anywhere is read
  now) and dispatches on `body`, after waiting for the "Reading …" status — which is what makes it
  test what its name says: the second drop must land while the first analysis is still running.

- **DONE — the logbook forgot flights and said nothing.** `saveRecent`'s prune keeps every noted
  flight plus the most recent `MAX = 12` un-noted ones, and it runs on every save. Measured: drop 15
  distinct flights and the logbook holds **12** — `flight-01`, `-02` and `-03` gone, named nowhere on
  the page. A launch day's folder is six files, so **two launch days fill the window and the third
  eats the first**, which is precisely the "season worth comparing" the manual says to design for. The
  escape hatch already existed (a noted flight is kept) but was one grey sentence at the FOOT of the
  list, in the past tense, and never stated the number. Now: the heading carries `n/12 un-noted`
  (amber within two of full), a save that prunes names what it dropped with the action that would have
  kept it, and `UNNOTED_MAX` is exported so the copy cannot drift from the code. Verified end to end —
  noting the oldest flight freed its slot AND carried it through twelve more drops.
  **Still open:** the window is a COUNT, and what it is really bounding is bytes — twelve 11 MB
  Blue Raven logs is 130 MB of IndexedDB on a phone, while twelve Eggtimer logs is under a megabyte.
  A byte-budgeted window would keep far more of a typical season for the same storage.

- **DONE — offline, every address Debrief itself generates fell through to "not available
  offline".** The service worker looked a navigation up with `caches.match(request)`, keyed on the
  whole URL including its query. The site is a static export — one document per route, and the query
  is read after the app boots — so a cached `/compare/` was invisible to `/compare/?ids=…&u=i`, which
  is the permalink the app offers as *"give this comparison an address"*. Measured after one online
  visit, network cut: `/compare/` **200, real page**; `/compare/?ids=abc,def&u=i` **503, fallback**;
  `/?u=m` **503**; `/?open=xyz` **503**; `/methods/` **200**; `/methods/?x=1` **503**. Every one of
  those is an address a flyer arrives by — a bookmarked comparison, a shared link, a flight opened
  from the compare surface — and the headline promise is that one visit with signal is enough.
  Navigations are keyed on the route now, on the way in as well as out, so three distinct permalinks
  leave **one** cached `/compare/` document rather than four. A route that genuinely isn't cached
  still gets the honest 503, which the fix was checked not to break.

- **The RSC payloads accumulate one cache entry per build-buster.** Noticed while measuring the
  above: after three visits the cache held `/compare/index.txt` plus **three**
  `/compare/index.txt?_rsc=…` copies of the same payload. The lookup already strips the buster
  (`stripRscBuster`), but the store doesn't, so each new `_rsc` value adds an entry that nothing will
  ever match by that name. Same shape as the navigation bug and the same one-line fix; left alone
  here because a payload is small and this run's change was scoped to documents, where the failure
  was user-visible.

- **The 44 px touch floor is never exercised by any test that measures a phone layout.**
  `playwright.config.ts:66-71` defines exactly one project, `devices['Desktop Chrome']`, which is
  `hasTouch: false` — so `@media (pointer: coarse)` (`app/globals.css:40`, the rule that sets
  `min-height: 44px` on every button, select, `a[download]` and `[role=button]`) is **off**.
  `e2e/touch.spec.ts:11` opts in with `test.use({ hasTouch: true })`, but `e2e/responsive.spec.ts:12`
  — the suite that checks the 360 px phone layout fits — does not. So every "fits the viewport"
  assertion measures controls at their desktop height, i.e. a layout no phone ever gets, and a
  regression that breaks the touch floor passes green. Adding `hasTouch: true` to responsive.spec.ts
  is the one-line version; a second Playwright project is the thorough one.
- **The e2e suite flakes under CPU contention and its failures read like real regressions.** On this
  4-core box, running the suite while a 3-agent fan-out was live (load average ~8) failed
  `e2e/analyze.spec.ts:575 "the wait says what it is reading"` and
  `e2e/touch.spec.ts:35 "a two-finger pinch zooms the chart"`; both pass in isolation and both passed
  172/172 twice on an idle box. Both are timing-sensitive (a loading-state assertion and a gesture).
  Do not run the gate concurrently with a fan-out, and do not read a failure under load as a finding
  without re-running it quiet.

- **The offline docs test went red on CI again, and this time the cause is closed with a test
  that fails without the fix.** Same shape as the four before it: `/methods/` came up offline
  as `app/error.tsx`. The diagnosis from the last pass was right — a route whose JS chunk
  isn't cached hydrates into the App Router's error boundary, so a document that cached
  perfectly still shows "Something went sideways" — but the *fix* was to prefetch the docs
  links on render, which only moves the race: the chunks reach the cache if a prefetch
  finishes before the network is cut, and on CI it sometimes doesn't. **The worker now reads
  each precached document for the `/_next/…` assets it names and caches those in the same
  install.** Read out of the HTML, not from a build manifest: the names are content-hashed
  and change every deploy, and a manifest is a second list to drift. Measured both ways —
  with the extraction disabled, **7 of the assets `/methods/` names are missing from the
  cache** after install; with it, zero. That is the race, and the new test sees it.

- **A green e2e suite had a one-in-twenty flake in it, and it was the test's own bug.** "The
  wait says what it is reading" holds the sample fetch open with a route handler that sleeps,
  then called `page.unroute` while that handler was still sleeping — Playwright hands the route
  back to itself, and the handler's `route.continue()` then throws "Route is already handled".
  Caught on a full run, reproduced by reading rather than by repeating (six repeats after the
  fix, all green). The unroute did nothing the handler's own timer wasn't already doing, so it
  is gone. Fifth instance of the same shape: **an e2e failure that looks like flake is usually
  a precondition the test got wrong.**

- **The screen and the saved report can no longer disagree about which readings exist.**
  Six readings — avg acceleration, thrust-to-weight, coast efficiency, peak roll rate,
  revolutions, battery low — were on the page and in no export, and that was possible
  only because the two lists (`MetricGrid`'s tiles and `report.ts`'s `headlineRows`) could
  be compared solely by reading both side by side. The tile list now lives in `lib/readings`
  as data, `headlineRows` is exported, and `lib/readings.test.ts` runs a flight carrying
  *every* metric through both and fails on any label one has and the other doesn't. The
  deliberate differences — time to apogee, the transonic/supersonic sentence, landing
  energy, the deploy and ejection checks, all of them prose rather than a number under a
  label — are an explicit allow-list, and a further test asserts each entry is still a row
  the code really produces, so the exceptions can't quietly go stale. Also covered: no
  duplicate labels in either list (the label is the key the show/hide choice is stored
  under, so a repeat would make one reading control another), the same figure in both, and
  a sparse GPS-only flight dropping the same readings from both.
  **Not** the unification "The saved report was missing six readings the screen shows"
  (Craft & product feel) asks for — the two lists still exist, because
  merging them is a set of product decisions (does a report keep "Time to apogee" as its
  own row when the tile already carries it as a sub-line?) rather than a refactor. This is
  the guard that makes the drift impossible while those decisions wait.
- **Swept the degenerate inputs and found nothing wrong — recording it so the next pass
  doesn't re-sweep.** A zero-byte file, a header row with no data, a binary file renamed
  `.csv`, and a note-to-self in a `.txt` each produce their own specific message ("That file
  is empty", "There's no flight data in this file"); a single row of numbers goes to the
  mapper rather than being rejected; none of them throws. (I briefly believed the empty file
  failed silently — it doesn't, my instrumentation truncated the page text before the error
  panel.) All five are an e2e regression now, which is what was actually missing.

## Benchmarked against the mature tools

- **Printing the comparison: 31 interactive controls come out on paper.** Benchmarked against the
  thing every vendor tool and every spreadsheet can do — print a clean sheet you can staple into a
  cert package. Debrief's comparison does print, and the caption and notes a flyer typed make it
  onto the page (measured: both present in the printed DOM). What comes with them, measured under
  `emulateMedia({ media: 'print' })` on a three-flight comparison with real client rects rather
  than a `display` check, is **31 buttons and 2 form fields**: a "← Compare other flights"
  navigation control, and a `▼` sort caret beside every one of the twelve metric names. Only the
  column-move `◀ ▶` arrows carry `print:hidden`. That is what a mature tool's print output has
  that ours does not — a stylesheet that knows the difference between a control and a number.
  **Not established, and worth measuring properly first:** whether the 1232 px table clips on A4.
  The first probe compared the print-media layout width against A4's 680 px content width and
  looked damning, but that measurement was taken at a 1280 px SCREEN viewport — Chrome reflows to
  the paper width when it actually prints, so the comparison was meaningless. The generated PDF is
  2 pages; its text could not be extracted (subset font encodings) to check which columns survived.
  Measure by rendering the PDF to an image, or by driving a real print at the paper viewport.

- **OpenRocket's data export against Debrief's, and theirs has three things ours doesn't.**
  Benchmarked the report's `Save .csv` (`analyzedDataCsv`) against OpenRocket's *Export data*
  tab ([user guide](https://openrocket.readthedocs.io/en/latest/user_guide/advanced_flight_simulation.html)).
  Debrief wins on breadth of what lands in the file — every recorded channel plus the six
  derived curves, in the displayed unit, in one export, with the recorded labels quoted and
  defanged. What OpenRocket has that we don't:
  1. **Column selection.** Theirs picks which of 50+ values go into the file. Ours writes all
     of them, always. The report already has a readings chooser and a figures chooser; the
     data CSV has neither, which is the North Star's "pull exactly the tables you need" going
     unmet on the one export a flyer takes into a spreadsheet.
  2. **A field separator you can choose** — comma, semicolon, space or tab. Ours is comma-only,
     and this is not a preference: the corpus itself holds semicolon-delimited European
     exports (an Eggtimer and an RRC3) that Debrief *reads* correctly. A flyer in a
     comma-decimal locale opens our export in Excel and gets one column. Reading a locale we
     cannot write is asymmetric in the wrong direction.
  3. **An optional comments block** carrying field descriptions and the flight events. Ours
     writes a bare header row; the flyer's own report label and notes, and the events Debrief
     detected, don't ride along, so a CSV opened a month later doesn't say which flight it is.
  All three are one increment's worth of work on `analyzedDataCsv` plus the compare chart-data
  CSV and the copy-table path — every CSV writer has to move together, or one export disagrees
  with another about what a decimal point is.

Where AltosUI, the vendor apps and Excel still do a job better than Debrief does:

- **Benchmarked the explorer against OpenRocket's Plot Data tab** (from its own docs, not
  memory). Debrief already matches it on the thing that matters most — several channels on
  one plot with a left and a right axis — and beats it on saved views, which OpenRocket
  doesn't have. Two gaps, both about the first thirty seconds rather than the tenth use:
  **(1) "standard plots"** — OpenRocket ships quick-select preset configurations, so a new
  user gets a useful plot before knowing what to ask for; Debrief's named views are all
  flyer-made, so the explorer opens on whatever it opened on last and a first-time visitor
  builds from scratch. **Done** — see below.
  **(2) choosing which flight events are called out on the plot** — OpenRocket lets you pick;
  Debrief draws all of them, which crowds the boost on a flight with four events in six
  seconds. **Done** — see below. Both halves of this benchmark are now closed.

- **Closed the "standard plots" half of the OpenRocket benchmark, and the corpus decided what
  they could honestly be.** Four built-in views, there on the first visit: *Altitude & speed*,
  *Speed & acceleration*, *Mach & max-Q*, *Raw vs cleaned*. **They name only Debrief's own
  derived channels, never a recorded one** — a recorded channel is stored by its logger's
  label, so a built-in written against `Batt(V)` would be right for one device and silently
  wrong for the next. Measured over the 34 analysable corpus flights, which is what set the
  four: altitude, raw altitude and velocity on **34/34**; Mach and dynamic pressure on
  **30/34** (both withheld when the velocity is judged impossible); a measured acceleration on
  **16/34**. **The rule is all-or-nothing:** a view appears only where the flight has *every*
  channel it names, because a "Speed & acceleration" that quietly drops the acceleration on a
  baro-only log is a different plot under a name that promises two — asserted end-to-end
  against a PerfectFlite PNut, which is offered three of the four. A flyer's own saved view of
  the same name wins, so re-saving is how you replace one.
  **Caught while wiring it up, and it was a real ambiguity rather than a test problem:** the
  velocity/acceleration view was first called "Boost", which is *already* the chart's zoom
  preset framing liftoff to burnout — the page had two different buttons reading "Boost" a few
  centimetres apart. A view names *which channels*; the zoom row names *when*. One word cannot
  mean both, and a test now holds the two vocabularies apart.
  **Still open from this:** a *speed vs height* view (x is not time) — the explorer supports
  any channel on x and no built-in uses it yet.

- **Benchmarked the recovery view against AltosUI and shipped the gap: KML for Google
  Earth.** Read AltosUI's own documentation rather than going from memory. Two things it has
  that Debrief didn't: an adjustable smoothing control on the baro-derived speed/acceleration
  ("a larger value smooths the data more"), and a **KML export**. The second shipped — Debrief
  already carries lat, lon and altitude on the same time base, and a GPX track says where the
  rocket went on the ground while KML says where it went full stop: `relativeToGround`
  altitudes and `extrude`, so Google Earth draws the trajectory in the air over the actual
  field with a wall under it. Written from the published KML 2.2 schema (OGC 07-147r2). The
  trap it is tested against is `lon,lat,alt` ordering — the reverse of every other coordinate
  in this app, and a swap puts a Mojave launch in the Indian Ocean while still opening fine.
  **Still open from the same benchmark:** the smoothing window is fixed and not exposed. It is
  a real question whether it should be — a control that changes the numbers is not the same
  kind of control as one that changes the view, and a flyer who can tune the filter until the
  apogee reads how they'd like is being handed a way to fool themselves. Worth a deliberate
  decision rather than a copy of AltosUI.

- **Done: per-column sort in the sample table.** Click a column for highest-first, again for
  lowest, a third time back to the recorded order; `aria-sort` on the header so it is
  announced and not merely drawn. It sorts an index list rather than the data, measured at
  7 ms for the largest analysable corpus file (36,701 rows) and 56 ms for 200,000. Not
  decoration on a time series: sorting altitude descending is the direct way to tell a real
  apogee from a one-sample spike, which is exactly the Jolly Logic case the validation page
  now works through. **And each column copies on its own** (the ⧉ beside its name), writing
  the rows in the current window in the order the table is showing them — the whole set was
  always a CSV away, but "save it, find it, open it, delete the other columns" is the
  workflow this table exists to replace. **Still missing next to a spreadsheet:** selecting a
  range of cells; the two granularities that exist are a whole row (text selection) and a
  whole column.

- Done: **named view presets.** Up to 8 views kept under names you choose, applied on any
  flight that has those channels (stored by channel label, so they survive moving between
  loggers). Re-saving a name updates it. Next in the same machinery: the report/export builder
  wants exactly this shape for "which tables and plots go in my document", and a preset can't
  yet be exported or shared — it lives in this browser only.

- **Per-quantity units.** Debrief has one feet/metres switch (acceleration is always g,
  pressure follows the system). AltosUI lets you choose the unit for each quantity, and a
  cert document may want mph or km/h for speed and °C for temperature regardless. North
  Star #2 asks for exactly this.
- **A raw sample table** — done, in the explorer, and *jump to an event* is done too: a row of
  buttons scrolls straight to liftoff, burnout, apogee or a deployment and highlights the
  sample landed on (it places the event on whatever is on the x axis, so it works on an
  altitude-vs-velocity plot as well as against time). Per-column sort is done since (above).
  Still missing next to a spreadsheet: cell/column selection — only whole-row text selection
  works, so copying one channel out means the CSV export.
- **DONE (2026-07-30) — a per-device flight list.** The report lists every flight in a
  multi-flight download and reads any of them on a click, and a flyer can crop any record by
  hand. Read against what this entry actually asked for, though, the parity is on the REPORT
  and not in the logbook: the logbook is still keyed on files, so a launch day is one row
  carrying the FILE's apogee whichever flight is on screen, and a comparison built from ids
  re-reads each flight whole. That half is D3's starting point — see the two entries at the
  top of this section. Original entry:
  The vendor apps read several flights off one device and let you pick between them; Debrief's
  logbook is close but is keyed on files, not flights from one download session.
- Found by driving a season into the logbook: it sorts but couldn't be *searched* — now it
  can (name, logger, note, launch day; all terms in any order), and the row shows the launch
  day the file stated rather than "3d ago". Three parsers read a date (AltOS and a
  Featherweight GPS state a GPS's UTC; a Blue Raven states its own clock); 12 of 28 corpus
  files and 3 of 5 fixtures carry one. The **column mapper couldn't carry a date at all** — a
  generic CSV with Year/Month/Day columns lost them, because there was no date role. Done
  since; see Feature depth.
- A corpus TeleMetrum states 27 Apr 2013 for a flight the ISSUIUC repo files under 2023-10-01
  — a decade out, on all 4,118 rows. Debrief reports what the file says (that's the device's
  own record, and the reason the label names whose clock it is), but it's worth knowing the
  stated date can be wrong when anything downstream is tempted to trust it: don't use it to
  group a launch day, dedupe, or order a stage assembly.

## Feature depth

- **A named Rocketry Ltd Mercury / AltimeterCloud parser — the seventh recognized logger.** It
  was the last corpus family Debrief read *well* but still made the flyer map by hand: five
  public flight-page exports, apogee agreeing with the device's own summary to 0.0%. Two
  header flavours in the wild, both covered (`Time(ms),Altitude(m),Velocity(m/s),…,Board
  temp(C)` after a settings block, and a columns-first
  `time(ms),altitude(m),velocity_pressure(m/s),…,bmp_temp(x100)`). The parser earns its place
  on more than detection: **`bmp_temp(x100)` is centi-degrees**, so the mapper read 2,708 °C
  and the analysis discarded it — those flights had no ground temperature and no speed of
  sound derived from one. They read 26.4–35.1 °C now, and the before/after is a test. The
  Euler angles and the unstated gyro axes are deliberately left out (see the roll-rate entry
  above), and `apogee_prediction` is left out because a prediction is not a measurement and
  has no business in a flight Debrief reads. Apogee is byte-identical before and after —
  the parser changes what is *recognised* and what is *recovered*, not the read.

- **Second slice of the report & export builder: the flyer picks the figures.** The first
  slice gave them the readings; this gives them the plots. Every figure the flight supports
  is still drawn on screen — that is the analysis — but which ones travel into the
  self-contained HTML, the bundle and *Save .svg* is a choice now, stored the same way as
  the readings (as what is turned OFF, so a figure a flight gains later appears rather than
  being excluded by a list written before it existed). The data exports are untouched on
  purpose. **Still missing from North Star #2:** colour and layout control, reordering the
  single-flight readings (still blocked on unifying the two reading lists), and the builder
  as a surface of its own rather than two controls on the report.

- **The logbook was keeping the file and throwing away the answer.** Found while adding an
  affordance and turned out to be the deeper bug under it: a flight Debrief doesn't
  auto-detect is only a flight because the flyer said which column was which, and that
  mapping was never stored. Reopening the flight from the logbook asked for it again from
  scratch, and `compareFromLogbook` skipped the flight outright with "needs its columns
  mapped, which a comparison can't do" — a limitation the code documented rather than fixed.
  The mapping now rides with the flight (`RecentFlight.mapping`, validated on import like
  `flownAt`, and carried in a logbook backup), and one shared `importRecent` puts the text and
  the mapping back together, so every surface that reopens a flight gets the same one.
  **On top of that, the launch-day gap that led here:** a batch drop used to report a file it
  couldn't auto-detect as left out, telling the flyer to open it on its own — which means
  starting the launch day over and losing the comparison already on screen. The comparison
  offers each one by name now, and a mapped file rejoins it at its own address. **A defect
  this introduced and the suite caught:** a note-to-self `.txt` reaches the mapper too, so it
  was offered as mappable and led to a dead end; the mapper's own "is there anything here to
  map" test is now one shared rule (`hasMappableColumns`) that both surfaces ask.

- **The column mapper can now carry a launch date — the gap the logbook work left open.** A
  hand-mapped CSV lost the one value that makes a logbook a logbook rather than a recents
  list. The mapper has eight new roles in a "When it flew" group, covering the two shapes real
  loggers actually write: a whole stamp in one cell, or the calendar parts in columns of their
  own with an hour/minute/second or a clock cell beside them. Nothing about them is guessed
  from the header alone — a stamp or clock column is settled by *reading the cells*, because
  "Time" is a wall clock in one file and elapsed seconds in the next. **The evidence it is
  right:** run the detector blind over the corpus and it independently reproduces every date
  the named parsers hand-code — 8 AltOS files as year/month/day/hour/minute/second, 6 Blue
  Ravens as Year/Month/Day + a clock, 3 Featherweight GPS files as a stated stamp — and steals
  no channel from anything else (all 67 corpus fixtures unmoved). Three committed fixtures now
  assert the stamp twice, once through the named parser and once through the generic path.
  **Two things it turned up:** a calendar `Second` column was winning the elapsed-time role and
  blocking the real one (a whole flight lost to a naming clash — the time base is handed back
  now, unless there is no other candidate); and a Featherweight GPS's `UNIXTIME` matched no
  time test at all, because `\btime\b` has no boundary inside it. **The honesty line:** a
  mapped date is the *logger's* clock unless the cell itself says UTC — a mapping carries no
  format Debrief knows, and promoting it to UTC would move an evening launch to the wrong day.
  **Still open:** a `date`/`timeOfDay` column can't yet serve as the *time base*, so a file
  whose only clock is a wall clock still can't be analysed at all (a Featherweight GPS export
  is exactly that shape, and only its `UNIXTIME` column rescues it).

- **First slice of the report & export builder shipped: the flyer picks the readings.** Every
  report format (screen, .txt, .md, .html, bundle) now reads its rows through one filter, and
  a chooser under the tiles turns them on and off — stored as what is turned OFF, so a reading
  a flight gains later (a roll-rate channel, a GPS apogee) appears rather than being silently
  excluded by a list written before it existed. Apogee is not removable. The data exports
  (.csv series, structured .json) deliberately stay complete: `debrief.flight/1` is a contract,
  and trimming it would break a consumer rather than shorten a document. **Still missing from
  North Star #2:** the flyer can't reorder the readings, pick WHICH figures go in the bundle,
  or choose colours/layout — though the comparison's readings can now be **reordered**, and
  the order follows into its table, its clipboard copy and every export. Ordering is
  deliberately NOT offered on the single-flight report: it is a grid of tiles beside an
  export table that carries readings the tiles don't (time to apogee, landing energy, an
  ejection delay), so an order made against one list has no exact meaning in the other —
  every rule tried for carrying it across (send unnamed readings to the back; anchor each to
  its nearest named neighbour) moved things a flyer didn't ask to move. Unifying those two
  lists is what would unblock it. **The comparison shares the show/hide half** — same component, same stored
  choice, so "what do I care about?" is answered once rather than once per surface, and the
  comparison's Markdown/HTML/bundle follow it like the flight report's do.
- **Done for the comparison: `/compare` is its own route.** A set of flights is now named
  in the address (`?ids=…`, logbook keys — not flight data, which never leaves the device),
  so a comparison survives a reload, can be bookmarked, and can sit in a second tab beside
  one flight's report; back/forward move between the picker and the comparison. The logbook
  is the picker, and both surfaces share one `useLogbook` so a note added on either shows on
  both. Dropping several files at once still compares them in place on `/`, because that
  path carries things the logbook cannot: a device's own summary file paired with its log,
  and per-file skip reasons for anything unreadable — but it now offers **“Give this comparison
  an address”**, since the dropped flights went into the logbook on the way in and
  `saveRecent` returns the id it stored them under. **Next in the same direction:** give the
  report & export builder its own route when it lands.
- **Done, and it turned up an invariant gap I had introduced myself.** Each surface now
  describes itself in the header rather than both saying "drop in a flight log… and read the
  flight" — but the real find was that `/compare`, a surface I added today that shows a table
  full of figures, did **not** carry the "measurement instrument, not a simulator" statement.
  That line is the basis on which every number here can be trusted, and it was living on the
  home page as if it were a footnote. It is a shared component now, on both surfaces, with a
  test that walks every surface showing numbers and requires it. Worth re-running that test's
  logic by hand whenever a surface is added.
- No report/export builder yet: a table & plot picker with unit/colour/theme control and
  multi-format export in one place (North Star #2).
- Per-stage assembly (a staged flight logging each stage on its own device) isn't built;
  same-flight reconciliation handles redundant altimeters only.
