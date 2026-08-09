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

**The queue was reordered on 2026-08-08 by the first batch of owner notes, and this is where that is
recorded.** Eight notes arrived at once and all eight were triaged that day. Four became milestones —
**D10**, **D11**, **P8**, **P9** — and they take the FRONT of their tracks, ahead of D9's remaining
slice and P1's remaining conversions. Two sharpened milestones that already existed rather than
becoming new ones (**P4** by `ON-6`, **P5** by `ON-B2`), because two milestones on one subject let each
run pick whichever it prefers, which is the thrash the *Status* machinery exists to stop. One is a
`DESIGN.md` token change (`ON-5`), and one is a `COMPETITION.md` row plus a parked question (`ON-B1`).

Note-born milestones jumping the queue is what *"a note reorders them"* means, and it does not violate
*"do not skip ahead"*: **P8 slice 1 and P9 both ADD to P1** — each needs a primitive the app has
already hand-rolled twice — so taking them first advances the milestone they are placed in front of
rather than stranding it.

**One input reorders this queue: `OWNER-NOTES.md`.** It is the owner's inbox — rough direction dropped
between runs — and it is read before this file at session start, because a note can change what the
next milestone is. It is usually empty, in which case nothing here changes. When it is not, a triaged
note becomes a milestone **in this file, in the normal shape** — outcome, *done when*, size, notes,
pinning check — and cites its origin in the heading: `D9 (from ON-4)`. Keep that tag. It is how a run
six weeks from now can tell which milestones came from the owner walking the live site and which the
queue generated itself, and the two are worth different things when something has to be cut.

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

### The Sev-1 that preempted a run on 2026-08-04 — a descent rate 2.4× too fast

**`legRate` read the leg rate off a derivative smoothed three times, and `timeMean` only
telescopes to the chord when it is handed the bare finite difference.** A moving average works on
an INDEX window, so on a log whose cadence changes — 25 Hz climbing, 3 Hz descending, gaps to 11 s —
a fast sample beside a long gap is smeared onto the samples bounding that gap, and `timeMean` then
weights the smeared value by the gap's whole duration. `issuiuc-sg1.2` sustainer published
**15.59 m/s (51.2 ft/s)** where its altitude falls 2,113 m → 150 m in 307.5 s (**6.38 m/s**) and its
own speed column reads **6.61 m/s** — two independent channels agreeing 2.4× below the published
figure, on the reading a flyer sizes a canopy against.

The leg rate is the chord now, read between **short medians** rather than between two single
samples — see below, because that half was found by review and it matters.

**What settles it is the flights recorded more than once**, because two instruments watching one
descent have no reason to agree better unless the reading got closer to the truth. Over the 8 groups
where two or more recordings publish the same leg: **7 tightened, 1 unchanged, 0 widened.** XPRS 2015
**40.1% → 1.8%**, Stargazer 1 **9.0% → 0.3%**, sg1.1 drogue **10.6% → 0.5%** and main
**11.5% → 0.8%**, lemiv L3 main **19.9% → 4.3%**. 43 of 50 digests moved; 42 legs; one record gained
a rate it had been withholding (`euroc-stacarl2` eggtimer, 25.15 m/s).

**The corpus test that had already measured this stopped being evidence, and saying so is the
point.** `reports a rate that matches its own leg` asserted an exact 8 legs disagreeing with their
own chord by ≥5%. All 8 closed — but they closed **by construction**, because the published rate IS
the chord now, so that comparison became the same arithmetic on both sides and agreed to 0.000%
because it could not do otherwise. A test that cannot fail is worse than none. It compares the
published rate against **the device's own speed channel** instead — a second instrument, 11 legs,
median error **0.109%**, worst 1.7%, with the legs it cannot use counted and named in the failure
message (2 whose channel reads above free-fall, 2 whose board states its own inertial solution
drifts after deployment). Falsified: a +12% error in the estimator fails it.

**The chord's endpoints had to become medians, and the pre-push review is what caught it.** A chord
reads two samples out of a leg's however-many, and one of them is `argMax(altClean)` — the record's
most extreme sample BY CONSTRUCTION, exactly where a positive spike survives. The Hampel filter does
not always see it: `blueraven meraki2-121km` peaks at 75,516 m on two samples between neighbours of
54,233 and 58,509, because at 121 km the whole neighbourhood is that noisy and there is no local
consensus to test against. As a bare chord that leg published **138.85 m/s**; with a short median at
each end it reads **107.4**, which is what the superseded estimator read there to 0.01%. Pinned by
`does not rest the rate on the one sample the Hampel filter could not catch`, falsified by returning
the bare sample. **The first version of this change shipped the bare chord**, and it also made one
same-flight group *worse* (lemiv L3 main 19.9% → 25.0%); the medians took that to 4.3%.

**`BACKLOG.md` said "Do NOT fix it by using the chord directly" and that instruction was wrong.**
Its arithmetic was right — the `euler-explosion` chord implies 303 m of descent on a 292 m apogee —
but its premise was that the smoothed figure was the sounder of the two there, and it is not:
7.31 m/s over that leg implies 112 m, contradicting the same trace by 191 m. Both read an unsound
trace (apogee at t=1.0 s, 0.8 s after liftoff — a blast spike on a rocket that exploded at Mach
2.4); the smoothed one was merely more plausible-looking, which is the worse failure. What is
genuinely still open is narrower and is filed: those two records should publish no descent rate at
all.

### The Sev-1 that preempted a run on 2026-08-03 — an apogee Debrief disowns, published bare

`lib/analyze` flags an altitude channel `altitudeUnproven` where the climb is too slow to be a
flight. `lib/report.ts` gated the apogee's caveat on `apogeeIsFloor` — the other of the pair — so a
record in that state put the sentence on the metric tile and on nothing else. One corpus flight is in
it: `issuiuc-sg1.2` reads 31 ft against a sibling altimeter's 2,115 m. `lib/readings.ts` owns the
words now (`apogeeCaveat`, `apogeeIsQualified`) and five surfaces read from them, including the
comparison's "highest" crown, which was withheld for a floor apogee and not for a disowned one.
Pinned by `lib/apogeeCaveat.test.ts`, and `HANDOFF.md` carries why the first version of that test
could not fail.

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

### What slice 1 found, 2026-08-03 — three corrections to the decomposition above

**The fixture is OpenRocket's own shipped example design, written by OpenRocket 24.12**, and it is
the most clearly-licensed file in the corpus: GPL-3.0-or-later, where most of the corpus is
"publicly posted, all rights reserved" with no grant at all. Held for private regression testing,
which the GPL does not restrict. **`LICENSE.TXT`'s section-7 additional permission is NOT the basis
and must not be cited as one** — it permits packaging *the Program* alongside non-compilable data
files such as thrust curves, which is a different act from redistributing an example design. An
earlier note in this section leaned on that clause; it is the wrong clause.

**Slice 2's *done when* is already half-satisfied, by measurement rather than assumption.** The
decomposition says SI must be proved against a real file because the spec page states no units. It
is: `maxvelocity / maxmach = 29.249 / 0.086 = **340.1 m/s**`, the speed of sound, so the velocity is
metres per second. All ten documented attributes are present on all five of the file's simulations.

**Three things the decomposition had open, now answered — and two of them change slice 2 and 4:**

1. **A `.ork` really can carry a saved time series.** This one holds **2,580 `<datapoint>` rows
   across five `<databranch>` elements**, despite `StorageOptions.saveSimulationData` defaulting to
   `false`. So "the summary is the only thing that can be relied on" is right as a *floor* and wrong
   as a *description* — an importer must handle both presence and absence, and slice 4 has a real
   fixture rather than a hypothetical.
2. **`<simulation status>` takes `"uptodate"` here**, a second observed value beside the spec page's
   `"loaded"` example. The page still defines none, so the trust rule stays `UNVERIFIED` — but the
   vocabulary now has two known members instead of one.
3. **`types=` holds LOCALIZED names** (`Time,Altitude,Altitude above sea level,Vertical velocity,…`)
   because 24.12 writes `getName()`. The decomposition says only `unstable` writes stable save keys,
   which is correct — but the sharper point is that **the encoding follows the version that WROTE
   the file, not the branch it is fetched from.** This file was fetched from `unstable` and is
   localized. 24.12 is the shipped stable release, so **localized is what a flyer's own file will
   have**, and slice 4 must read it as the normal case rather than the legacy one.

**One thing the fixture is NOT, stated so slice 3 is not scoped against it:** it corresponds to no
flown log. It is a 50–320 m model rocket with five simulations and no altimeter recording anywhere
in the corpus. That is fine for slices 1, 2 and 4 — parse it, refuse it standalone, read its series
— but slice 3's cross-check table needs a prediction and a flight *of the same rocket*, which only a
flyer can supply. Slice 3's *done when* should be tested with a hand-paired set, not with this file.

**And a question the decomposition never raised, because nothing had been read:** this single file
carries **five** simulations. An importer has to decide which one a flyer means — the last? the
one matching the flown motor? all of them? — and "the `.ork` holds a prediction" is therefore wrong
in the singular. That is a slice 2 design question and it is not answered here.

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

**Status:** IN PROGRESS — **slices 1, 2 and 3 SHIPPED; the tilt slice (4) is MEASURED AND BLOCKED, and the block now STANDS on a re-measurement rather than on a suspicion.** The previous status line said slice 4's blocking number had been taken over spliced data and that slice 3 made de-splicing possible. **That re-run was done 2026-08-03 and it changed the reasoning without changing the verdict** — see the slice-4 body below. Removing the repeated samples makes jan10 *worse* (21.67°/96.67° → 24.05°); only reading less of the file repairs it (4.07°/7.34° truncated at its first seam). And the sharper reason to refuse: on WORST single sample jan10 is not the outlier at all — **jan18 reaches 10.80° against jan10's de-spliced 7.34°** — so a refusal would have to separate them on mean while ignoring that the other is worse on peak, and nothing in the corpus supplies that rule. **Updating this line in the same commit as the work is what the paragraph below exists to demand; it is being obeyed here rather than quoted.**
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

   **The block STANDS, with a corrected magnitude.** Do not ship a tilt on this.

   **THE DE-SPLICED RE-RUN IS DONE — 2026-08-03, and it changed the reasoning rather than the
   verdict.** This entry said the next step was to re-run the comparison on de-spliced streams,
   because every number above was computed over data containing a replay. `findRepeatedSpans`
   (slice 3) makes that possible, and the measurement is:

   | file | whole ascent | copies removed | read only up to the first seam |
   |---|---|---|---|
   | meraki | **0.62° / 1.80°** | *no replay* | — |
   | lemiv | **1.81° / 3.84°** | *no replay* | — |
   | jan18 | **1.76° / 10.80°** | identical — its replays are all past apogee | identical |
   | jan10 | **21.67° / 96.67°** | **24.05° / 96.67° — WORSE** | **4.07° / 7.34°** |

   **"De-spliced" had two readings and only one of them is an operation that can work.** Deleting
   the repeated samples makes jan10 *worse*. A download that repeats itself has lost the
   correspondence between its two halves from the first seam onward — dropping rows does not restore
   it, because the surviving rows on either side of the seam still describe different instants than
   the low-rate half does at the same clock time. Only reading LESS of the file repairs it.
   Truncated at its first seam, jan10 reads **4.07° / 7.34°**, reproducing the 4.71°/7.29° recorded
   above by an independent route (that cut at 12.17 s, the pre-seam window of both halves; this cuts
   at the high-rate seam at 14.09 s).

   **So the block stands, and its reason is sharper than "jan10 is the odd one".** On MEAN error
   jan10 at 4.07° is still 2.2× lemiv and 6.6× meraki. But on the WORST single sample it is not the
   outlier at all: **jan18 reaches 10.80°**, further out than jan10's de-spliced 7.34°. A refusal
   would therefore have to separate jan10 from jan18 on mean while ignoring that jan18 is worse on
   peak — and nothing in the corpus supplies that. A tilt right three times in four with no way to
   say which time is the fourth is the plausible-but-wrong reading the MEASUREMENT invariant exists
   to stop.

   **Published rather than left in this file:** `/validation` now carries the four numbers, the
   deleting-the-copies-makes-it-worse finding, and why no angle is computed. A withheld number that
   says why it is withheld is the shippable form of this slice.

   **A fifth high-rate corpus file would still settle it faster than any of this**, and that is now
   the only thing that would — it is an owner action (the fixtures repo), not an engineering one.

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

## D9 — Predicted versus flown

**Status:** SHIPPED 2026-08-09 — **all five slices.** Slice 3b landed last and is the one the
milestone was held open for: a flyer can now say which simulation flew when a design states
several. Pinned by `lib/predictionChoice.test.ts` (11 cases, falsified 5 ways) and two e2e walks in
`e2e/analyze.spec.ts` — *"a design stating several simulations lets the flyer say which flew, and
says it was theirs"*, which drives choose → switch → reset in the real app, and *"a chosen
simulation reaches the exports, not just the panel"*, which reads the `.md` a flyer pastes into a
cert document rather than trusting the panel on screen.

**What 3b shipped, against the shape scoped for it below.** All three parts it named:
`ingestFiles` surfaces the runs as a `predictionOffers[]` paired to the flight the design landed
on; the analyze page holds the offer and the choice on its `report` state for the session; and
`applySimulationChoice` re-merges the chosen run's figures, notes and curve onto an already-built
flight. The re-merge is **additive and needs no re-analysis** — a prediction contributes
`reported`, `notes` and `predicted`, and nothing in `lib/analyze` reads any of them — so every
surface downstream updates from the flight object rather than each learning about simulations.

**The refusal is still the default and Debrief still never picks.** What changed is that a flyer
may override it with a fact they have and the file does not, and that the override is attributed to
them everywhere it appears. Three properties are asserted rather than assumed, because each is what
keeps the control from being a one-way door: applying twice equals applying once, switching runs
leaves nothing of the one before, and *Don't compare one* restores the ingested flight exactly.

**Two things 3b settled that the scoping below did not have.**
1. **A canonical record keeps the answer; the logbook does not.** `lib/reopen.ts` says in its own
   words that a prediction is not persisted, but `toCanonical` writes `notes`, `reported` and
   `predicted` verbatim — so a saved record returns the figures AND the line saying it was the
   flyer's statement, which is right, since D11's whole point is that a flyer's statements survive.
   The copy therefore says the design must come back to *change* the answer, rather than claiming
   the answer is forgotten. Measured, not assumed; an earlier draft of that sentence was wrong.
2. **The design's own word for each run's freshness was hover-only, and is now visible.** Found by
   this run's competitive probe against OpenRocket, whose Flight Simulations table carries a status
   per row. `PredictedRun.status` was already parsed and was rendered only in a `title=` — nothing
   at all at the pad, which `DESIGN.md` §5 rules out before §8 does. It is shown verbatim on every
   chip now and **interpreted nowhere**, which is the caution that field was written with: the
   format page shows one example value and defines none, so even "warn unless it says uptodate"
   would be a rule built on an unpublished vocabulary. `COMPETITION.md` row 38 carries the rest.

**Scoped 2026-08-09 by reading rather than by planning.** `lib/parsers/openrocket.ts` already reads
every `<simulation>` block into a run with its own name, its ten stated figures in canonical SI, and
its saved trace (`PredictedSeries`). `predictionFigures` then throws all of that away when
`runs.length > 1` and returns a refusal naming them: *"…states 5 simulations … a flight log does not
say which motor flew, so Debrief will not pick one"*. That refusal is honest and is the right
default — what it costs is a trip back to OpenRocket to re-export, which is a task a flyer can
complete expensively rather than one they cannot complete at all. **A real test case exists**:
`lib/parsers/__corpus__/openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork`
states **five** simulations. It is corpus-only, so the assertion runs in CI and skips on a fork.

**Corrected later the same day, and the correction is the useful part.** An earlier pass of this
paragraph called the remaining work "a CHOICE, not a parse" and said the decision left to make was
"a UI one". The parse half of that stands; the UI half does not, and it understates the slice by
about two thirds. A picker is not a control over data already in hand, because **no design survives
the drop**. The `runs` array exists only inside one `readPredictionDetail` call, made from
`ingestFiles`'s catch block; `predictionFigures` collapses it to figures-or-a-refusal before it
returns, `pairPredictions` merges that answer into `target.flight`, and nothing else about the `.ork`
is retained — as the note a flyer reads says in its own words: *"unlike a device summary, it is not
kept with the flight"* (decided 2026-08-04, below: the XML is 996 KB on the corpus fixture and the
ten figures have no place on the logbook row yet). By the time a flyer could point at a simulation,
the flight has already been analysed, saved and rendered.

So the smallest honest shape for 3b is three things, not one: `ingestFiles` has to surface the runs
alongside `predictionPaired`; the analyze page has to hold them for the session, which is state that
does not exist there today; and choosing one has to re-merge its figures and its curve onto an
already-built flight and re-render the cross-check. Plus the control itself, with §9's five states
and the touch contract. That is why this is not the tail end of D9 to be swept up in an idle hour —
it is a slice with its own decomposition, and it lands on the one surface where a PREDICTION sits
beside a MEASUREMENT.

**Not started deliberately, and this is the reason rather than an omission.** It changes what
reaches the cross-check panel — the surface where a PREDICTION sits beside real readings — and
`MAINTAINING.md`'s spine is that the two must never blur. Starting that at the end of a long run is
how this repo's own history says a wrong claim ships. The next session should take it first, with a
full run in front of it rather than the last hour of one: the parse is done and the fixture is
there, and what is left is the session state, the re-merge and the control described above.
Slice 4 is pinned by
`lib/overlay.test.ts` (6 cases on the union time base, the sharpest of them a PROPERTY — every
finite output sample must equal an input sample at exactly that instant, which is the difference
between a union and a resample), by `lib/parsers/openrocket.test.ts` (the saved curve read by
column NAME, and cross-checked against the figures the same file states independently), and by
`e2e/analyze.spec.ts` → *"a design that saved its curve is drawn beside the flight, dashed and on
its own clock"*, which drives the real app and is falsified by making the parser return no series.

A design stating one simulation is read, paired onto the flight it was dropped beside, shown as a
third source in the cross-check with its own verdict wording, **and its saved altitude curve is
drawn on the report's altitude chart** — dashed, in a neutral zinc, on a union x that resamples
nothing. A design stating several is read and refused by name, which is the honest half — and the
reason 3b exists.

**Two things slice 4 settled that the decomposition did not have.** The `types=` header is
LOCALIZED in shipped 24.12, so columns are matched by name and a design whose names Debrief cannot
find carries no curve rather than one read off the wrong column — `hasSeries` and `series` are
separate fields because *there is no curve* and *there is a curve I cannot read* are different
sentences. And the dash goes on the PREDICTION, which is the opposite of what the nearest
competitor does: `COMPETITION.md` row 32 records Project APEX establishing its axis from the
simulation and dashing the measured trace. Both are defensible; the measurement-not-simulation
spine decides it here.

Slice 2
landed 2026-08-04 (`lib/parsers/openrocket.ts`, pinned by `lib/parsers/openrocket.test.ts`), so
Debrief now reads a prediction and refuses it as a flight. Nothing SHOWS a prediction yet — that is
slice 3, and until it lands the ten figures are read and dropped.

**Slice 1's fixture reached `nrdptel/debrief-fixtures` main on 2026-08-04, not 2026-08-03.** The
earlier status line said it was in the corpus; it was on an unmerged branch, which is a different
thing and is why the file was absent from a session that went looking for it. Merged in that repo's
`#4`. It is still **not in any release asset**, so CI cannot see it — see slice 2 below for the one
owner action that closes that.

`openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork`, manifest row 62,
full provenance in `SOURCES.md`. `COMPETITION.md` row 12 — **not** the oldest open
`GAP`, which this line first claimed: rows 3 and 4 are both `GAP` and both older, and rows are
numbered in order added.

**The product assumption, stated loudly because this one is not mine to make quietly.**
`MAINTAINING.md` says keep the tools distinct, so this is an **import of a prediction file, never a
shared runtime and never a network call to the sibling**. A flyer exports a prediction from whatever
they simulate in, drops it on Debrief like any other file, and Debrief says how the flight compared.
Debrief does not simulate, does not fit, and does not correct a prediction — it reports the gap.
Recorded under *Decisions taken without the owner*.

### What the measurement found, 2026-08-03 — and it inverted the obvious plan

**Three of the four tracked tools cannot do this, and the fourth is the one already on the ledger.**
OpenRocket has one open feature request (#2356, no milestone, no assignee) whose asker wants exactly
this; RockSim cannot overlay two of its own sims (Apogee's own *Peak of Flight* #544: *"One
limitation with RockSim is that it can't graph out data from two simulations (or more) so that they
can be compared"*); AltosUI reads `.telem`/`.eeprom` and mentions no prediction format anywhere in
its manual. **The fourth is Featherweight, and it must not be skipped here.** `COMPETITION.md` row
16 records wFIP 2.0 as loading OpenRocket simulation files and overlaying them on flown traces —
which would make it the closest competitor D9 has. It stays `UNVERIFIED`: its sole source 403s
through this proxy and the vendor's own page says nothing about OpenRocket. **So the honest framing
is "unverified, possibly already beaten", not "nobody ships this"** — an earlier draft of this line
said the latter and it was wrong twice over, since it also contradicted a row this repo already
carries.

**But a tool OUTSIDE the tracked set ships the mirror image, on Debrief's own input format.**
Project APEX (`apexrocketsim.com`, free, browser-based) states it imports Blue Raven altimeter CSV
and overlays real flight data on simulated results. That is a *simulator that imports the log*;
D9 is an *analyzer that imports the prediction*. Same flyer, same question, opposite direction.
Added to `COMPETITION.md` as row 29 — this is a deficit with a live competitor, not an opening, and
it is why D9 was decomposed this run rather than left in the after-list. Its licence is not stated
on its page and it was read rather than run, so everything about it is a published claim.

**The obvious first slice — read the OpenRocket CSV export — is wrong, and this is the measurement
that says so.** Checked against the two primary sources rather than against the plan:

- **The CSV export is time-series only, and it carries FIVE of the ten — not none.** OpenRocket's
  user guide: *"you can export any or all of over 50 values"* — the plot variables, per timestep.
  `maxaltitude`, `maxvelocity`, `maxacceleration`, `maxmach` and `flighttime` are all **recoverable**
  from `Altitude` / `Total velocity` / `Total acceleration` / `Mach number` / `Time` columns, and the
  export's optional comments block names flight events, apogee among them, which is `timetoapogee` —
  a behaviour **`COMPETITION.md` row 22 already records**. What genuinely has no column is
  `optimumdelay`, `groundhitvelocity`, `launchrodvelocity` and `deploymentvelocity`. *An earlier
  draft of this bullet said the CSV carries "none of the ten", which is both wrong and contradicted
  by this repo's own ledger — the sort of claim a later session reads instead of checking.*
- **The CSV has no stable schema, and that is the real disqualifier.** Columns are user-selected;
  the separator, the comment character and the decimal precision are all user-set. An importer could
  only ever detect it heuristically, and would then have to *derive* five of the ten scalars from a
  column set the exporting flyer chose — deriving a maximum from a decimated user-chosen series is
  not reading a stated figure, and Debrief would be publishing a number the prediction never made.
  **`UNVERIFIED`, and flagged rather than asserted:** that a fresh install selects no columns, and
  that the column-name line is comment-prefixed and conditional. Both were stated flatly in a first
  draft; neither could be confirmed from a primary source. The stable-schema argument does not need
  them.
- **The `.ork` carries all ten as stated figures, and its format is published.** `<simulation>`
  holds `<flightdata maxaltitude maxvelocity maxacceleration maxmach timetoapogee flighttime
  groundhitvelocity launchrodvelocity deploymentvelocity optimumdelay>` on OpenRocket's own
  file-specification page. **Two hedges this entry originally dropped, both restored:**
  - **The page states no units.** SI is *inferable* from the example's internal consistency
    (`maxvelocity="29.249"` ÷ 343 ≈ `maxmach="0.086"`) and from the dev guide's "OpenRocket always
    uses internally pure SI units", but the spec page itself defines no attribute and names no unit.
    Slice 2's *done when* has to prove SI against a real file, not assume it off this page.
  - **The clean-room question was NOT disproved, only two bad quotations were.** A first pass
    claimed the page says the format is "not documented other than as the reference implementation"
    and points at GPL-3 Java. Neither phrase is on the page, and its one XSD sentence is about
    **`.orc`**, a different format — both checked by fetching it. **But the page does say:** *"Not
    every parameter in the XML file is explained here. Please refer to the
    `core/src/main/java/info/openrocket/core/file/openrocket` package in the source code."* That is
    the substance of the concern, and calling it "manufactured" would stop the next session
    checking. **What follows is narrower and still enough:** the ten attributes ARE named on the
    page, so the summary parser slice 2 describes can be written from it. Anything beyond them —
    the `<databranch>` series, the `status` vocabulary — is where the page defers to GPL-3 source,
    and that is a clean-room boundary to respect, not to cross. This is a *weaker* footing than
    `lib/parsers/xlsx.ts`, which cites two complete formal specifications (PKWARE APPNOTE.TXT and
    ECMA-376 / ISO/IEC 29500) with defined semantics and units; an earlier draft called the two
    equivalent and they are not.
- **The time series inside a `.ork` is OPTIONAL and off by default** (`StorageOptions
  .saveSimulationData = false`), so the summary is the only thing that can be relied on — which is
  the same reason the summary slice comes first, arrived at from the other direction.

**The repo is one keystroke from the right shape, and that is not a coincidence.**
`lib/flight/types.ts:91` declares `ReportedValue.source: 'device'` — a **single-member union**.
`RawFlight.reported?: ReportedValue[]` already carries a non-measured series through the entire
stack, `lib/flight/reported.ts` already holds the agree/differ logic once (`compareReported`,
`REPORTED_QUANTITY` as a `Record` over the metric union, so a new metric fails to compile until it is
classified), and the cross-check renders at **three** call sites — the on-screen panel
(`DeviceSummary.tsx:51`), the formatted report (`lib/report.ts:338`, feeding the .txt and .md) and
the JSON (`lib/report.ts:1417`). *Three, not four: `analyzedDataCsv` is a real export that does not
carry it, and `lib/flight/reported.ts:59`'s own comment says three.* `lib/parsers/deviceSummary.ts`
is the exact structural precedent for a registered parser that is not a flight. **A prediction is a
second `source`, not a second architecture.**

**What does NOT support it, and must not be bent to.** `lib/compare.ts`'s `CompareInput` demands a
full `FlightAnalysis` per flight, and `buildComparison` aligns on a **detected liftoff** and
resamples measured series. A prediction has no detected events and no `FlightMetrics`; feeding one in
would fabricate a measurement, which **MEASUREMENT, not simulation — the safety spine** forbids
outright. (`MAX_COMPARE` is 6, so "a seventh entry" is literal.) A predicted trace on a chart needs
its own series type beside `CompareFlight`, never a seventh entry in it.

**Zero corpus coverage, and that is slice 1.** 61 manifest files, extensions `csv`/`txt`/`eeprom`/
`pf2`/`xtra`/`rff`/`bin` — **no `.ork`, no `.rkt`, and `grep -Eic 'simulat|predict'` over the
manifest returns 0**. *Note the `-E`: this was first filed as `grep -ic "simulat|predict"`, which is
a BRE matching the literal string `simulat|predict` and would return 0 on a manifest that did
contain those words — a command filed as evidence has to be able to fail.* Every slice below is
unbuildable until a real prediction file is sourced. Do not synthesise one and call it a fixture:
the whole milestone is about reading what a real tool actually writes.

### The slices, ranked by what a flyer can check

1. ~~**A prediction file in the corpus, or a written refusal.**~~ **DONE 2026-08-03 — see the
   section immediately above.** Source one real `.ork` with saved
   simulation data under `LICENSING.md`'s redistribution and privacy rules — *which are a different
   rule from the clean-room one governing parsers; an earlier draft merged the two into one phrase*
   — and record its provenance in `SOURCES.md` like every other fixture. **If none can be licensed, that is a legitimate outcome and
   it gets written down** — D9 then blocks on a fixture the way D8 slice 4 blocks on a measurement,
   rather than being quietly dropped. *Done when:* `manifest.csv` carries a prediction row, or this
   slice records why it cannot and the milestone's status says BLOCKED.

2. ~~**Read `<flightdata>` and nothing else.**~~ **SHIPPED 2026-08-04**, pinned by
   `lib/parsers/openrocket.test.ts` (19 cases; the 3 that need the real archive carry an
   `existsSync` guard and **skip in CI** — see the note below, which is a fact about the
   corpus release, not about the parser). `lib/parsers/openrocket.ts` reads all ten scalars as
   `ReportedValue[]` with `source: 'predicted'`, and a `.ork` dropped alone is refused with a
   sentence naming what it is and what it needs. Both halves of the *done when* are met:
   **SI is proved from the file, not assumed** — `maxvelocity / maxmach` over the fixture's five
   simulations gives 340.1, 338.7, 339.1, 339.1, 339.1 m/s, and `readPrediction` re-runs that
   check on every file and drops a prediction that fails it, so a future OpenRocket writing feet
   cannot publish a number under a metre's label.

   **Four things this slice found that the decomposition did not have.**
   - **The fixture was reachable by nobody.** Slice 1's file sat on an unmerged branch of the
     fixtures repo, and `scripts/make-release-zip.sh` there listed its ten format directories
     *inline* — so `openrocket/` would have shipped in no release asset at all, and the parser
     test would have passed locally and skipped in CI as though it were flaky. Both fixed in
     `nrdptel/debrief-fixtures#4`: the payload is derived from disk and the built asset is
     checked against the manifest before it can be published. **Cutting the release is an owner
     action this session had no route to** — the API is unreachable here and the tooling has no
     release verb — so `corpus.lock.json` still pins `v1.1.0` and CI still cannot see the `.ork`.
     One command rebuilds the asset: `scripts/make-release-zip.sh v1.2.0`, sha256
     `fc06599b2b9fefb690acebf453474085b38d77e8e6d7ba064a6a85bf8eaeb4ba`.
   - **The three cross-check renderers fell through to acceleration.** Each wrote
     `q === 'length' ? … : q === 'speed' ? … : accel`, so adding `time` and `mach` to the metric
     union would have printed a flight time as g — the same defect `reported.ts` already records
     having shipped once against burnout velocity and descent rate. Replaced by `renderReported`,
     which takes one renderer per quantity and fails to compile when the set is incomplete.
   - **Four of the ten are deliberately given nothing to compare against.** `groundhitvelocity`,
     `launchrodvelocity`, `deploymentvelocity` and `optimumdelay` name no `FlightMetrics` field,
     and mapping them to the nearest one would invent an agreement — the mistake that made four
     recordings of one flight "disagree" by 121.6%. `METRIC_FIELD` records that as `null` per
     metric, so the compiler asks again next time the union grows.
   - **The picker greyed out three formats the app can read.** `lib/fileAccept.test.ts` swept for
     `endsWith('.ext')` only, so `openrocket.ts`'s anchored regex was invisible to it — the class
     error DESIGN.md §9 keeps recording in its own greps. Widened to both forms, it immediately
     named `.xtra` and `.bin` as well: a flyer with an Entacore AIM download had it greyed out and
     so could never reach the message that explains what to do with it. All three offered now.

   *The original decomposition, kept because slices 3 and 4 still rest on it:* A registered parser that opens the `.ork` zip (the
   `lib/parsers/xlsx.ts` central-directory + `DecompressionStream` route, with `lib/fileText.ts` as
   the async pre-step that exists because `Parser.parse` is synchronous), reads `rocket.ork`, and
   returns the ten scalars as `ReportedValue[]` with `source: 'predicted'`. **Not a flight** — it
   must be refused as a standalone the way a device summary is, for the same reason.
   *Done when:* the fixture's ten values are shown to BE SI (proved against the file, not assumed off
   the spec page, which states no units) and a `.ork` dropped alone is refused with
   a sentence saying what it is and what it needs.

   **Two hazards to design against, both found by measurement.** `<flightdata>` sits inside
   `<simulation status="…">`, so a `.ork` can carry a summary that is stale or from a superseded
   design — and **the spec page shows one example value and defines none**, so a trust rule keyed on
   `status` is unverified and must be confirmed against real files before it is written. And in
   shipped 24.12 the `<databranch types="…">` attribute holds *localized* names; only unstable
   (26.xx) uses stable save keys. That is a slice-4 problem, but it is why slice 2 reads attributes
   and not the series.

3. ~~**The cross-check table grows a third column.**~~ **SHIPPED 2026-08-04**, pinned by
   `lib/flight/reported.test.ts` (6 cases on the grouping and the vocabulary, each falsified by
   mutating the source), `lib/parsers/openrocket.test.ts` (4 on what a design contributes) and two
   e2e cases in `e2e/analyze.spec.ts` that drive the real app — one dropping a single-simulation
   design beside a log, one dropping the real five-simulation corpus fixture. Both clauses of the
   *done when* are met.

   **Four things this slice found that the decomposition did not have.**
   - **A prediction could not reach the flight at all, and the plumbing was the work.**
     `pairSummaries` deduped by METRIC ALONE, so a design's apogee was silently dropped by an
     altimeter's apogee — precisely the cross-check this milestone exists to show. Keyed on
     `source:metric` now. `lib/ingest.ts` grows `pairPredictions` beside the summary and high-rate
     pairings, matched the same two ways (rocket name, or one-of-each).
   - **`compareReported` had no notion of a metric identity.** It is a 1:1 map, so two sources
     stating apogee produced two rows both labelled "Apogee", each showing Debrief's identical
     read, under a duplicate React key. `reportedByMetric` groups them; `compareReported` stays as
     it is, because a caller that wants each stated figure once is still right.
   - **`deltaPct` is unsigned, and for a prediction the direction IS the reading.** Two
     measurements of one flight have no reference between them; a prediction has one — the flight.
     `signedPct` is added beside it rather than replacing it.
   - **The verdict vocabulary had no third case.** `agree`/`consistent`/`differ` is a measurement
     vocabulary, and `lib/flight/types.ts` already stated the invariant it would break: a flight
     that missed its prediction "is not an error at all — it is the answer". `predictionVerdict`
     says *flew higher · +8%* or *as predicted · 2%*, in `accent` and never `warn`.

   **Six defects a second-opinion pass on the finished diff found, all fixed before the push.**
   Worth recording as a group, because five of the six are the same failure: a sentence written for
   the case in front of me, then reached by a case that was not.
   - **"flew higher" was being said about all ten figures.** `Time to apogee — flew higher · +245%`,
     on the row directly above Apogee. The direction words go through `renderReported` now, which
     is the funnel that already forces a per-quantity decision for units — so a time *took longer*
     and an acceleration *pulled more g*, and the next metric added cannot reach a flyer under
     borrowed words.
   - **The gravity-convention finding fired on predictions.** It is a MEASURED regularity of
     instruments Debrief has read files from (+1.00 g, to two decimals, on every AltimeterCloud
     file in the corpus). The `.ork` format states no acceleration convention at all, so on a
     design it would have printed a confident sentence about "the device" under a figure no device
     wrote, and flipped a real 5–7% under-prediction to `agree`. Gated on `source === 'device'`,
     with the caveat stated once in the design's own note instead.
   - **A design stating several simulations was announced as a prediction that landed.** It
     contributes only its refusal, so it is no longer counted as paired — the two sentences were
     contradicting each other on one screen.
   - **The pairing note promised a table that surface does not have.** The cross-check panel lives
     on the single-flight report; a drop that assembles a comparison shows no reported figures at
     all, and a prediction is not persisted, so it is not one reopen away either.
   - **A prediction verdict was printed under a column headed `Agreement`** — on screen, where a
     device-less row also rendered the same chip twice, and in all three documents. One column per
     question now, each present exactly when its source is.
   - **The row's Debrief cell was copied off whichever source came first**, and `hasComputed` on a
     comparison is false when the stated value is 0. A device figure of 0 blanked Debrief's read
     for the whole row while `analysisJson` still carried the number.

   The pass also caught the one that would have failed the gate on arrival: the new methods-page
   block was not in `lib/methodIds.ts`, which is a type error, and I had reported the gate green
   from a run that predated writing it.

   **The sign convention is a decision, and the field is split on it.** Debrief states
   `(flown − predicted) / |predicted|`. RASAero II's published 43-flight comparison table states
   the same quantity as `(sim − flown) / flown` — opposite sign AND a different denominator, so a
   flight it prints as −4.30% Debrief prints as +4.5%. Debrief takes the flight as the reference
   because the flight is what it measured. Recorded in `COMPETITION.md` and on the methods page.

   **What it deliberately does NOT do, filed as slice 3b:** pick a simulation when a design states
   several. See *Decisions taken without the owner*.

   *The original slice text follows, because slice 4 still rests on it:* `DeviceSummary` already puts the board's own
   figures beside Debrief's read with an agree/differ verdict. Predicted is a third source in the
   same table, on the same `compareReported` logic, at the same three surfaces it already reaches.
   *Done when:* a flight with a prediction shows `PREDICTED | LOGGER | DEBRIEF | AGREEMENT`, and the
   verdict language distinguishes **"these two measured the same flight and disagree"** from
   **"the flight did not do what was predicted"** — which is not a discrepancy, it is the answer.

4. **The predicted trace on the chart, if and only if the file carries one.** A new series type
   beside `CompareFlight`, drawn dashed, never resampled onto a detected liftoff, and stated as
   predicted wherever it appears. *Done when:* a prediction with no saved time series says so and
   draws nothing, rather than drawing a line through its own summary scalars.

   **Scoped and measured 2026-08-04, not started — and the measurement inverts the emphasis above.**
   The done-when is written as though the common case were a design with no saved data. It is not.
   The corpus `.ork` carries **2,580 datapoints across five `<databranch>` elements**, one per
   simulation, 233–695 points each. A branch declares its columns in a `types=` attribute
   (`Time,Altitude,Altitude above sea level,Vertical velocity,Total velocity,Vertical
   acceleration,Total acceleration,…` — 46 of them) and each `<datapoint>` is one comma-separated
   row against it, with `NaN` for the columns that stage does not have. Everything the chart wants
   is in there and named. So slice 4 is "there is a real curve to draw", and "says so and draws
   nothing" is the fallback, not the case.

   **The real cost is not the parse — it is that `uPlot` has ONE x array for every series.**
   `components/Chart.tsx` takes `time: Float64Array` plus `series[]` all aligned to it, so a
   prediction on its own time base cannot simply be pushed into `series`. Three ways out, and only
   one of them is allowed:
   - *Resample the prediction onto the flight's samples.* This is what the comparison surface
     already does to overlay several flights, and it says so in its own words ("resampled onto a
     shared time base"). **Forbidden here** by this slice's own text, and rightly: resampling a
     simulation onto a measured liftoff makes the prediction look like it was measured.
   - *A second chart underneath.* Cheap, and it throws away the one thing the overlay is for —
     seeing where the two curves part company.
   - **Merge the two time bases into a union x, keeping every original sample of each and NaN
     elsewhere.** Not a resample: no value is invented and none is moved. Needs `spanGaps` on so
     each line draws through the other's samples. This is the one to build, and `bracketUnsortedX`
     in `Chart.tsx` is already the same shape of trick.

   The multi-simulation refusal from slice 3 applies unchanged: five branches means five curves,
   and a flight log still does not say which motor flew. Session-only persistence applies too —
   996 KB of XML against a shared browser quota.

**Size.** 3–5 increments, and slice 1 gates all of them. Slice 2 is the one with real risk: the
standalone refusal must survive it, exactly as it had to for the device summary.

---

## D10 (from ON-2) — A sample for every capability, and every one says what it is

**Status:** IN PROGRESS — **slices 1, 2, 3, 4 and 5a SHIPPED.** (This line read "1, 2 and 3" for a
day after 4 shipped; corrected 2026-08-09, and the paragraph below is the reason the rule exists to
update the status in the same commit as the work.) Slice 1 2026-08-08, pinned by `lib/samples.test.ts` (6 cases,
including *"gives the two-altimeter sample two recordings of ONE flight, not two flights"* and a
check that `public/sw.js`'s precache list equals the registry) and two walks in
`e2e/analyze.spec.ts`.

**The route changed, and the change made the milestone smaller and more honest.** This was scoped
around synthesized logs because the corpus cannot ship. That is right about `debrief-fixtures`, the
private corpus — and not true of `lib/parsers/__fixtures__/`, which is a different set: real,
publicly-shared logs already committed to this public repo with their provenance documented. Serving
one publishes nothing new, so a sample can be a REAL flight and no synthetic label is needed for it.
Recorded under *Decisions taken without the owner*.

Three samples now, from one: a single flight; **two boards recording one physical flight** (a
PerfectFlite Pnut and a Featherweight Raven aboard the same airframe, agreeing at 1,025 vs 1,029 ft,
a 0.4% spread); and a log beside its board's own summary. The first demonstrates D3 — a shipped
milestone that until now a visitor could not see without bringing two of their own files.

**And the sample path stopped being a second path.** It fetched one hardcoded URL, ran the bytes
through `decodeBytes` and handed `ingest` a string, so a sample could only ever be one UTF-8 text
file — no binary, no spreadsheet, no set. Samples build real `File` objects and go through
`onFiles` now, which is the drop path itself; the `.pf2` sample opening at all is the proof.

**Slice 2 SHIPPED 2026-08-09 — `/compare` offers a way in.** Its empty state was a task a flyer
could not complete at all: the only exit needed two flight logs, which is exactly what a first-time
visitor does not have, on the surface that demonstrates D3. It offers the two-board sample — a real
pair, agreeing to about 0.4% — chosen by id rather than by position, through the same
`sampleFiles()` + drop path the analyze page uses. Pinned by 4 cases in `lib/samples.test.ts` and an
e2e that asserts TWO ids reach the address.

**`/stitch` is deliberately NOT given one, and that is a decision rather than the slice being
half-done.** The committed fixtures hold no genuine staged pair. `e2e/stitch.spec.ts` uses two
unrelated real logs as stand-ins because they have the right SHAPE — fine for a test, not fine for a
demonstration. A sample presented as a staged launch that is not one is precisely what this
milestone's *done when* forbids about synthetic flights, without even the honesty of a label. It
needs a synthesized staged pair, labelled, which is the same work as the rest of the list below.

**Slices 3 and 4 SHIPPED 2026-08-09.** Slice 3 — a flight Debrief made up says so, and the cost of the milestone is
now measured rather than guessed.** `lib/synthetic.ts` generates a deterministic demonstration
flight and writes it as a CSV the COLUMN MAPPER must handle; the marker rides **in the file**, in
the same metadata block a logger's own summary block occupies, and `analyzeTable` lifts it onto the
flight as its FIRST note. Pinned by `lib/synthetic.test.ts` (14 cases, falsified 5 ways), including
the canonical round trip — save the record, mail it, drop it back, and it still says what it is.

**Three things this slice established by measurement, and they reshape what is left.**

1. **The file is the ONLY carrier that survives.** A surface audit traced a `synthetic` field on
   `RawFlight` through five persistence hops and **four silently drop it**: `toCanonical` and
   `fromCanonical` are explicit field-by-field rebuilds (`satisfies` rejects excess keys, never
   missing ones), `SharePayload` is `{n,t}` and nothing else, and `normalizeFlight` rebuilds on
   logbook restore — its own comments already record three fields lost exactly that way. A marker in
   the bytes survives all five with no new code. That is why the label is a note and not a field.
2. **There are 26 export sinks across 6 call sites, and NO registry to enumerate them from.**
   `lib/download.ts` is the only shared thing and it takes an already-serialized `Blob`, so it
   cannot see a flight let alone a flag on one. The *done when*'s pinning check therefore cannot be
   written as specified until that registry exists and every exporter is routed through it.
   **That, not the label, is the milestone's remaining cost.**
3. **Four surfaces never receive a `RawFlight` at all** — the metric grid takes `FlightMetrics`, the
   print card takes series/metrics/stem, the logbook row takes a `RecentFlight`, and the comparison
   takes a `CompareFlight` with no provenance member. Each needs a prop threaded, not a read.

**No synthetic sample is offered in the app yet, and that is the slice boundary rather than an
omission.** `lib/synthetic.test.ts` enumerates all 26 sinks with a verdict each and requires a
written reason for every one not covered; **5 carry the label today** (.txt, .md, .html, .json and
the canonical record, all via `flight.notes`) and the data CSV — the export a flyer pastes into a
spreadsheet, where an unlabelled number is most likely to be read as measured — is named as the gap
that matters. Offering a sample before that is closed is exactly what this milestone's *done when*
forbids.

**Slice 4 SHIPPED 2026-08-09 — the export registry, which slice 3 named as the remaining cost.**
`lib/documents.ts` is the one list of every document a flyer keeps. The report's save strip renders
from it — six hand-written `<Button>`s and six near-identical `downloadX` closures are gone — and
both ratchets enumerate it instead of keeping their own copies. So **a document with a button is a
document the checks reach**: a seventh export cannot get a button without also getting a build-stamp
assertion and a synthetic-label assertion.

Two things that made it more than a move. The registry's `build` takes an optional `DocumentContext`
rather than `(flight, analysis, sys)` — the naive signature compiles and **silently drops the
flyer's own label and notes, the recovery figures they typed, and the grouping statement** from
every saved document, which is a regression with no error message. And the two ratchets now address
documents by a stable `id` rather than by display name, because keying on a name meant renaming a
button silently un-checked a document.

Pinned by `lib/documents.test.ts` (4 cases, falsified 3 ways: a seventh document carrying nothing,
the strip reverting to hand-written buttons, and the data CSV mis-declaring that it carries prose —
4, 1 and 4 assertions fail respectively). The data-CSV exemption is now stated once, on the
document, instead of twice in two test files.

**Slice 5a SHIPPED 2026-08-09 — the label reaches the surfaces a flyer READS, and the audit that
said which was re-run rather than believed.** Five sinks moved from `todo` to `labelled`: the report
(a §5 `Notice` at `warn`, first thing on the page and deliberately **not** `print:hidden`), the
metric grid (a second one, above the tiles — the report runs nine screens on a phone and the
readings are the part that gets screenshotted), the logbook row (a `Chip` at `warn`, with the
claim in `sr-only` text rather than a `title`), the logbook's clipboard table (a conditional
*"Provenance"* column) and the logbook backup. The stitch composite `.zip` moved too, from
`unreachable` rather than from `todo` — say which, because the first draft of this paragraph said
"five sinks moved from `todo`" and one of the five had not.

**The clipboard column is a per-row cell rather than a caption, and the reason is a citation
rather than a preference.** `COMPETITION.md` row 41, opened by this run's competitive probe, is the
measurement: NMEA 0183 marks simulation in *every sentence*, HL7 v2 in a *required field on every
message*, DICOM on *every instance*. The shared principle is that the claim lives in a field the
consumer must already parse to get the numbers at all — a caption above a header is a cell that a
sort moves away from the rows it was about. That row also settles the question D10 had left open as
*"a column or a decision"* for the data CSV: it is a column, and it is slice 5b.

**Two things it found that were not on anyone's list.**

- **The ★ was crownable by a flight nobody flew.** `personalBests` ranked on a bare `apogeeM`, so a
  demonstration file wore *"Highest of your remembered flights"* — and both stars, measured in the
  real app with the exclusion removed. It is EXCLUDED rather than blocking the set, which is the
  opposite of the apogee-caveat rule beside it and deliberately so: a caveat says Debrief cannot
  settle how high THIS flight went, so the runner-up must not be crowned; a synthetic flight did
  not go higher and did not go lower, so the real flights settle it exactly as before.
- **The 2026-08-09 audit's own record was wrong in both directions, and re-running it is what
  found that.** `.gpx` and `.kml` were exempted as *unreachable* because "the generated flight has
  no GPS" — a property of one generated FILE used to exempt a SINK, when the marker is a metadata
  row any mappable CSV can carry, and both are named in this milestone's *done when*. The stitch
  composite `.zip` was exempted as unreachable and is in fact covered (`toCanonical` writes notes
  verbatim). The plot `.png`/`.svg` exemption claimed the image "carries no figure a reader could
  mistake for a measurement" — it has a labelled y-axis. And three sinks were missing entirely,
  all three outside `lib/documents.ts` and therefore invisible to a registry-driven check: the
  channel explorer's own `.csv`, the sample table's per-column clipboard copy, and the ground
  track's landing coordinate. `SINKS.length` **20 → 23**.

Pinned by `lib/synthetic.test.ts` (17 cases: `isSynthetic` falsified two ways, a source check that
every one of the three save sites goes through `fileFacts`, and the sink table), by
`lib/logbookStar.test.ts` (+4 cases, falsified by removing the filter), by `lib/recents.test.ts`'s
two `Required<>` fixtures which stop the file COMPILING when a member is added and not carried, and
by two walks in `e2e/analyze.spec.ts` driving the real app through the mapper — both falsified by
breaking the component and rebuilding, one of which showed the demonstration wearing both stars.

**And the pre-push review found a defect the slice itself created, which is the third diff running
that it has.** `lib/reopen.ts` rebuilds a hand-mapped flight from the stored text plus the stored
mapping, and it passed headers, rows, mappings and `reported` — never `synthetic`. So the one route
a generated demonstration file can take lost the claim the moment the flyer clicked its logbook row.
It was worse than a missing notice: a reopen is a save, `fileFacts` reads the rebuilt flight, and a
save is a replace in place, so **one click deleted the stored flag permanently**, after which the
made-up apogee could take the ★. Nothing in the suite could see it — every other assertion builds
its flight directly rather than through `importRecent` — and the first walk only reloaded the
landing page. Fixed, pinned by a unit test that fails alone when the spread is removed, and the walk
now clicks the row.

**One thing this slice deliberately did not fix, filed instead:** the marker is read on the MAPPER
route only, because `syntheticFromRows` is called from `analyzeTable` and a vendor parser never
reaches it. Harmless while the only generated file is written with column names no parser claims —
and a live blocker for slice (d), whose whole design is a generator writing a real logger's format.
See `BACKLOG.md`, 2026-08-09.

**Slice 5b SHIPPED 2026-08-09 — the two spreadsheet destinations, on a citation rather than a
preference.** The data CSV and the report's *"Copy readings"* table each grow a `Provenance` COLUMN
carrying the claim on **every row**, and the logbook's clipboard table was converted to the same
vocabulary rather than keeping its own.

D10 had carried this open as *"a column or a decision"* since the sink audit. `COMPETITION.md` row
41 settles it and the reasoning is worth not re-deriving: **NMEA 0183 marks simulation in every
sentence** (GGA quality `8`, FAA mode `S`), **HL7 v2 in a required field on every message** (MSH-11
Processing ID), **DICOM on every instance** (`ORIGINAL`/`DERIVED`). The shared principle is
per-record redundancy — the claim lives in a field the consumer must already parse to get the
numbers at all — and it is exactly right here, because a CSV has no comment syntax every reader
agrees on (which is why this export carries no build stamp either) and because the gesture these
exports exist for is *select the data block and paste*, which a header would not survive.

Three details worth keeping. The column is **first**, so it is what a spreadsheet opens on. The
cell is **quoted**, because it carries a comma and a data export that breaks its own column count
is worse than a verbose one — and the first version of the check split on commas and failed for
that reason, on a correct export, which is why it reads the file back through the app's own CSV
parser now. And a **real flight gains nothing**: the column exists only where there is something to
say, asserted in both directions, because adding a column of the word "recorded" to every data
export is a change to a file readers parse by position.

`PROVENANCE_COLUMN` and `provenanceCell` moved to `lib/synthetic.ts`, where the three surfaces
answering one question share one answer.

**What is left, in order.**
(b) **The remaining reachable sinks** — the nine still `todo` in `lib/synthetic.test.ts`: the print
    card and its PNG, the comparison and its four documents, `/stitch`'s composite readings and its
    timeline table, the explore CSV, the sample-table column copy, the plot images, `.gpx`/`.kml`,
    and the bundle that inherits from them.
(c) **Then, and only then, offer the mapper sample** — the generated file is already written and
    tested; it is held back, not missing. Note the trap: `lib/samples.test.ts` asserts every
    single-file sample auto-detects as a flight, which a mapper sample cannot do by definition, so
    that assertion needs a second kind rather than a loosened tolerance.
(d) **The other synthesized logs** — a saturated accelerometer, a coarse-GPS flight, and a staged
    pair on two devices, which is also the only thing that will give `/stitch` a sample. Each
    revisits the `.gpx`/`.kml`/composite rows the current check marks unreachable.

**Also still left:** the samples are offered on `/` and `/compare`; `/stitch` offers none.

**Outcome.** Someone who has never flown a rocket can see everything Debrief does, in one click each,
without supplying a file — and can never mistake a demonstration for a flight.

**Done when** the app offers a named sample for each shipped capability that has none today —
multi-recording reconciliation, per-stage stitching, the column-mapper on an unrecognized CSV, the
OpenRocket design overlay, a saturated accelerometer, and a coarse-GPS flight; each opens through the
same `ingest()` path a dropped file takes; and **every synthetic flight is labelled synthetic on every
surface that can carry it out of the app** — the metric grid, the report, the comparison, the print
card, the logbook, and each of the `.txt`, `.md`, `.html`, `.csv`, `.json`, `.gpx` and `.kml` exports.
No synthetic flight is counted in any accuracy or validation figure on `/validation`.

**Pinned by** a test that enumerates the export surfaces from the same list the exporters are
registered in and fails when a synthetic flight reaches one without its label — the asymmetry check,
not a per-surface assertion, because a per-surface list is the thing that goes stale.

**Notes.** Measured 2026-08-08: `public/samples/` holds **exactly one** file, offered from one call
site (`components/Analyzer.tsx:108`). The corpus cannot substitute — `debrief-fixtures/LICENSING.md`
grants no redistribution and the logs carry real names, launch-site GPS to a few metres, and device
serial numbers. Two independent reasons, and neither is fixable by finding a license.

**The samples are generated, not hand-written, and that is the load-bearing decision.** A generator
that writes a real logger's actual file format means every sample is also a parser test, and the
sample path already proves it: `Analyzer.tsx:548` calls the same `ingest()` a drop does, so nothing
here needs a bypass. Synthesizing to a format also lets a sample exercise a capability a real log
covers only by luck — redundant altimeters that genuinely *disagree*, an accelerometer that saturates
at a known value, a column deliberately mis-scaled so the mapper has something to catch.

**Slice 1 is the surface audit, run rather than remembered.** This repo's history is a caveat landing
on one panel and a confident claim on another; the label is worth nothing if it reaches six of eight
exports.

**Size.** 4–6 increments.

---

## D11 (from ON-4) — One canonical file, out and back in

**Status:** SHIPPED 2026-08-09 — all five slices, and every clause of the *done when* is met and
pinned. A canonical export round-trips losslessly (`lib/canonical.test.ts`, over the 9 committed
fixtures AND every corpus recording, so it holds in fork CI without a token and holds harder with
the corpus attached); **provenance survives** (the record writes the MEASUREMENT and never the
reading, so a re-imported flight is re-analysed rather than frozen); and **multi-source structure
survives** in both of its forms — a flight of two recordings does not flatten (slice 3), and a
stitched composite keeps its stages (slice 5).

**Slice 5 SHIPPED 2026-08-09.** The composite wrote nothing at all before it: "Copy the timeline"
and "Copy a link" were its whole output surface while `/compare` wrote five formats and a ZIP for
the same flyer. It now writes one canonical record per recording, zipped, each carrying the flyer's
per-stage statement — and dropping the folder back in restores it. `CanonicalStage` is a separate
field from `CanonicalGrouping` on purpose: a grouping says *one flight recorded twice*, a stage set
says *different parts of one launch*, and one field for both would let a restore read either claim
as the other. Pinned by `lib/firstStage.test.ts` (6 cases on the restore plan) and by
`e2e/stitch.spec.ts` → *"the composite saves as records and comes back from them"*, which wipes the
logbook between saving and dropping and was falsified in both halves.

**What the milestone answered that it was really asking.** D11's notes predicted that if every
parser is genuinely a thin producer of one model the round-trip would be nearly free, and that
wherever it was not free a parser would be smuggling format-specific state past the model. It was
free, first try, across the whole corpus. The two things that did NOT survive were both the
flyer's own statements — the grouping and the stage order — and neither is in the model at all,
which is the right answer: they are not measurements, and they now ride beside the flight rather
than in it.

**Two known gaps, filed in `BACKLOG.md` rather than fixed here**, both downstream of one root — the
record bakes the flyer's CROP into the samples instead of stating it: a restored group whose
recordings were cropped can compute an apogee spread over two different stretches, and two copies
of one record under different names group as a flight recorded twice.

**Slices 1, 2, 3 and 4 SHIPPED.** Slice 3 shipped 2026-08-09 (PR #156): the flyer's grouping statement now travels in the
record, outside the `RawFlight` fields, and the drop path restores it. The *done when*'s
multi-source clause is met for the two-recordings case and pinned twice — by
`lib/flightGroups.test.ts` → `planRestoredGroupings` and `groupToken` (12 cases, falsified against
both rejected token designs) and by `e2e/analyze.spec.ts` → *"two recordings saved as records come
back as one flight, not two"*, which drives the whole journey in the real app and was falsified in
both halves, writer and reader. `lib/canonical.test.ts` additionally pins that the grouping stays
OUT of the flight: a record written with one and a record written without produce an identical
`RawFlight`.

**What slice 5 still owes, and it is the last clause:** *"a stitched composite keeps its stages"*.
The composite is entirely derived and stores nothing except the flyer's first-stage statement, which
lives in `localStorage` under `debrief.firstStage` keyed by device-local logbook ids and is not in
the logbook backup — so it needs the same treatment slice 3 gave the grouping, applied to a
statement that currently lives outside the logbook entirely. Two known gaps are filed in
`BACKLOG.md` rather than fixed here: a restored group whose recordings were CROPPED can compute an
apogee spread over two different stretches (the crop does not survive the round trip either, and the
fix is the same one), and two copies of one record under different names group as a flight recorded
twice.

**Slice 1 SHIPPED 2026-08-08**, pinned by `lib/canonical.test.ts` (8 cases;
the round-trip runs over the 9 committed fixtures AND every corpus recording, so it holds in fork CI
without `FIXTURES_TOKEN` and holds harder with the corpus attached) and by `e2e/analyze.spec.ts` →
*"a flight saved as a record opens again as the same flight"*.

**What slice 1 delivered.** `lib/canonical.ts` writes `RawFlight` as `debrief.record/1`;
`lib/parsers/canonical.ts` reads it, registered FIRST in `PARSERS` because detection keeps a match
only on a strict `score > best.score` and ties go to the earliest entry; `.json` joins
`FLIGHT_FILE_EXTENSIONS`; "Save record" sits on the report's export strip. **50 corpus recordings and
9 fixtures round-trip field-by-field and to an identical analysis digest.**

**The headline result is about the architecture, not the feature.** D11's *notes* predicted that if
every parser is genuinely a thin producer of one model the round-trip would be nearly free, and that
wherever it was not free a parser would be smuggling format-specific state past the model. It was
free, first try, across the whole corpus — no parser is smuggling anything. That is the answer to
the question the milestone was really asking, and it is worth more than the export.

**Slice 2 SHIPPED 2026-08-08 — the other file Debrief writes stopped lying about itself.** The
scoping probe found that `analyzedDataCsv` (`lib/report.ts:779`) re-imports as a materially different
flight: its derived `velocity`/`acceleration` columns look exactly like recorded ones, so they claim
those roles and the real channels beside them are dropped. Reproduced through the real pipeline on
`altusmetrum-telemetrum.csv`: `dynamic pressure (kPa)` takes the ambient-pressure role, `acceleration
(g)` appears TWICE and both take `accelAxial`, and `axialResultant` then reads them as two body axes —
**peak acceleration 194.21 m/s² out, 267.78 back in, +37.9%.** Across the corpus the probe measured
**19 of 48 recordings shifting peak acceleration, worst +41.4%, and 16 flipping velocity provenance.**

**It is refused with a reason rather than made to round-trip, and that is the decision.** The analyzed
CSV is a report artifact — display units, no provenance, derived curves beside recorded ones — and
teaching the mapper to un-pick it would produce a flight that still differs from the original in ways
a flyer cannot see. So it joins the device summary, the OpenRocket design and the logbook backup as a
file Debrief recognises and explains, and the explanation now has somewhere to send them: the flight
record from slice 1, which before this run did not exist. Pinned by `lib/canonical.test.ts` → *"would
have come back as a different flight, which is why it is refused"*, which asserts the exporter's own
header trio, the roles the generic path WOULD have assigned, and the refusal — falsified.

**Slice 4 SHIPPED 2026-08-08 — every document a flyer keeps names the build that wrote it**, which
resolves `COMPETITION.md` row 36 the same run it was opened. Debrief's methods change most weeks, so
a cert package filed in March and questioned in June needs to be able to say which version produced
its numbers; AltosUI's CSV writer stamps its own version and Debrief stamped nothing.
`scripts/stamp-version.mjs` had been writing `public/version.json` at every build since forever and
**nothing in `app/`, `components/` or `lib/` read it** — zero matches. It is now inlined into the
bundle by `next.config.mjs`, which READS that same file rather than re-deriving the sha, so the git
logic stays in one place; and it is inlined at build time rather than fetched, because these
documents are written in a browser that may be at a launch site with no signal. Carried by the .txt,
.md and .html reports, the analysis .json and the canonical record. **Deliberately NOT the data
CSV** — a CSV has no comment syntax every reader agrees on, and that export exists to be pasted into
a spreadsheet; the .json beside it in the same ZIP carries the stamp. Pinned by
`lib/buildInfo.test.ts` (9 cases), which enumerates the documents rather than spot-checking, so a
seventh export that forgets fails — falsified three ways, including one that catches the stamp
growing a word like "validated", since an identifier must not drift into a claim about correctness.

**What is left. Slice 3 is the multi-source STRUCTURE, and it is now scoped in detail rather than
just named.** The *done when*'s remaining clause: a flight with two recordings must not flatten, and
a stitched composite must keep its stages. Established by reading the code:

- **The grouping is one optional string per logbook ROW** — `RecentMeta.flightId` (`lib/recents.ts:46`):
  absent means a flight of its own, equal-to-own-id means this recording reports the flight, any
  other id means the flight reported by that row (`lib/flightGroups.ts:15`). Nothing about it is in
  `RawFlight`, so the canonical record structurally cannot hold it today — `CanonicalRecord` is keyed
  off `RawFlight` with `satisfies`.
- **The composite is entirely derived and stores nothing** except the flyer's first-stage statement,
  which lives in `localStorage` under `debrief.firstStage` keyed by device-local logbook ids, and is
  NOT in the logbook backup.
- **No import path sets `flightId` today**, but it is not a type barrier: `IncomingFlight` already
  permits it, and `lib/ingest.ts:357` already runs a second pass after the read loop — once every
  file's `savedId` is known — to pair summaries and high-rate halves. That is exactly where a
  grouping can be applied, using the same `planGrouping` + `setFlightIds` the manual join and the
  proposal banner already use.

So the slice is: the record carries the flyer's grouping statement as an optional block OUTSIDE the
`RawFlight` fields, `downloadRecord` passes it (the report already has `recordings` and
`recordingId`), and the drop path restores it in that existing second pass — applying only to rows
that state no grouping, which is `proposeGroups`'s own rule. **This is reading the flyer's statement
rather than inferring a grouping**, which `lib/flightGroups.ts:11` forbids; a statement they made
earlier is stronger evidence than the filename-stamp proposal already shipped. Slice 5 would be the
composite's stage order, which needs the same treatment for a statement that currently lives outside
the logbook entirely.

**Outcome.** Any of the ten formats goes in, one canonical file comes out, and dropping that file back
in returns the same flight.

**Done when** a canonical export of the internal flight model round-trips losslessly: the re-imported
flight carries the same readings, **the same provenance** (a derived value is still derived, never
silently promoted to measured), and **the same multi-source structure** (a flight with two recordings
does not flatten into one, and a stitched composite keeps its stages). Pinned by a property test that
round-trips every corpus flight and every D10 sample and diffs the model both ways — an assertion
class golden values cannot produce.

**Notes.** This is worth more than a convenience export because it is **a test of the architecture the
manual already commits to.** If every parser and the column-mapper are genuinely thin producers of one
canonical model, the round-trip is nearly free; wherever it is not free, that is a parser smuggling
format-specific state past the model, and finding those is the point rather than a side effect.

Queued behind D10 deliberately: D10 gives this something to round-trip that can ship in the repo and
run in fork CI with no `FIXTURES_TOKEN`, where the corpus half cannot.

**Size.** 3–5 increments.

---

## P1 — One design system, adopted

**Status:** IN PROGRESS — the primitive layer exists and is pinned. `lib/design-system.test.ts` is
`DESIGN.md` §9 as an EXACT ratchet, so every count below has to move in the same commit as the
conversion that earns it.

**2026-08-08 — the app's ONLY hand-rolled primary fill converted, and §5 gained the check that
would have caught it.** `components/CompareSurface.tsx`'s "Choose flight logs" — the comparison
surface's single most prominent control — was a styled `<label>` carrying `rounded-md bg-indigo-600
px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500`. The only `bg-indigo-600` outside
`ui.tsx`, and off §4's scale where the primitive is `px-3 py-1.5`. It now uses `Button
variant="primary"` over a hidden input, which is `DropZone`'s idiom — so the two file-entry surfaces
share one rather than resembling each other. `Button` adopters **20 → 21**.

The check is the durable half, and writing it found something worth recording: §5's existing
hand-roll scan looks for `text-indigo-`, the weight that lives inside a sentence, and nothing looked
for the FILL. **The first version of the new check matched `bg-indigo-\d+` and named four more
files** — `FlightPicker`, `RecordingPicker`, `SampleTable`, `FlightReport` — every one of which is
`bg-indigo-50` / `bg-indigo-950/40`, §2's *"interactive, selected"* tint on a current segment, a
selected row or a pressed chip. **Correct usage.** Converting them would have broken four right
things to fix one wrong one, so the check narrowed to the saturated levels the primitive itself
uses (600 light, 500 dark), with the reason written into it. It also scans class ATTRIBUTES rather
than raw text, because the conversion left a comment naming the string it removed and a raw grep
counts that comment as a violation — a check that goes red on its own explanation is one somebody
deletes.

**2026-08-04 — `ChipButton` shipped, and §5 gained its sixth word.** The vocabulary was short a name
for **a chip that DOES something** — a filter you toggle, an action on a row — and the scan that
was supposed to catch hand-rolls could not see them: it read `<span|li|div>` only, so every
chip-shaped BUTTON was invisible and the pin read green while four sat on the page. Widened to
`button|a` it named six at once. Four converted; two are two-line picker options that match the
predicate only because a bordered box looks like a bordered box, and a third wants `Segmented` —
each recorded with its reason rather than left as a silence.

**2026-08-04, second P increment — the census that was widened that morning still could not see
one.** `FigureChooser`'s figure toggles are a hand-rolled chip at `py-0.5`, and the scan walked
straight past them: it finds the end of an opening tag by walking to the first `>` at brace depth
zero, and it was walking through `//` comments and strings as if they were code. That file explains
in a comment between two attributes why its control is named `"<title> figure"` — and that `>` cut
the tag off five lines above its `className`. Three identical copies of the walk existed, so the
blind spot was in all three; they are one shared `openingTag` now, which skips comments and strings
and treats a template's `${…}` as nesting. Falsified both ways: with the hand-roll present the old
scan passes green and the new one names the file. The toggle took `ChipButton` with `tone="accent"`
and kept its `line-through` off state with a reason — the other chip toggles in the app are view
settings, and this one says what goes in a document.

**Counts that moved:** `invertedTypeFiles` **11 → 10** · `uiAdopters` **35 → 36** · three
hand-rolled `py-0.5` chip treatments gone, the geometry now `Chip`'s own `px-2 py-1` so a static
chip and an actionable one in the same row are one height. Unchanged: `rounded-lg` 0, card
treatments 3, off-scale spacing 0, off-scale type 1.

**Item 5 was also re-censused and both previously recorded denominators were wrong** — see below,
and note that `offline` turned out not to be a debt at all: `DESIGN.md` §5 now records that Debrief
is offline-complete, measured, rather than carrying a phantom 21-surface gap every run.

Three more P-track-adjacent things landed inside the D work, named here so nobody re-finds them: the
file picker stopped greying out `.ork`, `.xtra` and `.bin`, all of which the app can read and
explain; every parser refusal now names the file it is refusing; and one refusal stopped instructing
flyers to do something that could not help them.

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

~~**What this did NOT close…** the logbook has no equivalent of `rankBlocked`…~~ **CLOSED
2026-08-03.** `RecentMeta` gains `apogeeCaveats` — the reasons, not a bare boolean, so a row can say
which one — written at all three save sites from `apogeeCaveatFlags`, carried through the list
projection and the backup importer, and read by `personalBests`. A flight whose apogee the report
prints as *"(at least)"* or *"unproven"* and the comparison refuses to crown can no longer be
starred **"Highest of your remembered flights"**, and the three logbook cells wear the same short
tags the comparison cell uses, from the same constants.

**Two decisions worth not re-deriving.** The star is withheld from the WHOLE SET rather than from
the caveated flight, because handing it to the runner-up is a stronger claim than the data supports —
the disowned flight may well have gone higher. And **absent means qualified**: every row written
before this field keeps exactly its old behaviour, because a migration that silently withheld every
star would be a worse regression than the defect. A re-save re-reads the file and fills it in.

The SPEED star is untouched: a caveated altitude says nothing about the speed ranking. Pinned by
`lib/logbookStar.test.ts` (7 cases), falsified by restoring the unqualified star and by dropping the
field from the list projection. `lib/recents.test.ts`'s `Required<RecentFlight>` fixtures caught both
projections that would otherwise have dropped it — an exhaustiveness check that cannot be satisfied
by accident, and it earned its keep here.

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
2. **~~16 of 46~~ component files have `text-xs` outnumbering `text-sm` — and the target is NOT 0.**
   **RE-MEASURED 2026-08-05: 10 of 48**, which is what `lib/design-system.test.ts`'s
   `invertedTypeFiles` ratchet has been holding all along; the prose was two runs stale against its
   own pin. The reasoning below still stands.** §5 makes `Chip` `text-xs` by definition, so a component built out of chips is
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
5. **The five required states.**

   **SLICE SHIPPED 2026-08-09 — the logbook, which was rendering FOUR of them by hand.** Not one
   surface picked out of twenty-one: `components/RecentFlights.tsx` is the landing surface's whole
   list, and it hand-rolled `loading`, the storage-`blocked` caveat, the genuine empty state and
   the search-found-nothing state — three of them at `text-xs`, which §3 makes the floor case for
   anything a flyer reads to decide something, and one of them wearing the CONTROL radius on a
   container. Two things make it more than four conversions:

   - **The file already contained the argument for the fix it had not made.** The `blocked`
     branch carries a paragraph of comment reasoning that this is §2's `warn` and specifically not
     `ErrorState` — and then renders a bare amber `<p>`, thirty lines above its `write-blocked`
     twin, which took `Notice` when the primitive shipped. One file, one meaning, two renderings.
   - **The two empty states named their one control two different ways**, and five assertions in
     `e2e/logbook.spec.ts` turn on that name — three of them NEGATIVE (`toHaveCount(0)`,
     `not.toContain`), the kind that go quietly green when the thing they name stops existing. The
     name is one constant in the spec now.

   **And the ratchet could not have caught any of it, because FOUR primitives had no entry in
   `PRIMITIVE_ADOPTERS` at all** — `ChipButton` (§5's sixth word), `CopyTableButton`, `Loading`
   (§5's fifth state, shipped 2026-08-05) and `Sources`. The list was hand-kept, so the omission
   was invisible; it is now checked against `components/ui.tsx`'s own exports, and a primitive
   that ships without a count fails the suite. Falsified by adding one.

   **Counts:** `Loading` **2 → 3** · `EmptyState` **1 → 2** · four primitives **uncounted → counted**
   (`ChipButton` 5, `CopyTableButton` 2, `Loading` 3, `Sources` 2). Nothing moved down.

   **One thing measured and deliberately NOT done:** `DataTable`'s fallback is `'Nothing to show
   yet.'`, which is the string §5 forbids — and it is reachable from **zero** call sites. Both were
   checked: `GpsApogee` passes a literal one-element array and `DeviceSummary` renders only behind
   a non-empty guard. Two bespoke sentences nothing can trigger is the decoration the `offline`
   withdrawal below already refused. Filed in `BACKLOG.md` with the reproduction.

   **Re-censused 2026-08-04 and BOTH previous figures were wrong.**
   The denominator is **21** data surfaces, not 15 and not 13; **0 of 21 implement all five**; and
   `StitchSurface` is *not* the only one implementing more than one — four surfaces implement three
   each (`Analyzer`, `RecentFlights`, `CompareSurface`, `StitchSurface`). The count kept moving
   because nobody had written the list down, so here it is, and the next session should correct it
   rather than re-derive it.

   ~~**The headline is worse than a denominator, and it is the thing to fix first: `offline` is
   implemented by 0 of 21, in a PWA whose whole promise is that it works at the pad with no
   signal.**~~ **WITHDRAWN 2026-08-05 — this was a live contradiction inside one milestone, and it
   is the shape that sends a session off to build something that should not exist.** `DESIGN.md`
   §5 (line 308) records Debrief as **offline-complete**, pinned by `e2e/pwa.spec.ts`, and states
   the rule directly: *a surface that cannot fail when the network does must not be given an
   offline state — it would be decoration that has to be maintained and can never fire.* The count
   to keep is **"0 of 21 NEED it"**, not "0 of 21 implement it", and those are opposite findings.
   P1's own header has agreed with `DESIGN.md` since 2026-08-04; only this paragraph did not, and
   a session reading item 5 top-down would have built twenty-one states nothing can trigger.
   What would earn the state is a surface that reaches the network *at the moment a flyer uses it*
   — a tile fetching a weather record, a map pulling tiles, a version check. None exists.

   `extrapolated` is implemented once, at `MetricGrid.tsx:101` — the only `<Extrapolated>` in the app.

   ~~**Two of the five states have NO primitive in `ui.tsx` at all.**~~ **ONE did, and it now has
   one: `Loading` shipped 2026-08-05 (`#137`).** `EmptyState`, `ErrorState`, `Extrapolated` and
   `Loading` all exist; `offline` deliberately does not, per the withdrawal above. The two surfaces
   that had hand-rolled the wait disagreed about the part that mattered — `Analyzer` announced it
   through a live region and `StitchSurface` used `aria-busy` on a card, which marks a region stale
   and announces nothing, so a flyer on `/stitch` who could not see the text was told nothing at
   all. Pinned by two assertions in `lib/design-system.test.ts`, falsified separately.

   **Ranked conversions, measured:**
   - **The save-refused path, and read this before scoping it — the census got it wrong and I
     checked.** The claim filed was that `Analyzer.tsx:295` returns `id: null` "with no `else`,
     save-failure swallowed". There IS an `else`: `Analyzer.tsx:301` calls
     `logbook.reportWriteRefused()`, and six call sites across `Analyzer` and `CompareSurface` do
     the same. The defect is real but it is a DIFFERENT one — the message lands on the **logbook**
     (`RecentFlights.tsx`), which is not the surface the flyer is looking at when the save fails.
     They are reading the report they just opened. So this is not a missing state; it is a state
     announced somewhere else, which is a `Notice` on the report, not new machinery.
     *Verified 2026-08-04 by reading all six call sites — an absence reported by an agent is a
     claim like any other, and this one was a subtle affordance rather than a missing one.*
   - **`CompareView.tsx`** — 1,128 lines, the second-most-visited data surface, **zero** of the five.
     A bookmarked `/compare/?ids=…` whose flights were evicted shows nothing at all.
   - **`Chart.tsx`** — on every report; empty, loading and error all absent.
   - The seven `Readout`-only reading panels (`ParachuteCd`, `DrogueCd`, `DragCoefficient`,
     `LandingEnergy`, `DeployAltitude`, `EjectionDelay`, `RailExit`) share one `extrapolated`
     decision, so they are one edit across seven files — but a **two**-increment job, because that
     decision wants a corpus measurement before a component edit.
   - `ChannelExplorer`, `GroundTrack`, `GpsApogee` and `DeviceSummary` each `return null` or fall to
     a `DataTable` default on empty, and those empties are argued unreachable. Confirm that before
     converting; an unreachable state is not a missing one.

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

7. **~~41~~ hand-rolled `<button>` elements** outside `components/ui.tsx`. **RE-MEASURED
   2026-08-05: there are 18** (25 in the tree, 7 inside the primitives), of which roughly four are
   genuinely convertible — the recorded 41 was stale by more than 2x, and this file's own rule is
   to re-measure a number before spending an increment against it. `RecentFlights` went **23 → 12** on 2026-07-31; what is left
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

    **DONE 2026-08-03 — §5's chip gained §2's semantic tones, and the same shape as the `link`
    weight one item up.** `DeviceSummary` renders four cross-check verdicts (the board's own summary
    against Debrief's read) and `GpsApogee` renders the same verdict again (GPS against barometer),
    byte for byte, in emerald and amber. **Neither could be said through the primitive**, whose only
    tones were `default` and `accent` — so they were hand-rolled, on the primitive's OWN `500/30`
    border + `500/10` fill ramp. Converging on the right colour and the wrong geometry is the
    vocabulary being short a word. `Chip` now takes `good` · `warn` · `danger`; `Chip` adopters
    **3 → 7**, `uiAdopters` **34 → 35**, `invertedTypeFiles` **14 → 12**.

    **Read `invertedTypeFiles` as ADOPTION, not improvement.** `DeviceSummary` (4/2) and `GpsApogee`
    (3/2) left the inverted list because six `text-xs` moved INTO the primitive. Nothing a flyer
    reads changed size. That is the first of the four ways this metric moves, and it has now moved
    that way twice.

    **The count in this entry was wrong three times before it was right, and every wrong version was
    written from eyeballing while the scanner that settles it sat in the same commit.** It said "ten
    spans across four padding combinations, six converted, three semantic"; the scanner says
    **twelve chip-shaped elements across three** — `px-1.5 py-0.5` ×7, `px-2 py-0.5` ×3, `px-3 py-2`
    ×2, **none of them §5's `px-2 py-1`** — **seven converted, four of them semantic**. Those four
    hold five tone STRINGS because `GpsApogee` picks emerald-or-amber in one ternary, and a count
    that starts in elements must not finish in strings. `GpsApogee` was missed entirely until the
    scanner ran. This sits one entry from a paragraph telling the next session that a ratchet
    comment is a claim like any other — the lesson did not transfer by being written down.

    **The pre-push review found a rendering defect the whole gate was blind to, for the second run
    running.** `CHIP_TONES.default` was `bg-zinc-50 dark:bg-zinc-900` — byte-identical to §2's
    SUNKEN card in light and to §2's DEFAULT card in dark. A chip whose fill equals its container's
    is a hairline outline, not a token. `StitchSurface`'s "from · accelerometer" had been rendering
    that way in dark mode since it was written, unnoticed, and converting `DeviceSummary` and
    `LogDetails` onto that tone would have spread it to two more surfaces — including the one
    unfilled cell in a column of four verdicts. Fixed at the primitive to `zinc-100`/`zinc-800`,
    which is **exactly the value `DeviceSummary` had hand-rolled**: the hand-roll was right and the
    primitive was the weak one. Pinned by a test that asserts the RELATIONSHIP — a neutral chip's
    fill differs from every `CARD_TONES` fill — rather than the string, because pinning the string
    goes green again the moment someone restyles `Card` instead.

    **Two more the same review corrected.** `accent` was excluded from the weight rule, so
    `FlightReport`'s format chip lost the `font-medium` it had hand-rolled — and `globals.css` sets
    `print-color-adjust: exact` naming "the format/event chips", on a strip that is not
    `print:hidden`, so that landed on the printed certification package. The rule is now "every
    §2 HUE carries weight; only the neutral does not". And the hand-rolled-chip grep scanned
    `<span>` only, which hid `RecognizedFormats.tsx:28` — a real chip written as an `<li>` because
    it lives in a `<ul>`, and so the form the next one is most likely to take. Widened to
    `span|li|div`; enumerating the tag in front of you is the mistake this file has now corrected
    seven times.

    **Five hand-rolled chips remain and every one of them says why**, in
    `lib/design-system.test.ts`'s `DELIBERATE` list: two are inline notices holding a `<p>`, not
    tokens; two are `text-[11px]` dense-list tokens whose conversion is a decision about logbook row
    density, which is a product change; one wants `Chip` to take an `as` prop the way `Card` does,
    filed in `BACKLOG.md`, because converting an `<li>` to a `<span>` today would strip the list
    semantics a screen reader announces.

    **Verified in pixels, not only in the suite.** All three gates were green on the revision whose
    neutral chip was invisible, exactly as they were green on last run's `text-inherit` defect —
    both times the e2e assertions are on roles and accessible names, which do not change when a
    colour does. Both themes were screenshotted at the four converted surfaces before push.

    **Owed to the sibling.** §5's chip entry is carried identically by `nrdptel/fusionspace-loft`;
    recorded in `HANDOFF.md` with the `link` weight debt.

    **DONE 2026-08-03 — §5 gained `Notice`, the THIRD missing word in one run.** Six inline notices
    were hand-rolled across five files — `Analyzer`, `CompareSurface`, `CompareView` (×2),
    `GroupProposalBanner`, `RecentFlights` — spanning **three element types (`p`, `div`,
    `section`), two hues, two paddings and two type sizes** while being one byte-identical
    treatment on a `-300/70` border + `-50` fill ramp. Same shape as `Button variant="link"` and the
    chip's semantic tones: a vocabulary short a word, not five files being careless.

    **It closes an open §5 question rather than only removing a hand-roll.** `HANDOFF.md` had
    carried "§5's five states have no name for a DEGRADED capability" as owed to both repos — a
    surface that reads fine and cannot write is none of empty/loading/error/populated/offline; it is
    the surface *working* with one thing qualified. That is exactly a notice above real content, not
    an `ErrorState` replacing it. The primitive is the answer, and the question can come off the
    owed list as a question (the PORT is still owed).

    **Three API decisions the census made and a guessed API would have got wrong:**
    - **`as`, because three elements are in use and all three are right** — `<p>` for one sentence,
      `<div>` where controls sit beside it, `<section aria-label>` for a named region.
    - **No `role` of its own.** Four of the six pass `role="status"`; `GroupProposalBanner`
      deliberately does not, and its own comment says why — `role="status"` implies `aria-atomic`,
      so a live region wrapping a panel containing a control re-announces both file names and the
      whole reason sentence over the flyer's own action on every press. **A primitive that
      hard-coded the role would have reinstated a bug that file had already fixed.** Pinned.
    - **`text-sm`.** Five of the six were `text-xs`, which §3 reserves for "captions, units,
      footnotes, dense table metadata" against `text-sm` as "the body default". Measured on the
      built page: the analyze note is **14 px now, 12 px before** — four sentences a flyer reads to
      learn what was merged and what was left out.

    **`invertedTypeFiles` 12 → 11, and this is the FIRST of the four ways that is a real
    improvement rather than adoption.** `Analyzer` left the list because text a flyer acts on got
    BIGGER. Every previous move of this number was a `text-xs` migrating INTO a primitive with
    nothing on screen changing size. Say which kind a move is every time.

    **A measurement mistake made twice in one run, and caught the second time by cross-checking.**
    The first notice census enumerated `div|section|aside|li|ul`, found three, and missed the three
    written as `<p>` — the element a one-sentence notice most naturally takes. It was found only by
    grepping the colour ramp instead. That is the chip census's `<span>`-only pass again, so this
    scanner takes **any** opening tag and has no element list to be wrong about.

    **`py-1.5` was nearly reported as an off-scale breach and is not one.** A draft of the
    primitive's comment claimed §4 has no `1.5` and that §9's spacing grep cannot see it. The second
    half is true — `…-[0-9]+\b` matches `py-1` inside `py-1.5`, so **124 half-steps repo-wide are
    invisible to a count that reports 0** — but the first half is wrong: §4's table names
    `px-3 py-1.5` explicitly as the padding *inside a control*. A notice is neither a control nor a
    card, so §4 gives it no value and `py-2` is a judgement. The grep hole is filed in `BACKLOG.md`
    with the two-step fix it needs (decide §4's rule first, widen the grep second) — **the third §9
    grep found blind in one run**, after the chip census and the card census.

    **The chip pin lost two allowances by being right.** `CompareView`'s mapping prompt and
    `RecentFlights`'s forgotten-flights banner were exempted from the hand-rolled-chip census as
    "inline notices, not tokens"; they are `Notice`s now and no longer match. The census also moved
    from five `file:line` strings to a **file → count map**, because every one of those line numbers
    shifted on an unrelated edit and the pin failed for a reason that had nothing to do with chips.

    Pinned by `lib/design-system.test.ts` → *"has no hand-rolled inline notice left"* and *"leaves
    the live region to the call site"*, both falsified by mutation (reverting one conversion names
    `Analyzer.tsx:726`; hard-coding `role="status"` on the primitive fails the second).
    `Notice` adopters **0 → 5**.

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

**Status:** SHIPPED 2026-08-09 — **slices 1–5.** Slice 1, 2026-08-08: the *done when*'s own pinning check now
exists in a form that can fail. It asks for "zero controls under 44 px … pinned by a mobile-viewport
e2e that asserts both counts", and the e2e that claimed to do that measured ONE dimension — five
hand-kept copies of the predicate, every one asking `if (r.height < 44)`. `e2e/touchTargets.ts` is now
the single predicate, measures both axes, and runs on all six routes rather than the two it reached.
It found exactly one real violation, on every route: the footer's `Privacy` link at 42×44.

**All three of `ON-6`'s surfaces are done**: the comparison (`components/CompareView.tsx`) as of
slice 2, the channel explorer (`components/ChannelExplorer.tsx`) as of slice 3, and the chart legends
(`components/Chart.tsx`) as of slice 4 — which was genuinely a different question rather than a third
table, and turned out to be half a layout problem and half a control nobody had noticed was one. The
phone walk also filed a concrete list into `BACKLOG.md`, including what was filed as a milestone
blocker: **the comparison's "Spread" column is `hidden … sm:table-cell`**, content that exists on a
wide screen and not at 390 px. That entry was measured and corrected — see below.

**Corrected 2026-08-09 by measurement, because the entry as filed would have bought a fix for a
problem two-thirds smaller than it claimed.** The column is genuinely hidden below `sm`, and the
code comment beside it claims *"Nothing is lost — the cross-check panel above states every one of
these spreads in prose."* Neither is quite true. Driven over the real two-altimeter pair
(`perfectflite-pnut.pf2` + `featherweight-raven-fip.csv`, the pair the sample offers): the table
carries **10** spreads and the prose panel — which does render at every width — restates **8** of
them, under different names (`max speed` for *Max velocity*, `max-Q` for *Max Q*, `main deploy time`
for *Main deploy at*, `main descent rate` for *Main descent*). **Two are absent at 390 px and
nowhere else: Max Mach (4.1%) and Flight time (0.2%).**

So the comment is wrong and the ledger entry was overstated, and the useful conclusion is neither:
hiding the column was the right call — it did not fit, and cut off it showed the leading digit of
each percentage, which reads as a number rather than as a fragment — and the answer `ON-6` asks for
is not "show the column at 390 px" but a comparison that is **laid out vertically** instead of being
a narrowed table. That is what this milestone owes, and closing the two-value gap on its own would
have let it look closed.

**Slice 2 SHIPPED 2026-08-09 — the comparison reads DOWN the page on a phone.** The first of the
three surfaces `ON-6` names, and the one where the gap was measurable. At 390 px the comparison is
no longer a table you scroll sideways: each metric is its own block, each flight a labelled line
inside it, and the Spread the table hides below `sm` is a line in every block rather than a cell
clipped at the edge. **Both shapes read the same `metricRows`**, computed once, so the phone and the
desktop cannot disagree about a number — which is the failure a second layout invites and the reason
this is one data set rendered two ways rather than two components.

Built from `Card` plus a `<dl>` rather than a new §5 word, deliberately: `DESIGN.md` is identical in
both repos and a change to one is owed to the other in the same run, and the sibling was not
attached. Composition of existing primitives owes nothing.

Pinned by `e2e/touch.spec.ts` → *"the comparison reads down the page on a phone, and hides
nothing"*, which drives the real two-altimeter pair at 390×844: it asserts the wide table is not
rendered at all (not merely scrolled off), that **Max Mach** and **Flight time** — the two the
measurement found were reachable at no narrow width — each have a block with a Spread, that the page
does not push sideways, that no control is under 44 px, and that the table is what returns at 1280.
Falsified two ways: reverting to the narrowed table, and dropping the Spread line from the blocks.

**Slice 3 SHIPPED 2026-08-09 — the channel stats read down the page too.** `ON-6`'s second named
surface, and the same shape slice 2 gave the first. **Measured at 390×844 before it changed: the
stats table rendered 395 px inside a 358 px container**, so reading a channel's Δ or rate meant
scrolling the table sideways — which a document-level overflow check cannot see, because the
wrapper absorbs it. The new e2e checks that directly: **no table on the page scrolls inside its own
wrapper**, which is the assertion the earlier phone sweeps were missing.

Two things worth keeping. The explorer's header carries no controls — only six words — so hiding it
below `sm` removes nothing a flyer can press; **that was checked rather than assumed**, because
hiding the comparison's header in slice 2 deleted its reorder buttons and colour swatches from the
phone. And the stats table had no accessible NAME on a page carrying seven tables; it has one now,
which is how the omission was noticed at all.

**Slice 4 SHIPPED 2026-08-09 — the chart legends, and the control nobody knew was one.** `ON-6`'s
third surface, and the one that is not a table, so the answer is not the one the first two got.
Measured at 390×844 on `/compare` with the two-altimeter sample before it changed: uPlot's legend is
a centred row of inline entries with a 16 px gutter, so it wrapped where it ran out of room — `time`
and `sample-pnut` on one line, `sample-raven-fip` alone and centred on a second. Three readings in a
ragged block with no column to run an eye down. Below `sm` each entry is now its own full-width line,
name and colour left, value right, so the values form a column.

**The half that was not a layout problem.** Every one of those entries is a **control**: clicking one
adds `u-off` and drops that flight's trace off the plot. uPlot ships them as a bare `<th>` with
`cursor: pointer` — no role, no tab stop, no key handler, **30×67 px**. So *hide this trace* was a
pointer-only capability, which is the state `DESIGN.md` §8 forbids and the exact failure this
milestone exists to remove. They are `role="switch"` now, with `aria-checked`, a name, Enter and
Space routed through the element's own click so uPlot stays the only thing that toggles a series.

**Two things this cost that are worth knowing before touching a legend again.** The legend had to be
moved OUT of the chart's `role="img"` host into a sibling — a focusable control inside an image is
`nested-interactive`, which `e2e/a11y.spec.ts` failed on the first run, correctly. And
`e2e/touchTargets.ts` could not see these controls at all: its predicate enumerates ROLES, and a
`<th>` has none. **A floor check only reaches controls somebody has already named as controls** —
`[role=switch]` was added to that selector, and the falsification that proves it is the one where the
44 px rule is deleted *and* the selector entry with it, and the sweep goes green on a broken page.

**Slice 5 SHIPPED 2026-08-09 — the *done when* itself, walked.** Slices 1–4 built surfaces; nothing
walked the acceptance sentence, and its SECOND count — *zero states reachable only by hover* — had
never been asserted anywhere at all. `e2e/hoverOnly.ts` is what makes it measurable: every visible
element whose only statement of a fact is a `title` tooltip. It exists because D9 slice 3b shipped a
design's staleness word into a `title=` and only a competitive probe noticed.

It found seven on the report at 390 px, and **three were the same defect again**: the figure and
flight colour swatches say *double-click to reset* in a tooltip and an `aria-label` and nowhere a
sighted flyer on a phone can reach. Both now say it in text, in `FigureChooser`'s caption and
`CompareView`'s intro. The other four are exempt with a reason verified against the source — the
timeline's `aria-hidden` bar, whose chips restate every phase and duration as text, and the
observance stripe, whose message `SiteFooter` prints in full. The exemptions are **patterns with
reasons**, not pinned strings, because the durations belong to the fixture and the stripe belongs to
the calendar; and the walk asserts the sentences the exemptions POINT AT are on the page, so an
exemption cannot outlive the fix it describes.

Two corrections the predicate forced on itself, recorded because both were nearly shipped as facts:
`innerText` returned `""` for the sample table's sort button while `textContent` returned
`"Time (s)▼"`, stably, on a visible button — so four controls that do carry their label were being
reported as hover-only. The predicate now walks the tree and subtracts what an eye cannot reach
(`display: none`, `visibility: hidden`, the `sr-only` clip). And the flight timeline's tooltips look
like hover-only durations and are not: the bar is decorative and the chips beneath it are the text.

**Outcome.** A phone at the range is a first-class tool, not a rescaled desktop.

**Scoped 2026-08-09 by `COMPETITION.md` row 39, and the correction is to this milestone's TITLE
rather than to its work.** The benchmark against the phone-capable field found that Debrief's phone
case is **post-recovery** and cannot be anything else: none of the vendor tools needs Debrief to get
data off the board, and **Debrief cannot do that for any board** — no Bluetooth, no WiFi, no live
telemetry, no continuity or deployment check. At the pad the vendor app is the first app opened and
Debrief is not opened at all. *The range on a phone* reads wider than that, because a range day
starts at the pad. The *done when* above is already honestly scoped — every journey it names is
post-flight — so nothing here changes what the milestone must deliver; it changes what a later run
should expect to find when it reads the title. The same row records the one thing this milestone
still owes: **`components/Chart.tsx`'s legends**, the third of `ON-6`'s three surfaces.

**Done when** a flyer can, one-handed and offline on a 390 px viewport, complete the things a range
day actually needs — drop a log straight off a card, read apogee and descent rate, check a deploy
altitude, and show someone the result — with zero controls under 44 px and zero states reachable only
by hover. Pinned by a mobile-viewport e2e that asserts both counts and walks each journey.

**Notes.** The touch minimums are partly in `app/globals.css` already, which is the right instinct
applied at the wrong layer — a global `min-height` is a floor, not a design. `DESIGN.md` §8 is the
contract. Decompose by what a flyer needs to DO at the range, not by auditing the desktop layout
narrow.

**Sharpened 2026-08-08 by `ON-6`, and the sharpening is a correction to the *done when* above.** Both
its clauses are **floors** — zero targets under 44 px, zero hover-only states — and a floor is
satisfiable by a desktop layout that has merely been made touch-safe, which is the exact outcome the
note is against. A vertical layout is not a wider one; it is a different one. So P4 must also answer,
for each of the three surfaces laid out for a wide viewport and currently only narrowed, what the
genuinely vertical version is: **the comparison table** (`components/CompareView.tsx`), **the channel
explorer** (`components/ChannelExplorer.tsx`), and **the chart legends** (`components/Chart.tsx`). A
milestone that hits both floors and leaves all three as narrowed tables has not met this.

`ON-6` is cross-applied from the sibling repo and is **not** confirmed as the owner's direction for
Debrief. P4 does not depend on it being so — it was queued before the note existed. The note changes
what P4 must answer, not whether it runs.

**Size.** 4–6 increments.

---

## P5 — Ready for the public

**Status:** IN PROGRESS — **slices 1–5 all SHIPPED 2026-08-09.** Only the repo METADATA half of
`ON-B2` is outstanding, and it is owner-level: no tool in a session can set a repository's
description, topics or pinned links. Slice 1 shipped the README — **4,545 words, 32 KB, zero images → 1,948 words, 16 KB, four images**, with the
first screenful a real flight read by the real app rather than three paragraphs of prose. 68% of
the file was one 3,099-word `What it does` section duplicating — without citations — what the
methods page now says properly, so it was cut and linked rather than paraphrased. Pinned by
`lib/readme.test.ts` (6 cases, falsified 3 ways): a referenced image not in the repo fails, alt
text that says "screenshot" fails, and a copy line where "upload" describes something a flyer does
fails — the PRIVACY invariant reaches the copy, not just the code.

**Slice 2 SHIPPED 2026-08-09** — the landing surface states the four things Debrief does that a
flyer's own altimeter software cannot, taken from `COMPETITION.md`'s standing conclusion, which had
been saying since it was written that it "is what the landing surface and the README should say, and
right now they do not say it". Two of the four are worded to that file's own warnings, because their
broader forms are false: overlaying several of its OWN files is something Featherweight's tool now
does too (row 15), so the cross-vendor qualifier IS the claim; and a composite combines nothing,
which the ledger says to publish carefully because combining is the part a rival would skip. Pinned
by `lib/whyDebrief.test.ts`, which holds the copy and the ledger side by side and fails from either
direction, and by an e2e on what a flyer actually reads.

**Slice 3 SHIPPED 2026-08-09** — the page says which build a flyer is looking at, linked to the
commit, using the same `buildLine()` the six saved documents carry. Pinned by `lib/buildInfo.test.ts`
and an e2e that saves a report and compares the two.

**Slice 4 SHIPPED 2026-08-09 — a flyer can tell the project something without leaving the app.**
`.github/ISSUE_TEMPLATE/` has carried a bug report and a format request for a long time, and the
only link to either was one sentence on the PRIVACY page — the craft bar's "a feature reachable only
by knowing it is there", almost word for word, since a flyer whose board is not read has no reason
to visit the privacy page. "Report a problem" is in the footer on every route; "Ask for a logger
that isn't here" is on the recognised-loggers card, which is where a flyer DISCOVERS their board is
missing. Both `?template=`d so they land on the form's questions rather than an empty box. Pinned by
`lib/links.test.ts` (4 cases, falsified 3 ways — a renamed template, the wrong query parameter, and
a hand-written URL at a call site) and an e2e over three routes.

**Slice 5 SHIPPED 2026-08-09 — `/changelog`, and the half of it that earns the page.**
`lib/buildInfo.ts` made a saved report traceable to the code that wrote it; a build identifier says
WHICH code ran and cannot say what that code did differently, so a flyer whose report disagreed with
today's read had a SHA and no account of why. The page answers that, and its spine is **“Readings
that changed”** — first in each release rather than last, because a number that moved is the one
thing a flyer holding an old cert package has to know about, and it is the entry a generic
Added/Changed/Fixed template has no place for. **3 of 8 releases so far moved a reading**, and the
five that did not say so in as many words rather than omitting the heading, which would leave a
reader working out whether nothing moved or nobody checked. Pinned by `lib/changelog.test.ts` (8
cases, falsified 6 ways: a post-dated release, a release out of order, copy where “upload” describes
something a flyer does, a dropped footer link, a dropped service-worker precache entry, and an entry
that is a bare commit subject) and an e2e that walks in from the footer on another route.

**What is left.** The GitHub description, topics and pinned links — **owner-level and parked**,
because no tool in this session can write repository settings; the README carries the message
without them. Everything else in the *done when* is met.

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

**Widened 2026-08-08 by `ON-B2`.** The repo landing page is a surface and nothing in the workflow ever
looked at it, so it could not go stale visibly. Added to the *done when* above: **the GitHub
description and topics are set and match what the tool does**, and the done-check gains a step that
reads the repo page. Measured at filing: `README.md` is **4,545 words, 28.0 KB, zero images** — the
clause about 27 KB of text was still true and is now 28.

**Size.** 3–5 increments.

---

## P8 (from ON-3) — The explanation comes to the reading

**Status:** SHIPPED 2026-08-08 — pinned by `e2e/analyze.spec.ts` → *"a question mark explains the
reading where it is, without losing the page"*, which asserts the dialog opens without navigating,
that the scroll position moves less than 4 px, that the explanation is more than 25 words of real
prose rather than a restated label, and — as a COUNT, because the note is about a count — that
**zero** readings still open the methods page in a second tab. Falsified by restoring the anchor.

All three slices landed in one run. Slice 1: `DESIGN.md` §5 gains `Popover`, with
`components/UnitsControl.tsx` — the hand-roll it was extracted from — as its first adopter. Slice 2:
the text of all 51 blocks moved out of `app/methods/page.tsx` into `lib/methods/content.tsx`, which
took the page from **1,348 lines to 128**; the move was verified lossless by comparing the built
page's rendered text character for character (79,900 characters, identical). Slice 3: the `?` on
every reading opens that same text in place, with *"Read this on the methods page"* still one click
away.

**One measured cost, taken deliberately.** The report route's First Load JS goes **270 kB → 302 kB**,
because the methods prose now ships with `/` as well as with `/methods`. For the installed PWA this
app is designed around that is close to free — the service worker already precaches the whole
`/methods` route, so those bytes were already on the device — and it is what keeps *"what does this
number mean?"* answerable with no bars, which the app's own copy promises. The alternative,
lazy-loading the module on first open, moves the text into a build-hashed chunk the service worker
does not know to precache, and would trade a headline promise for 32 kB. Filed in `BACKLOG.md` with
that caveat rather than done.

**What slice 4 would have been** — the same affordance on the eight standalone estimator panels
(`DragCoefficient`, `ParachuteCd`, `DrogueCd`, `LandingEnergy`, `EjectionDelay`, `RailExit`,
`DeployAltitude`, `GroundTrack`) and on the comparison table, which have no `?` at all and whose
values are the user-input-driven ESTIMATES most in need of "and here is where this is wrong" — is
filed in `BACKLOG.md`. The primitive and the content module are both in place, so it is a call-site
change now rather than a milestone.

**Outcome.** A flyer meeting a term of art gets the explanation where they are standing, and keeps
their place in the report.

**Done when** every `?` on a reading opens its explanation **in place** rather than navigating; the
explanation is the same text the methods page carries, from one module, not a second summary that can
drift; the full write-up is still one click away for anyone who wants it; and the affordance is
reachable by keyboard, dismissible with `Escape`, returns focus to its trigger, and opens fully on
screen at 390 px. Pinned by a unit test asserting every `MethodId` cited by a reading resolves to
content, plus an e2e that opens a popover from a reading, reads its text, dismisses it and asserts the
scroll position did not move.

**Notes.** Measured 2026-08-08: `components/MetricGrid.tsx:33` renders the `?` as
`<a href={"/methods#" + tile.method} target="_blank">`, on **21 tiles**
(`grep -c "method:" lib/readings.ts`). **21 navigate away; 0 explain in place.**

**§5 gains `Popover`, and `DESIGN.md` moves before any component does.** The vocabulary has
`Disclosure` for in-flow progressive detail and no overlay primitive at all — and the app has already
hand-rolled one without it: the per-quantity units panel is a raw `<details>` that
`e2e/touch.spec.ts:209` had to be written for after it opened from −39 px at 375 px. Two sites reaching
for the same missing word is the vocabulary being short, which §5 records twice already as its own
failure mode. `useReturnFocus` in `components/ui.tsx:88` already owns the focus-return and `Escape`
contract this needs.

**The content extraction is the real work and it is slice 2.** The 51 explanations live as JSX
children of `<Method>` inside `app/methods/page.tsx`. Both surfaces must render from **one** module —
the architecture invariant's *"where two surfaces do the same job, they share a module rather than a
resemblance"* — so a short popover summary written beside the long page is the thing this milestone
must not ship. `lib/methodIds.ts` already binds both sides at compile time, so the key layer exists.

**Slices.** 1: `Popover` in `components/ui.tsx` + `DESIGN.md` §5 (owed to the sibling repo). 2: method
content out of the page into a shared module, a pure move pinned by an unchanged-text assertion.
3: the `?` opens it in place. 4: the same affordance wherever else a term of art is published.

**Size.** 3–5 increments. Slice 1 is also P1 work — a primitive the app hand-rolled twice.

---

## P9 (from ON-1) — The methods page is a document you can read

**Status:** SHIPPED 2026-08-09 — all five slices. The *done when* is met in every clause and each
is pinned: the hierarchy and in-page navigation by `lib/methodIds.test.ts` and `e2e/smoke.spec.ts`;
the paragraph structure by the same file's "more than one paragraph" case; the measure by
`e2e/measure.spec.ts` (9 cases, eight widths plus a width-against-width comparison); the editorial
half by the 400-word ratchet that walks every paragraph; and the sources by four checks — a
reference nobody cites, a must-cite block that stops citing, a block that starts citing without
being listed, and a reference that loses the clause saying what Debrief takes from it.

**Where it ended up, measured.** 1 `h1` → 11 `h2` → 51 `h3` where it was 1 → 51 → 0. **96
paragraphs** where 51 blocks were 51 walls; longest paragraph **369 words** against 850 when owner
note ON-1 was filed; **nothing over 400 words** against 11 blocks. 49–66 rendered characters at
every width, monotonic, against 46–76 with the tablet band narrower than a phone. And **five cited
sources where there were none** — 0 URLs and no named algorithm in 102 KB before, on a page whose
own repo requires methods to be implemented from published sources and cited.

**What slice 5 deliberately did NOT do**, recorded so a later run does not read it as unfinished:
46 of the 51 blocks cite nothing, because they rest on no published method — every threshold in
them was measured off the corpus. A test fails if any of them starts citing. Borrowed authority
would have been the worse outcome and the easier one.

**Slices 1–4 SHIPPED. Slice 5 was scoped and shipped the same run: the page cited nothing.** Slice 4 shipped 2026-08-09 (PR #156) — the two blocks that were still
a single paragraph, 705 and 614 words, broken at eight subject changes with the rendered text proved
character-identical (62,797 chars). Paragraphs **88 → 96**, longest **705 → 369**, over 400 words
**2 → 0**, pinned by a ratchet in `lib/methodIds.test.ts` that walks every paragraph rather than
spot-checking the two, falsified against the previous text and against a reader that matches nothing.

**Slice 5 — the page cites nothing, and that is a gap against this repo's own invariant.** Measured
2026-08-09: `lib/methods/content.tsx` carries **0 URLs, 0 DOIs and not one named algorithm** across
102 KB — `Hampel` 0, `Kalman` 0, `Barrowman` 0, `Savitzky` 0, `1976` 0 — while `Hampel` appears 11
times in the analysis code and `1976` twice. `MAINTAINING.md`'s CLEAN-ROOM invariant says to
implement every method from published sources **and cite them**; the citing is happening in code
comments, where no flyer can reach it. `COMPETITION.md` row 37 has the field comparison, including
why OpenRocket is both the high-water mark and the cautionary tale: its technical documentation is
thesis-derived and frozen at v13.05 (2013-05-10) while the app is many releases past it — which is
exactly the drift D11 slice 4's build stamp already lets Debrief avoid. **Done when** every method
block that rests on a published source or a named algorithm names it, the page carries a references
section those names link to, and a check fails when a block cites nothing that the code it describes
names. Sized 1–2 increments.

**Slice 1 SHIPPED 2026-08-08**, pinned by `lib/methodIds.test.ts`
(*"places every block in exactly one group"* and *"renders each group as its own section, in the
order it declares"*, both falsified) and `e2e/smoke.spec.ts` → *"the methods page can be navigated,
not just scrolled"* (falsified twice — against the blocks put back at `h2`, and against the contents
list removed). The page is **1 `h1` → 11 `h2` → 51 `h3`** where it was 1 `h1` → 51 `h2` → **zero
`h3`**; it has a contents list and a pinned strip with a you-are-here marker; and all 51 anchors are
unchanged, so every one of the 21 inbound `?` links still lands.

**Slice 2 SHIPPED 2026-08-08** — the structural half of the prose problem. `Method` wrapped each
body in a single `<p>`, so **no block could have a second paragraph**; the wall was structural, not
editorial. The bodies carried **36 standalone `{' '}` lines** sitting exactly where a break was
intended — every one verified by reading it, each in front of a sentence opening a new topic (13 of
them a `<strong>`) — and JSX rendered each as one space. The page now has **87 paragraphs across 51
blocks**, **12** of which gained a break, and the longest single paragraph is down from **850 to 741
words**. The number that moved most is the one a reader feels: **paragraphs over 400 words went from
11 to 2**, because every block used to be exactly one paragraph.

Verified three ways, because a scripted split of prose corrupts it silently: the rendered text is
**character-identical after whitespace normalisation** (80,325 chars), so no word was joined or
dropped; **zero** paragraphs start with a lowercase letter, none is under six words, and none ends
without terminal punctuation, so no sentence was cut in half; and the counts above are read off the
**built** `out/methods/index.html`, not off the source. Pinned by `lib/methodIds.test.ts` → *"lets a
block have more than one paragraph, which it could not before"*, falsified both ways.

**Slice 3 SHIPPED 2026-08-08 — the page has a measure, and it is a number somebody measured.**
`DESIGN.md` §3 said nothing about long-form reading, which is the silence that let this happen. It
now binds running prose to **45–75 rendered characters**, and names the two traps that were live on
this page. Measured on the built page BEFORE: **58 characters at 390 px, 46 at 640 px, 55 at 768 px,
76 at 1024 px** — non-monotonic in viewport width, with the tablet band reading *narrower than the
same page on a phone*, because a `sm:grid-cols-2` grid divides the width and nobody had multiplied
the classes together. AFTER: **49 · 55 · 66 · 66 · 66 · 65 · 65 · 65** across 390–1600 px, monotonic
and inside the range everywhere.

Three classes, each load-bearing and each falsified separately: `text-sm` → `text-base` (§3 already
assigned `text-base` to "prose in docs" and this page was the one place breaking it — reverting it
fails every width on the computed-size assert); `sm:grid-cols-2` → `lg:grid-cols-2` (reverting gives
40 characters at 640 px); and `max-w-3xl` → `max-w-[30rem]` (reverting gives 84 at 640 px and 99 at
768 px). **Not `max-w-prose`**: `ch` is the advance width of `0`, and a Geist `0` is 11.0 px where
the average prose character is 7.10 px, so 65ch renders about 101 characters — the cap is in `rem`
and the number came from measuring rendered text.

Pinned by `e2e/measure.spec.ts` (9 cases): eight widths asserting the character count and the
COMPUTED font size, plus one that compares widths against each other — because a per-width floor
cannot see the actual defect. 46 characters is inside the range; it was only wrong *relative to the
phone*.

**What is left is genuinely editorial and is slice 4:** the paragraph work restored the author's OWN
rhythm; it did not invent breaks nobody wrote. **Eleven blocks still exceed 400 words in total** and two carry
a single paragraph over 400 (741 and 654), so the long ones need breaking by someone reading them.
That is cheap now — the text is data in `lib/methods/content.tsx` and a break is a `</p><p>`. Both
`DESIGN.md` gaps that slice 2 recorded here are closed by slice 3 above.

**Outcome.** The longest surface in the app reads like a reference someone can navigate, not a wall.

**Done when** the methods page has a real hierarchy — its 51 blocks grouped under named subjects with
a level above them; an in-page table of contents and a pinned section strip with a you-are-here marker;
a reading measure the prose actually obeys; and no reader has to scroll 12,700 words to find one
definition. Pinned by an assertion that every `METHOD_ID` belongs to exactly one named group (so a new
block cannot be added ungrouped) and an e2e that reaches a named definition from the top of the page in
one click.

**Notes.** Measured 2026-08-08: `app/methods/page.tsx` is **1,205 lines, ~12,700 words, 51 `<Method>`
blocks**, structured as **one `<h1>`, 51 sibling `<h2>`s at `text-base`, and zero `<h3>`** in a
two-column grid. No table of contents, no section nav, no back-to-top. It also **imports nothing from
the primitive layer**, making it the largest surface in the app and the least converted.

**The fix already exists in this repo, on the wrong page.** `components/FlightReport.tsx:816` builds a
pinned "Jump to a section" strip with a you-are-here marker from `components/useCurrentSection.ts`,
written because the report ran nine screens on a phone. The methods page is longer and has none of it.
That strip is hand-rolled inside one component — lifting it into `components/ui.tsx` is P1 work this
milestone pays for, and it is the second primitive (after P8's `Popover`) that this batch of notes
turns out to need.

**`DESIGN.md` says nothing about long-form reading** — §3 is a type scale for data surfaces, §4 a
spacing scale, and no section covers measure, prose rhythm, or the architecture of a page someone reads
rather than scans. That silence is the mechanism: every run correctly updated one sentence and none was
ever asked what the page had become. The system gains that section before the page is re-laid-out.

**Depends on P8 slice 2**, which moves the content into a shared module. Grouping the blocks is far
cheaper against data than against 1,205 lines of JSX.

**Size.** 3–4 increments.

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

**D9 — Predicted versus flown. DECOMPOSED 2026-08-03 — it has its own section above `P1`; take it
from there, not from this line.** The measurement changed it twice over, and both are worth reading
before scoping anything. **The obvious first slice is wrong:** OpenRocket's CSV export is
time-series only, over user-selected columns with no stable schema, and carries **none** of the ten
summary scalars the milestone wants — those live only in `<flightdata>` inside a `.ork`, whose
format is published and safe to read clean-room. A first pass recommended the CSV *because* it
believed the `.ork` was a licensing hazard, and that hazard turned out not to exist on the page it
was attributed to. **And the milestone cannot start at all until a real prediction file is in the
corpus** — there is not one, which is why the decomposition's slice 1 is sourcing one or writing
down why it cannot be sourced.

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

- **2026-08-09 — the grouping token in a flight record is the smallest logbook id in the set, not
  the flight's own id and not opening order.** Two records of one flight must agree on a token or
  the restore silently does nothing, and "silently" is the problem: the failure is two ordinary
  flights, which looks like nothing went wrong. **Rejected: the flight's own id**, which is its
  current primary's and moves the moment a flyer presses "report by this one" or deletes the primary
  row. **Rejected, and this one was shipped and then caught: earliest `addedAt`**, the "opened
  first" rule `planJoin` already uses — `saveRecent` writes a fresh `addedAt` on every re-read,
  including a plain re-open, so exporting a record from each of two recordings moves "earliest"
  BETWEEN the two exports. The e2e walk failed on it. A row's ID is the only thing here that does
  not move: a replacement keeps it. **The cost of the choice, stated:** the token changes if the
  flight gains or loses a recording, so records exported either side of that will not re-group. That
  is a real change to what the set IS, it fails safe (two flights, joinable in one click), and the
  alternative — a stable per-flight key minted at join time — is a new field in `RecentMeta` and a
  migration, which is a bigger change than this slice, worth doing if the failure is ever observed.

- **2026-08-09 — a burnout speed's caveat does NOT inherit the peak's "usually reads high" tendency
  unless burnout IS the peak.** The tendency is measured on the peak — five of six corpus pairs read
  high, one 14% low — and the burnout sample is generally a different one. **Rejected: reusing
  `velocityProvenance`'s full sentence everywhere**, which reads better and would state a
  corpus-measured error range for a sample the corpus never measured. The row says
  "derived from the altitude, at a measured burnout" instead: the provenance without a tendency the
  reading has not earned. This is the same rule as the standing one about quoting a speed ratio
  under a Mach ratio's name.

- **2026-08-08 — the canonical flight record is JSON, not the CSV the scoping proposed.** The scoping
  agent's slice-1 design was a CSV with a magic first line and a `key,value` preamble, on the
  reasonable ground that a flyer can open it. **Rejected**, for three measured reasons. (1) NaN is
  this model's gap marker and CSV has no way to distinguish an empty cell from a zero, which is the
  exact failure mode the JSON codec had to add sentinels to avoid — a GPS dropout re-importing as a
  real 0 m reading. (2) Presence is a signal in this model: `flownAt`, `reported`, `repeatedSpans`,
  `predicted` and `gravityRemoved` are optional, and absent must come back absent rather than as an
  empty column — a CSV preamble can express "missing" only by convention. (3) `reported[]` is a list
  of records with their own `source` discriminator, which flattens into a CSV preamble badly. The
  cost of the choice is real and named: the file is not readable in a spreadsheet, which is what the
  `.csv` export is already for. Reversal is one module — `toCanonical`/`fromCanonical` are the whole
  surface.
- **2026-08-08 — a spliced descent publishes NO rate, rather than the second copy's rate.** Fixing
  the Sev-1 (the first copy's in-the-air rate reaching the report as a touchdown speed) had two
  candidate repairs, and the obvious one is wrong. **Rejected: taking the rates from the second copy
  along with the clock**, which is what the field's own doc comment appeared to promise and what this
  run implemented first. A descent time needs two instants both copies agree on; a rate needs the
  deployment structure between them, and an unresolved one averages the whole descent — on the corpus
  Blue Raven this comes from that is **48.2 m/s, where a GPS recording of the same flight separately
  reads a 6.2 m/s main**, a 7.8x overstatement of the number a canopy is sized against. That
  measurement was already recorded in `lib/analyze/analyze.test.ts`'s "does not take the descent RATES
  across", by the session that decided it; the correction here is to make the withholding EXPLICIT
  rather than a side effect of the first copy happening to have nothing.

- **2026-08-08 — the sample flights are REAL recordings drawn from `lib/parsers/__fixtures__/`,
  not synthesized logs.** `ON-2` was triaged on the premise that no real log can ship, which is true
  of the private `debrief-fixtures` corpus (no blanket license; real names, launch-site GPS to a few
  metres, device serials) and **not** true of the fixtures already committed to this public repo,
  whose provenance is documented in that directory's README. **Rejected: synthesizing a log for
  every capability**, which was the plan and which would have required a `synthetic` label on every
  one of thirteen surfaces and eight export formats before the first sample could ship — a large
  change to the safety spine, taken to demonstrate features, when real recordings that need none of
  it were already in the repo. Synthesis stays the route for what the fixtures cannot show (a
  mis-scaled column, a saturated accelerometer, a staged flight), and the labelling requirement
  stands for those. **Reversal cost: the files are copies in `public/samples/`; deleting them and
  the registry entries restores the previous state exactly.**

- **2026-08-08 — Debrief's tip button stays NEUTRAL, against the literal text of `ON-B1`.** The note
  asks for the theme control and the tip control to match `motor.fusionspace.co`. Both live sites were
  fetched and their header markup compared: the **theme control already matches byte for byte** in
  `title`, `aria-label`, glyph, label, border, background, radius and type size, differing only by 2 px
  of padding and a coarse-pointer floor Debrief has and the motor finder does not. The **tip control
  differs in colour only** — the motor finder's is `amber-300/50/700`, Debrief's is neutral secondary.
  **Rejected: converging Debrief onto amber.** `DESIGN.md` §2 gives amber the meaning `warn` and
  permits `indigo` as the single accent; the same fetch shows the motor finder's header also carries a
  **sky** API chip, so converging imports two off-system accents into a system that allows one, and
  spends the hue Debrief's safety posture leans on — in a persistent header sitting above every report a
  flyer scans for amber caveats. That cost does not exist in a motor catalogue, which is why the same
  choice is right there and wrong here. **Also rejected: converging the theme control's `px-2.5`**,
  which would take every small button off §4's spacing scale and drop §8's touch floor to close a gap
  nobody can see. The direction that makes the suite consistent without either cost is the motor finder
  adopting the neutral treatment its own copy of `DESIGN.md` already specifies; only the owner can make
  that change, so it is parked in `OWNER-NOTES.md`. **Reversal cost: one `className` in
  `components/KofiButton.tsx`.**

- **2026-08-08 — D11 (the canonical round-trip) is queued BEHIND D10 (the sample flights), not ahead
  of it.** `ON-4` and `ON-2` arrived in the same batch and either could go first. **Rejected: D11
  first**, which is the more architecturally interesting of the two and would have had nothing it
  could ship a round-trip assertion over: the corpus cannot be redistributed, so a fork or a
  `FIXTURES_TOKEN`-less CI run would exercise the check on zero files. D10 produces logs that live in
  the repo, so D11's property test runs everywhere. **Reversal cost: the order of two `NOT STARTED`
  headings.**

- **2026-08-04 — the deployment-shock bracket is set from corpus measurement, and it is ASYMMETRIC.**
  `[1.0, 1.0]` s at apogee, `[3.5, 1.0]` s at main. No vendor publishes its own detection lag, so
  there is no source to cite; the widths come from measuring where the charge actually sits relative
  to the index Debrief detects the deployment at — apogee charges fire 0.35–0.78 s early, main
  deploys are detected 2.0–2.9 s late — and are set past the largest lag rather than at it.
  **Rejected: a symmetric ±0.3 s window**, which is what "convert the sample count to clock" gives
  you and which reads the quiet coast beside the charge: it took stargazer1 from 63.2 g to 0.65 g
  and SG1.1's main from 26.5 g to 1.9 g, understating a harness load 14x. **Also rejected: keeping
  the sample-count window**, which published 22.8 g and 1.5 g for one Kairos charge that was really
  84.6 g. **Also rejected, for now: requiring the peak to LOOK like a transient** before publishing
  it — the right answer for `intrepid2`, which reports 30.4 g off a thrust plateau on a record that
  ends mid-boost, but a second change to the same reading that wants its own corpus validation.
  Filed in `BACKLOG.md`. The reversal cost is one constant.

- **2026-08-04 — a design stating SEVERAL simulations is refused by name rather than resolved by a
  rule.** A `.ork` accumulates a simulation per motor; the corpus fixture holds five, apogees
  50.59–319.75 m. Nothing in a flight log says which motor flew. **Rejected: "use the last one"**,
  which is a guess wearing a rule's clothes and would have Debrief inventing the claim the
  cross-check exists to test — on a milestone whose whole subject is not doing that. **Also
  rejected: silence**, which reads as "this file states no prediction" and is false. What ships
  names the simulations it found and says why it will not pick. The better answer is to let the
  flyer choose, and that is filed as slice 3b — it is a control with its own state, persistence and
  touch contract, and shipping the unambiguous case first put the capability in front of a flyer a
  run earlier.

- **2026-08-04 — the predicted-versus-flown difference is signed from the FLIGHT's side.** Debrief
  states `(flown − predicted) / |predicted|`, so positive means the rocket beat its simulation.
  **Rejected: RASAero II's convention**, `(sim − flown) / flown`, which is the only published
  predicted-versus-flown table in the field (43 flights, average error 3.47%) and is therefore the
  one a flyer might already know. It is the opposite sign and a different denominator: a flight it
  prints as −4.30% Debrief prints as +4.5%. Taken the other way because the two are answering
  different questions — RASAero is grading its own simulator, Debrief is reporting what a rocket
  did against what was expected of it, and Debrief's reference is always the thing it measured.
  The divergence is stated on the methods page and in `COMPETITION.md` rather than left to be
  discovered by someone holding both tables.

- **2026-08-04 — a paired prediction lasts the session and is not kept with the flight.** A device
  summary's TEXT is stored on the logbook row so the cross-check survives a reopen; that text is a
  few hundred bytes. The equivalent for a design is the whole `rocket.ork` XML — **996 KB on the
  corpus fixture** — against a browser quota the logbook shares between every flight a flyer keeps.
  **Rejected: store the XML** (a megabyte per flight to re-derive ten numbers) and **rejected:
  store the ten figures instead**, which is right but needs a place on the logbook row that does
  not exist yet. The note a flyer sees says the design must be dropped again, so nothing is
  silently lost. Filed in `BACKLOG.md`.

- **2026-08-03 — D9's product shape was decided rather than asked, and it is the biggest product
  call taken unattended so far.** "Predicted versus flown" could reasonably have meant several
  things, and the decomposition above commits to one: **Debrief imports a prediction FILE, and does
  nothing else with it.** Rejected, each for a stated reason rather than by taste:
  - *A shared runtime or an API call to the sibling* — `MAINTAINING.md` says keep the tools
    distinct, and **EVERYTHING client-side / static** forbids the network call outright.
  - *Debrief simulating, even a little, to fill a gap in a prediction* — **MEASUREMENT, not
    simulation — the safety spine**.
    Debrief reports the gap between a prediction and a flight; it never improves either.
  - *Fitting or correcting a prediction against the flown data* (back-calculating Cd from the coast
    phase, which the competitor named in row 29 does) — the same invariant, and it is the thing that
    would make Debrief a simulator wearing an analyzer's name.
  - *Feeding a prediction into `lib/compare.ts` as a seventh flight* — `CompareInput` demands a full
    `FlightAnalysis`, so this would fabricate detected events and metrics for a curve that has none.
    The refusal is structural, not stylistic.

  **The owner can reverse any of this cheaply**, because the decomposition puts the whole product
  claim in slice 3's *done when*: predicted-versus-flown is a THIRD COLUMN in a cross-check table
  that already exists, not a new surface. If the answer is "no, it should be a chart first", slices
  3 and 4 swap and nothing else changes.

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
