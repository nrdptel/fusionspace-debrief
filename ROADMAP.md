# Debrief — Product Roadmap

**This file is the work queue.** `BACKLOG.md` is a defect ledger — its own header says so: *"Not a
roadmap; a memory."* It is right about that, and for a long time nothing else was the roadmap. What
Debrief still cannot DO lives here.

Read this at session start, alongside `HANDOFF.md`, `DESIGN.md` and `COMPETITION.md`. See *Each pass*
in `MAINTAINING.md` for how defect work preempts a milestone (Sev-1 only).

## Two tracks, and a run ships from both

**The queue has two tracks, and they alternate.** This replaced a single capability-only queue on
2026-07-30, for a measured reason: the D-track shipped three milestones and started a fourth, and the
app still read as one long scrolling page assembled from **fifty components with no shared primitive
layer at all** — zero cross-component imports, twelve card treatments, and `text-xs` used 212 times
against `text-sm` 82, which puts most decision-grade numbers at caption size. Capability was never the
bottleneck. **What a flyer can do** and **what the tool feels like to use** are different work, and a
queue containing only the first can only ever ship the first.

- **D-track — capability.** What a flyer can DO that they could not before. D1–D5 shipped; D6 is next
  and is decomposed below.
- **P-track — product and craft.** What makes it a tool a stranger picks up, trusts, and keeps using:
  shape, design system, first run, form factor, documentation, discoverability.

**A run takes the next unstarted milestone from EACH track, and ships both.** Not one or the other.
Start with whichever is smaller so something lands early, then take the other. If a run has time for
only one, take the P-track milestone — the D-track has momentum and the P-track has none, and that
imbalance is the thing being corrected.

A milestone from either track is finished when **a flyer can do the thing, or see the difference** —
not when the code exists. Within a track, do not skip ahead: each is a prerequisite for the next.

**This file is the run's only state.** The prompt is deliberately stateless — it says "the next
unstarted milestone", never a number — because the same prompt is run for a week or two unattended and
a prompt naming D1 is wrong the day D1 ships. The `Status:` lines are the baton. Update them in the
same commit as the work, never in a later one.

**Status vocabulary**, and nothing else: `NOT STARTED` · `IN PROGRESS` · `SHIPPED <date> — <pinning
check>`. A milestone may only be marked `SHIPPED` once an automated check exists that fails if the
capability regresses; name that check on the status line. That is what stops one run believing a
milestone is done and the next redoing it. Where a *done when* genuinely cannot be automated, mark it
`SHIPPED <date> — NOT PINNED` with the reason, so the gap is visible rather than implied.

---

## Read this before scoping anything

**Debrief is further along than a first look suggests, and the obvious "biggest gap" is the wrong one
to start on.** That is not an opinion — this ordering was drafted the obvious way, then refuted by two
independent adversarial reviews that measured the code. What follows is what survived.

### What is genuinely strong

- **Ingestion is well advanced.** Ten named parsers (`lib/parsers/`: Altus Metrum, Blue Raven,
  Eggtimer, Entacore AIM, Featherweight FIP and GPS, MissileWorks RRC3, PerfectFlite, Altimeter
  Cloud …) plus a generic CSV/spreadsheet column-mapper with saved, reusable templates
  (`lib/mappingTemplates.ts`).
- **Same-flight reconciliation is already TESTED against real redundant recordings** — the corpus
  suite carries `same-flight reconciliation (redundant recordings agree)` cases over
  `iss-irec2023: EasyMega + TeleMega` and `ac-lilnuke: four AltimeterCloud recordings`, and a case for
  a file that holds one flight twice. Those run only in CI, where the corpus is fetched.
- **Cross-checking is sophisticated, not a badge.** `lib/crossPeak.ts` judges agreement on *time* as
  well as value, precisely so a GPS whose altitude solution lags the flight cannot peak 34 s late
  under drogue and be reported as corroborating the barometer to 3%.
- **Multi-sensor within one file is modelled correctly.** `altitudeInertial` and `altitudeGps` sit
  beside the barometric channel and are explicitly *never merged into it* (`lib/flight/types.ts`).
- **Cross-file assembly already exists.** `pairSummaries` (`lib/ingest.ts:88`) matches a device-summary
  file to a flight-log file by rocket name and carries its `reported[]`, notes and `flownAt` onto that
  flight; the pairing persists (`lib/recents.ts`) and is re-applied on reopen (`lib/reopen.ts:44`). Two
  dropped files routinely make one flight. Do not write "one file = one flight" — it is false.
- **A shared timeline for several recordings exists.** `buildComparison` (`lib/compare.ts:108`) puts
  N recordings on one 800-point grid with agreement spreads and `mixedSource` / `saturated` /
  `partialLeg` caveats. Read against the North Star's own words — *"onto one common timeline … side by
  side as cross-checks, never blended"* — that clause is substantially delivered.
- **Report output is most of the way there.** `lib/reportProfile.ts` lets a flyer pick which readings
  appear — stored as what is turned OFF, so a new reading appears rather than being silently excluded
  by a list written before it existed — and that follows into the text, Markdown and HTML reports and
  the bundle. Column order and hidden figures persist. Data leaves as CSV and JSON.

### What the last runs actually shipped

Of the last 40 commits on `main`: **25 correctness, 6 docs/process, 5 new capability, 2 craft, 2
tests** — and **4 of those 5 capability commits are two-clause subjects whose second clause is itself
a correction**. `BACKLOG.md` holds **212 entries, of which 0 propose a capability.** So features do
land here, unlike in a repo that ships none — they land as small affordances on existing surfaces, in
whatever order a defect sweep surfaced them, while both North Star ambitions' headline items sit
still.

### The Sev-1 that preempted all of this — fixed 2026-07-30

**`nextFlightStart` mis-read any launch-day file whose flights differ by more than 2× in apogee, and
printed the result with no caveat.** The cliff was exactly 2.00×, in both directions, and past it a
`[300, 3000]` day reported apogee 1,671 m, time-to-apogee 45.1 s, burn time 27.8 s and flight time
156.5 s against a first flight that flew to 204 m in 7.0 s and was down in 20.6 s — with **one**
warning on screen, about derived velocity, and nothing at all about the file holding two flights.

Every threshold is measured against the flight in hand now, never against the record's own highest
flight, and the fix turned out to be wider than the one line the entry named: the *ground* band
carried the same defect (5% of the corpus 121 km flight is 3.8 km, so a rocket still that high
counted as landed), and patching the climb threshold alone would have turned real corpus records into
false splits. Pinned by `finds the second flight however far apart the two apogees are` in
`lib/analyze/analyze.test.ts`, over six pairs from 8× to 100× in both directions, plus nine guard tests
for the artefacts a per-flight band exposes: a transonic dip that recovers gradually, a mid-ascent
dropout, post-landing drift, a post-landing spike, a spike between apogee and touchdown, a baseline
that drifts while the flyer waits, a rocket at rest above the pad, a club session of sub-100 m
flights, and 13 m of wobble on a misparsed fragment. Each was falsified by mutation. Corpus: over all
46 records that analyse, 44 byte-identical and 2 moved, both deliberately.

**Three of those nine came from the pre-push review, not from the author**, and two were Sev-1s in the
fix itself — a gradual transonic dip cut a 9,729 m Mach flight down to a 390 m "flight", and a
baseline that drifted while the flyer waited between launches put the original Sev-1 straight back.
The review also caught that the calibration sweep had been run over 34 records when 46 analyse.

---

## D1 — Every flight in one download, and the flyer says which is theirs

**Status:** SHIPPED 2026-07-30 — pinned by `a launch day gives up every flight in it, and any of
them can be read` and `a flyer can say which stretch of a record is their flight, and the analysis
reads it` (both `e2e/analyze.spec.ts`, both walking the real app), `says so when it read a record
as one flight that does not look like one` (`lib/analyze/analyze.test.ts`), and a whole-corpus
invariant that the refusal fires on none of the 46 records that analyse.

**What a flyer can do that they could not before:** drop a launch-day download, see every flight
in it, open any of them, and — on any record at all — say which stretch is theirs and have the
analysis read that instead. The stretch is remembered, so coming back to the flight comes back to
the flight.

**Each clause of the *done when*, and the check that pins it:**

- *see every flight it contains* — `FlightAnalysis.segments` lists them with each apogee on the
  file's own datum. `lists every flight in the download, not just the one it read`, and the corpus
  suite pins the count on the Eggtimer anomaly.
- *open any of them* — a strip above the readings, and the report re-reads without leaving the
  page. `a launch day gives up every flight in it, and any of them can be read` (e2e, including
  the 44 px touch floor and an axe audit).
- *select a stretch and say "this is my flight"* — the chart is the selector, the two boxes are
  the same choice typed. `a flyer can say which stretch of a record is their flight, and the
  analysis reads it` (e2e), plus six unit tests over the crop's own traps — the file's datum, the
  file's pad pressure, the way back out, the list surviving the crop, and a crop that spans a
  boundary saying so.
- *and when a record the tool cannot segment confidently says so* — the trace is counted
  separately from the segmentation, and where the two disagree the report says which. `says so
  when it read a record as one flight that does not look like one`, and a whole-corpus invariant
  that it says it about **none of the 46 records that analyse**.
- *and it is remembered* — the stretch is kept with the flight in the logbook, in seconds on the
  file's own clock rather than sample indices, so a re-parse cannot shift it. The e2e walk crops a
  record, reloads the page, and finds the same stretch still read.

**What this delivered against its *done when*, and what it did not.** All four clauses hold. Three
things it does NOT do, each filed in `BACKLOG.md` rather than left implied: the logbook row still
carries the FILE's apogee whichever flight is on screen; a comparison built from ids re-reads each
flight whole, so a cropped flight joins a comparison uncropped; and two flights to the same height
within 1% in one file are still called "the same flight written twice", which the altitude column
alone cannot settle. **The first two are D3's starting point** — they are both the logbook being
keyed on files where it now needs to be keyed on flights.

**Outcome.** A launch-day download gives up every flight in it, and where the automatic read is
uncertain the flyer can simply say which stretch is theirs.

**Done when** a flyer can drop a file holding several flights, see every flight it contains, open any
of them — and, on any record at all, select a stretch and say "this is my flight", with the analysis
honouring that selection rather than its own segmentation. And when a record the tool cannot segment
confidently says so instead of reading through it.

**Notes.** Today Debrief reads the first flight and tells the flyer to go back to the vendor software
(`lib/analyze/index.ts:630`), which is the parity failure `BACKLOG.md:2377` names: *"The vendor apps
read several flights off one device and let you pick between them; Debrief's logbook is close but is
keyed on files, not flights from one download session."* Zoom exists but is purely visual and never
reaches the analysis, and there is no flyer input into segmentation at all.

**The manual crop is the load-bearing half, and it is first because automation has been refused twice
by measurement** — `BACKLOG.md:1148` (a chooser scored on "which segment looks cleanest" hands the
flyer a documented Eggtimer baro artefact, because the artefact trips zero guards while the real
flight trips one) and `BACKLOG.md:1233`. When the automatic route is twice-refuted on evidence, the
flyer's own say-so stops being a fallback and becomes the route.

**Size.** 5–8 increments.

---

## D2 — Read the file the card actually holds

**Status:** SHIPPED 2026-07-30 — pinned by `an Altus Metrum raw .eeprom download opens into a
report` and `an RRC3 raw .rff download opens, and survives a reload through the logbook` (both
`e2e/raw-download.spec.ts`, both walking the real app), by `altosEeprom.test.ts` and
`missileworksRff.test.ts` measuring every reading against the vendors' own exports of the same
bytes, and by the corpus invariant that the mapped-but-unanalysable set is now **empty** where it
was seven.

**What a flyer can do that they could not before:** pull the card out of an Altus Metrum board or a
MissileWorks RRC3, drop the file their own software downloaded, and read the flight — no CSV export
first. And where Debrief still cannot read a raw download, it says what the file is instead of
telling the flyer their flight log is not a flight log.

**Each clause of the *done when*, and the check that pins it:**

- *the shape has to grow before a binary parser can exist* — `ParseInput` carries the file's bytes
  as well as its text, always, with `importFlight` the single place either is derived from the
  other. Pinned by `a parser is handed the file, not just its text` (`parsers.test.ts`), including
  the case that matters: the bytes handed over are the ones given, never a re-encode of a lossy
  text view.
- *an AltOS `.eeprom`* — three log formats (TeleMetrum v1's 8-byte records off an MP3H6115A, and
  the 32-byte TeleMega/EasyMega family's raw MS5607 conversions). All three corpus downloads have
  AltosUI's own export of the same bytes beside them, and **every pressure matches it**: on the two
  MS5607 boards all 6,820 are IDENTICAL, the arithmetic being integer either side; on the older
  TeleMetrum v1 both sides convert in floating point, none of the 2,206 is bit-identical, and the
  worst disagreement is 0.0035 Pa. Apogee and peak acceleration land inside the tolerances the
  paired CSVs are already held to against a *second altimeter*.
- *an RRC3 `.rff`* — the .NET-serialised `List<Int16>` the mDACS software saves. The file holds
  exactly as many barometer readings as mDACS printed rows for, all 3,541 agree to the last tenth
  of a millibar, and Debrief's read of the raw file is asserted **identical** — not close — to its
  read of that export's pressure column.
- *with the corpus fixtures that currently yield zero columns asserted as read* — the
  stepped-around count is asserted `=== 0`, and the analysed count rose from 37 to 41.

**What this delivered against its *done when*, and what it did not.** Two of the three named logger
families are read. **The Entacore AIM `.bin` and `.xtra` are not, deliberately.** The `.xtra` is a
Boost serialization archive of a C++ object graph and the `.bin` a tagged variable-length flash
stream; the corpus carries a screenshot of that flight and no sample-for-sample ground truth for
either, so a decoder for them could not be measured against anything. Every raw download that *did*
ship came with the vendor's own reading of the same bytes to check against, and that is the bar this
repo sets. What shipped instead is the honest half: those files are now recognised and named —
"this is an Entacore AIM XTRA raw flight file, and Debrief can't read that format yet" — where
before they produced *"Debrief couldn't find any data rows in this file. Is it a flight log
export?"*, which is false about a flight log. **The remaining work is filed in `BACKLOG.md`**: it
needs either the AIM XTRA software's CSV export of one of these exact flights, or Entacore's record
layout. Do not attempt it without one.

**Outcome.** The raw download off an altimeter opens, instead of sending the flyer back to the vendor
software to export a CSV first.

**Done when** a flyer can drop a raw binary download from a logger Debrief already names — an AltOS
`.eeprom`, an Entacore `.bin`/`.xtra`, an RRC3 `.rff` — and get a flight, with the corpus fixtures
that currently yield zero columns asserted as read.

**Notes.** `ParseInput` is `{ name, text }` (`lib/parsers/types.ts:3`), so bytes are structurally
unreachable for *any* parser — the shape has to grow before a binary parser can exist. Seven corpus
fixtures are raw binary the generic mapper reads zero columns from (`lib/parsers/corpus.test.ts:366`),
and three of the named logger families produce them. For the literal "just pulled the SD card"
flyer this is a task that cannot be completed at all — the repo's damage rank 3 — and it ends in the
same dead end as D1's failure mode: go back to the vendor's software. North Star 1 exists to end
exactly that.

**Size.** 4–6 increments.

---

## D3 — One flight can carry several recordings

**Status:** SHIPPED 2026-07-30 — pinned by `two altimeters on one flight are one flight in the
logbook, counted once` (`e2e/analyze.spec.ts`, walking the real app end to end: joining, the
crowns, the report's recording strip, the note, the way back out, and the 44 px touch floor at a
390 px viewport), by `personalBests > over flights, not over files` (`lib/logbook.test.ts`), by
`a document says which recording of the flight it is` (`lib/report.test.ts`, over the text,
Markdown, HTML and JSON exports and their absence on an ordinary flight), and by
`every flight analyses to exactly what it analysed to before` (`lib/parsers/corpus.test.ts`,
50 committed digests over every metric, event and sample of every series).

**What a flyer can do now that they could not before:** tick a primary and a backup log and say
*these are one flight* — one logbook entry, one crown, each recording still openable with its own
reading, the flight reported by whichever recording they choose, and a way back out.

**What that fixed, measured rather than assumed.** Two recordings of one flight broke the
personal-best crowns in both directions at once:

- **Two that agree exactly deleted the crown outright.** `uniqueMaxId` returns null on a tie, so a
  flyer's highest flight lost its ★ for having been recorded twice — and the corpus holds three
  such pairs (an AltOS `.eeprom` beside AltosUI's export of the same bytes, an RRC3 `.rff` beside
  its mDACS text export, two StratoLoggers that both read 465.1 m).
- **Two that disagree crowned one flight twice.** The four AltimeterCloud recordings of
  `ac-lilnuke` read 756.54–756.75 m and 156.9–167.8 m/s; ungrouped, the apogee ★ landed on `1796`
  and the speed ★ on `1785` — two personal bests off one launch that happened once.

A flight now competes on the reading of the recording the flyer NOMINATED, never the best of its
recordings — that would be a best-of dressed as a measurement.

**The Sev-1 this run found and fixed on the way.** `saveRecent`'s replace-in-place carried three
named members forward and the stretch a flyer had cropped was not one of them. Reopening a flight
IS a save, so a crop survived one reload — it was read from storage on the way in and wiped on the
way out — and reverted to the whole file on the second visit, silently, with a launch-day record
back to reporting a flight time that spans two flights. That is D1's *and it is remembered* clause
failing on the second use rather than the first. Reproduced with a walk that reloads twice before
it was touched. Closed structurally: `replaceInPlace` is pure, exported and unit-tested, and a
compile-time check now fails when a member of `RecentFlight` is classified as neither
the file's nor the flyer's. **This is the fourth member that file-by-file rebuild has lost.**

**Outcome.** A flight flown on two altimeters is one flight in the logbook, not two.

**What a flyer can DO after this milestone that they could not before:** keep a two-altimeter
flight as ONE flight — one logbook entry, counted once, with each instrument's own reading still
there and the one they nominate named on the report and in every document they hand in.

**Done when** a flyer opens a primary and a backup log from one flight and gets **one logbook entry**
counted **once** by the personal-best crowns, with each headline reading naming which recording it
came from — while every single-recording flight in the corpus produces byte-identical analysis,
asserted by the corpus suite rather than by eye.

**Notes.** `RawFlight` (`lib/flight/types.ts:61`) carries one `time` and one `channels[]`, and
`RecentMeta` (`lib/recents.ts:9`) is one logbook row per file with one `apogeeM` — so one flight
occupies two rows and is double-counted by the crowns. The pivot is **not** to widen `RawFlight`: it
is to introduce a `Flight` that owns `recordings`, leaving `RawFlight` as exactly what it is — one
recording, one file, one parser — so no parser and no analysis input shape moves. Single-recording
flights must cost nothing, not merely remain possible.

This ranks below D1 and D2 deliberately: it needs the flyer to have two devices *and* both files
already readable, so D2's failure and D1's failure both bite first. The comparison surface already
gives those flyers two correct, individually caveated reads — a real cost in steps, but not a wrong
number.

**How the grouping is stated, and why it is one field.** `RecentMeta.flightId` is optional and
absent on nearly every row. Absent means a flight of its own; equal to the row's own id means this
recording REPORTS the flight; any other id names the recording that does. Keeping "which flight"
and "which recording speaks for it" in one field means the two can never disagree, and a
single-recording flight costs one missing optional member — no wrapper object, no second store,
nothing to migrate. `lib/flightGroups.ts` is the only thing that reads it.

**The grouping is the flyer's statement, never inferred.** That is D6's job and it is deliberately
late, because a wrong automatic merge fabricates one flight out of two. Note for whoever takes D6:
the corpus's `same_flight_group` column is NOT that signal — it conflates three different relations
(independent instruments, the same recording exported into two containers, and different STAGES of
one launch), so reading it as "recordings of one flight" would group a booster with a sustainer.
`iss-sg1.2-20231118` is the negative case: a TeleMega sustainer at 2,113 m beside two StratoLogger
boosters at 465 m.

**What this delivered against its *done when*, and what it did not.** All four clauses hold:
one logbook entry, counted once by the crowns, the readings naming which recording they came
from, and the corpus asserting that no ordinary flight's analysis moved.

On that third clause, read what shipped rather than the words: **the readings are named per
PAGE, not per tile.** A report is of one recording, so every headline figure on it comes from
the same instrument, and the page says which — prominently, above the readings, with the others
one click away, and in every document it exports. Twenty tiles each repeating the same file name
would be noise, and the one reading that genuinely comes from elsewhere already names its own
source (`descentSource === 'second-copy'` prints *"from this file's second copy of the flight"*).
If a future pass ever lets one report take readings from more than one recording, that is when
per-tile labelling earns its place — and the seam is `Tile.sub`.

Three things it did not do. **One is closed since**, and the other two are filed in `BACKLOG.md`:

- ~~The spread between recordings is not on the flight's row.~~ **DONE 2026-07-30** — the row now
  reads *"Recorded 2 times — reported by X · apogee within 0.05%"*, amber past 10%.

  **Apogee alone, and that is a measurement rather than a simplification.** Apogee is
  altitude-sourced on every logger, so two recordings of it carry no measured-versus-derived mix.
  Top speed does not survive the same treatment, and the corpus is emphatic: over the six
  same-flight groups the apogee spread runs 0.03%–2.29% and never higher, while the top-speed
  spread runs 2.56%–**81.65%** — and the two widest, 26.37% on `iss-endurance` and 81.65% on
  `trf-lemiv-l3`, are exactly the two groups pairing a device-MEASURED speed with a DERIVED one.
  Those are documented, correctly-grouped flights, so a row showing that figure would have told
  their owners their grouping was wrong. The logbook stores no `maxVelocitySource` and cannot
  caveat it; the comparison surface, which holds the whole analysis, already does.

  It also says nothing at all when any recording carries a crop, because a cropped recording's
  stored apogee is the CROP's apogee — comparing it with an uncropped one paints the flyer's own
  choice as instrument disagreement. Pinned by `recordingSpread` (`lib/flightGroups.test.ts`) and
  asserted in the e2e walk.
- **A grouped flight has no one-click overlay of its own recordings.** Ticking them and pressing
  Compare works and is two more steps than it should be. Fix `compareFromLogbook` dropping the
  crop first — it is filed, and D3 multiplies it by the number of recordings.
- **The comparison still hedges.** *"If these are recordings of the same flight…"* is a hedge
  because nothing knew; now something does. A comparison built from one flight's recordings can
  say so outright.

**Those three are D5's starting point**, and the first is the highest-leverage of them.

**Size.** 4–6 increments; shipped in 3.

---

## D4 — Stitch per-stage logs into one composite flight

**Status:** SHIPPED 2026-07-31 — pinned by `e2e/stitch.spec.ts` (8 cases, walking the real app: two
per-stage logs assembled into one ordered timeline with every mark naming its recording, the stage
statement, whole-second composite times, both refusal paths, the empty state, reachability from the
header, the service-worker precache and the static export), by `lib/composite.test.ts` (10 cases over
the corpus's real staged pair to the tenth), and by the alignment core's existing
`lib/stitch.test.ts` (10) plus its three corpus invariants.

**What a flyer can DO that they could not before:** open `/stitch` with two per-stage logs and read
one timeline — every recording's marks in order on the clock they share, each naming the recording it
came from — instead of two files that each hold part of a launch and neither of which has the order.

**Each clause of the *done when*, and the check that pins it:**

- *assemble two per-stage logs into one timeline* — `/stitch/?ids=a,b`, reusing `/compare`'s own id
  contract and loader, so a composite reloads, bookmarks and pastes into a club thread. Pinned by
  `two per-stage logs read as one timeline, each mark naming its recording`.
- *whose events read in order across staging* — pinned in the same case: the stage that flew higher
  and longer has the later apogee and the table puts it there.
- *see which recording each segment came from* — every row names it, asserted structurally rather
  than by prose: the table's four columns are `Time · Mark · Recording · Its own altitude`, and a
  blended reading would have to add a fifth or replace the third.
- *and get a refusal that says why when the two cannot be aligned* — two refusal paths, both walked:
  a recording with no liftoff (named, with the reason `lib/stitch.ts` already wrote), and a set with
  a stage the logbook no longer holds. That second one is deliberately UNLIKE `/compare`, which is
  right to drop a dead id and carry on: a composite missing a stage has a hole in it.
- *rather than a plausible composite built on a guess* — `verified` is false on every composite,
  carried from `StageAlignment` rather than dropped, and the surface says so above the readings.

**What it deliberately does not do**, each refused by measurement rather than preference: no merged
reading of any kind; no staging mark (no corpus record holds two separable burns); no composite time
printed to a tenth (two boards in ONE airframe still want a further 0.56–0.74 s to agree, and read
333 m and 487 m at t+3 s); and no cross-check panel, because `/compare` will report a 30.5% apogee
"disagreement" between a booster and a sustainer behaving exactly as designed — filed in `BACKLOG.md`.

**The stage statement is a LABEL, not a gate.** Every stage leaves the pad together, so the alignment
never reads it: stating either recording gives identical offsets, and an e2e case asserts exactly
that. All it may do is order marks the alignment cannot separate — which is why marks within a second
of each other are shown as tied rather than sequenced.

**Where the previous slice left it**, for the record: the alignment core shipped first and on purpose,
because a composite surface built before the alignment was measured is exactly the guess this
milestone must not make.

**What was measured, and what it refuted — read this before extending it.** The corpus's one real
staged pair is `iss-kairos-20240323`: a Kairos booster and sustainer, each on its own TeleMega.

- **The sustainer's log carries no clock at all** (`flownAt` is undefined; the booster's is a GPS
  UTC stamp). So aligning on overlapping wall clocks — one of the two methods the note below
  proposed — does not exist on the only real pair there is.
- **Both logs DO contain the launch**: the booster's opens 0.2 s before liftoff, the sustainer's
  carries a 307.5 s pad wait before the same instant (liftoff at 307.67 s on its own clock). Every stage leaves the pad together, so that
  is the shared event, and it is the method that shipped.
- **Two ways of checking whether a record contains the launch were tried and BOTH failed.**
  Altitude is useless — the analyzer takes each record's pad datum from its own opening samples,
  so a log beginning at 1,000 m in the air reads zero there too. Motion before the liftoff is
  worse than useless: measured over all 50 corpus flights, ordinary SINGLE-stage records show
  speeds before their own detected liftoff ranging from 0 to thousands of metres per second, because plenty of loggers begin recording at boost
  and the detector fires a little way into it. **There is no threshold that separates "a sustainer
  lighting up at altitude" from "a StratoLogger that records only the flight."** Picking one would
  only have meant telling the owner of a plain single-stage flight that their file was already
  moving when the log opened. The first draft of `lib/stitch.ts` did exactly that on 14 of 50
  corpus flights; the rule was deleted rather than tuned until the corpus looked tidy.
- **A THIRD rule was tried, shipped, and then removed — this is the most important thing on the
  page.** The reading was that until the stages separate every board is bolted into the same
  rocket, so every one of them records the same first-stage burn; lined up on liftoff those
  instants must be one, and a gap of seconds catches a sustainer whose logger started at its own
  ignition. It shipped with a 1 s tolerance. Measurement then refuted it in three ways at once,
  and the numbers are all reproducible from the corpus:

  1. **It has no power against the failure it named — not weak power, none.** Lined up on liftoff,
     the gap between two boards' burnouts is exactly |burn duration_i − burn duration_j|. **The
     staging delay is not a term in it**, because a sustainer log that opens at its own ignition
     carries no trace of the delay. Sweeping the delay from 2 s to 5,000 s leaves the number at
     0.30 s every time, while the composite is wrong by the whole delay.
  2. **It refused correct data — two of the corpus's six redundant-board groups.** Several boards
     bolted into ONE airframe recording ONE burn is the rule's premise stated exactly, and a 1 s
     tolerance rejected `iss-endurance` (TeleMetrum **2.900 s** against StratoLogger **0.050 s**)
     and `trf-lemiv-l3`, four boards in one rocket (**3.160 / 2.300 / 1.750 / 1.550 s**). All nine
     files carry `knownIssue: None`. The mechanism is this repo's own analyzer: a burnout found on
     the signed axial trace may be sought up to `BURNOUT_TAIL_S` past the velocity peak while the
     baro path takes the peak itself, so across the corpus a `measured` burn runs 0.769–6.040 s
     and a `derived` one runs 0.050–23.910 s. Two loggers on one motor compare DEFINITIONS.
  3. **It never separated one flight from another either.** The genuine staged pair agrees to
     0.290 s — but the Kairos booster paired against 32 unrelated corpus flights was accepted
     three times, including a June 2023 IREC flight at 0.750 s and an SG1.2 sustainer from a
     different launch at 0.910 s. No tolerance sits between those and 0.290 s.

  A guard that rejects correct real data is worse than no guard, and this one bought nothing in
  exchange. It is gone rather than widened. The burn durations still ship — named per recording
  and **provenance-labelled**, because a 2.85 s spread means nothing until you know one board
  measured that moment and the other derived it — but nothing gates on them, and the six
  redundant-board groups are now a corpus test so that reinstating the gate is a red build rather
  than an argument.

The alignment therefore rests on the liftoff alone. It is also simply true that half the corpus's
staged flights have nothing to compare anyway — neither StratoLogger booster on `iss-sg1.2` marks a
burnout at all, so that alignment ships with `burnDurationSpreadS: null`.

So `StageAlignment.verified` is **false on every result**, as a field rather than an omission, so
that a surface built on this has to look at it. **A composite built from these offsets is the
flyer's statement, not a measurement**, and the next increment is what makes that honest: let the
flyer say which recording is the first stage — the same shape as D1's crop and D3's grouping,
where the flyer states what the data cannot.

**Two more measurements were taken before that surface is designed, and both bound what it may
say.** Pinned by `what a composite may claim` (`lib/parsers/corpus.test.ts`).

- **The offsets are good to about a second, not a tenth.** Over the first-stage burn the two
  Kairos boards were bolted into ONE airframe, so they measured the same motion — and lined up on
  their own liftoffs they still disagree. The extra shift that minimises it is **0.56 s** on
  altitude (RMS 11.0 m, against 133.6 m unshifted) and **0.74 s** on velocity (13.5 against 52.6).
  Plainly: at t+3 s the two records read **333 m and 487 m**. A composite may order events that
  are seconds apart; it must not print a composite time to a tenth as though that meant anything.
- **No mark on any of these records is a staging event, and none can be.** Counting sustained
  axial thrust runs (>20 m/s², ≥0.15 s) over whole records, the staged files do not stand out.
  The Kairos booster holds **one** burn (0.17–5.19 s) and the Kairos sustainer **one**
  (307.67–312.29 s) — its log opens after separation, so it never saw the booster's burn at all.
  The SG1.2 sustainer holds three runs of 1.67 / 2.23 / 0.47 s, which are fragments of one boost
  rather than two burns. Across every device-accelerometer record: one run on 21 files, **two runs
  on three files, every one of them an ordinary SINGLE-stage flight** (`iss-endurance`, `meraki2`,
  `asteria-lyrid`), three on the one staged record. A "two burns means staging" rule fires on three
  single-stage flights and still does not pick out the staged one. On baro-derived traces it is
  hopeless — five and nine "runs" on the SG1.2 files, and a **174-second** one on a StratoLogger.
  **So `EventType` cannot gain a grounded `separation` or second-ignition member from this corpus**,
  and the composite must say which recording a mark came from and nothing more. The corpus test is
  written so that a record holding two genuinely separable burns turns it RED — which is the signal
  that staging detection has become possible.

**There is deliberately no fallback.** A stage that missed the launch could be placed by assuming
a staging delay or by correlating the traces; both produce a composite that reads exactly like a
measured one. Where the evidence is not there, the answer is that Debrief cannot do it.

**Outcome.** A staged flight logged on separate devices reads as one flight.

**Done when** a flyer can assemble two per-stage logs into one timeline whose events read in order
across staging, see which recording each segment came from, and get a refusal that says why when the
two cannot be aligned — rather than a plausible composite built on a guess.

**Notes.** This is the one clause of North Star 1's second bullet that is genuinely unbuilt: nothing
in `lib/` or `components/` matches stitch, composite or per-stage, and `EventType` has no separation
or second-ignition member (`lib/analyze/types.ts`). It needs D3's recording dimension first, plus a
stated alignment method — a shared event, or overlapping wall clocks — and it must say which it used.
A wrong composite is the most damaging thing this product can produce, so the refusal path matters as
much as the success path.

**Size.** 5–8 increments.

---

## D5 — The report a flyer can actually build

**Status:** SHIPPED 2026-07-31 — every clause of the *done when* is met and each is pinned by a
check that walks the real app and asserts on the SAVED FILE rather than the screen:
`the figures a comparison carries are the flyer’s choice, and the report agrees` and
`the order a flyer puts the figures in follows into the document` (`e2e/compare.spec.ts`),
`a colour the flyer picks reaches the exported figure, and can be undone` (`e2e/compare.spec.ts`),
and `a figure colour the flyer picks reaches the saved figure, and can be undone`
(`e2e/analyze.spec.ts`). Every one is falsified two ways — colouring or ordering the screen but
not the document fails it, and removing the way back out fails it.

**What a flyer can DO that they could not before:** choose which plots a document carries and in
what order, and set the colour of any trace — on the single flight and on a comparison — with
every choice remembered on the device and reaching the .html, the bundle and the saved figure,
not just the screen.

**What it delivered against its *done when*, and what it did not.** All three clauses hold, and
the third is worth stating plainly: **"at least one image or self-contained document format" was
already satisfied when the milestone was written** — four PNG paths, per-figure SVG and a
self-contained HTML report all shipped before this run. `ROADMAP.md`'s own note claiming none
existed was the stale thing, not the code, and an increment was nearly spent rebuilding it.

Two things it does NOT do, filed rather than implied:
- **No paginated document Debrief generates itself.** `printCard()` forces light mode and calls
  `window.print()`, relying on ~30 `print:hidden` utilities. That is a browser print of a live
  page, not a document a certification package receives. It is a larger want than the clause
  states; `package.json` carries four runtime dependencies and `lib/zip.ts` is hand-rolled, so a
  PDF library would be against the grain of this repo.
- **No column model.** The .txt, .md, .html and clipboard tables all render `headlineRows` as
  label/value pairs, so "which columns" has no answer to give. Whether that is a gap at all is a
  product question, not an oversight.

The first clause is pinned by `the figures a comparison carries are the flyer’s choice, and the report agrees` and
`the order a flyer puts the figures in follows into the document` (both `e2e/compare.spec.ts`,
both walking the real app: the bundle's SVG entries, the .html's figure captions and their
sequence, and both choices read back on the single-flight report), and the colour clause by
`a colour the flyer picks reaches the exported figure, and can be undone`.

**Outcome.** The plots, colours and formats are the flyer's choice, not the tool's.

**Done when** a flyer can choose which figures appear and in what order, set the series colours, and
export a report a certification package or forum post can use directly — including at least one image
or self-contained document format beyond today's text, Markdown, HTML, CSV and JSON.

**Two of this milestone's own premises were wrong, and were corrected by measurement before any
of it was scoped. Read these before planning the rest.**

1. **"There is no image or paginated export" is false.** Four PNG paths ship
   (`FlightReport.tsx:442` altitude chart, `FlightCard.tsx:283` the shareable card,
   `ChannelExplorer.tsx:258`, `CompareView.tsx:431`), plus per-figure SVG via `lib/svgChart.ts`,
   plus print-to-PDF: `window.print()` at `FlightReport.tsx:423` behind a real `@media print`
   block in `app/globals.css:117` and 30 `print:hidden` utilities. An increment spent "adding an
   image export" would have rebuilt shipped work. The genuine gap is a **paginated document**
   Debrief generates itself rather than a browser print of a live page — and it is the most
   expensive clause, so it goes last, not first.
2. **The comparison ignored the flyer's figure choice entirely.** The report filtered its figures
   through `hiddenFigures`; the comparison exported the literal
   `['altitude','velocity','acceleration']` in both `saveHtml` and `saveBundle`. So a flyer who
   turned Acceleration off on the report still got an acceleration plot in the comparison bundle,
   and could never get the Mach or dynamic-pressure overlays into a document at all, though the
   surface draws both. **Closed** — both exports now read one `documentFigures` list, so they
   cannot disagree, and `components/FigureChooser.tsx` is one control shared by both surfaces
   rather than two that resemble each other.

   Two defects fell out of it. The comparison offered every overlay whether or not any flight
   carried it, so on a set whose peak speed was withheld the Mach and dynamic-pressure options
   were live and drew a blank chart — the "control that is always enabled and fails only when
   pressed" tell. The filter now tests what the data holds, which covers any metric added later.
   And the figure toggles are named `"<title> figure"` rather than `"<title>"`, because the
   comparison already has a channel picker with those exact names and two controls sharing an
   accessible name is ambiguous to a screen reader before it is ambiguous to a test.

**What is left**, in the order it is worth doing:

1. ~~**Figure ORDER.**~~ **DONE 2026-07-31.** `debrief.report.figureOrder`, plus `onMove` on the
   shared chooser, reusing `orderRows`/`moveReading` rather than a second implementation of them.
   Ordered FIRST and filtered second on both surfaces, so the ▲/▼ act on the sequence the
   document will carry — ordering the survivors instead would silently renumber the list every
   time a figure is hidden. Falsified two ways: ordering the screen but not the document fails
   the .html caption sequence, and not persisting fails the cross-surface read-back.

   **Worth recording, because `orderRows`'s own comment refuses reading-order on the report:**
   that refusal is about the report's READINGS being two parallel lists — a grid of tiles beside
   an export table carrying rows the tiles do not have — so "third from the top" has no exact
   meaning across them. A figure list is ONE list on both surfaces, so the same machinery
   applies with none of that ambiguity. Do not read the refusal as covering figures.
2. **Series colours — DONE on the comparison 2026-07-31, still open on the single-flight report.**
   `lib/seriesColor.ts` stores an override map per FLIGHT id (not per comparison: a flyer who
   makes their L3 red wants it red wherever it appears), applied once at the top of `CompareView`
   so the chart, the legend, the event markers, the SVG and the PNG cannot disagree. The swatch
   in the column header IS the control; double-click restores the palette's own colour, which is
   the way back out. Pinned by `a colour the flyer picks reaches the exported figure, and can be
   undone` — which asserts on the SAVED SVG, because that is the artifact a cert package
   receives, and is falsified both by colouring the screen only and by removing the undo.

   Two prerequisites were cleared first, both real defects rather than tidying:
   - `MAX_COMPARE` was `COMPARE_PALETTE.length`, so colour and CARDINALITY were one decision. Now
     its own constant at 6, as is the explorer's `MAX_SERIES`.
   - `lib/eventStyle.ts` gave drogue and main the same `#0ea5e9`, so a saved figure could not tell
     the two deployments apart — the question a cert document asks of a dual-deploy flight.

   **What remains:** the single-flight report's three figure colours are still literal hexes in
   `FlightReport.tsx`, duplicated for the on-screen charts. They are per-CHANNEL rather than
   per-flight, so they want a different store shape — that is the next slice, and `plotSvg`
   already takes a colour per series, so no exporter changes with it.
3. ~~**At least one image or self-contained document format**~~ — **the third clause of the
   *done when* was ALREADY MET when the milestone was written**, and premise 1 above is why
   nobody noticed: four PNG paths, per-figure SVG, a self-contained HTML report, and
   print-to-PDF all shipped before this run. Read the clause literally — "including at least one
   image or self-contained document format beyond today's text, Markdown, HTML, CSV and JSON" —
   and PNG alone satisfies it. What is genuinely missing is a paginated document Debrief
   GENERATES rather than a browser print of a live page, which is a larger want than the clause
   states. Note `package.json` carries four runtime dependencies and `lib/zip.ts` is hand-rolled,
   so a PDF library would be against the grain; that is a decision for whoever takes it, not a
   blocker on this milestone.

**Notes.** Closing named gaps rather than starting fresh: `reportProfile.ts` and `plotView.ts`
already carry readings, order and hidden figures. Keep the rule `reportProfile.ts` already states —
trimming a *report* is a presentation choice, trimming a *data export* is a broken file, so CSV and
JSON keep every key. Verified still true after this slice: `analyzedDataCsv` takes no profile, and
`compareJson` builds its differences with no hidden/order argument.

**Size.** 4–6 increments.

---

## D6 — Propose which files belong to one flight, and be refusable

**Status:** NOT STARTED — decomposed 2026-07-31 from the one-line entry below, and the decomposition
changed the milestone. **The signal its own text named is not there**, and that is measured rather
than suspected. Read the measurement before scoping anything.

**Outcome.** A flyer who drops a launch day's folder is *offered* the grouping D3 makes them state
by hand — with the evidence shown, the flight still ungrouped until they accept, and a proposal that
declines to guess far more often than it guesses.

**What a flyer can DO after this milestone that they could not before:** drop two altimeters' files
and be shown *"these look like one flight — here is why"*, accepting with one press instead of
finding the pair by hand, and seeing nothing at all where the files do not support the claim.

### The measurement that reshaped this, taken 2026-07-31 over all 44 manifest files

D6's one-line entry proposed grouping on "launch day, overlapping wall clocks and profile shape".
Two of those three do not survive contact with the corpus.

- **Wall clocks are mostly absent. 11 of 44 files yield a `flownAt` at all** (all 11 timed; 8 UTC,
  3 the logger's own clock). Of the **21** manifest groups, exactly **one** has two files that both
  carry a stamp — and it is `iss-kairos-20240323`, the **staged** booster/sustainer pair, which is
  precisely the relation that must NOT be merged. Both read `2024-03-23T18:54:37`, identically. So
  the only timestamp agreement the corpus can demonstrate is a *false* merge waiting to happen.
- **A clock can be a decade wrong and still look valid.** `iss-sg1.1-20231001` reports
  `2013-04-27T20:16:12` for a flight flown 2023-10-01. It passes `flownAtFromParts`'s 1990–2100
  sanity window because it is a real date — just not this flight's. Any rule keyed on the stamp
  files that flight ten years from its siblings.
- **Apogee agreement alone is worse than useless.** Over the 23 files that yield a readable altitude
  channel, all 253 pairs measured: same-group pairs run a median **0.51%** apart, cross-group pairs a
  median 63%. That looks separable until the tail: the **tightest agreement in the entire corpus,
  0.28%, is between two files that are NOT the same flight** — tighter than the median true pair.
  **Five** cross-group pairs fall within **2.12%**, the widest spread of a genuinely-redundant pair
  measured here. A threshold admitting every true pair admits more false ones than true.

  *(That threshold was first written as 2.29%, borrowed from D3. It is 2.12% when measured the way
  this test measures it — off the altitude channel's own maximum rather than the logbook's stored
  apogee — and the count of five is unchanged either way. The test uses its own measurement rather
  than a number copied from another section.)*

  The tightest of the five is the one to remember: the **Kairos sustainer at 4,044 m** and an
  unrelated **XPRS 2015 scratch rocket at 4,055 m** — different airframes, different continents,
  nine years apart, agreeing to **0.28%**.

The reason is not noise, it is physics: a flyer flying the same airframe on the same motor twice in
a day gets two flights that agree to a fraction of a percent, because they *should*. Apogee
agreement measures "these are similar flights", and D6 needs "these are one flight".

### What that leaves, and it is enough

The signal D6's entry did not name is the one that actually carries it: **how the files arrived.**
Two logs off one flight reach Debrief together — the same folder, the same drop, minutes apart in
`addedAt` — and D1 already ingests a launch day's folder as a unit. That is a fact about the flyer's
own action rather than an inference about the flight, and it is the only one available on every row
regardless of what the logger wrote. Corroboration then *narrows* a proposal that arrival opened; it
never opens one by itself.

**Done when** a flyer dropping a folder holding two recordings of one flight is offered that
grouping with its evidence stated, accepts it in one press, and gets exactly what D3's manual
grouping gives them — while the corpus asserts that **no proposal is ever made across the five
cross-group pairs named by `lib/parsers/d6Grouping.test.ts`**, that the staged `iss-kairos` and
`iss-sg1.2` pairs are never proposed, and that nothing is grouped without an explicit acceptance.

**Notes.**

- **Never merge silently, and never merge on acceptance-by-default.** A wrong automatic merge
  fabricates one flight out of two and every downstream reading inherits it. The proposal is a
  suggestion next to the files, not a state the logbook is already in.
- **The evidence is the feature.** Whatever the rule keys on, the flyer is shown it in words — *"both
  arrived in the folder you dropped, and their apogees agree to 0.4%"* — because a grouping a flyer
  cannot audit is one they cannot correct. This is the provenance spine applied to an inference.
- **`same_flight_group` is not the ground truth to train against.** D3 recorded this and the numbers
  above confirm it: the column conflates independent instruments, one recording exported twice, and
  different STAGES of one launch. `iss-sg1.2-20231118` is the negative case — a TeleMega sustainer at
  2,113 m beside two StratoLogger boosters at 465 m, all one `same_flight_group`.
- ~~**The first increment is to commit the measurement above as a test.**~~ **DONE 2026-07-31 —
  `lib/parsers/d6Grouping.test.ts`.** Five assertions, and every one written to fail in the USEFUL
  direction: a red there is not a regression in the app, it is the corpus changing under D6 in a way
  that changes what D6 can do, and each assertion's message says which. Deliberately **not** a
  threshold — `expect(spread).toBeLessThan(2.12)` would pin a number meaningless outside today's
  fixtures. What is pinned is the SHAPE of the two distributions, whether they overlap, which is what
  decides whether any threshold can exist. It also names the five confusable pairs as D6's standing
  negatives: whatever rule D6 ships must refuse all five. Falsified by four mutations.
- **`flightId` already carries the result.** D3's field means a proposal has nowhere new to write to
  — accepting one sets exactly what the manual path sets, so this milestone adds a way to *offer*
  and nothing to the data model.

**Size.** 4–6 increments, and the first is the measurement rather than any grouping code.

---

## P1 — One design system, adopted

**Status:** IN PROGRESS — the primitive layer exists and is pinned. `lib/design-system.test.ts` is
`DESIGN.md` §9 as an EXACT ratchet, so every count below has to move in the same commit as the
conversion that earns it.

**Where the counts stand, measured 2026-07-31 at the end of the run** — the §9 shell block and the
test agree exactly, which is itself the check that the two have not drifted:

| count | was | now | target |
|---|---|---|---|
| `rounded-lg` | 22 | **0** | 0 — **a guard now**, may never rise |
| off-scale spacing | 25 *(really 33)* | **0** | 0 — **a guard now** |
| hand-rolled card treatments | 7 *(really 19)* | **10** | **floor is 4**, not 1 |
| inverted-type files | 23 | **16** | **floor is at least 4, not 0** |
| off-scale type sizes | 20 | **1** | floor is 1 — the shared brand wordmark |
| files importing the primitives | 11 | **25** | most of the 46 |
| `Card` adopters | 0 | **21** | — |

**Three of those targets are not 0 and the file now says why in each case.** A budget whose target
is unreachable trains the next session to ignore it, which is worse than not having it.

**And a finding that belongs to P1 rather than to any one count:** the design documents and the
compliance test were *shipping the utilities they forbid*. Tailwind v4 auto-detects its sources, so
it read `DESIGN.md`, this file, `HANDOFF.md`, `BACKLOG.md` and `lib/design-system.test.ts` — every
file whose job is to name a banned class — and emitted **25 dead rules** into the production
stylesheet that no component used. Scoped in `app/globals.css`; 68,225 → 66,209 bytes. Found by the
done-check's cold walk on the built export, not by reading source, which is the argument for walking
the artifact rather than the tree.

**What is left, in the order it is worth doing** — each measured, none guessed:

1. ~~**25 off-scale spacing values**~~ **DONE 2026-07-31 — and the count was lying.** The 25 named
   here were converted, after which the §9 grep read **0 while 7 occurrences over 5 sites were still
   in the tree**: it enumerated the values somebody had in front of them (`5|7|9|10|11|14`) over the
   prefixes `p m g`, so it never matched `gap-` or `space-{x,y}-` at all and stopped below 16. The
   pattern now subtracts the scale instead of naming what is off it, and the five survivors —
   `mt-20 md:mt-28` ×2, `mt-16`, `space-y-5`, `gap-5` — were converted in the same commit.
   Falsified against `gap-5`, `space-y-7`, `mt-20` and `p-16`, every one of which the old form passed.
2. **16 of 46 component files have `text-xs` outnumbering `text-sm` — down from 23, and the target
   is NOT 0.** §5 makes `Chip` `text-xs` by definition, so a component built out of chips is
   permanently "inverted" while fully compliant; `EventChips`, `RecognizedFormats`, `SiteFooter` and
   `FusionSpaceBadge` are already correct and are the floor. **The 23 → 16 was the seven derived-
   reading panels**, every one of which rendered its label, its input, its description and all of its
   state messages at caption size — including, in `RailExit`, a flight-safety caution about too
   little airflow over the fins. `ChannelExplorer` was taken 17/4 → 11/10 by fixing six genuine
   violations and **deliberately left inverted**, because the other eleven are sanctioned. Read the
   note in `lib/design-system.test.ts` before treating this number as a defect total: the numbers on
   these surfaces were never at caption size — `TD_NUM` and both cross-check tables inherit `text-sm`.

   *(Superseded, kept because the reasoning still holds:)* This was the count that mattered most and
   had barely moved: the conversions so far took the buttons, not the bodies.
   Worst offenders, measured: `RecentFlights` 26/6, `FlightReport` 24/12, `ChannelExplorer` 17/4,
   `CompareView` 17/10 — and the first of those is the logbook, the one surface built for scanning
   flights against each other.

   **A prediction written here on 2026-07-31 was wrong, and the correction is the useful part.**
   It said converting `RecentFlights`'s buttons onto `<Button>` would un-invert the file, because
   `Button`'s default `md` size is `text-sm`. Eleven of its 23 were converted the same day and the
   file went **26/6 → 18/6 — still inverted**, because most of them are correctly `size="sm"`,
   which is `text-xs` by §4's own "inside a control … `px-2 py-1` for `text-xs` chips". A dense
   logbook toolbar of `md` controls would be the generous-whitespace failure §4 warns about.

   **So items 2 and 7 are NOT the same work, and item 2's target of 0 may be unreachable on a
   toolbar-dense surface without breaching §4.** Do not force it: the metric exists to stop a
   decision-grade NUMBER rendering at caption size, and that specific breach is fixed here
   (below). Before spending an increment driving this count to 0, decide whether the count or the
   rule is what needs changing — this is the third §9 metric to turn out to measure something
   other than what it was reached for, after the suite-wide type ratio and the two blind greps.

   **Already done on this file (2026-07-31):** the two decision-grade values — apogee and max
   velocity, the numbers the logbook exists to be scanned down — were `text-xs` in §2's TERTIARY
   colour with proportional digits. They are now `text-sm tabular-nums` in the primary text colour,
   which is §3's floor for a number a flyer reads to make a decision and its requirement that
   compared numerals line up column to column. That moved the file 27/3 → 26/6; it does not clear
   the inversion, and it was not meant to.
3. **Three unsanctioned dark surfaces, 32 uses**, where §2 allows one beside the two sanctioned:
   `dark:bg-zinc-900/40` ×27, `/30` ×4, `/60` ×1, against `dark:bg-zinc-900` ×41 and `/50` ×4.
   The earlier entry said "`/40`, 30 times" and named only one of the three.
4. **`DataTable`.** 7 tables (not 6), 2 sortable, 2 copyable, 0 keyboard-navigable. Lift it from
   `SampleTable.tsx`, which already has the sticky header, `aria-sort` and the clipboard copy, and
   collapse `CompareView`'s independent second copy onto it.
5. **The five required states.** 0 of 13 data surfaces implement all five, and none has an offline
   state — in a PWA whose headline promise is working at the range with no signal. `EmptyState` and
   `ErrorState` exist and have one adopter each.
6. **Two primaries on one surface** — `ColumnMapper` only now. ~~`RecentFlights`~~ **DONE
   2026-07-31**: its second indigo fill was the note editor's Save, which is now secondary. The
   logbook's one primary is "Compare N flights", the action the surface exists to perform. A
   FIFTH button weight went with it — an indigo-outlined "These N are one flight", which §5 does
   not have.
7. **The remaining 41 hand-rolled `<button>` elements** outside `components/ui.tsx` (46 in the
   tree, 5 inside the primitives). `RecentFlights` went **23 → 12** on 2026-07-31; what is left
   there is genuinely not `Button` — the row itself as a click target, the file-name text button,
   the ✕ (an `IconButton` with a responsive size), the sort chips and the checkbox labels.
8. **17 call sites still hand-roll a card** — `rounded-xl border …` written out rather than `<Card>`.
   This is the adoption debt the §9 count does not measure: §9 counts distinct TREATMENTS, which is
   7, and seven strings spread over seventeen sites is one number going to 1 and another going to 0.
   Kept here rather than added to `DESIGN.md` §9, because a new metric in that file is a change owed
   to the sibling repo in the same run and this run cannot push there.

**Outcome.** The app reads as one considered product rather than fifty components built on different
days.

**Done when** `DESIGN.md`'s compliance block (§9) runs clean and is **pinned by a test**: a shared
`components/ui.tsx` exists and most components import their containers, buttons and fields from it;
zero `rounded-lg`; one card treatment plus the named non-card primitives; zero off-scale spacing
values; zero off-scale type sizes; and **zero component files where `text-xs` outnumbers `text-sm`**,
so a decision-grade number is no longer rendered at caption size. A flyer sees consistent spacing, one
button hierarchy, and the same card everywhere.

**The last clause used to read "`text-sm` outnumbering `text-xs`" and that metric is now known to be
wrong** — see `DESIGN.md` §9. A primitive collapses many occurrences of a class into one, so adoption
drives the suite-wide ratio the wrong way for the right reason: the sibling app measured 91/88 before
converting nine buttons and 84/89 after, an inversion by the metric, with not one glyph on screen
changing size. The count that means something is how many FILES are individually inverted, because a
flyer reads one surface rather than the suite total.

**The ratchet, measured 2026-07-31 at the start of this milestone and where it stands now:**

| count | §9 target | at P1 start | now |
|---|---|---|---|
| `rounded-lg` | 0 | 26 | 22 |
| distinct card treatments | 1 + named non-card primitives | 6 | 7 |
| card call sites hand-rolling one | 0 | — | 17 |
| off-scale spacing | 0 | 25 | **0** (grep widened — see item 1) |
| off-scale type sizes | 0 (honest floor 1) | 20 | **1** |
| files where `text-xs` > `text-sm` | 0 — **but read item 2 first** | 26 | 23 |
| components importing `./ui` | most of 47 | 0 | **13** |
| components importing `Button` | most | 0 | **10** |
| hand-rolled `<button>` elements | few | 90 | **41** outside `ui.tsx` (46 in tree) |

Measured at the end of the 2026-07-31 run, with §9's own commands. Two of these moved for reasons
worth keeping: `off-scale spacing` reached a *real* 0 only after the grep was widened twice — it
had been reporting 0 against 8 live occurrences — and `hand-rolled <button>` fell 52 → 41 in one
surface, `RecentFlights`, which also lost a fifth button weight and its second primary.

**Off-scale type's floor is 1, and it is not a shortfall.** The one that remains is the brand
wordmark, `text-2xl md:text-3xl` in the sibling app too, which §10 makes shared and non-negotiable.
It is the brand's size, not a content size; reaching 0 would be a §3 change in both repos.

Card treatments went UP by one and that is the conversion working: the seventh is `<Card>`'s own
string, and the other six fall away as surfaces adopt it. **Two of the six will not fold into `Card`
and want their own named primitive** — the page-level drop zone (`border-dashed … p-10`, an
interactive target rather than a container) and the floating drop overlay (`border-2 border-dashed …
shadow-lg`, which needs elevation) — so the honest floor is 3, not 1. **Make that 4:** a third was
identified 2026-07-31 by trying to convert it and finding it would regress. Five sites share a
bordered treatment with NO background — `FlightCard`'s canvas, `ColumnMapper`'s and `SampleTable`'s
scrolling tables, `GroundTrack`'s `<dl>` and its `Stat` tile — and the missing background is the
point of them. `SampleTable`'s sticky header is `dark:bg-zinc-900`, exactly `Card`'s default dark
fill, so converting would flatten the header band into the card on the `zinc-950` body. That is a
FRAME, and if it ever earns a primitive it is `Frame`, not a `Card` tone.

**Notes.** Debrief had **no shared primitive layer at all** — zero cross-component imports across 44
components. The names and implementations are the sibling repo's, so the two apps converge rather than
forking a second dialect; `Readout`, `Extrapolated`, `EmptyState`, `ErrorState` and `IconButton` are
Debrief-side additions from `DESIGN.md` §5 that the sibling has not needed yet. Convert in slices —
one surface per increment, each shipped green — never one sweeping diff.

**What the opening audit found that the milestone must close, ranked** (measured 2026-07-31):

1. ~~**`focus-visible` appeared 4 times across 44 components**, so 87 of 91 buttons had no visible
   focus ring.~~ **Checked and REFUTED before acting on it.** `app/globals.css:27` carries a global
   `:focus-visible { outline: 2px solid #6366f1 }`, and because it is UNLAYERED it beats anything in
   `@layer utilities` — so every control already has the ring, and the `focus-visible:outline-*`
   utilities briefly added to `Button` were inert. They were removed rather than kept as a second
   belt. The same argument retires the 44 px token from `Button`: `globals.css`'s
   `@media (pointer: coarse)` block already floors every `button`, `select`, `[role="button"]` and
   `input`. `TOUCH_TARGET` stays for the elements that block does not reach — `<label>`, `<summary>`,
   a plain `<a>`.
2. **`font-mono` 81 times against `tabular-nums` 5** across `components/` and `app/`. Monospaced
   readings with proportional digits do not line up column to column. `Readout` carries both;
   converting a reading onto it cannot get this wrong.
3. **`ACTION_BTN` was declared byte-identically in six files** (`FlightReport`, `FlightCard`,
   `ChannelExplorer`, `UnitsControl`, `GroundTrack`, `CompareView`) over 25 call sites. This slice
   removed `UnitsControl`'s, leaving five files and 24 call sites to collapse onto one `Button` —
   the cheapest large deletion available, and the next slice.
4. **Two primaries on one surface** in `ColumnMapper` and `RecentFlights`.
5. **`dark:bg-zinc-900/40` is a fourth dark surface level**, used 30 times beside the sanctioned
   `dark:bg-zinc-900` and `dark:bg-zinc-900/50`.
6. **Six of seven `<h1>`s are off the six-size scale** — five `text-2xl` and one `text-4xl`, where
   §3 says a page title is `text-3xl`. Exactly one route already gets it right (`app/not-found.tsx`).
7. **0 of 13 data surfaces implement all five required states**; none has an offline state, in a PWA
   whose headline promise is working at the range with no signal.
8. **4 of 6 tables cannot be sorted or copied out of and 0 are keyboard-navigable.** `DataTable`
   should be lifted from `SampleTable.tsx`, which already has the sticky header, `aria-sort` and the
   clipboard copy, rather than written fresh — and `CompareView`'s independent second copy collapsed
   onto it.

**Size.** 4–6 increments.

---

## P2 — Surfaces as routes

**Status:** NOT STARTED

**Outcome.** Debrief is shaped like an application, not a scrolling page.

**Done when** the distinct jobs — drop/ingest, analyse one flight, compare flights, the logbook, build
a report — are distinct static routes with one navigation spine that shows where the flyer is; the
loaded flights survive moving between them; every route deep-links and reloads into the same state;
and no route is more than two screens deep to its primary answer. Pinned by e2e over each route plus a
static-export assertion.

**Notes.** `/compare`, `/methods`, `/validation` and `/privacy` are already routes, so the spine
partly exists — the analysis itself is the long page. `components/Analyzer.tsx` and
`components/FlightReport.tsx` are where the jobs are stacked. Keep navigation and layout above the
model; the parsers and analysis stay ignorant of pages and form factor. Multi-view is multi-route,
never multi-server.

**Depends on** P1 — converting surfaces onto shared primitives first means the split moves components
rather than rewriting them.

**Size.** 4–6 increments.

---

## P3 — A stranger's first five minutes

**Status:** NOT STARTED

**Outcome.** Someone who has never heard of Debrief gets to a flight they believe in, without being
told how.

**Done when** a first-time visitor can, without instruction: understand what the tool is within one
screen; open a real sample flight in one click without supplying a file; drop their own log and be
told plainly what was and was not understood about it — including which board it thinks wrote it; and
find the methods and validation pages from where the question arises rather than from a footer.
Pinned by an e2e walkthrough that starts at a cold load with empty storage and reaches an explained
flight.

**Notes.** `public/samples/` has one sample; the recognised-format list exists but a newcomer meets it
too late. The measurement that matters is steps and dead ends, not looks: count the clicks from cold
load to an explained flight, and count the states a first-timer can reach that explain nothing.

**Size.** 3–4 increments.

---

## P4 — The range on a phone

**Status:** NOT STARTED

**Outcome.** A phone at the range is a first-class tool, not a rescaled desktop.

**Done when** a flyer can, one-handed and offline on a 390 px viewport, complete the things a range
day actually needs — drop a log straight off a card, read apogee and descent rate, check a deploy
altitude, and show someone the result — with zero controls under 44 px and zero states reachable only
by hover. Pinned by a mobile-viewport e2e that asserts both counts and walks each journey.

**Notes.** The touch minimums are partly in `app/globals.css` already, which is the right instinct
applied at the wrong layer — a global `min-height` is a floor, not a design. `DESIGN.md` §8 is the
contract. Decompose by what a flyer needs to DO at the range, not by auditing the desktop layout
narrow.

**Size.** 4–6 increments.

---

## P5 — Ready for the public

**Status:** NOT STARTED

**Outcome.** Someone can find Debrief, understand it, use it, trust it, and tell someone else.

**Done when** the README shows what the tool does with images rather than describing it in 27 KB of
text; the landing surface states the three things Debrief does that no vendor tool does
(`COMPETITION.md`'s standing conclusion) instead of leaving a flyer to discover them; the recognised
formats are visible before a file is dropped, not after; there is a visible changelog and a versioned
release the flyer can see in the UI; and there is a working way to report a bug or request a format
from inside the app. Pinned by link-checking and a build-time assertion that the version shown matches
the release.

**Notes.** Debrief's advantages are structural and completely illegible from outside: it reads every
board rather than one, it cross-checks redundant recordings, and nothing is uploaded. Keep the
ecosystem consistency invariant — whatever ships here ships in both apps.

**Size.** 3–5 increments.

---

## After D5 and P5 — extend this file yourself, in this order

**Do not ask which of these to do, and do not fall back to the defect ledger because the list above is
finished.** When a track's last milestone ships, take the next from that track's order below and
decompose it here to the same shape — outcome, *done when*, size, notes — then start it. That
decomposition is one increment's work and it IS the work when a track is dry. **A dry D-track is not a
reason to skip the P-track or vice versa** — extend the dry one and keep alternating. The order is a
standing decision, changeable by the owner at any time; absent that, it holds.

### D-track, after D5

**D6 — ~~Infer~~ Propose which files belong to one flight. DECOMPOSED 2026-07-31 — it has its own
section above; take it from there, not from this line.** The decomposition changed it, so the
original wording is kept here only to show what was wrong with it: it proposed grouping on "launch
day, overlapping wall clocks and profile shape", and two of those three are not available. 11 of 44
corpus files carry a clock at all, the only group with two of them is the staged pair that must not
be merged, and the tightest apogee agreement in the corpus is between two files that are not the
same flight. The signal that survives is how the files ARRIVED. Numbers and reasoning in the D6
section.

**D7 — Deeper honest insight, the stated moat.** North Star 1's third bullet: more of what the data
supports, each reading validated against the corpus, the logger's own reported summary and published
sources, and each arriving with its method on the methods page. Decompose by readings a flyer asks for
and that can be checked — not by whatever is computable. `COMPETITION.md` row 6 is the cheapest first
slice: show the flyer the board's own reported summary beside ours, which the corpus already uses as
ground truth and which nothing surfaces to a flyer.

**D8 — Orientation and high-rate data.** `COMPETITION.md` rows 3 and 4: the boards flyers increasingly
own record far more than a baro trace, and the vendor tool shows it. Only honest where the log carries
the channels — degrade to "this board did not record it", never estimate. Verify the ingestion ceiling
against a real high-rate log first; that measurement is the first increment.

**D9 — Predicted versus flown.** `COMPETITION.md` row 12: the most valuable capability neither half of
the suite has. Debrief holds the flight, the sibling holds the prediction, and a flyer wants the
overlay. It is an *import of a prediction*, never a shared runtime — the tools stay distinct. This one
touches product direction, so state the assumption loudly and record it below.

### P-track, after P5

**P6 — Instrument what flyers actually hit.** Client-side, keyless, privacy-preserving: which formats
arrive, which parses fail, where a journey is abandoned. Today every priority is inferred from a
corpus and a cold walk rather than from use. Deliberately after P5, because it needs users.

**P7 — The suite as one product.** Debrief and the sibling cross-refer, share a design system and a
nav idiom, and a flyer who analyses in one and designs in the other never feels they changed tools.
Some of this lands earlier in `DESIGN.md` §10; this is the milestone that finishes it.

Beyond these, decompose from the North Star in `MAINTAINING.md` and from `COMPETITION.md`'s standing
`GAP` rows, and record why you chose what you chose.

---

## Decisions taken without the owner

Unattended runs do not stop to ask (see *Unattended operation* in `MAINTAINING.md`). Every decision
that would otherwise have been a question goes here, with the option rejected, so it can be reversed
cheaply instead of re-derived. Newest first.

- **2026-07-31 — `DESIGN.md` was re-synced FROM the sibling repo, and then changed in both.** The two
  copies had diverged: the sibling's was 2.7 KB newer and carried three lessons this repo did not have
  (`text-lg` as an off-scale seventh size, the suite-wide `text-xs`/`text-sm` ratio replaced by a count
  of inverted FILES, and a broken adoption grep). The invariant says the copies are identical and a
  change to one is a change to both in the same run; the sibling shipped its half and this repo's copy
  was the stale one, so the sync direction was not a judgement call. Rejected: leaving them diverged
  and building P1 against the stale copy, which would have pinned the wrong type metric into a test.
  **Then two §9 greps were corrected in this copy**, because both were wrong here in ways they could
  not be there: the adoption grep hard-codes a quote character and the two repos use opposite quoting,
  and the off-scale-type grep names only `text-lg` where this repo has 19 off-scale sizes across three
  classes. Rejected: writing the test to match the broken greps. **The same two edits are owed to the
  sibling repo** — the harness for this run pins only `fusionspace-debrief` and `debrief-fixtures`, so
  they cannot be pushed there from here; carrying them across is the next session's first job if a run
  with both repos attached comes up before then.

- **2026-07-31 — P1's *done when* dropped "`text-sm` outnumbering `text-xs`" for a count of inverted
  FILES.** The alternative was to keep the suite-wide ratio, which is what the milestone was written
  with. Rejected on the sibling's measurement: converting nine hand-rolled buttons onto a shared
  `Button` moved that repo's totals from 91/88 to 84/89 — an inversion by the metric — while nothing on
  screen changed size, because the `text-sm` moved INTO the primitive. A metric that goes backwards
  when the milestone succeeds cannot be the milestone's own test. Reverse this only against a metric
  that survives adoption.

- **2026-07-30 — the queue was split into two alternating tracks, and product/craft work was made
  queue-legal rather than quota-capped.** The owner directed the shift: the products "still look and
  feel like thrown together" projects rather than something the public can pick up, against the vendor
  tools and the desktop sims. The decomposition is mine. Rejected raising the old one-in-four polish
  quota: the quota was never the real constraint — `ROADMAP.md` was, and it contained no polish
  milestone to spend a quota on, so raising the cap would have licensed more defect-clearing rather
  than more product work. Rejected appending the P-track after D5, which is where the equivalent item
  already sat as D8 and where it had been sitting untouched while three D-milestones shipped past it.
  Alternation is mechanical, which is the property that makes a rule survive an unattended run; a
  preference is not. Old D8 (surfaces per device) split into P2 (routes) and P4 (phone), because it
  conflated a shape problem with a form-factor problem and the shape one is both cheaper and more
  visible.
- **2026-07-30 — the burn-agreement gate in `lib/stitch.ts` was removed rather than widened.** It
  had shipped. The alternatives were to widen the 1 s tolerance until the corpus's redundant-board
  groups passed, or to compare only burnouts of matching provenance. Rejected both: widening does
  not fix a check with **zero** power against the error it names (the staging delay is not a term
  in the arithmetic), and a provenance-matched version would still have none. A guard that fires on
  correct data and catches nothing is worse than no guard. The burn durations still ship as labelled
  measurements; nothing gates on them. **Reverse this** only against a check that can actually fail
  on a record that missed the launch — the six corpus groups in `recordings of one launch line up on
  it, whatever their burnouts say` are the bar it must not break.

- **2026-07-30 — a warning that was right once and wrong seven times was made conditional, not
  deleted and not thresholded.** It told flyers to subtract a record's resting height from every
  altitude. The alternatives were (a) delete it, (b) gate it on a landing actually being found,
  (c) tune a threshold on the resting fraction. Rejected (b) and (c) on measurement: `landingFound`
  is false on the one flight the instruction HELPS (`AL0`, confirmed by its device summary to 0.9 m)
  as well as on the flight it hurts worst, and the resting fraction straddles — 3.3% hurts, 5.5%
  helps, 7.5% hurts. Rejected (a) because the observation is real and, on AL0, checkable; only the
  *conclusion* was Debrief's to withhold. So it states the observation, states both readings, says
  the record does not settle which, and points at the flyer's own altimeter summary. **Reverse this
  cheaply** if a rule is ever found that separates "came to rest" from "stopped in the air" — the
  five corpus cases in `the record's last height is stated, never subtracted` are the bar it must
  clear.

- **2026-07-30 — `EventType` gains no staging member, and D4's composite will name recordings
  rather than stages.** The alternative was to add `separation`/`ignition2` and detect a second
  burn, which is what a composite "reading in order across staging" implies. Rejected on
  measurement: no corpus record holds two separable burns (the Kairos sustainer's log opens after
  separation and holds ONE; two-run records are all ordinary single-stage flights). Pinned by
  `no corpus record holds two burns` — **which goes red the moment a record with two separable
  burns is added, and that is the signal to revisit this.**

- **2026-07-30 — D4's slice 2 shipped as measurements rather than as the surface.** The `/stitch`
  surface was designed and adversarially reviewed in the same run, and the alternative was to build
  it. Rejected because two of the design's load-bearing numbers did not survive being reproduced —
  including a second burn it believed the corpus contained and which is not there. Building a
  surface on a fact that is not there is the failure this milestone exists to avoid, and the two
  measurements that replaced it are what make the surface safe to build next. The design is in
  `HANDOFF.md`, flagged as a starting point rather than a spec.

- **2026-07-30 — a grouped flight is reported by ONE nominated recording, not by a blend.** The
  alternatives were a mean, a maximum, or showing every recording's reading everywhere with no
  headline. Rejected all three: the safety spine says several recordings of one flight are
  independent measurements that can disagree, never a consensus dressed as certainty, and a max is
  a best-of dressed as a measurement. The nomination is the flyer's, changeable in one click, and
  the recordings that are not reporting the flight keep their own readings on screen rather than
  being hidden.

  **Checked against governing practice afterwards, and it holds:** Tripoli's altitude-record form
  carries a single altimeter-of-record block — Manufacturer / Model / Reported Accuracy — so the
  flyer states which instrument's number is the flight's number, and only one application is filed
  per flight regardless of how many altimeters flew
  (<https://tccrockets.com/v2/tcc-documents/recordform.pdf>,
  <https://tccrockets.com/v2/tcc-documents/recordclasses.pdf>). **One counter-example, recorded
  rather than buried:** NAR high-power *competition* scores multiple altitude systems on one flight
  as the AVERAGE of all systems, rounded up to the next foot
  (<https://www.nar.org/contest-flying/high-power-competition/>). Debrief still does not compute
  that mean — a blended number on a measurement surface is the thing the spine forbids — but a
  flyer entering NAR competition needs it, and the comparison surface already shows them every
  contributing reading. Filed in `BACKLOG.md` as a real, cited gap rather than settled here.
- **2026-07-30 — the crop Sev-1 was fixed inside D3's first slice rather than as its own pass.**
  Rejected: filing it and shipping the milestone slice alone. It is one function — the same
  replace-in-place D3 had to add a member to — and adding `flightId` there without fixing the rule
  would have lost the grouping on reopen in exactly the same way. Fixing the class was cheaper than
  fixing the instance twice.
- **2026-07-29 — ordered by what bites the flyer first, not by distance from the North Star.** The
  first draft of this file led with the multi-recording model (now D3) because it is the largest
  architectural debt and the North Star names it. Two independent adversarial reviews refuted that
  ordering on measurement, and they were right: a redundant-altimeter flyer today gets two correct,
  caveated reads — a cost in steps — whereas a launch-day file gets a *wrong* flight time with no
  caveat, and a raw card file does not open at all. `MAINTAINING.md` says to rank by damage, and the
  wrong number outranks the missing convenience. Rejected: model-first ordering.
- **2026-07-29 — the manual crop leads D1, ahead of better automatic segmentation.** Rejected:
  improving the detector alone. The automatic route has been prototyped and refused twice on
  measurement (`BACKLOG.md:1148`, `:1233`); the detector should still be fixed as the Sev-1 above, but
  the capability a flyer needs is to be able to overrule it.
- **2026-07-29 — the Sev-1 segmentation cliff is filed as a preempting defect, not as a milestone.**
  Rejected: making it D1. Milestones are capabilities; this is a wrong number, and the *Each pass*
  rules already say a Sev-1 is fixed before the milestone regardless of what the milestone is.
- **2026-07-29 — five milestones, with D6–D8 named but not decomposed.** Rejected: decomposing all
  eight now. A milestone written without having built the one before it is a guess, and the
  self-extension rule above makes deferring it free.

---

## Keeping this file honest

- **Update the `Status:` line in the same commit as the work.** It is the only thing telling the next
  run where the baton is, and a status updated "later" is a status the next run reads wrong.
- When a milestone ships, mark it `SHIPPED <date> — <pinning check>` and say what it actually
  delivered versus its *done when*. The gap is the next session's first increment — work it forward
  rather than re-opening the milestone.
- A defect found while building goes to `BACKLOG.md` unless it is Sev-1 or blocks the milestone.
  Filing it is not deferring the work; absorbing the run into it is.
- If a milestone turns out wrongly ordered or wrongly sized, re-order or re-split it here and say why,
  under *Decisions taken without the owner*. Discovering that is progress; the next run should inherit
  it rather than rediscover it.
- **This file must never be dry.** If the last milestone is `SHIPPED`, decomposing the next one is the
  run's first increment. A dry roadmap is not permission to go back to the defect ledger.
