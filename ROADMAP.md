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

**Status:** SHIPPED 2026-08-01 — pinned by `lib/proposeGroups.test.ts` (15 assertions, five
falsified by mutation, including the corpus measurement) and **four** journeys in
`e2e/analyze.spec.ts` walking the real app: offered-with-evidence, refused-and-nothing-merged,
not-offered-across-different-launches, and the flyer naming which recording reports the flight
before accepting.

Decomposed 2026-07-31, then **amended 2026-07-31 by a second measurement that found a signal the
decomposition had concluded did not exist**, and closed 2026-08-01 when the last open item was
**refused on a measurement** rather than built — see *What is left* below. A flyer drops two files
off one flight, is offered the grouping with the evidence in words, says which recording reports
it, and accepts or refuses in one press.

**The gap against the original *done when*, recorded rather than implied:** every clause is met —
the offer, the evidence, one press, exactly what D3's manual grouping gives, no proposal across
the five confusable pairs, no staged pair proposed, nothing grouped without acceptance. What is
NOT delivered is separating *one recording exported twice* from *two instruments*; that relation
is still conflated, the sync counter cannot separate it, and the summary CSV's serial number is
the next place to look. It is D7's starting point, not a reopening of this one.

### The amendment, measured 2026-07-31 — read this before the decomposition below

The decomposition concluded that no CONTENT signal separates one flight's files from another's, and
that only *arrival* survives. That is true of the three signals it tested and **false in general**:
it never looked at the file NAME.

**Featherweight's download tool writes the launch second into every file name it produces.** Over
the manifest's 61 files, 12 carry `MM-DD-YYYY_HH_MM_SS`, and a ±120 s rule over them yields
**16 true pairs and 0 false pairs** — the separable distribution D6 concluded did not exist. The
widest spread inside a true group is 5 s; the nearest pair that must be refused is 956 s away, so
the tolerance sits 24× above the widest true pair and 8× below the nearest false one.

It is the LAUNCH instant, not the download time, and that was verified rather than assumed:
`BlRv_SN1537_HR_04-12-2025_12_45_49.csv` opens at `12:45:47.382` with `Flight_Time -2.040`, so
T0 = 12:45:49.4 — the second in its own name. That is why it can be shown to a flyer as evidence.

**Two bounds, both load-bearing.** All 12 stamped files are Featherweight-ecosystem, so this is a
vendor-specific key that NARROWS a proposal rather than replacing arrival — and it is exactly why
the staged pairs the notes below name as standing negatives are refused for a *reason* rather than
by a special case: none of their files is stamped. And a file name is not a measurement, so this
deliberately never becomes `FlownAt`: it is evidence for a grouping the flyer confirms, and nothing
else reads it.

**Also corrected:** the decomposition's figures ("44 manifest files", "21 groups") predate the
current corpus, which holds **61 files in 29 groups**. Its conclusions about apogee and wall-clock
agreement were re-checked and stand.

### What shipped 2026-07-31

- `lib/proposeGroups.ts` — `launchStampFromName` and `proposeGroups`. A proposal needs BOTH
  co-arrival and stamp agreement; neither alone is sufficient, and the module says why in full.
- `components/GroupProposalBanner.tsx` — the offer, with its evidence in words and two presses:
  *Yes, one flight* / *No, separate flights*. Accepting runs the same `planGrouping` the manual
  press runs, so there is one code path and nothing new in the data model.
- **It renders where the drop LANDS the flyer**, which is not where it started. It was written
  inside `RecentFlights`, and a walk of the built export showed that is the one place a flyer is
  not looking after dropping two files: both surfaces switch to the comparison, and the analyze
  route returns early on `phase === 'compare'` without rendering the logbook at all. An offer
  nobody sees at the moment it applies is the "feature reachable only by knowing it is there" tell.

**What is left: nothing. Both remaining items are closed, one shipped and one refused on a
measurement.**

- ~~the primary is a suggestion and the banner does not yet let the flyer change it before
  accepting~~ **SHIPPED 2026-08-01.** The banner carries a `Segmented` "Reported by" control,
  seeded from the suggestion and overridable before the press. Each option is labelled with the
  part of the file names that actually differs — `distinguishingLabels`, which strips the shared
  head and tail at TOKEN boundaries, because character-level matching walks straight through the
  boundary and turns `HR`/`LR` into `H`/`L`. Pinned by `e2e/analyze.spec.ts` — *the flyer names
  which recording reports the flight, before accepting* — which was falsified by mutation twice:
  the first version of the assert passed with the choice thrown away, because the logbook row
  carries a nested list of every recording by name and so contains both names whichever one is
  primary. It asserts on the "reported by" line now, in both directions.

  **Each option carried that recording's apogee for one draft, and it came out again — recorded
  here rather than rediscovered.** `RecentMeta` stores `apogeeM` with no `apogeeIsFloor` beside
  it, and that flag is real: a record whose log ends at its own peak reports a LOWER BOUND. A bare
  number on the control that decides which instrument reports the flight pushes a flyer toward the
  larger of two figures when the larger one may be the floor — the same defect as publishing a Cd
  off a refused velocity, one surface further on. What each recording read belongs where it is
  already shown with its context, on the recording strip after the flight exists. **Putting an
  apogee back on this control means storing its provenance first.**

  Two more, both caught by the pre-push read and both now pinned. The options' width is
  FLYER-controlled — they are file names — and `Segmented` lays them out in a row, so a long label
  scrolled the whole DOCUMENT sideways on a phone: measured 423 px against a 390 px client, and
  108 px over once the options moved up to body size. Labels are clipped at 18 characters and
  `e2e/touch.spec.ts` asserts `scrollWidth <= clientWidth` with deliberately long names. And the
  control renders only for 2–5 recordings, which is §5's own range for `Segmented`; beyond that the
  offer degrades to its suggestion and the row control, rather than inventing a vocabulary.

- ~~Featherweight publishes an in-file join key — a sync counter shared by the HR and LR files~~
  **REFUSED 2026-08-01 — measured, and it is the apogee failure again.** `Sync` is a free-running
  millisecond counter mod 250, deterministic from the timebase, carrying no per-recording
  identity. `lib/parsers/blueraven.ts:66` already said so in one clause — *"the on-board sync code
  rolls over every 250 ms and can't be used directly"* — and the measurement confirms it is fatal
  rather than inconvenient:

  | pair | relation | shared samples | distinct offsets | best offset agreement |
  |---|---|---|---|---|
  | `lemiv-HR` × `lemiv-LR` | **true** — one board | 9,655 | 1 | 100.0% |
  | `lemiv-HR` × `reddit-HR` | **false** — unrelated flights | 96,629 | 1 | 100.0% |

  A TRF L3 flight and a Reddit 121 km flight — different airframes, different continents, about
  nine months apart — join *perfectly*, at a single constant offset, across 96,629 shared samples.
  The false pair is not merely admitted; it is **indistinguishable from the true one**, and it is
  the larger and cleaner join of the two. Any two files sharing a `Flight_Time` grid agree at some
  constant offset, because that is all the counter is.

  It is worse than a bad threshold: `blueraven__reddit-meraki2-121km__BlueRaven-LR.csv` **has no
  `Sync` column at all**, so one of the four genuine pairs is unjoinable before any rule runs.

  **The only real per-recording identity in this data is in the summary CSV** — `Serial
  number,SN1537` and a firmware stamp — and only 2 of the 4 Blue Raven groups ship a summary file.
  It is already captured as `RecentFlight.summaryText`. That is where a future attempt at
  separating *one recording exported twice* from *two instruments* should start, and it is a
  narrower capability than this item claimed.

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

## D7 — Deeper honest insight, the stated moat

**Status:** SHIPPED 2026-08-01 — all four slices, decomposed and finished the same day D6 left the
D-track dry. Corpus assertions 40 → 54 and a tolerance that was absorbing a gravity; every recorded
channel readable as numbers; the derived-peak overstatement made a computed, corpus-pinned figure
instead of prose that had drifted into publishing a number no pair produces; and each recording of a
staged launch reading its own figures on the composite, which no tool in the field ships from flight
logs.

**Two of the four slices had a false premise, and that is the durable lesson from this milestone.**
Slice 1's stated first slice turned out to be already shipped, and slice 4's said the composite
"describes itself as though it were one motor" when `lib/composite.ts` merges nothing and never has.
Both were written from reading the code's intent rather than running it. The next decomposition of
any milestone should open by executing the thing it claims is missing.

**Where the depth is still owed** is recorded in slice 4 below: a staged flight's burn time is the
span from liftoff to the end of powered flight, and on the corpus's two-motor record 15.79 s of that
23.91 s span was a coast. It is not fixed, the blocker is one file, and what would settle it is
written down.

**Decompose by readings a flyer ASKS FOR and that can be CHECKED, never by what is computable.**
That sentence was already in the after-list and it is the whole constraint: this milestone is where
"measurement instrument, not simulator" is easiest to breach, because every new reading is one more
chance to publish a number the data does not support.

### What is already there, measured 2026-08-01 before proposing anything

**21 readings** in `lib/readings.ts` — apogee, max/burnout velocity, max and average acceleration,
thrust-to-weight, burn time, burnout altitude, coast time and efficiency, max Q, drogue and main
descent rates, descent and flight time, ground temperature, battery, peak roll rate, revolutions,
tilt at burnout — plus eight derived panels: measured Cd, parachute Cd, drogue Cd, deploy altitude,
landing energy, ejection delay, rail exit, and the GPS and device-summary cross-checks.

**So D7 is not "add the obvious readings".** They are shipped. What is missing is depth of a
different kind, and each slice below names the ground truth that would settle it.

### The slices, ranked by what a flyer can check

1. ~~**Every recorded channel readable as numbers, not just six.**~~ **DONE 2026-08-01.**
   `SampleTable` showed the channels the explorer had selected, and the explorer caps at
   `MAX_SERIES = 6` — a limit whose own comment justifies it as "how many traces stay readable",
   which is a fact about a CHART and not about a table. `analyzedDataCsv` already carried every
   channel, so the data was there and only the in-app view was capped. AltosUI "shows all of the
   data available from the flight computer" (VERIFIED). *Done when* a flyer can read every channel
   their board recorded without swapping chart selections, and a Blue Raven log proves it.

   **Measured over the corpus before building:** of the **25 corpus files a parser auto-detects as
   a flight**, **23 carry more channels than the chart will draw at once**, the richest carries **15**, and **119 channels in total**
   could not be read as numbers without going back to the chart and swapping the selection. Worse
   than the "six" in the title suggests — the table inherited whatever the flyer had *plotted*, so
   on a fresh Blue Raven LR read it showed **1 of 11**, not 6 of 11.

   The table has its own scope now, defaulting to every channel, with a `Segmented` giving the
   chart's own selection back in one press for reading the plot's numbers. The conversion to
   display units is deferred until the `<details>` is actually opened: this is one array per
   channel, and 15 channels of a 190,000-sample file is ~23 MB to hold for a panel that is
   collapsed by default. Verified in a real browser on `blueraven-app-lr.csv` — **12 columns where
   there were 2** — and pinned by `e2e/analyze.spec.ts` → *"every channel the board recorded is
   readable as numbers, not just the plotted ones"*. It reads the NUMBERS, not just the headings —
   a table with every header and no cells is exactly the shape a broken data path takes here, and
   would satisfy a column count. It names four channels a six-trace chart could never show together,
   checks the battery column parses as a plausible voltage, and pins the keyed sort across a scope
   change. Falsified by pinning the table back to the chart's selection and watching it go red at 2
   columns.

   **`MAX_SERIES` is untouched**, deliberately: six traces on two axes is still the right answer
   for a chart, and the defect was never the limit — it was a chart's limit deciding what a table
   could show.

2. ~~**A reading's uncertainty, not just its value.**~~ **DONE 2026-08-01 — and the figures it was
   supposed to attach turned out to be wrong.** The invariants require an accuracy claim to be
   "a range with their basis, not a flattering single number", and to name a caveat's DIRECTION and
   size where the corpus can measure them. The corpus can: it is grouped by flight, so a second
   instrument's reading of the same flight bounds the first. *Done when* at least one headline
   reading carries a measured range whose basis is a corpus statistic, cited on the validation
   page, and a test fails if the range is quoted without its basis.

   **What shipped.** `lib/derivedPeak.ts` holds the figures once — pairs, both bases, and the
   basis each rests on — and `lib/parsers/corpus.test.ts` → *"matches lib/derivedPeak.ts, pair for
   pair"* recomputes them from the real logs and fails if they move, so a published accuracy figure
   can no longer drift from the corpus. Six sites that had written the sentence out by hand now
   read from it.

   **Three things were wrong before it, all found by measuring rather than by reading:**
   - **A published `+30%` that no pair in the corpus produces.** Its stated source was "a
     PerfectFlite baro against an AltusMetrum inertial on the endurance flight" — the endurance
     group holds ONE recording, and the PerfectFlite that does sit beside a TeleMetrum is on sg1.1
     and is a `knownIssue` fixture the runner never analyses. **A published accuracy figure had
     been computed off a read Debrief refuses to stand behind.**
   - **`/validation` said a derived peak is "softer at peak speed than a logged one".** It reads
     HIGH — the analysis says so at `lib/analyze/index.ts:2739`, and a corpus test has been named
     *"a speed differentiated out of an altitude reads high, not soft"* the whole time. Telling a
     flyer their peak is soft invites reading it as a floor when the corpus says it is a ceiling,
     which is the dangerous direction on a supersonic claim. The same bullet said two flights
     "bracket the error in both directions" and then gave two examples that are both high.
   - **The saved document carried no provenance at all.** `lib/report.ts` says in its own comment
     that "the document a flyer files has to carry the qualifier the screen shows" — and did that
     for the apogee floor while the peak speed left bare, because `maxVelocitySub` was
     module-private and there was nothing to call. The tile said measured/derived; the `.txt`,
     `.md`, `.html`, the clipboard and the print card all printed the speed bare. `.md` and `.txt`
     are precisely what a cert document is built from.

   **The shape of the measurement, which matters more than the range.** Four pairs over two
   flights, and they are not four of a kind — the spread widens exactly as the comparison gets less
   clean: a TeleMetrum's CSV against its own `.eeprom` (**+4%**, one device, one flight, method
   isolated with no confound at all) · a Blue Raven against a Featherweight GPS (**+5%**) · against
   an Eggtimer Quantum baro (**+23%**) · against an Eggtimer Proton baro through the transonic push
   (**+110%**). So +4% is what differentiating costs when nothing else differs. `isolatesMethod`
   carries that distinction in the data so the wide end cannot be quoted as the cost of the method.

   **The most important thing this slice produced is a claim CI refused.** A local run found four
   pairs, all high, and the first version of this work published *"a derived peak is an upper
   bound"* on that basis — on `/methods`, on `/validation`, on the metric grid and in the analysis's
   own caveat. **CI, running the corpus `corpus.lock.json` actually pins, found six pairs and one of
   them reads 13.7% LOW.** So the claim was false, and it was false in the flattering direction:
   telling a flyer their derived peak is a ceiling when it is not.

   Worse, the app had said the right thing before — *"the error runs both ways"* — and the
   "correction" to *"reads high"* was the regression. What was genuinely wrong in the original was
   only its examples (it offered two, both high) and one stale figure. **The published wording is
   back to both-ways, now with the measured spread beside it**: `-14% to +110%`, usually high,
   bounding the speed in neither direction.

   **This is also the first hard evidence that the attached fixtures checkout and the pinned release
   are different corpora** — `VERSION` says `v1.0.0`, `corpus.lock.json` pins `v1.1.0`, and they do
   not agree about which fixtures are analysable. A local green run cannot see the difference, so
   `lib/derivedPeak.ts` is a **superset** and its test asserts CONTAINMENT rather than equality: a
   pair the corpus shows and the published list omits fails, a listed pair a smaller corpus cannot
   reproduce does not. Equality would have made the check pass on exactly one corpus and go red on
   the other, which teaches the next session to widen it.

   *(The original decomposition, kept because its cautions still hold:)*
   **Measured 2026-08-01, so the next run builds rather than re-derives.** Every manifest row carries a `stated_max_velocity`; sweeping all of
   them through the real pipeline gives peak speed against ground truth, split by how Debrief got
   it:

   | source | fixtures | agreement with the ground truth |
   |---|---|---|
   | device velocity channel | 11 | **0.0%** on every one |
   | device channel vs a *summary* figure | 1 | −4.7% (`lemiv-l3` Blue Raven LR: 427.0 m/s read, 448.3 stated) |
   | barometric, derived | 5 | **+2.8%, +3.0%, +9.4%, +17.2%, +99.7%** — every one HIGH |

   **Three cautions, all of which would make a careless range wrong:**
   - The 0.0% column is **self-consistency, not accuracy**: Debrief reads the device's own velocity
     channel and the device's summary states that same peak. It bounds units, sign and window — not
     how well the instrument measured the flight. A range built on it would be a claim about
     agreement with itself.
   - The **+99.7%** is `Proton-FW_format.csv`, whose velocity column is the file's own altitude
     differenced (the corpus records its raw peak as 4,880 ft/s on a Mach 1.3 flight). It is a real
     barometric read and belongs in the population, but quoting it as the top of a range without
     saying what it is would read as an instrument error rather than a method limit.
   - **Say which basis the ratio is on.** The invariant names this exactly: the same GPS pair reads
     +5% on the speeds and +8% on the Mach numbers, and `/validation` already quotes both. A range
     published under the wrong one is its own wrong claim.

   **What already exists, checked before proposing anything** — this is the trap slice 1 fell into,
   where the stated first slice turned out to be shipped. `/validation` and `lib/analyze/index.ts`
   already carry the direction AND the size in prose: *"Every derived peak the corpus can check runs
   the same way, the barometric ones by +23%, +30% and +110%"*, plus the transonic caveat naming
   Mach 1.19-against-0.93 and 2.64-against-1.22. **So the gap is not that the number is unknown; it
   is that no READING CARRIES it.** The caveat lives beside the tile as prose, and `lib/readings.ts`
   says only `derived` where §6 and the safety invariant want a range with a basis.

   **The smallest shippable slice**, therefore: give `maxVelocity` a machine-readable uncertainty
   (a signed range plus the basis it was measured on) on the flight model, surface it wherever the
   reading is surfaced — the metric grid, the report, the comparison, the print card and every
   export — and hold the prose and the number side by side in a test, the way `lib/readings.test.ts`
   already holds two reading lists side by side, so the page and the figure cannot drift.

3. ~~**The readings the corpus can settle and nothing asserts.**~~ **DONE 2026-08-01 — and the
   tolerance turned out to be hiding a whole gravity.** Recorded because it was the standing hole:
   the corpus asserted an apogee on most fixtures and almost nothing else, which is exactly where
   that day's earlier Sev-1 lived — a Cd of 0.00 and a window of "Mach 9.90 – 23.10" on a flight
   whose golden value was green. *Done when* every fixture whose `manifest.csv` row carries a
   velocity or Mach ground truth asserts it, and the count of asserted quantities per fixture is
   itself pinned so it cannot quietly fall.

   **Measured before touching anything:** all 61 manifest rows carry a `stated_max_velocity`, and
   the effective contract (`expected.json` + `corpus-overrides.json`) asserted **40 quantities over
   33 fixtures — 33 apogee, 4 maxAccel, 3 maxVelocity**. It is **54 CHECKED over 33** now:
   `maxVelocity` 3 → 11, `maxAccel` 4 → 10, and 13 fixtures pin two quantities or more.

   **It read 55 over 34 for part of the run, and the correction is the useful part.** One of the
   nine new velocity asserts landed on a fixture carrying a `knownIssue`, and `runFixture` returns
   before `assertGolden` — so it was never evaluated. Set to **1.0 m/s on a flight that reached
   1,719.4 m/s, the suite stayed green.** That is the same trap the mapping branch already refuses
   for a never-analysed file, and worse here because the new ratchet was counting it. The runner
   refuses the combination outright now, the ratchet counts only fixtures it actually asserts on,
   and both published figures came down by one. Pinned by
   `corpus.test.ts` → *"says how many quantities it pins per flight, and never fewer"*, a floor
   ratchet rather than an equality, so adding a fixture cannot turn it red.

   **The find worth keeping is not the count.** Every one of the eight Altus Metrum flights read
   **exactly +9.80 m/s² — one standard gravity, zero spread** — above its own stated peak
   acceleration. That is not a defect: `lib/analyze/index.ts` deliberately reports SPECIFIC FORCE
   (+1 g at rest, what the sensor measures) while AltOS states its peak net of gravity, and
   `/methods` has said so all along. The defect was in the **contract**: both accel asserts stated
   the gravity-removed figure and carried `tolPct: 6`, so the tolerance was absorbing the offset.
   One g is 1.2% of an 84 g boost and 9.4% of a 10.7 g one, which means the tolerance had to be set
   by the smallest flight anyone wanted to assert, **and no regression narrower than a gravity could
   ever trip any accel assert.** An `Assert` now names its `basis` and the ground truth is converted
   onto Debrief's convention before comparison; the eight then agree to **within 0.006%** and the
   tolerance went 6% → 2%, where it measures precision instead of a definition. A `maxAccel` assert
   with no basis is now refused outright.

   **Falsified, five ways**, because an assert that cannot fail is worse than none: dropping the
   basis from the smallest accel flight goes red at 2% (114.4 vs 104.6±2%); a perturbed velocity and
   a perturbed acceleration each go red; a `basis` on a non-acceleration metric is refused; and the
   untouched contract stays green.

   **What is still NOT pinned, stated rather than glossed:** descent rates — 17 manifest rows carry
   one and no fixture asserts it. `/validation` now says that out loud rather than implying all four
   headline numbers are checked. That is the next slice's starting point.

4. ~~**Stage-aware readings on a composite.**~~ **DONE 2026-08-01 — and its stated premise was
   false, which is the second slice of this milestone to open that way.** The entry said "the
   readings still describe the composite as though it were one motor". Nothing did: `lib/composite.ts`
   says in its own first paragraph that "**It merges nothing** — there is no composite altitude, no
   composite speed, no blended reading of any kind", `Composite` has no metrics field at all, and
   `StitchSurface` never imported `metricTiles`. There was no merged reading to make stage-aware.

   **What was actually missing is the opposite of what the entry described.** The composite has held
   every recording's whole `FlightAnalysis` since D4 and surfaced exactly ONE number off it — the
   burn duration — so a flyer who wanted the sustainer's own apogee, its peak speed, or the
   thrust-to-weight the booster left the pad at had to leave the surface that knows these are one
   launch, open each file on its own, and hold two or three reports in their head.

   *Done when* the three staged corpus groups named by `lib/parsers/d6Grouping.test.ts` report
   per-stage figures, and a single-stage flight is unchanged. **Met, and measured:** `stageTiles`
   in `lib/readings.ts` is a subset of `metricTiles` selected BY LABEL — so a stage panel cannot
   invent a reading, cannot format one differently from the single-flight grid, and cannot drop a
   qualifier — and `corpus.test.ts` → *"every staged group reports per-stage figures, and each is
   one recording's own"* runs it over the real logs. **9 recordings across the three groups report
   figures**, e.g. the Kairos booster at *Apogee 2,973 m · Max velocity 332 m/s · Max acceleration
   84.6 g · **Thrust-to-weight 5.0:1** · Burn time 5.1 s · Burnout altitude 1,012 m* beside its
   sustainer at *Apogee 4,045 m · 366 m/s · 9.5 g · Burn time 4.8 s*. Nothing is combined: a
   booster's apogee is where the booster came down. `e2e/stitch.spec.ts` walks it and reads the
   NUMBERS rather than the headings — a panel with every label and no values is exactly the shape a
   broken data path takes when `recordings` is new state — falsified by pointing every stage at the
   first recording's metrics and watching the two apogees become one string.

   **`COMPETITION.md` row 23 is why this is worth more than it looks**: per-stage burn time and
   per-stage thrust-to-weight derived from FLIGHT LOGS are shipped by no tool in the field. AltosUI
   opens one file per window and its per-"stage" tabs are flight STATES; OpenRocket has per-stage
   branches but only from a simulation; RockSim colours per stage role, from a design.

   **What this slice did NOT do, with the measurement that says why.** A staged flight's `burnTime`
   is still the span from liftoff to the end of powered flight, and on `meraki2` that is **23.91 s
   of which 15.79 s the motor was not burning** — two ascent thrust runs, T+0.00–4.46 and
   T+20.25–23.83, on a manifest-stated **O7800 booster + N3100 sustainer**. The second ignition is
   unmistakable in the record: the signed axial steps −15.7 → +92.7 in one 0.25 s sample, peaks at
   549 m/s² (56 g), and the speed goes 427 → 1,663 m/s. `avgBoostAcceleration` is averaged across
   the same span and diluted by it.

   **The blocker is one file and it is stated rather than glossed.** `iss-endurance` — one motor by
   its manifest row — also produces a second run, T+5.65–6.95 peaking at 80.7 m/s², inside a stretch
   where the record repeats a sample and its altitude goes backwards. A rule that fires on meraki2
   and not on endurance can be written and would be separating one example from one example, which
   is fitting rather than measuring, on a number a flyer reads. **What would settle it:** a second
   staged record in the corpus, or endurance's second run corroborated or refuted against the
   StratoLogger that flew with it (it is a redundant-board group, so the second board exists — it
   simply has no accelerometer, which is itself worth checking against its baro-derived speed). That
   is the next slice, and it is a corpus request as much as a code change.

**What this milestone must NOT do**, stated because it is the likely failure: no reading that
cannot be reproduced from the flight's own record, no motor recommendation, no comparison against a
simulation, and no number whose method is not on the methods page in the same change.

**Size.** 4–6 increments. Slice 3 is the cheapest and the one with a Sev-1 already behind it; slice
1 is the most visible to a flyer.

---

## D8 — Orientation and high-rate data

**Status:** IN PROGRESS — **slices 1, 2 and 3 SHIPPED; the tilt slice (4) is MEASURED AND BLOCKED, and its blocking number was measured over spliced data — which slice 3 now makes it possible to remove.**
Decomposed the same day, from measurement, after D7 shipped and left the D-track dry.

**This line said "slices 2 and 3 remain" for a run after slice 2 had shipped, and correcting it is
worth more than it looks.** Slice 2's own body below records it as shipped and names its four
pinning assertions; only the status line — the baton this file says is what a session reads first —
still called it open. A status line that disagrees with its own section is exactly the thrash the
`Status:` vocabulary exists to prevent, and the cost is a whole increment spent rebuilding something
that is already pinned. **Update the status line in the same commit as the work, not the body
alone.** Re-verified 2026-08-02 before this edit: `lib/parsers/blueraven.test.ts` carries the "this
board did not record it" assertion that is slice 2's own *done when*.
`COMPETITION.md` rows 3 and 4. North Star 1's third bullet, on the boards flyers increasingly own.

**The after-list said "verify the ingestion ceiling against a real high-rate log first; that
measurement is the first increment." It has been taken, and it moved the milestone.**

### What the measurement found, 2026-08-02, over all 48 analysable corpus files

**The ingestion ceiling is not the problem, and the row that assumed it was is wrong.** Every
analysable file parses AND analyses end to end in under a second: the worst is
`blueraven__reddit-meraki2-121km__BlueRaven-LR.csv` at **901 ms for 36,700 samples over 10.7 MB**,
and the next is 895 ms. The highest sample rate the analyzer sees is **114 Hz** (an AltimeterCloud
flight, 7,799 samples). Nothing chokes, nothing is decimated, and there is no performance slice
here worth an increment.

**The problem is that the file carrying the data is REFUSED.** The corpus holds
`blueraven__reddit-meraki2-121km__BlueRaven-HighRate.csv` — **192,001 rows, 15 MB**, columns
`Flight_Time_(s), Sync, Gyro_X, Gyro_Y, Gyro_Z, Accel_X, Accel_Y, Accel_Z, Quat_1..Quat_4,
Aux_Volts, Current`. That is precisely the three-axis orientation and high-rate content rows 3 and
4 are about, and `lib/parsers/blueraven.ts` throws a `ParseGuidanceError` on it — *"This is the Blue
Raven high-rate file (gyro, acceleration and attitude only). Drop the low-rate file instead for
altitude and the flight profile."* The refusal is CORRECT as far as it goes: the file has no
altitude, so it is not a flight on its own and nothing in the current model could hold it. But the
consequence is that **the richest recording in the corpus reaches no surface at all.**

**And no orientation channel is named anywhere.** Of the channels `buildPlotChannels` offers across
48 files, the named ones are `d-altitude` (48), `d-altitude-raw` (48), `d-velocity` (48),
`d-mach` (33), `d-q` (33) and `d-acceleration` (26). Everything else is a raw passthrough — `r-0`
(48) through `r-12` (1) — so a gyro trace that IS present in a low-rate file arrives as an unnamed
column a flyer has to recognise by its numbers.

### The slices, ranked by what a flyer can check

1. ~~**Read the high-rate file as a SECOND RECORDING of a flight it does not itself contain.**~~
   **SHIPPED 2026-08-02**, pinned by `lib/highRate.test.ts` (9 tests) and by
   `e2e/audit-compare.spec.ts` → *"a drop of all three Blue Raven files reads all three, and says
   what each contributed"*, which reads the channels off the running app by name.

   **Two clauses of this slice were FALSE PREMISES, and both were found by executing them.**

   - **`lib/stitch.ts` is not the machinery this needs, and reaching for it would have imported
     an estimate where an exact value exists.** Stitch aligns DIFFERENT boards and returns
     `verified: false` on every path because nothing in the records establishes the offset. One
     board writes both halves off ONE flight clock — measured, all four corpus pairs open within
     **0.062–0.108 s**, which is the sample phase of 500 Hz against 50 Hz. The only shift applied
     is the flight's own re-basing (`buildFlight` zeroes each flight on its first sample), read
     out of the low-rate file by `flightTimeOrigin`.
   - **"Both corpus HR files" is five**, and one of them is a shape this slice deliberately does
     not read: `…SG1.2-Sustainer-November-BlueRaven-High.txt` is the serial `@ LOG_HIR` capture,
     whose columns are unlabelled positional tokens. Reading them would be a guess at the vendor's
     field order, so its refusal stands as the whole answer for that shape.

   **The obvious implementation was a Sev-1 and the measurement caught it before it shipped.**
   Resampling 500 Hz onto the 50 Hz flight clock — what `multiTimebase` already offers — loses
   **69.0%** of `jan18`'s `Accel_Z` peak (264 g read as 82 g), 61.6% of `lemiv`'s, 50.2% of
   `meraki`'s and 42.1% of `jan10`'s `Gyro_X`. Each point kept is instead the largest-magnitude
   sample the board recorded in that window, so every plotted value is a real sample and the peak
   survives by construction.

   **And the reduction that is right for a RATE is meaningless for an ATTITUDE** — found by review
   after the first version was written. Reducing the four quaternion components independently takes
   each from a different instant; the merged norm averaged **1.0132** on `jan10` against an exact 1,
   which is not a rotation and not an attitude the board ever solved. Attitude channels take one
   whole sample per instant, shared by all four. The same mistake had `railed()` flagging `Quat 1`
   as a saturated sensor on every corpus file, because a normalised component's maximum repeats for
   thousands of pad samples — a fabricated saturation warning, which breaches the safety invariant
   exactly as a missing one does.

   The standalone refusal survives unweakened, pinned byte for byte over all five HR files. Units
   are read off the data rather than asserted (`|accel|` on the pad 0.9935–0.9947 → g; `|quat|`
   0.99998–1.00000 → normalised), and the vendor's Sept 2025 manual states the same schema. **No
   axis is mapped to `accelAxial` or `rollRate`**: `lemiv` rests on X and `jan10` on Z, so the
   board is mounted differently in different rockets and guessing would publish a lateral reading
   as an axial one.

   **What this slice deliberately did NOT do**, and the next one starts here: no reading is
   computed off the reduced stream. A number read off an envelope needs its own validation.
2. **Name the orientation channels, and only where the board recorded them.** `Gyro_X/Y/Z`,
   `Accel_X/Y/Z` and `Quat_1..4` become named channels with units and provenance rather than
   `r-7`. *Done when* a corpus file carrying them plots them by name, and a file that does not says
   "this board did not record it" rather than showing an empty axis.

   **STARTED 2026-08-02 on the orientation channel that was not in this list at all, because
   looking for the ones that were turned up a wrong number first.** The premise here is the
   high-rate file's gyro and quaternion columns. Reading the LOW-rate file's headers instead —
   all four app-CSV corpus exports — found `Tilt_Angle_(deg)`, `Future_Angle_(deg)` and
   `Roll_Angle_(deg)` sitting side by side, with Debrief mapping only the first.

   **A roll angle was also being read as a RATE — on the generic importer's path, and the scope
   of that claim was corrected by review before it shipped.** `normalize` turns
   `Roll_Angle_(deg)` into `roll angle deg`, so the generic `\broll\b` rate test matched and the
   column arrived as `rollRate`: degrees published as degrees per second. It is the identical
   defect `releaseAttitudeRoll` exists to stop, in the one shape that guard cannot see — it fires
   only where `pitch` AND `yaw` siblings prove an attitude solution, and a board writing
   tilt/future/roll has neither. **`lib/flight/columns.test.ts` was ASSERTING it** —
   `expect(by('Roll_Angle_(deg)').role).toBe('rollRate')` with a comment explaining why that was
   correct — which is how it survived.

   **What it was NOT: a wrong number on any file Debrief recognises by name.** The first version
   of this entry said the corpus files "reported a roll RATE"; they did not. `blueraven.ts`
   mapped no roll column at all before this change, so the four Blue Ravens had no roll channel
   of either kind. The exposure is an unrecognised CSV going through the column mapper — real,
   reachable, and pinned — but latent rather than observed. The correction is kept here because
   overstating a defect's blast radius is its own kind of wrong claim.

   `rollAngle` is now its own `ChannelKind` and `ColumnRole`, in degrees, offered in the mapper
   beside the rate. The Blue Raven reads its column; the four corpus files carry it and the
   serial `@ LOG_LOW` capture carries none, which is this slice's own "this board did not record
   it" case. It is **cumulative and unwrapped** — it passes a full turn rather than resetting,
   peaking at **26,099°** on meraki, **24,240°** on jan18 and **−4,969°** on jan10 — which is
   why reading such a column as a rate produces a figure no flyer could sanity-check.

   **And on meraki the angle is a FLOOR, which the first version of this slice did not say.**
   That file also carries a board-measured `Roll Rate (HZ)` column, and it holds at exactly
   ±6.38889 rev/s — **2,300 °/s** — for **46 of its 36,700 samples**, which is a sensor at its
   limit rather than a rocket repeating a value. Whatever it did faster was not recorded, so
   neither the rate nor the angle integrated from it contains it. The two agree exactly
   otherwise: integrating that rate over the flight reproduces the board's own stated angle to
   the degree, **25,333° either way**, which both confirms the vendor's stated method and makes
   the total a lower bound. Said on the methods page.

   The board's own limit travels with the channel rather than being left to be looked up: the
   vendor states the roll angle is an integration of the measured roll rate over time that takes
   no account of motion in the other two axes, so it drifts further from true the longer the
   flight runs. **No size is put on that drift** — nothing in the corpus measures roll
   orientation independently, so a percentage here would be invented.

   **`Future_Angle_(deg)` is deliberately refused, and the refusal is pinned.** It is the
   board's PROJECTION of where its tilt is heading, used for its own tilt lockout — not a
   recording of anything that happened. Surfacing another instrument's forward estimate is what
   the measurement-not-simulation invariant rules out.

   Pinned by `lib/parsers/blueraven.test.ts` → *"every app-CSV low-rate export yields the
   board's roll angle, matching its own column"* (over all four corpus files, comparing the
   channel's extremes against the column read straight out of the file), *"a board that recorded
   no angle says nothing about one"*, *"refuses the board's FUTURE angle"*, and by
   `lib/flight/columns.test.ts` → *"tells a tilt angle from a roll angle, and both from a rate"*.
   Four mutations were run against them — removing the header test, removing the parser mapping,
   mapping the future angle, and making the caveat unconditional — and each failed the assertion
   that names it.

   **The reopened question is answered, and the answer is that the mounting IS knowable — but
   not by the method the manual describes. SHIPPED 2026-08-02.** The `Gyro_*` / `Accel_*` /
   `Quat_*` channels now carry `angularRate`, `accelAxis` and `attitudeQuaternion` kinds instead
   of `other`, and — where the record can establish it — a label saying what each axis IS to the
   airframe: *roll rate*, *lateral rate*, *along the airframe*, *across the airframe*. A flyer
   looking at six traces called X, Y and Z can now tell which one is the roll.

   **The vendor's stated method was measured before it was adopted, and rejected.** The manual
   says the board finds the rocket axis "by measuring the direction of the initial motion while
   the rocket is on the rail". Reduced to *which axis carries the largest excursion*, that
   separates the winner from the runner-up by only **1.1×–2.4×** across the four corpus
   high-rate files and picks the **WRONG** axis on two of them: at 500 Hz the lateral axes see
   shock and vibration that rival the boost. The board has its own solution and more to go on
   than its log; Debrief has the log.

   **GRAVITY answers it instead, on the stretch before the record moved.** A rocket on a rail
   stands within a degree or two of vertical, so the 1 g the accelerometer feels while it waits
   lies along the airframe. Measured over all four files the long axis sits **0.26°–1.72°** off
   the at-rest vector and outweighs the runner-up by **33.2×–216.4×**. Two of the four rest on
   `X` and two on `Z`, which is the same board mounted differently in different rockets — the
   fact slice 1 correctly refused to guess at.

   **The window is the LAST still stretch before it moved, not the first and not the longest**,
   and that rule was chosen on a failure rather than on the corpus: a rocket is often horizontal
   while it is prepared, for longer than it then stands on the rail, and gravity across the
   airframe would name a lateral axis as the long one. A synthetic record that lies down for 8 s
   and stands for 1 s pins it. `jan10` shows the rule earns its keep on real data too — something
   disturbs it early, so the run nearest its launch is 0.29 s where the first is 1.34 s, and the
   near one is both the right window and the cleaner reading (0.9987 g against 0.9947).

   **Withheld** where the record never left the ground, where no still window of at least 0.2 s
   precedes it, where the board was turning or rocking through that window rather than resting,
   or where no axis lies within 15° of the gravity it felt. Each of those four guards was
   falsified by mutation; the rocking case exists **because** falsification found the at-rest
   magnitude check unreachable by the tests as first written.

   **The kinds deliberately do NOT become `rollRate` / `accelAxial`.** Those are what the
   analysis reads to produce readings, and a high-rate stream reaches Debrief reduced to an
   envelope — so a metric computed off one would be a number taken from a trace built for
   looking at. Slice 1's boundary stands; naming a trace is not reading a number off it.

   Pinned by `lib/parsers/blueraven.test.ts` → *"every high-rate export names its long axis, and
   says how it knows"*, *"the margin over the runner-up is wide on every record"*, *"the traces
   say which is roll and which is across the airframe"*, *"naming the axis does not let the
   analysis read a number off it"*, and six refusal cases including *"takes the wait on the RAIL,
   not the longer stretch lying on its side"*. Said on the methods page under **Which way is up
   the rocket**.
3. **A high-rate download written more than once — SHIPPED 2026-08-03**, pinned by
   `lib/highRateRepeats.test.ts` (12 tests, of which 6 run the real read path over every corpus
   high-rate pair). *Done when* a replayed block is stated to the flyer and a clean download says
   nothing: both hold, on all four pairs.

   **It was BUILT AND REVERTED once before this**, on the same day, because the pre-push review
   showed the note it put on screen was wrong about which repeat, wrong about how many, and wrong
   about whether a flyer could see it at all. The account below is the measurement that survived
   that revert; what shipped is what the account demanded, and the three things the second attempt
   did differently are named at the end.

   **Re-measured 2026-08-03 before the rebuild, and the corpus numbers reproduce exactly** — but
   only once the payload is taken from the `Sync` column onward. A first pass at re-deriving them
   excluded `Flight_Time_(s)` alone and reported **zero repeats on every file**, because the row
   also carries `Year,Month,Day,Time` — a wall clock that makes every row unique. That is a
   two-minute mistake that looks exactly like "the roadmap was wrong", and it is recorded here so
   the next session does not make it a third time.

   **The gap is real.** A Blue Raven backup download can write the same samples more than once. The
   LOW-rate half of such a download is already reported as *"holds the same flight written twice"*;
   the high-rate half says nothing at all.

   **What the corpus actually holds** — and note the numbers are per-BLOCK, which is where the first
   attempt went wrong. `jan10`'s high-rate file has **three** row-0-anchored repeats
   (`lag 7101 × 7101`, `lag 20160 × 20160`, `lag 27261 × 7101`) totalling **27,261 repeated rows**,
   not the 20,160 of its longest. `jan18` totals **44,793**. `lemiv` and `meraki` have **no repeated
   run of 50 rows or more at ANY offset** — so a detector anchored on the file's opening row and one
   scanning every offset agree on this corpus, and neither guard in the first attempt was load-bearing
   on it.

   **The clause that kills the naive version, and it is not obvious.** Debrief ALREADY truncates
   `jan10` to its first copy: the low-rate half is doubled too, so the analysis extent is
   `{from: 0, to: 1012, startTime: 0, endTime: 20.22}` and the report draws **0 – 20.22 s**. The
   20,160-row block sits at flight clock ≈40 s — **entirely outside what the flyer sees** — while the
   7,101-row block lands at ≈14.1 s, inside the drawn window, and was the one the first attempt threw
   away. So the note described an invisible repeat and hid the visible one. A further **10,120** of
   the file's rows fall outside every window the reduction builds (10,070 of them past the end of the
   low-rate log), so "all 64,290 reach the trace" was false as well.

   **Therefore the requirement, which the first attempt did not meet:** the statement has to be
   EXTENT-AWARE. A repeat is only worth telling a flyer about if it falls inside the stretch being
   drawn — and that stretch is decided by the analysis, long after the parser that finds the repeat
   has run. Reporting every block rather than the longest is necessary but not sufficient.

   **Three smaller corrections worth not re-deriving.** Anchoring on the opening row cannot see
   `[A][B][B][C]` — a repeat with a unique lead-in — so a field documented as "the longest run that
   repeats an earlier run" must either scan every offset or say it means the opening run. The scan
   needs a `n - lag <= best` ceiling or it is quadratic: on 192,000 identical rows it runs for
   minutes, at ingest, on the main thread. And any count put in front of a flyer needs
   `toLocaleString('en-US')` like every other number in `lib/`, or a de-DE browser renders `20.160`.

   **What the second attempt did differently, and it is exactly three things.**

   - **Detection and STATEMENT are separate.** `findRepeatedSpans` is pure and knows nothing about
     extents; the spans travel on the flight as `RawFlight.repeatedSpans`, and
     `repeatedSpanNote(spans, extent)` turns them into a claim only where both halves are in hand.
     That seam is what makes it extent-aware without the parser needing to know an extent it cannot
     have. `lib/report.ts`'s `howRead` is the first place that holds both, so every export inherits
     the note; `FlightReport` calls the same builder for the screen.
   - **The copies are UNIONED.** jan10's four blocks overlap and sum to 41,463 rows; the union of
     what they mark as a copy is 27,261. A row replayed twice is still one row that is not its own
     instant. The first attempt reported a per-block number, which is where "wrong about how many"
     came from. Pinned, and the assertion fails on exactly that mutation.
   - **A still board is not a replay.** Identical rows repeat trivially while nothing is moving, so
     a block only counts where the stretch it copies actually varies. Measured: this removes
     nothing from the corpus — every jan10 and jan18 block varies — so it guards a file the corpus
     does not hold rather than filtering one it does. It is kept because the alternative is telling
     a flyer their download is corrupt because their rocket was on the pad.

   **The pre-push review then found the SAME class of error one layer down, and it is the most
   useful thing in this entry.** The rebuild consulted the extent for *which* repeat to name and
   for the *range* — and not for the *count*, nor for a reassurance it had no basis for:

   - **A clipped range kept an unclipped count.** jan10 read *"14.1–20.2 s … 7,101 of them"* for a
     6.13 s window that holds about 3,065 samples at 500 Hz — a **2.3× over-claim a flyer could
     catch from two numbers in one paragraph**, and precisely the "wrong about how many" that got
     the first attempt reverted. Fixed by deriving nothing: the span's own range and own count are
     facts about the FILE, where the read ends is a fact about the ANALYSIS, and all three are
     stated separately.
   - **"Nothing has been removed: every sample the file holds is still drawn" was false by ~64×.**
     The high-rate trace is an ENVELOPE — one sample per flight instant — so at most 1,012 of
     jan10's 64,290 samples reach it, and 10,119 fall outside every window the reduction builds.
     This file's own slice-3 account already records that number. The sentence also contradicted
     the note beside it in the same list. Deleted; the envelope note is where that is explained.
   - **An unconditional claim about the low-rate half** — *"is read separately and says so on its
     own account"* — was never checked against `analysis.warnings` and is false on any board whose
     high-rate half repeats while `recordedTwice` refuses the low-rate one. Deleted.
   - **130 MB of transient strings on the main thread.** One concatenated key per sample cost that
     on meraki's 192,000 rows, beside the 15 MB file text, for a file with no repeats at all. Now a
     32-bit numeric hash into an `Int32Array` (768 KB) used only to BUCKET, with every proposed
     match confirmed by an exact elementwise comparison — so a collision costs a comparison and
     never a wrong answer. The scan also got faster: meraki 1,030 ms → 641 ms.
   - **A test that fails on timing is a test that will one day fail for no reason and be believed.**
     The two clean pairs shared one `it` at ~3.1 s against vitest's 5 s default and the review
     measured it over the line on a colder machine. Split; the slowest case is now 1.78 s.

4. **One honest reading off the orientation solution.** `tiltAtBurnout` already exists and is read
   from a logger's own solved attitude; a quaternion series can give the same quantity through the
   flight. *Done when* it agrees with the existing `tiltAtBurnout` on a file that carries both, and
   is withheld where the quaternions are absent or unnormalised.

   **MEASURED 2026-08-02 and NOT SHIPPED. The arithmetic works and the validation does not hold on
   the whole corpus, so no number is published.** Recorded here in full so the next run starts from
   the measurement rather than repeating it.

   **What is established.** The Blue Raven's `Quat_1..4` is `(w, x, y, z)`: the other ordering is
   43°–68° wrong on every file. All four records open at quaternion identity with their own tilt
   column reading 0.00°, so the board initialises its attitude on the pad — which fixes the
   reference: tilt is the angle between the long axis rotated by the quaternion and where that axis
   sat at rest. Compared against the board's own `Tilt_Angle_(deg)` over the ASCENT:

   | | body axis | mean error | worst |
   |---|---|---|---|
   | meraki | `X` | **0.64°** | 1.39° |
   | lemiv | `X` | **1.96°** | 3.27° |
   | jan18 | `Z` | **1.28°** | 3.62° |
   | jan10 | `Z` | **22.72°** | 96.49° |

   **This independently corroborates slice 2's axis determination**, which is the most useful thing
   it produced. The body axis that reproduces the board's tilt is exactly the one `longAxisFromRest`
   measures off gravity, on all four files; either wrong axis gives 43°–89° mean error. Two entirely
   separate channels — the accelerometer at rest, and the board's solved attitude against its own
   tilt column — pick the same axis.

   **What blocks it, and it is one file.** `jan10` sits at 22.72° mean where the other three are
   inside 2°. The obvious explanation is refuted rather than merely untested: its gyros rail, but so
   do **all three** of meraki's, and meraki is the best of the four at 0.64°. So saturation does not
   separate them and no other guard tried does either. Publishing a tilt with a refusal that cannot
   tell jan10 from jan18 would be a number right three times in four, which is exactly the
   plausible-but-wrong reading the measurement invariant exists to stop.

   **Also measured, and worth not re-deriving:** over the WHOLE record the agreement falls apart on
   the two tumbling machbuster flights (54°–61° mean) while the two stable flights stay at
   0.79°/1.58°. That IS aliasing — a coherent 500 Hz attitude sample against a 50 Hz column, on an
   airframe spinning under drogue — and it is why any future version of this must be scoped to the
   ascent, not to the record. The first pass at this concluded aliasing had been refuted; that was
   wrong, and only because the wrong body axis was in use at the time.

   **What would unblock it: ANSWERED 2026-08-03, and the blocking number was wrong.** The account
   this asked for is that **`jan10`'s file is spliced.** Its high-rate stream repeats a 20,160-row
   block verbatim and its low-rate half repeats a 1,012-row / 20.24 s block — at DIFFERENT offsets,
   so inside the compared window the two files are describing different instants of the flight. The
   **22.72° above is therefore largely bookkeeping.** Measured on the stretch where both halves are
   pre-seam (t ≤ 12.17 s), `jan10` reads **4.71° mean / 7.29° worst** against meraki 0.21/1.08,
   lemiv 1.83/3.25 and jan18 1.32/3.62 on the identical window.

   **The block STANDS, with a corrected magnitude and a corrected next step.** 4.71° is still 2.6×
   the worst of the other three, and `jan10`'s worst error exceeds all three of theirs, so this is
   not a file that agrees once the corruption is removed — it is a file that agrees less. Do not
   ship a tilt on this. **The next step is not a guard hunt**: re-run the whole slice-3 comparison on
   de-spliced streams first, because every number in the table above was computed over data that
   includes a replay. Then decide. A fifth high-rate corpus file would still settle it faster than
   any of this.

   **The splice is detected and stated to the flyer as of 2026-08-03** — see slice 3 above — so the
   raw material for a de-spliced comparison exists rather than needing to be rediscovered. *(This
   sentence claimed that while slice 3 stood REVERTED, which made it false for a day. It is true
   now. A pointer written against work that was then pulled is the same stale-baton failure the
   `Status:` discipline at the top of this file exists to prevent, and it is worth noticing that it
   happened inside the very section that records the lesson.)*

**What this milestone must NOT do.** No estimated attitude — the invariant is explicit that where a
sensor cannot resolve a quantity the number is withheld, and integrating a gyro to an angle without
a reference is exactly the drift-prone estimate it forbids. No decimation that could move a reported
peak. And no reading off the high-rate file that the low-rate file already reports better.

**Size.** 3–5 increments. Slice 1 is the one that unblocks the others, and it is also the one with a
real risk attached: the standalone refusal must survive it.

---

## P1 — One design system, adopted

**Status:** IN PROGRESS — the primitive layer exists and is pinned. `lib/design-system.test.ts` is
`DESIGN.md` §9 as an EXACT ratchet, so every count below has to move in the same commit as the
conversion that earns it.

**2026-08-02, re-measured at the end of that day rather than carried forward — and four of the six
clauses this paragraph used to carry were already false when written.** `Frame`, `NumberField` and
`Figure` all exist (items 8 and 12); `Panel` is refuted, not pending, because nothing in the app has
the shape §5 draws for it; card treatments are at **3, which is the floor and now a guard** rather
than "7 against a floor of 4". **What is genuinely left is three things:** the five states (item 5),
the caption-size numbers (item 2), and the 29 hand-rolled `<button>`s (item 7) — plus the ~37
still-open rows the design-system audit filed into `BACKLOG.md`.

**2026-08-02 — §2's colour-by-magnitude clause is closed on both surfaces that broke it.** The
logbook's ★ marking a personal best was `text-amber-500`, which is §2's *caveat* hue, so on a column
scanned down for an apogee the mark praising a reading wore the colour that elsewhere warns the
reading is soft; the comparison table's winning cell was `text-indigo-600`, which is §2's
*selected*. §2 forbids colouring a number by whether it is large in as many words. Pinned by
`lib/design-system.test.ts` → *"never carries a superlative in a semantic colour"*, over
`components` **and** `app`. Falsified against the pre-conversion source, where it names all four
true sites.

**Three things the pre-push review caught in this change, and each was a real defect in the fix
rather than a nitpick.** Recorded because the pattern — a conversion that removes a wrong signal and
leaves nothing in its place — is the one to watch for on every remaining P1 slice.

- **Removing the colour without adding a glyph made the comparison WORSE, not better.** Weight alone
  left `zinc-900` against `zinc-800`: a **1.19:1** step in light and **1.15:1** in dark, on a
  `font-mono` column of numerals. The screen-reader text was perfect throughout and a sighted
  low-vision flyer lost the mark almost entirely. The comparison now carries the **same ★ the
  logbook uses**, so the two surfaces that rank flights say it the same way. Every cell is §2
  PRIMARY now, because every one is a number being read — the old `zinc-800/zinc-200` was **not a §2
  text token at all**, and the first version of this entry cited it as "§2's own primary/secondary
  step", which does not exist.
- **The check enumerated the forbidden hues instead of subtracting the allowed ones** — the fifth
  time this file has had to make that correction. It passed `ring-indigo-500`, `fill-amber-500`,
  `text-violet-600` and `text-[#f59e0b]`. And `\bbest\b` cannot match `isSpeedBest`, the actual
  variable guarding one of these marks, so the whole check hung on a prose `title=` string.
- **It reported line numbers that were wrong by up to 72 lines**, because stripping comments deleted
  the lines instead of blanking them — inside a commit whose ledger entry is about one defect filed
  three times at three wrong line numbers.

**What this did NOT close, stated because the first version of this entry claimed it had.**
`rankBlocked` withholds the comparison's crown on a clipped peak, a floor apogee or a mixed source —
but **the logbook has no equivalent.** `personalBests` (`lib/logbook.ts:93`) crowns a raw
`max(apogeeM)` off `RecentMeta`, which carries no floor, clipped or mixed-source flag at all. So a
flight whose apogee the report prints as *"(at least)"* and the comparison refuses to crown is still
starred **"Highest of your remembered flights"** in the logbook. Filed in `BACKLOG.md`; it wants a
schema field on the persisted store, which is why it is not folded in here.

**And a caution the last two increments both earned.** Two of the counts in this list were stale by
the time they were spent against — item 3's dark-surface census, and `BACKLOG.md`'s half-step
figures, which read 21 and were 11. **Re-measure a number in this file before building against it**;
these are records of what was true on the day, not live values, and the ratchet only guards the six
counts it actually holds.

**Measured 2026-08-03 at the end of that run, from §9's own shell block** — and taken TWICE, at the
run's first commit and its last, because "no count moved the wrong way" is a claim about a
difference and this file has carried counts that were stale by two sessions:

| grep | 2026-08-02 (run start, `07198a0`) | 2026-08-03 (run end) |
|---|---|---|
| `rounded-lg` | 0 | **0** |
| hand-rolled card treatments | 3 | **3** |
| off-scale spacing | 0 | **0** |
| off-scale type | 1 | **1** |
| inverted-type files | 14 | **14** |
| components importing `./ui` | 34 of 48 | **34 of 48** |

**Identical at both ends: nothing moved, in either direction.** That is the honest reading and it is
worth stating rather than dressing up — this run's P-track work was about surfaces telling the truth
(three storage-refusal states, a superlative off a claim colour, one chart export instead of three),
none of which any §9 grep can see. The greps measure token drift, not honesty. **The previously
recorded figures here said card treatments 10, inverted files 15 and `./ui` adopters 29, dated
2026-08-01; all three were stale** — corrected above from a measurement rather than carried forward,
which is the failure mode this file's own *Keeping this file honest* section warns about.

**Where the counts stood, measured 2026-07-31 at the end of that run** — the §9 shell block and the
test agree exactly, which is itself the check that the two have not drifted:

| count | was | now | target |
|---|---|---|---|
| `rounded-lg` | 22 | **0** | 0 — **a guard now**, may never rise |
| off-scale spacing | 25 *(really 33)* | **0** | 0 — **a guard now** |
| hand-rolled card treatments | 7 *(really 19)* | **10** | **floor is 4**, not 1 |
| inverted-type files | 23 | **16** | **floor is at least 4, not 0** |
| off-scale type sizes | 20 | **1** | floor is 1 — the shared brand wordmark |
| files importing the primitives | 11 | **29** | most of the 46 |
| `Card` adopters | 0 | **23** | — |
| `Button` adopters | 0 | **16** | — |
| `Section` adopters | 0 | **2** | — |
| `Segmented` adopters | 0 | **2** | — |
| hand-rolled `<button>` outside `ui.tsx` | 90 | **39** | few |
| `bg-indigo-600` outside `ui.tsx` | — | **1** | 0, and the 1 is a `<label>` that cannot be a `Button` |

*(Re-measured 2026-07-31 at the end of the run, from §9's own shell block. The per-primitive counts
read `app` as well as `components` — see `lib/design-system.test.ts` — because §5 defines `Section`
by its route, and a count scoped to `components` could never see it adopted.)*

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

   **Done 2026-08-02 on `FlightReport`'s events grid, which was the sharpest instance left.** The
   height the main actually fired at — against what the flyer set on the altimeter — and the shock
   the airframe took when it did were `text-xs` in §2's TERTIARY colour. These are what a flyer
   sizes a harness and checks a recovery against. Now `text-sm tabular-nums` in the primary colour,
   read down a column event against event; the provenance label beside them moved `text-[11px]` →
   `text-xs`, since §3 reserves the smallest size for axis ticks and diagram annotations.

   **DONE 2026-08-02, the same day, and this is the first time this count has moved for the
   reason it exists.** `RecordingPicker`, `FlightPicker` and `GroundTrack` each rendered a
   decision-grade number below §3's floor — the apogee and peak speed a flyer reads to decide WHICH
   RECORDING to trust, the apogee that tells one flight in a multi-flight download from another,
   and the walkback distance and bearing read standing in a field deciding where to walk. All three
   left the inverted list: **16 → 13**, and unlike every previous move of this count, GLYPHS
   ACTUALLY CHANGED SIZE. Nothing moved into `ui.tsx`.

   **So this metric has now moved three ways in two runs, and the ratchet's comments tell them
   apart:** 15 → 16 was pure adoption (a `text-sm` migrating into a primitive), 16 → 13 is real, and
   the earlier 16 → 15 was adoption again. A count that cannot distinguish these is the trap §9
   already documents for the suite-wide ratio; the per-entry reasoning in
   `lib/design-system.test.ts` is what keeps it honest.

   **Already done on this file (2026-07-31):** the two decision-grade values — apogee and max
   velocity, the numbers the logbook exists to be scanned down — were `text-xs` in §2's TERTIARY
   colour with proportional digits. They are now `text-sm tabular-nums` in the primary text colour,
   which is §3's floor for a number a flyer reads to make a decision and its requirement that
   compared numerals line up column to column. That moved the file 27/3 → 26/6; it does not clear
   the inversion, and it was not meant to.
3. ~~**Three unsanctioned dark surfaces, 32 uses**~~ **DONE 2026-08-01, and the count was stale by
   3×.** Re-measured before touching anything: **11 uses, not 32** — `/40` ×9, `/30` ×1, `/60` ×1.
   Earlier work had already taken most of them without the entry being updated, which is the
   argument for measuring a number before spending an increment on it.

   All 11 are gone. Each was decided by **its own light-mode half**, using §2's table rather than a
   judgement per site: a light `bg-white` is `raised`, so its dark half is `dark:bg-zinc-900`; a
   light `bg-zinc-50` is `sunken`, so its dark half is `dark:bg-zinc-900/50`. That mapping settled
   ten of them mechanically. The eleventh, `DropZone`, was off-system on **both** halves —
   `bg-zinc-50/50` over `dark:bg-zinc-900/30` — and is now `bg-zinc-50` / `dark:bg-zinc-900/50`,
   verified on the built export in both themes (light `oklch(0.985 0 0)`, dark zinc-900 at 50%
   over the page).

   Census after: `dark:bg-zinc-900` ×52, `dark:bg-zinc-900/50` ×8, **everything else 0**.

   **That last clause was false when it was written, and it is corrected here rather than left to
   read as a finished sweep.** Re-measured 2026-08-01 with a pattern that does not presuppose an
   opacity suffix — `grep -rohE 'dark:bg-zinc-[0-9]+(/[0-9]+)?' components app | sort | uniq -c` —
   the census is `zinc-900` ×45, `zinc-900/50` ×8, `zinc-950` ×6, and then **`zinc-800` ×2,
   `zinc-700` ×1 and `zinc-100` ×1**. The sweep enumerated the three opacity forms somebody had in
   front of them (`/40`, `/30`, `/60`) and so could never see a bare shade, which is the same
   shape as the spacing and off-scale-type greps §9 has already had to widen twice. The four are
   `FlightReport.tsx:773` (section-nav active chip), `DeviceSummary.tsx:115` ("consistent"
   agreement chip), `ui.tsx`'s `Segmented` active thumb — inherited by all five adopters, which
   makes it the most-rendered off-system surface in the app — and `SiteHeader`'s inverted active
   nav pill, which §10 makes a shared pattern and therefore a suite-level fork. Filed in
   `BACKLOG.md`; unfixed.

   *Worth knowing before "restoring" any of these:* several were chips or buttons sitting inside a
   `Card`, where `/40` gave a faint tone break in dark mode that light mode never had — a
   `bg-white` chip on a `bg-white` card is already flat and separated by its border alone. The
   conversion makes dark match light rather than removing a deliberate effect.
4. **`DataTable`.** 7 tables (re-verified 2026-08-01: exactly 7, all in `components/`, no
   `role="table"`/`role="grid"` surface anywhere, so 7 is the whole population), 2 sortable,
   2 copyable, 0 keyboard-navigable. Lift it from `SampleTable.tsx`, which already has the sticky
   header, `aria-sort` and the clipboard copy.

   **STARTED 2026-08-01 — the primitive exists and the two cross-check tables are on it.**
   `DataTable` is in `components/ui.tsx` with a `{columns, rows}` model: sortable where a column
   supplies a `compare`, copyable as a whole over `lib/copyTable`, sticky header behind an optional
   `maxHeight`, an always-mounted `role="status"` live region, and the `colSpan` empty row. The
   column type carries **`cell` and `text` separately**, which is the piece that made it fit these
   surfaces at all: an agreement badge reads as a coloured chip on screen and has to reach a
   spreadsheet as `agree · 0.6%`, not as markup and not as an empty cell.

   `DeviceSummary` and `GpsApogee` are converted — **the two surfaces §6 exists for, and neither
   had any copy path at all**: the numbers a cert document most wants were on screen and the only
   way into a spreadsheet was to retype them. Both now also share one `agreementText`, so the badge
   and the clipboard cannot drift into saying different things about the same row. Pinned by
   `e2e/device-summary.spec.ts` → *"the logger cross-check copies as a real table, verdict and
   all"*, falsified by blanking the clipboard text alone and watching it go red while the badge
   stayed correct. Adopters 29 → 31; `<table>` in a component 7 files → 6.

   **The window-stats table has the copy but not the primitive, and that is the right answer.**
   It puts the channel in a `th scope="row"` and collapses a whole row to one `colSpan` cell when a
   channel has no samples in the current zoom; modelling either in `DataTable` would add config
   surface for one caller, which is how a shared layer stops being used. What it owed a flyer was
   the copy — these are the min/max/mean a cert document quotes, over the stretch of flight they
   zoomed to — so `CopyTableButton` was lifted out of `DataTable` instead, and both use it. The rows
   are built at press time, so the copy follows the zoom rather than the window at mount. Pinned by
   `e2e/analyze.spec.ts` → *"the window stats copy as a real table, with the unit beside each
   channel"*, which checks the unit column and that max ≥ min rather than only that something
   arrived. **Copyable tables: 2 → 5.**

   **The composite timeline has the copy too** (2026-08-01). A staged flight's marks — which mark,
   at what time on the common clock, off which recording, at what height on that recording's own
   datum — is what a cert write-up quotes, and it was readable and nothing else. Two details worth
   keeping because they are what makes a copied table usable rather than merely present: the unit
   rides in the HEADER and the altitude cells are bare numbers, because a spreadsheet will not sort
   `1,234 ft`; and the tie marker travels as a WORD, because `↳` says nothing once it is out of this
   table and away from the row above it. **Copyable tables: 2 → 6.**

   **Still open:** `ColumnMapper` only — and it is the one table here that is not data a flyer
   copies. It is the mapping UI: its cells are `<select>`s for choosing what each column of an
   unrecognised CSV means. Sorting it is meaningless and copying it would yield the flyer's own
   in-progress choices. Left deliberately, so a later run does not read "1 of 7 unconverted" as
   debt. **That makes item 4's table sweep complete**, with the keyboard clause below still owed. Arrow-key cell navigation is **not** implemented
   and §5's "keyboard-navigable" is therefore only partly delivered: every affordance is on the Tab
   path, cell-to-cell movement is not. Said here rather than claimed, because a four-row cross-check
   would not benefit and a claim is worse than a gap.

   **~~and collapse `CompareView`'s independent second copy onto it~~ — that clause is wrong and
   is withdrawn.** Measured 2026-08-01: `CompareView`'s table is **transposed**. Metrics are rows
   and flights are columns, and sorting a row *reorders the columns* — it ranks flights by that
   metric — where `SampleTable`'s sort reorders rows. The two share an `aria-sort` attribute and
   nothing else: one puts `aria-sort` on `th[scope=col]`, the other on `th[scope=row]`. Collapsing
   them produces a union of two different components, not one primitive, which is how a shared
   layer acquires the config surface that makes nobody use it.

   **What is genuinely liftable from `SampleTable`**, measured the same day: `SortableHeader`
   (the button-inside-`th` + `aria-sort` + per-column ⧉ copy pattern), `cycleSort`/`sortState`
   (the three-state cycle, third click restoring record order), the copy-what-is-on-screen
   contract over `lib/copyTable`, the always-mounted `role="status"` live region, the sticky
   `thead` scroll shell, and the `colSpan` empty row. **What is NOT liftable:** the entire prop
   surface is the explorer's column model — `seriesData: Float64Array[]` with `xVals` as a phantom
   column addressed by a `col < 0` sentinel, the `view`→`[from,to]` window scan, `ROW_H`-based
   virtualisation with spacer rows, and the event jump strip. None of it generalises to a four-row
   cross-check table.
5. **The five required states.** Re-measured 2026-08-02: the denominator is **15** data surfaces,
   not 13, and `StitchSurface` is the only one implementing more than one state.

   **2026-08-02, later the same day — three §8 defects closed that no state audit would have
   found, because they are not missing states but states a phone cannot reach.** A measured cold
   walk at 390 px with `hasTouch` found: every chart's live legend advertising a reading that only
   a mouse could produce (uPlot's cursor is mouse-driven and `Chart.tsx` returned unless two
   fingers were down); `CompareView`'s sort cue at computed opacity 0 on every inactive column,
   so nothing said the table sorted; and the colour swatches at 44 px tall and **12 px wide**,
   which `.touch-area` could not have fixed because a colour input is a REPLACED element and
   generates no `::after`. All three are fixed and pinned in `e2e/touch.spec.ts`.

   Worth keeping from the same walk, measured and CLEAN: **zero controls that render at 1440 and
   not at 390** (161 vs 161 on the report with every disclosure open, 120 vs 120 on `/compare`
   with four flights), zero horizontal body scroll on any of the six routes, and offline better
   than the promise — 39 cache entries and all six routes serving full content with no network
   after visiting only `/`.

   **STARTED 2026-08-02 on the surface that mattered most.** `Analyzer`'s error phase — where every
   unreadable file dropped on `/` lands, the app's most-hit error surface — hand-rolled the danger
   card §5 gives `ErrorState`, and **six of its ten error paths named no file at all** ("That file
   is empty.", "Could not read this file."). On a launch day's folder that is one of eight files.
   The state carries the file now and renders through the primitive; `ErrorState` adopters 1 → 2.
   Pinned by `e2e/analyze.spec.ts` → *"an unreadable file is named in the error, not described in
   the abstract"* and by a per-case assertion in `e2e/mapper.spec.ts`.

   Worth keeping: the mapper's no-data branch was **already** naming its file properly, so the
   e2e asserts the FACT (the file is named where it is handled) rather than the surface — two
   surfaces answer this differently and both are right.

   **2026-08-02, later still — the chart now answers a KEYBOARD, which closes the §8 half no state
   audit reaches.** `Chart.tsx` carried `role="img"` and an `aria-label` but no `tabIndex` and no key
   handling, so it could not be focused, while `GroundTrack` beside it has had arrow keys, Home/End,
   PageUp/PageDown and Escape since it was built — an inconsistency inside one report, not only a
   gap against a spreadsheet. (The `COMPETITION.md` row that filed this said "no `role`, `tabindex`
   or focusable element"; the role was there, and the row is corrected.) Arrow keys now walk the
   samples in the VISIBLE window — a logger armed on the pad records minutes the flight doesn't get,
   and the chart opens framed on the flight, so Home and End mean the ends of what is shown.
   PageUp/PageDown step between the marks already drawn. It drives uPlot's own cursor, so the live
   legend is the same element for mouse, finger and key, and only deliberate presses write to the
   `aria-live` region. Pinned by two `e2e/a11y.spec.ts` cases, three mutations run against them.

   Worth keeping, because it cost real time: adding a status region to every chart broke an
   unrelated ground-track test whose `p.sr-only[role="status"]` locator had been unique only by
   accident — it matched five elements afterwards. Both that locator and the new one are now scoped
   to the surface they are asserting about.

   **And one instance of this item was REFUTED before it was built, 2026-08-02.** `DataTable`'s
   default empty string is "Nothing to show yet.", which its own prop doc forbids by §5 — but the
   state is unreachable at both call sites: `DeviceSummary` is rendered only when
   `flight.reported.length > 0`, and `GpsApogee` returns null without GPS and passes a literal
   one-row array. `Figure` already settled this shape — *a guard that fires on nothing is worse
   than none* — so nothing was built. Do not re-open it without a call site that can reach it.

   *(2026-07-31: `navigator.onLine` is read NOWHERE in `components` or `app` — measured, 0 hits — so
   the offline state is undelivered suite-wide rather than missing on some surfaces. That is either
   20+ states to build or a rule `DESIGN.md` should stop asserting, and deciding which is a §5
   change owed to both repos. Do not treat it as a per-surface defect until that is settled.)*

   **DONE 2026-08-02 on the logbook, and this one was visible to EVERY returning flyer on EVERY
   cold load.** `RecentFlights` used `recents.length === 0` as the sole discriminator for three of
   the five states — genuinely empty, still loading, and browser-refused-storage — and only the
   first is what its copy says. That is not a rare race: **every route here is a static export**, so
   that block is prerendered into `out/index.html` and `out/compare/index.html`, and a flyer with
   fifty flights read *"Flights you open are remembered here on this device"* with an offer to
   restore a backup until ~1.4 MB of JS hydrated and IndexedDB answered. `CompareSurface` carried
   the identical conflation with *"Your logbook is empty"*.

   **The storage refusal could not be told from an empty logbook at all**, one layer down:
   `listRecents()` caught the failure and returned `[]`, so a private window and a first-ever visit
   were the same value. `readRecents()` now reports `{ recents, blocked }` and `useLogbook` exposes
   `status: 'loading' | 'ready' | 'blocked'`; `listRecents` stays as a thin wrapper, so the callers
   that only want rows are untouched.

   **The pin reads the ARTIFACT, not the source**, because the source could never have shown this:
   `e2e/logbook.spec.ts` → *"the prerendered page does not tell a returning flyer their logbook is
   empty"* fetches `/` and `/compare/` as raw HTML — before a line of JS runs — and asserts the
   promise is absent and the looking-for-flights line is present. Beside it, *"a browser that
   refuses storage says so, instead of promising to remember"* removes `indexedDB` and checks the
   surface says so and that analysis still works. Both falsified by mutation.

   **Two things this deliberately did NOT do.** ~~The `status` prop defaults to `'ready'`~~ —
   **corrected the same day: it is REQUIRED.** Defaulting it made the *defect* value the one a new
   caller gets for free, on a prop whose entire reason for existing is that "I have no rows" and
   "I could not read any" had been the same value. A convenience default that reinstates the bug it
   was added to fix is not a convenience. Both call sites already threaded it, so the cost was zero.
   And the offline state is still undelivered suite-wide (see the note above); this closes loading
   and error on one surface, not the fifth state everywhere.

   **DONE 2026-08-03 — the whole family, root last.** The three increments above closed the READ
   path; the write path could not report failure at all. `saveRecent` and `importLogbook` both
   assigned their result the moment a `put` was queued and `preventDefault()`ed the abort away, so a
   full quota or an ITP eviction returned a good-looking id and a *"Restored 12 flights."* over an
   empty logbook. Both await their transaction now. **`savedId` means "the logbook took it"** — the
   thing every surface above already read it as — and the saves are atomic, so `forgotten` cannot
   name a flight dropped to make room for a save that never landed. **The constant split in two on
   the way**: `STORAGE_REFUSED` says *"read or keep"* and is only true where `indexedDB` is absent,
   while a quota abort reads perfectly — so `STORAGE_WRITE_REFUSED` carries the write half rather
   than telling a flyer their logbook cannot be read directly above a list rendering it. Five
   surfaces, three on the two shared constants and two bespoke because they each have something
   specific to say. The analyze page is the one left, and it is now a plumbing job rather than a
   truth problem (`BACKLOG.md`, where it is paired with the caption panel's matching gap).

   **And a FOURTH state, found by the done-check's cold walk rather than by any test.** With the
   drop note finally honest, the logbook list directly below it still rendered *"Flights you open
   are remembered here on this device"* — because the list's state comes from a READ, and on a
   quota-full device the read works perfectly. `status` was `ready` with no rows and correct about
   everything it could observe. **A refused write is not discoverable by reading**, so `useLogbook`
   gains `write-blocked`, reported in by the four surfaces that attempt saves and cleared by the
   next save that lands. This is the entry's own list-of-states question answered properly: the
   logbook now implements loading, empty, populated, read-refused and write-refused — five, not the
   "three empty-looking states" this section was written against.

6. ~~**Two primaries on one surface** — `ColumnMapper` only now.~~ **DONE 2026-08-01, and the
   remaining count was 0 before the work started.** `ColumnMapper`'s two `variant="primary"` calls
   are at `:151` and `:277`, in the two arms of a `if (!mappable) return …` — **mutually exclusive
   branches, so no flyer ever sees both.** The grep that produced this entry counted occurrences in
   a file, and a file is not a surface. Say that rather than bank a fix for a defect that was not
   there.

   **DONE 2026-08-03 — §5 gained the weight rather than the sites being converted away.** The
   heading read *"three button weights, and only three"* while listing FOUR, and the code had
   hand-rolled a fifth **eight times across four files** (`Analyzer`, `ChannelExplorer`,
   `CompareView`, `RecentFlights`). Eight sites independently reaching for one missing word is the
   vocabulary being short, not four files being careless, so `Button variant="link"` is now in
   `DESIGN.md` §5 and in `ui.tsx`.

   **`link` is not `ghost`, and that distinction is the variant's whole definition.** `ghost` is a
   button that happens to have no border: it keeps `px-3 py-1.5`, a hover fill and the 44 px touch
   floor, because it sits in a toolbar or a table row. `link` takes *neither* `BUTTON_SIZES` nor
   `TOUCH_TARGET` — it sits in running prose at the surrounding size, where control padding breaks
   the line and a hover fill reads as a selection. One converted site keeps `min-h-11` by hand and
   says why: it is in a table row on a phone, which is the exception §5 names.

   **The count was wrong twice before it was right, and both errors are worth not repeating.** This
   entry said **7 across 5 files**; a first grep this run said **13**. The honest figure is **8**,
   because three different things wear indigo on a button and only one is the missing weight — a
   SELECTED state (§2's `accent` doing exactly its job on a sorted column header), a HOVER
   affordance on a filename, and a bordered indigo chip. The pin has to let all three through or it
   fails naming files that are correct. Pinned by `lib/design-system.test.ts` →
   *"is not re-invented by hand"* and *"carries no button geometry, which is what makes it not a
   ghost"*, both falsified by mutation. `Button` adopters **18 → 19** in the same commit.

   **The pre-push review then found the implementation of the opt-out was wrong, and it was
   invisible to the whole gate.** The size opt-out was written `text-inherit` — which is Tailwind's
   COLOUR utility, not a size one. Emitted beside the variant's own `text-indigo-600`, adjacent in
   one `@layer utilities` run at equal specificity, the later class wins: **every `link` rendered in
   the surrounding prose colour in LIGHT mode**, while dark mode looked right because
   `dark:text-indigo-400` is emitted later still. Verified from the built stylesheet
   (`.text-indigo-600` at byte 25,858, `.text-inherit{color:inherit}` at 25,999). Nothing in the
   gate can see this — the roles and accessible names the e2e suite asserts on never changed — so
   eight controls would have shipped invisible to half the flyers who use them.

   **Three more the same review corrected, two of them in the binding file itself:**

   - **§5's touch-floor claim was false.** `app/globals.css` floors every bare `button` at 44×44
     under `@media (pointer: coarse)` with no exemption for one inside a `<p>`, and
     `e2e/touch.spec.ts` measures exactly that — so dropping `TOUCH_TARGET` from the variant is a
     no-op for the button branch, and "a `link` in a toolbar is a 14 px target" was wrong. The one
     shape that IS under-sized is `link` **with `href`**, which renders an `<a>` the coarse-pointer
     rule does not cover. §5 now separates those two claims; `BACKLOG.md` carries the `href` gap.
   - **The §5 paragraph named four Debrief components verbatim**, in a file §10 declares shared and
     identical with the sibling — where that sentence would be a false statement about Loft's
     codebase. Re-worded to "one app … eight call sites across four components".
   - **The one converted site in a table row lost its resting underline.** `link`'s underline is
     `hover:` only, which is right in prose and wrong for 11 px of accent text in a recordings row
     on a device with no hover. Restored at the call site, and §5 now says where that belongs.

   **And the pin was being carried by an amnesty clause.** It skipped any tag containing `${`
   outright — and every legitimate survivor in the repo has an interpolation somewhere, so the
   clause was doing all the work while a hand-rolled link written with a template literal passed
   silently. It now strips the interpolations and ternary branches and tests what RESTS. Falsified
   against exactly that form.

   **Owed to the sibling.** §5 is carried identically by `nrdptel/fusionspace-loft`; this session
   has only this repo, so the edit is written to make sense there too and the debt is recorded in
   `HANDOFF.md`.

   What WAS wrong on that surface, and is fixed: **an indigo TEXT button hand-rolled beside the
   real primary** — `text-indigo-600 hover:text-indigo-500` on "Remember these columns" — which is
   the primary weight's colour worn as a link, on the one surface a flyer has to get right. It now
   takes `secondary`, because remembering the mapping is a real second action, and "Choose a
   different file" takes `ghost`, because it is the way back out. Two hand-rolled `<button>`s gone
   with it. **A second instance of that same invented weight survives at `RecentFlights.tsx:835`**
   (underlined, `text-[11px]`) — two files reached for the same missing weight independently, which
   is either a `Button` variant or a documented fifth in §5, and either way is owed to both repos.

   ~~`RecentFlights`~~ **DONE 2026-07-31**: its second indigo fill was the note editor's Save, which
   is now secondary. The logbook's one primary is "Compare N flights", the action the surface exists
   to perform. A FIFTH button weight went with it — an indigo-outlined "These N are one flight",
   which §5 does not have.
   **DONE 2026-08-03 — the chart export was the `ACTION_BTN` shape restarted.** `savePng` /
   `saveChartPng` existed **three times, byte for byte** — `FlightReport`, `CompareView` and
   `ChannelExplorer` each carried the same eleven-line body, differing only in which ref they read
   and what they named the file. `lib/plotPng.ts` is the one implementation, written as
   `lib/copyTable.ts`'s sibling because it is the same kind of thing: one job the app does from
   several surfaces, and a table's answer to "get this into my write-up" is copy-paste where a
   chart's is an image. Three copies of a canvas composite is three places for a
   transparent-background or device-pixel-ratio bug to be fixed in two of.

   Pinned by `lib/design-system.test.ts` → *"composites a plot to an image from exactly one
   place"*, which is the frame/focus shape rather than a §9 grep (a §9 addition is owed to the
   sibling repo). Matched on `.drawImage(` in member AND bracket form, deliberately, not on
   `toBlob`: `FlightCard` calls `toBlob` correctly on its own canvas, so a `toBlob` guard would fail
   naming a file that is not doing this job at all. The **four** existing PNG-export e2e cases
   carried the behaviour unchanged.

   **Its source list had to be widened, and that correction is most of its value.** §9's own list is
   `['components', 'app']` over `['.tsx', '.css']` — which never walks `lib/`, the one directory the
   failure message names, and cannot see a `.ts` under `components/` either. So a second composite in
   `lib/`, or in the `components/usePlotExport.ts` hook that is the most natural React home for this
   code, would both have kept it green while the message insisted only `lib/plotPng.ts` may carry
   one. **A guard whose message names a file it never reads is worse than none**, and this is the
   sixth time this file has had to widen a pattern from the form somebody had in front of them.
   Falsified BOTH ways after widening: a copy in `lib/`, and a bracket-access copy in `CompareView`.

   **What the collapse exposed rather than caused**, and it is filed: the figure light/dark toggle
   governs the exported SVG and not the exported PNG. The PNG is not wrong to take the page theme —
   it composites the live canvas, whose pixels are already in that theme — but two buttons an inch
   apart now behave differently and nothing says why.

7. **The remaining 41 hand-rolled `<button>` elements** outside `components/ui.tsx` (46 in the
   tree, 5 inside the primitives). `RecentFlights` went **23 → 12** on 2026-07-31; what is left
   there is genuinely not `Button` — the row itself as a click target, the file-name text button,
   the ✕ (an `IconButton` with a responsive size), the sort chips and the checkbox labels.
8. **12 call sites still hand-roll a card** — `rounded-xl border …` written out rather than `<Card>`.

   **STARTED 2026-08-01 — the FRAME exists now, and the count is 10 → 7 against an honest floor of
   4.** This list and `lib/design-system.test.ts` have both described the frame for two runs as the
   thing to build and then left it unbuilt, so the six sites that shared it went on being six
   just-this-onces. `<Frame>` is in `components/ui.tsx`: `rounded-xl border border-zinc-200
   dark:border-zinc-800` and nothing else, because the missing background is the whole point —
   every one of these holds something that paints its own fill, and `SampleTable`'s sticky
   `dark:bg-zinc-900` header against `Card`'s identical default is the proof that a `tone="none"`
   would not have been the same component with a value switched off. Adopters: `SampleTable`'s and
   `ColumnMapper`'s scroll shells, `FlightCard`'s `<canvas>`, `GroundTrack`'s divided `<dl>` and its
   `Stat` tile, `FlightReport`'s event tiles. `DataTable` takes the class rather than the component,
   because its border is conditional on `maxHeight` and a `bordered` prop existing for one caller is
   how a shared layer stops being used.

   Two things rode along. `Frame`'s `ref` is **generic** where `Card`'s is fixed to the div, because
   two of these are a scroll shell and a `<canvas>`; fixing it would have pushed a cast to every
   call site instead of one inside the primitive. And `GroundTrack`'s `Stat` was `py-2.5`, an
   unsanctioned half-step §9's spacing grep cannot see — it reads `py-2` and passes — now `py-2`.

   **The count cannot see a re-hand-roll of the frame**, because it is a `sort -u` and a sixth file
   writing the identical string would land in the bucket `ui.tsx` already fills. So a separate
   assertion holds the treatment to exactly one file, falsified by putting the string back into
   `SampleTable` and watching it name that file.

   **DONE 2026-08-02 — 7 → 4, and the floor this entry has quoted for three runs was wrong.** It
   said the page-level drop zone wants its own named primitive. It does not: its hand-rolled string
   was **byte-identical to `CARD_TONES.muted`** — §2's "sunken and dashed: a slot with nothing in it
   yet" — a tone that had been added for exactly this case and then written out by hand anyway.
   `CompareSurface`'s dashed box took the same tone; it was the one dashed box in the app with **no
   fill**, so two drop targets on two surfaces read as two different kinds of thing while being the
   same kind of thing. `RecognizedFormats` was a plain raised card, off-scale `py-3.5` and all.

   **So the honest floor is 3, not 4:** `Card`, `Frame`, and the floating drop OVERLAY — the one
   that genuinely will not fold in, because it is `border-2 border-dashed … shadow-lg` and needs
   elevation that `Card` has no prop for by design.

   **DONE — 4 → 3, AT THE FLOOR, 2026-08-02.** The last string was `RecentFlights.tsx:584`, the
   logbook row, and `Card`'s `as` union gained `'li'` for it. That widening is the right shape
   rather than a concession: the row is a card AND a list item — a flight in a list of flights —
   and rendering it as a `<div>` to fit the primitive would have taken it out of the list semantics
   a screen reader announces, which is the exact trade `as` exists to refuse. `Card`'s default tone
   IS that row's treatment, written out by hand; what stayed in `className` is only the hover and
   the indigo left edge marking an annotated flight.

   **`cardTreatments` is a GUARD now, like `rounded-lg` and off-scale spacing, and may never rise.**
   The three are `Card`, `Frame` and the floating drop overlay — three distinct kinds of container,
   not hand-rolls waiting to be converted. Any fourth string is a new just-this-once.

   Card adopters 23 → 27; components importing the primitives 31 → 34.
   *(Re-measured 2026-08-01: **12**, not 17. Like item 3 this number had drifted downward as other
   slices landed. Of the 12, one is `<Card>`'s own string and two are the drop zone and the drop
   overlay, which §9 already records as wanting their own named primitives rather than folding into
   `Card` — so the real adoption debt is nearer 9.)*
   This is the adoption debt the §9 count does not measure: §9 counts distinct TREATMENTS, which is
   7, and seven strings spread over seventeen sites is one number going to 1 and another going to 0.
   Kept here rather than added to `DESIGN.md` §9, because a new metric in that file is a change owed
   to the sibling repo in the same run and this run cannot push there.

9. **`Section` had ZERO adopters and now has 2 — the two docs routes.** `/privacy` and `/validation`
   are built from it; `/methods` was measured and deliberately NOT converted, because its 47 `<h2>`s
   are glossary terms in a two-column grid rather than section headings. The heading skip those
   pages carried (`text-3xl` straight to `text-base`) is closed: 30 → 20 → 16 px on the built
   export, both themes, with §4's `mt-8` between sections.

   **The per-primitive ratchet could not have seen this, and that is the finding worth keeping.**
   It counted `components` only, while §5 defines `Section` BY its route — "this is what a route is
   built from" — so every `Section` there will ever be was outside what the check could read. It
   counts `app` too now. Measured the same day: all nine route files imported zero primitives, so
   widening the denominator moved no other number. This is the fourth §9 metric to measure
   something other than what it was reached for, after the two blind greps and the suite-wide type
   ratio.

10. ~~**A sixth radius nobody counts:** bare `rounded` (0.25rem) at 11 sites.~~ **DONE 2026-08-01 —
    and the count was wrong in both directions before it was measured properly.** The entry said 11;
    a sweep this run first said 15. Both were counting prose. `rounded` sits inside the word
    "G**rounded**", so `\brounded\b` matches a heading on `/validation`, and a comment in
    `FlightReport` about uPlot having "rounded the window to its axis" matched too. The honest
    figure is **12 class uses over 6 files** — `DeviceSummary` ×4, `ChannelExplorer` / `CompareView`
    / `GpsApogee` ×2, `RecentFlights` / `SampleTable` ×1 — found with a leading boundary
    (`(?<![-\w])rounded(?![-\w])`) and then filtered to lines that are actually class strings.
    Every one is a chip or an icon button, so every one became `rounded-md`, which is §2's own
    value for a control. Three of the six files are tables.

    **No §9 metric was added for it, deliberately.** `DESIGN.md` §9 is carried identically by the
    sibling repo and `lib/design-system.test.ts` is its executable copy, so a new count here alone
    would fork the file — the same reason item 8's "17 hand-rolled card sites" lives in this list
    rather than in the ratchet. **The check is owed to a run that can push both repos**, and until
    then this conversion is unguarded: nothing fails if a bare `rounded` comes back.

11. **`tabular-nums` on the two cross-check tables.** **DONE 2026-08-01.** `GpsApogee` and
    `DeviceSummary` rendered their numbers `font-mono` with proportional digits — on the two
    surfaces §6 exists for, where a GPS apogee sits directly above a barometric one and a device's
    own summary figure sits beside Debrief's read of it. Comparing two numbers column-to-column is
    the entire job of both tables and the digits did not line up. Four cells; suite-wide
    `tabular-nums` is **27** against `font-mono` **90**, from 5 against 81 at P1's start.

12. **Three of §5's named primitives do not exist at all, and this list had never said so.**
    Measured 2026-08-01 by reading §5 against `components/ui.tsx` rather than by reading the
    conversion counts, which is why nine runs of counting adopters never surfaced it: a primitive
    with no implementation has no adopters to be short of, so every count it should have moved was
    silent.

    - ~~**`NumberField`**~~ **DONE 2026-08-02, and the interesting part is what "bounded at the
      field" turned out to require.** §5: "**Every** numeric input in either app is this", and it
      "owns the refusal behaviour the SAFETY invariant requires: a value that cannot mean anything
      physically is bounded or refused at the field". It was hand-rolled at 9 sites, seven of them
      with a byte-identical class string, each re-deriving its own bound.

      **The bound was never missing — it was SILENT, and that is a different defect.** Every panel
      already does `Math.min(x, MAX_REASONABLE_…)`. Type 50,000 ft into the main-deploy check and
      you got 29,528 with nothing on the page saying why the number you typed was not the number
      used: `MAINTAINING.md`'s "a control that is always enabled and fails only when pressed"
      wearing different clothes, on the panel a flyer uses to check what they set on the altimeter
      against what actually fired.

      **And the primitive cannot see it from the value, which is the finding worth keeping.** These
      fields are CONTROLLED by the already-clamped number, so by the time a value reaches
      `NumberField` it is always in range and the refused figure is gone. The first implementation
      read the bound off `value` and was therefore incapable of ever firing — it passed a review, a
      type-check and a build, and only the e2e caught it. `NumberField` keeps what was typed, which
      is the only place that fact survives, and clears it on any change to the unit or the bound so
      a message about the old unit cannot linger.

      Six of the seven same-shaped panels are on it. `CropControl` is deliberately not: its two
      inputs are a different shape (stacked label, `h-11 w-28`, `font-mono`) and bound each other,
      so folding them in would add layout config for one caller — the same call `ColumnMapper`'s
      table and `CompareView`'s transposed one already got. Pinned by `e2e/audit3.spec.ts` →
      *"a deploy altitude beyond what the physics allows is bounded at the field, and says so"*,
      which reads the bound off the control rather than hard-coding it, so a unit change or a
      change to `MAX_REASONABLE_DEPLOY_M` cannot leave it passing against a stale number. Falsified
      by disabling the announcement.
    - ~~**`Figure`**~~ **SHIPPED 2026-08-02 in `9d57303`, and this entry went on calling it "the
      next slice of P1" for two runs afterwards.** Re-measured 2026-08-02: `Figure` is in
      `components/ui.tsx` with **four call sites across two files** — three in `FlightReport` and one
      in `CompareView`; `PRIMITIVE_ADOPTERS` counts the two FILES, so read which unit a count is in
      before spending against it —
      and it owns the title string including the unit, which was the real find (both call sites had
      been interpolating the unit by hand, so two surfaces a flyer reads against each other could
      disagree about what a charted quantity is called).

      **§5's "empty and extrapolated states" are deliberately NOT in it**, and that is measured
      rather than skipped: an `empty` prop was written, wired to the comparison, and removed, because
      `CompareView` filters its channel list to metrics at least one compared flight recorded, so a
      chart with nothing to draw is unreachable there. `ChannelExplorer` and `GroundTrack` were
      checked the same way and neither reaches it either. Add `empty` when a call site needs it,
      **with the case that needs it**.

      **The lesson is about this file, not about charts.** A session that trusted this bullet would
      have spent an increment rebuilding a primitive that already had four adopters — the exact
      thrash the `Status:` vocabulary exists to prevent, and the second stale pointer found on one
      day (see D8's status line). Before spending an increment against any entry here, grep for the
      thing it says is missing.
    - **`Panel`** — §5: a dismissible `Card` that "owns focus return (see `useReturnFocus`)".

      **`useReturnFocus` SHIPPED 2026-08-02; `Panel` is deliberately NOT built, and this entry's
      premise was wrong.** It said `UnitsControl` and `FigureChooser` each hand-roll a dismissible
      surface with its own focus return. Measured: `UnitsControl` is a native
      `<details>`/`<summary>`, where the browser owns dismissal and focus never leaves the summary,
      and `FigureChooser` is an inline row of toggle chips with **no dismiss at all**. Nothing in
      the app has the shape §5 draws, so a `Panel` built today would be a primitive with no call
      site — which `Figure`'s own comment already settled.

      What DID exist twice is the focus behaviour, on the two destructive confirms (the logbook's
      Clear and the privacy page's Forget), which are the same control written twice.
      `useReturnFocus` is §5's own named hook and now owns all three parts. **6 imperative focus
      calls across 2 files → 2, both in `ui.tsx`**, pinned by a §9 assertion that holds focus
      management to one file — because a third confirm hand-rolling its own would import nothing
      from `./ui` and move no adopter count.

    These are not new work invented here; they are §5 as written, unimplemented. Recorded so the
    milestone's *done when* can be judged against the whole vocabulary rather than against the part
    that happened to have adopters.

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

**D7 — Deeper honest insight, the stated moat. DECOMPOSED 2026-08-01 — see its own section above
`D8`.** North Star 1's third bullet.

**Its stated first slice was already shipped, and the pointer is corrected rather than left to cost
someone an increment.** This entry said `COMPETITION.md` row 6 was "the cheapest first slice: show
the flyer the board's own reported summary beside ours … which nothing surfaces to a flyer."
`components/DeviceSummary.tsx` has done exactly that all along, rendered by `FlightReport.tsx:1045`
on any flight whose file carries a summary, and **row 6 was itself marked `HAVE` / RESOLVED on
2026-07-31** — the same day this pointer was written. Checked before building, which is the whole
reason to check.

**D8 — Orientation and high-rate data. DECOMPOSED 2026-08-02 — it has its own section above; take it
from there, not from this line.** The measurement this line asked for was taken and it changed the
milestone: the ingestion ceiling is a non-issue (worst case 901 ms for 36,700 samples over 10.7 MB,
top rate 114 Hz), and the real blocker is that the 192,001-row Blue Raven high-rate file carrying the
gyro, accelerometer and quaternion channels is REFUSED by the parser, correctly, because it holds no
altitude and so is not a flight on its own.

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

- **2026-08-01 — a record that genuinely holds two burns was found, and NO detector was built on
  it.** `meraki2` — a stated O7800 booster under an N3100 sustainer — shows two ascent thrust runs
  15.79 s apart on its signed axial channel, and the second ignition is unmistakable (−15.7 →
  +92.7 m/s² in one 0.25 s sample, peaking at 549 m/s², speed 427 → 1,663 m/s). The tempting move
  was a second-ignition event and a split burn time, which would have been a genuinely
  first-in-field reading. **Rejected because the corpus holds exactly one positive example and one
  near-miss**: `iss-endurance`, one motor by its manifest row, produces a second run too, inside a
  stretch where the record repeats a sample and its altitude runs backwards. A rule that fires on
  one and not the other is fitted to two data points, on a number a flyer reads. The measurement is
  banked in slice 4 and in `BACKLOG.md` with exactly what would settle it — a second staged record,
  or endurance's second run checked against the StratoLogger that flew with it. **Reverse this the
  moment either arrives**; it is a deferral with a named trigger, not a refusal.

- **2026-08-01 — `Frame` was built in `components/ui.tsx` and deliberately NOT added to
  `DESIGN.md` §5.** §5 is the shared component vocabulary and both repos carry the file
  identically; `add_repo` for the sibling was attempted this run and refused by the harness, so a
  §5 edit here would fork it. **Building the primitive without listing it is sanctioned by §9's own
  sentence** — "a treatment that matches the grep but is genuinely not a card … gets its own named
  primitive rather than a `shadow` prop on `Card`" — which is in the shared file already. The
  alternatives were worse in both directions: fork §5 now, or leave six hand-rolled treatments and
  a count stuck at 10 because a documentation edit could not be made. The §5 entry is recorded as
  owed in `HANDOFF.md`, alongside the five §9 edits already owed there.

- **2026-08-01 — D7 slice 4 was reinterpreted rather than executed as written, because its premise
  was false.** The entry said the composite's readings "describe it as though it were one motor";
  `lib/composite.ts` merges nothing and never has. Rather than mark the slice not-applicable, it
  was read as the gap its *done when* actually describes — per-stage figures on the composite —
  which turned out to be real, unbuilt, and shipped by no tool in the field. The alternative was to
  close D7 with slice 4 struck out, which would have banked a milestone and built nothing.
  closed without it.** The item proposed using the `Sync` column the HR and LR files share as an
  in-file join key, to separate *one recording exported twice* from *two instruments*. Measured
  over the corpus: it cannot. `Sync` is a free-running millisecond counter mod 250, derived from
  the timebase, so any two files on a shared `Flight_Time` grid agree at *some* constant offset.
  The true pair `lemiv-HR × lemiv-LR` joins at 1 distinct offset with 100.0% agreement over 9,655
  shared samples — and so does `lemiv-HR × reddit-HR`, two unrelated flights on different
  continents nine months apart, at 1 distinct offset and 100.0% over 96,629. The false join is the
  larger and cleaner of the two. One genuine pair has no `Sync` column at all. Rejected: shipping
  it with a tolerance, which is the mistake apogee agreement already taught this milestone, and
  which here would be worse because the false pair scores *identically* rather than merely close.
  Also rejected: leaving the item open as "hard", which would have cost a future run an increment
  to re-derive. The reversible part is written down — the summary CSV's serial number is real
  per-recording identity, on 2 of 4 groups, already captured as `RecentFlight.summaryText`.

- **2026-08-01 — no §9 metric was added for the bare-`rounded` sixth radius.** The 12 sites were
  converted, but `DESIGN.md` §9 is carried identically by the sibling repo and
  `lib/design-system.test.ts` is its executable copy, so adding a count here alone would fork the
  file. Rejected: adding the guard anyway and accepting the fork, and rejected: leaving the 12
  sites unconverted until a run can push both. The conversion is therefore **unguarded** and this
  file says so — a bare `rounded` can come back without failing anything. Same reasoning as item
  8's hand-rolled card sites.

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
