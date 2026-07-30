# Debrief — Product Roadmap

**This file is the work queue.** `BACKLOG.md` is a defect ledger — its own header says so: *"Not a
roadmap; a memory."* It is right about that, and for a long time nothing else was the roadmap. What
Debrief still cannot DO lives here.

Read this at session start, alongside `HANDOFF.md`. Unless the owner names something else, the next
unstarted milestone below is the run's goal. See *Each pass* in `MAINTAINING.md` for how defect work
preempts it (Sev-1 only) and how much of a run it may take (one increment in four).

One milestone at a time, in order. Do not skip ahead: each is a prerequisite for the next. A milestone
is finished when a flyer can do the thing — not when the code exists.

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

**Status:** NOT STARTED

**Outcome.** A flight flown on two altimeters is one flight in the logbook, not two.

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

**Size.** 4–6 increments.

---

## D4 — Stitch per-stage logs into one composite flight

**Status:** NOT STARTED

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

**Status:** NOT STARTED

**Outcome.** The plots, colours and formats are the flyer's choice, not the tool's.

**Done when** a flyer can choose which figures appear and in what order, set the series colours, and
export a report a certification package or forum post can use directly — including at least one image
or self-contained document format beyond today's text, Markdown, HTML, CSV and JSON.

**Notes.** Closing named gaps rather than starting fresh: `reportProfile.ts` and `plotView.ts` already
carry readings, order and hidden figures; `COMPARE_PALETTE` (`lib/compare.ts:13`) is hardcoded and
caps a comparison at 6; there is no image or paginated export. Keep the rule `reportProfile.ts`
already states — trimming a *report* is a presentation choice, trimming a *data export* is a broken
file, so CSV and JSON keep every key.

**Size.** 4–6 increments.

---

## After D5 — extend this file yourself, in this order

**Do not ask which of these to do, and do not fall back to the defect ledger because the list above is
finished.** When D5 ships, take D6 from the order below and decompose it here to the same shape —
outcome, *done when*, size, notes — then start it. That decomposition is one increment's work and it
IS the work when the roadmap is dry. The order is a standing decision, changeable by the owner at any
time; absent that, it holds.

**D6 — Infer which files belong to one flight.** D1 and D3 make the flyer say so; this proposes the
grouping from launch day, overlapping wall clocks and profile shape, shows its reasoning and lets the
flyer correct it. It is deliberately late: a wrong automatic merge silently fabricates one flight out
of two, and it must sit on a model that already handles the explicit case.

**D7 — Deeper honest insight, the stated moat.** North Star 1's third bullet: more of what the data
supports, each reading validated against the corpus, the logger's own reported summary and published
sources, and each arriving with its method on the methods page. Decompose by readings a flyer asks for
and that can be checked — not by whatever is computable.

**D8 — Surfaces per device.** The North Star says the tool "takes shape as distinct, purpose-built
surfaces over that one model, each optimized for the device it's used on". Decompose by what a flyer
needs to DO at the range on a phone versus at a desk writing a cert document — capability first,
layout second.

Beyond D8, decompose from the North Star in `MAINTAINING.md` and record why you chose what you chose.

---

## Decisions taken without the owner

Unattended runs do not stop to ask (see *Unattended operation* in `MAINTAINING.md`). Every decision
that would otherwise have been a question goes here, with the option rejected, so it can be reversed
cheaply instead of re-derived. Newest first.

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
