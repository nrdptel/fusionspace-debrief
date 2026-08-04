# Backlog

**This is a DEFECT LEDGER, not the work queue.** The queue is `ROADMAP.md`. This file was already
right about itself — "not a roadmap; a memory" — but for a long time nothing else was the roadmap, so
a session that treated it as the queue could only ship fixes. It holds 212 entries and not one of them
proposes a capability.

Read it to file into, and to screen for a **Sev-1** — a wrong number on a surface a flyer would act
on, or a one-way door. Those preempt the milestone immediately. Everything else waits its turn under
the one-in-four quota on **unqueued** defect work in `MAINTAINING.md` — which caps clearing entries
from this file, and deliberately does **not** cap craft or product work, because that now has its own
track in `ROADMAP.md` with its own *done when*.

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first.

- **2026-08-04 — `FlightReport`'s range picker should be `Segmented`, not a hand-rolled chip.**
  `components/FlightReport.tsx:1181` is a one-of-N range selector written as
  `rounded-md border px-2 py-0.5 text-xs font-medium` with an indigo selected state. It is the one
  chip-shaped control the `ChipButton` census did NOT convert, and the reason is a real distinction
  rather than a dodge: `ChipButton`'s unpressed state is *muted out* — dashed and faded, correct for
  a hidden event series — where an unselected RANGE is simply not chosen yet and must stay a normal
  control. `Segmented` is the primitive for one-of-N and already exists (`ChannelExplorer` and the
  "Reported by" banner use it). Left out of that increment because it changes the control's shape on
  a surface the increment was not otherwise touching. Recorded in `lib/design-system.test.ts`'s
  `DELIBERATE` map with the same reason, so the pin does not read green over it silently.

- **2026-08-04 — FIXED: "Couldn't read <file>" headed a message saying Debrief read the file
  perfectly well.** The error state carries `recognised` now, set wherever a `ParseGuidanceError` is
  caught, and a recognised file is headed *"Debrief didn't analyse …"* — a decision, not a failure.
  Pinned by `a file Debrief recognises and declines is not called unreadable` in
  `e2e/analyze.spec.ts`, falsified by forcing the flag false. **Two catch sites needed it, not one**,
  and the first version fixed only `ingest`'s: a file dropped through the picker goes through
  `onFile`'s catch instead, so the fix passed the test in isolation and failed the full suite. The
  original entry follows.

- **[FIXED — see above] 2026-08-04 — "Couldn't read <file>" heads a message that says Debrief read the file perfectly
  well.** `components/Analyzer.tsx:814` uses one `ErrorState` heading for every `ParseGuidanceError`,
  but that class covers two different outcomes: a file Debrief genuinely could not parse, and a file
  it parsed, recognised, and is declining to treat as a flight *on purpose*. Walked in the built app
  2026-08-04: dropping the OpenRocket `.ork` shows **"Couldn't read
  openrocket__example-simple-model-rocket__A-simple-model-rocket.ork"** above the sentence "This is
  an OpenRocket design file "A simple model rocket" — a rocket and its simulations, not a recording
  of a flight. It states 5 simulations…". The body is right and the heading contradicts it — Debrief
  read the file well enough to name the design and count its simulations. The device summary and the
  raw-download refusal have the same shape and the same heading, so this is three surfaces, not one.
  **§5 already has the vocabulary**: a recognised-but-not-a-flight file is not an `error` state, it
  is a `Notice` above an explanation. The fix is a second heading (or a `kind` on the guidance error)
  for "recognised, not a flight", not a reword of this one.

- **2026-08-04 — Two records publish a descent rate off an altitude trace that is not a flight
  profile, and neither estimator can help.** Exposed by closing the chord-disagreement entry below,
  which had bundled these two in with six real estimator defects. `eggtimer euler-explosion` reaches
  its 292.0 m "apogee" at **t = 1.0 s, 0.8 s after liftoff** — a blast pressure spike from a motor
  that exploded at Mach 2.4, not a climb — then its drogue leg runs to **−10.4 m AGL**, below the
  pad, and it publishes **19.83 m/s**. `blueraven meraki2-121km` publishes a 138.85 m/s drogue leg
  from 121 km, where the barometric model has no validity whatsoever. Debrief already emits four
  warnings on the first (baseline not on the pad, last sample below the start, derived velocity,
  climb-refuted speed) and still prints the rate. **The fix is not a better estimator — both of
  these are honest reads of unsound traces.** It is a gate: a record whose apogee arrives within a
  second of liftoff has no ascent to speak of, and a leg that descends past the record's own
  starting altitude on a record already flagged as not starting on the pad is not a recovery
  reading. Withhold with a reason, the way `descentAboveFreeFall` already does. Measured
  2026-08-04; the numbers above are from the analysis, not from the manifest.

- **2026-08-03 — FIXED (Sev-1): `altitudeUnproven` reached only the metric tile.** `lib/report.ts`
  gated the apogee caveat on `apogeeIsFloor`, the OTHER of the flag pair, so a record flagged
  unproven and not a floor published its apogee with no qualifier attached on the clipboard table,
  the JSON, the share card, all three comparison exports, and the apogee row of the .txt/.md/.html.
  One real corpus flight is in that state (`issuiuc-sg1.2`, 31 ft against a sibling altimeter's
  2,115 m). `apogeeCaveat` / `apogeeIsQualified` in `lib/readings.ts` are the one source of those
  words now. Pinned by `lib/apogeeCaveat.test.ts`; `HANDOFF.md` carries what the review corrected.
- **2026-08-03 — the LOGBOOK publishes an apogee bare and can crown it with a personal-best ★.**
  `RecentMeta` (`lib/recents.ts`) stores `apogeeM` with no caveat flag of any kind, so
  `components/RecentFlights.tsx` (row cell, recording strip, clipboard/CSV export), the `'apogee'`
  sort and `personalBests` in `lib/logbook.ts` *cannot* qualify it. The comparison now refuses to
  crown a disowned apogee "highest"; the logbook will still give it a star.
  `components/GroupProposalBanner.tsx` documents this exact gap for `apogeeIsFloor` and calls it
  *"the same defect as publishing a Cd off a refused velocity, one surface further on"*. The one
  corpus case reads LOW (31 ft) so it cannot win a star today — the mode that bites is the other one
  the analyzer names, a stuck barometer or a column read as a height that is not one, which reads
  high. **Fix shape:** carry the flags on `RecentMeta` beside `apogeeM`; that is one storage change
  and then every logbook surface can read them.
- **2026-08-03 — `altitudeUnproven` doubts far more than the apogee, and the rest still ships bare.**
  The analyzer's own warning ends *"every reading on this page rests on that channel"*. Verified by
  flipping the flag on a full metrics set: burnout altitude, Max Q's "at N ft", the transonic
  crossing altitude, coast efficiency, the drogue descent rate and the max-velocity tile's altitude
  all render with no qualifier. The `.txt`/`.md`/`.html`/JSON carry the analyzer's warning as a
  document-level block, but the clipboard table, the share card and all three comparison exports
  carry no warnings at all — so on those five, every altitude-derived reading except the apogee is
  published with nothing beside it. Pre-existing and narrowed rather than created by the apogee fix;
  larger in scope than that Sev-1 and the natural next milestone rather than a slice of it.
- **2026-08-03 — `Button variant="link"` with `href` is the one shape that really is under-sized.**
  `app/globals.css` floors every bare `button` at 44×44 under `@media (pointer: coarse)`, so a
  `link` BUTTON keeps its touch target however little the variant declares. The `href` branch
  (`components/ui.tsx`) renders a `<Link>`/`<a>` instead, and the coarse-pointer rule covers only
  `a[download]`, `nav a`, `header a` and `footer a` — while `e2e/touch.spec.ts` exempts an `<a>`
  inside a `p`/`li` from measurement. Nothing uses `variant="link"` with `href` today; the variant
  makes it a one-word mistake away. Reproduce: add `href="/methods"` to any converted link site and
  measure its box at a 390 px coarse-pointer viewport. **Fix shape:** either extend the
  coarse-pointer rule to cover it, or refuse the combination in the type.
- **2026-08-03 — SEV-1 CANDIDATE, LATENT: a climb dropout lets the burnout search run unbounded,
  and the result ships labelled `measured`.** `lib/analyze/index.ts:1758` assigns `maxVelIdx` only
  under `ascentPresent && !ascentGapBreaksPeak`, so a gap leaves it at `-1`; `:1973` captures
  `peakVelIdxBeforeJudgement` after that, so the `:1995` ternary
  `velocityImplausible ? peakVelIdxBeforeJudgement : maxVelIdx` is a no-op on this route and both
  arms are `-1`. `:2045`'s `velPeakEnd` then collapses to `apogeeIdx` — the exact unbounded search
  the `:2021-2044` comment says produced a 39.85 s burn time. **Measured on a SYNTHESISED dropout**
  over `altusmetrum__issuiuc-stargazer1-20230507__SG1-May-EasyMega.eeprom`: burn time 4.36 → 11.29 s,
  burnout altitude 241 → 543 m (95% of its own 573 m apogee), burnout velocity 128.4 → 46.8 m/s,
  coast 7.53 → 0.60 s — and it reproduces identically with the gap placed entirely in the COAST,
  strictly after the true burnout, so it is a bound collapse and not missing data. `readings.ts:287`
  prints `burnoutSub` = `'measured'` beside a Max-velocity tile withheld for `'gap'`.

  **REPRODUCED INDEPENDENTLY 2026-08-03, and every filed number matched.** Re-derived from the
  fixture without reading the original probe: gap punched at **5.36–8.37 s**, entirely inside the
  coast and strictly after the true 4.36 s burnout, 1,592 → 1,290 samples. Result: burn
  **4.36 → 11.29 s**, burnout altitude **240.6 → 542.5 m** against an unchanged 572.7 m apogee
  (94.7% of it), burnout velocity **128.4 → 46.8 m/s**, coast efficiency **0.395 → 0.270**, drag
  loss **509 → 81.6 m** — while `maxVelocity` goes correctly to `NaN` with
  `maxVelocityWithheld='gap'`. **Removing data the burn never used more than doubles the burn
  time**, which is the signature of a bound collapse rather than of missing samples, and it is the
  claim this entry rests on. A finding is a claim until reproduced; this one now is.

  **The fix is TWO lines, and the obvious version of it is wrong — sized 2026-08-03 so the next
  session does not discover this the expensive way.** The tempting change is to compute `maxVelIdx`
  unconditionally and let the gap withhold only the VALUE. **Do not.** `maxVelIdx` has **13 uses**
  in `lib/analyze/index.ts` (`:1853`, `:1889`, `:1909`, `:1964`, `:2057`, `:2397`, `:2433`, `:2725`
  among them), and every one currently reads `>= 0` as "there is a peak this analysis stands
  behind". Widening it publishes Mach at peak, peak altitude, the coast climb and
  `burnoutAtVelocityPeak` off a peak the report has already refused — turning one wrong number into
  eight. **The safe shape is a SEPARATE index used only for the bound**: compute the ascent argMax
  into its own `const` regardless of `ascentGapBreaksPeak`, feed `velTurnoverIdx` from it, and
  leave `maxVelIdx` byte-for-byte alone. Two lines, no other call site touched.
  *(`:1995` is the same pattern already solved once for the OTHER withholding reason — its comment
  says throwing the index away with the value "left the burnout crossing search running all the way
  to apogee on 4 of the corpus's 14 signed-axial flights". The gap reason simply never got the same
  treatment, and `peakVelIdxBeforeJudgement` at `:1973` cannot supply it because it is captured
  AFTER `:1758` has already left the index at `-1`.)*

  **Filed rather than fixed, deliberately, and the reason is this repo's own rule.** No shipping
  corpus file combines the exposed shape (baro velocity + signed axial accelerometer, no velocity
  column — seven files) with an ascent dropout (two files, both Featherweight GPS logs that find no
  burnout at all). So today the fix would be a guard firing on zero real files, which the entry at
  `BACKLOG.md`'s "a guard that fires on zero real files is worse than nothing until a fixture
  exists" forbids. **The right shape is a synthetic fixture first**, then the one-line bound, then a
  test that fails without it. Not already filed: the two nearby entries scope strictly to
  `velocityImplausible` and never name `ascentGapBreaksPeak`, and `grep velTurnoverIdx|velPeakEnd`
  over the ledgers returns one line that asserts this case was left "identical".

  **ATTEMPTED 2026-08-03 and reverted before pushing — read this before starting, it is a wasted
  increment otherwise.** The four-line code change is easy and was written: a
  `const ascentVelPeakIdx = ascentPresent ? argMax(velocity, liftoffRef, apogeeIdx + 1) : -1`
  hoisted above the withholding block, and a third arm on `velTurnoverIdx` falling back to it when
  `maxVelIdx < 0`. **The blocker is the FIXTURE, exactly as this entry already said, and the
  specific reason is worth writing down: `ascentGapBreaksPeak` is gated on
  `velocitySource === 'baro'` (`lib/analyze/index.ts:1711`).** So the synthetic dropout has to be
  punched into a flight whose velocity is BARO-DERIVED — and the flights that reach the burnout
  crossing search are the signed-axial ones, which in this corpus all carry a device-reported
  speed. A dropout punched into `stargazer1`'s coast does not set the flag at all; the metric comes
  back `undefined` and the test passes vacuously.

  **Do not trust a quick reachability probe here, and this is the second lesson.** A sweep written
  to count `velocitySource` across the corpus reported `{none: 37}` — that field is not on the
  metrics object, so the probe measured nothing while looking authoritative, and its
  "0 baro-velocity flights with a burn" line was worthless. The honest position remains: **nobody
  has yet shown a real or synthetic file that reaches this path.** Until one exists the code change
  is unpinnable, and shipping it would be exactly the confidently-wrong-finding shape
  `MAINTAINING.md`'s opening section exists to prevent. **The next attempt should start by building
  the synthetic baro-only signed-axial file and proving the flag flips**, and only then touch
  `lib/analyze/index.ts`.
- **2026-08-03 — `burnoutVelocity`, `coastEfficiency` and `dragLossAltitude` gate on
  `!velocityImplausible` alone.** `series.velocityUnusable` (`lib/analyze/index.ts:2001`) is the flag
  covering BOTH withholding reasons, and `lib/analyze/types.ts:196` says in terms that it is "the one
  thing a consumer should test" because testing only the first reason already shipped a leak once.
  These are two more consumers testing only the first reason: with a gap present the analysis reports
  `maxVelocityWithheld='gap'` and `maxVelocity=NaN` while publishing `burnoutVelocity` 46.8 m/s,
  `coastEfficiency` 27% and `dragLossAltitude` 82 m off that identical trace. `coastEfficiency ∝
  1/v²`, so the error is squared. Same latency caveat as the entry above — reachable only with a
  synthesised dropout today — and the same fix shape.

  **Also reproduced 2026-08-03, in the same run as the entry above and from the same trace.** The
  two are one defect seen from two ends: the bound collapse produces the wrong burnout index, and
  this gate is what lets four readings derived from it reach a flyer while the fifth
  (`maxVelocity`) is correctly withheld from the very same analysis. **Fix them together or the
  first fix makes the second invisible** — bound `velPeakEnd` alone and the numbers become right,
  so a later session finds no symptom and leaves the gate testing the wrong flag until the next
  withholding reason arrives. The synthesised dropout that demonstrates both is written down in
  the entry above, so neither needs re-deriving.
- **2026-08-03 — `findRepeatedSpans` caps candidate lags at 16 and says nothing when it hits the
  cap.** On the corpus the most any file produces is four, so nothing is silently dropped today, and
  a replay's hit count is its block length (thousands) so it ranks far above any incidental lag. But
  a file with more than 16 long-run repeat periods would have the excess ignored with no statement.
  Reproduce: synthesise a stream with 20 distinct repeat lags and compare `repeatedSampleCount`
  against the construction. **Fix shape:** count the candidates before slicing and, where any were
  dropped, say "at least" in the note rather than a bare figure.
- **2026-08-03 — a genuine repeat can fall under `MIN_RUN` when its own rows recur between source
  and copy.** Candidate lags come from CONSECUTIVE occurrence gaps, so a block whose rows also appear
  between the two copies contributes fewer than `run` hits to the true lag. Constructed by review:
  `[blk(120)][blk[0:60]][noise(30)][blk(120)]` yields lags 120/90/210 at 60 hits each — right on the
  50 floor. A 60–70-sample block with a few interior recurrences would be missed entirely. Not a
  corpus case, and the fix (count all pairwise gaps, not just consecutive ones) is quadratic in the
  duplicate count, so it wants thought rather than a one-liner.
- **2026-08-03 — the union path has no coverage on a checkout without the corpus.**
  `findRepeatedSpans`'s overlap merge is exercised only by jan10 and jan18, whose four blocks each
  collapse to two spans; the synthetic tests cannot reach it because consecutive-gap candidates make
  a second overlapping lag hard to construct minimally. `mergeRepeatedSpans` is unit-tested directly,
  which covers the same arithmetic but not the path through the detector. Reproduce: run
  `npx vitest run lib/highRateRepeats.test.ts` with `lib/parsers/__corpus__` unlinked and note the
  corpus block skips.
- **2026-08-03 — `analysisJson` emits the repeat as prose but not as data.** The whole argument in
  `lib/flight/types.ts` for `repeatedSpans` being structured is that a sentence cannot be filtered by
  an extent; the JSON export then carries only the sentence. A consumer wanting to skip replayed
  stretches programmatically has to parse English. Reproduce: export a jan10 report as JSON and grep
  for `repeatedSpans`.
- **2026-08-03 — the comparison surface carries no flight-level caveat of any kind.** Verified by
  review: `CompareInput` (`lib/compare.ts:33`) carries `id / name / formatLabel / analysis / flownAt`
  and no flight, so `repeatedSpans` is dropped at the boundary — and so is the low-rate *"holds the
  same flight written twice"*. No high-rate sample reaches any comparison trace, so the repeat note
  specifically has no claim to caveat there; the LOW-rate one does, and that is the pre-existing gap
  worth closing. Reproduce: build a comparison containing jan10 and look for any warning.
- **2026-08-03 — the figure light/dark toggle governs the exported SVG and not the exported PNG,
  and they sit next to each other.** `components/FigureTheme.tsx`'s own docblock states the contract
  — *"A light/dark choice for an exported vector (SVG) figure … it only governs the exported
  figure"* — and `plotSvg` honours it (`dark: figureDark`) while the PNG path takes the page theme.
  **The PNG is not wrong to**: it composites the LIVE canvas, whose pixels uPlot drew in the page's
  theme, so a light fill under a dark plot would be worse. But a flyer in dark mode who flips the
  toggle for a cert document gets a light SVG and a dark PNG from two buttons an inch apart, and
  nothing says why. Either the toggle's label should say it is the vector figure only, or the PNG
  should re-render off-screen in the chosen scheme — which is a real change, not a swap of `dark`
  for `figureDark`. Reproduce: dark mode, `/`, toggle the figure theme, save both.
- **2026-08-03 — `components/StitchSurface.tsx:100`'s fallback names the wrong cause.** When
  `compareFromLogbook` returns fewer inputs than ids but no `skipped` entries, the composite says
  *"one of those flights is no longer in this logbook"*. That branch is unreachable for a missing or
  unreadable flight (each pushes a `skipped` entry, and those now carry the shared refusal wording),
  so the one way in is an id list longer than `MAX_COMPARE` — where nothing is missing and the real
  answer is that the surface only reads the first N. Small, and worth a line because the sentence
  asserts a deletion. Found by sweeping for a fifth surface with the storage conflation; there is
  not one, and this is what the sweep turned up instead.
- **2026-08-03 — one condition, four wordings: the storage refusal is still conflated everywhere
  except the logbook list.** The logbook now tells "browser refused storage" apart from "empty" and
  "still loading", but the same refusal reaches three other surfaces still wearing the old
  disguise, and two of them accuse the flyer's own device of losing data:
  - `lib/compareFromLogbook.ts:45` — `getRecent` swallows the refusal, so every id is skipped with
    **"no longer in this logbook"**. Reproduce: stub `indexedDB` undefined and open
    `/compare/?ids=a,b`. It asserts the flights were deleted.
  - `components/Analyzer.tsx:643` — the `/?open=<id>` deep link the logbook rows navigate to says
    **"That saved flight could no longer be read."** Third wording, same cause.
  - `components/CompareSurface.tsx:218` — a drop with storage blocked reports **"Added a.csv, b.csv
    to your logbook — tick them with another flight to compare"** while the list directly below
    says the browser won't keep a logbook. Nothing was added and there is nothing to tick.

  **HALF FIXED 2026-08-03, and the half that is not is the more dangerous one.** `readRecent(id)`
  reports `{ rec, blocked }` beside `readRecents`, and the two surfaces that ACCUSED the flyer's
  device of deleting a flight — `compareFromLogbook` and the `?open=<id>` deep link — now say the
  shared `STORAGE_REFUSED` sentence instead. Pinned by `e2e/logbook.spec.ts` → *"a storage refusal
  is not reported as a deletion"*, asserted on the error card rather than on the page (the logbook's
  own blocked paragraph renders on every `/`, so a page-level locator passed with the deep-link
  defect fully restored — found by review, and the test now fails on exactly that mutation).

  ~~**What is NOT fixed, and it is a family rather than a wording problem: the WRITE path cannot
  report failure at all.** `saveRecent` assigns its id immediately after `store.put` without
  awaiting the transaction…~~ **FIXED 2026-08-03, and it was the ROOT of the whole family.**
  `saveRecent` awaits its transaction and returns `{ id: null, forgotten: [] }` on an abort, so
  **`savedId` means "the logbook took it"** — which is what every surface above it already read it
  as. Until now that was true only where IndexedDB was absent entirely, which is the case an
  `addInitScript` stub simulates and the rarest one in the wild; mobile Safari's ITP eviction and a
  full quota are the common ones, and both returned a perfectly good-looking id with nothing
  stored. The `/compare` half that was written against the false invariant and reverted the same
  day is restored with it, and now means what it reads as. Pinned by `e2e/logbook.spec.ts` → *"a
  save the browser refuses is not announced as a flight added"*.

  **The prune went atomic with it, and that is load-bearing for a second claim.** `forgotten` names
  flights the logbook dropped to make room; the deletes ride the same transaction as the `put`, so
  an abort drops neither and `forgotten: []` is the honest answer. Reporting "3 flights were
  forgotten" for a save that never landed would have been the same class of lie one layer over.

  ~~**The worst instance, and it should be fixed first:** `importLogbook` resolves on
  `transaction.onabort` and returns `flights.length` regardless…~~ **FIXED 2026-08-03.**
  `importLogbook` now reports its transaction's OUTCOME as `{ restored, blocked }`, so a refused
  restore says the backup could not be written and to keep the file, rather than *"Restored 12
  flights."* over an empty logbook — which is the worst direction this family runs in, because the
  obvious next thing a flyer does is delete the file it came from. The sibling failure went with it:
  a `catch → 0` used to render *"No flights found in that file — is it a Debrief logbook export?"*
  over a perfectly good backup, blaming the flyer's file for the browser's refusal. Three outcomes
  now, and `{ restored: 0, blocked: false }` — a file with genuinely nothing in it — is the only one
  that says anything about the file. Pinned by `e2e/logbook.spec.ts` → *"a restore the browser
  refuses does not report flights it did not keep"*, which aborts the readwrite TRANSACTION the way
  a full quota does rather than removing `indexedDB` (which is caught long before the write and
  would prove nothing about the outcome path). Falsified by restoring the old resolve-and-count.

  **Reproduce what remains:** DevTools → Application → Storage → clamp the quota to ~1 MB, then
  analyse a file on `/` and look for any signal that it was not kept. (The import and `/compare`
  cases that used to be here are fixed and each has its own regression test.)

  **What is left is ONE surface, and it is now a plumbing job rather than a truth problem.** The
  analyze page says nothing about a refused save *while the report is up*: `Analyzer.tsx:293`'s
  `if (saved.id)` is a *correct* condition now and simply has no else — see the separate entry below,
  which is the same defect from the other end and is the one to work. `FlightReport.tsx` does carry
  the sentence, but inside a disclosure that defaults closed and is titled for something else.

  **Measured 2026-08-03, and it narrows the entry: `RecentFlights` does not render on the report
  screen at all.** So the `write-blocked` logbook caveat added the same day cannot cover this case —
  it reaches the flyer only once they go back to the drop zone. Verified by probing the built export
  with writes aborting: `main` carries no logbook paragraph in either the working or the refused
  case while a report is on screen. The report screen genuinely needs its own line.

  **Count, kept honest:** the constant SPLIT IN TWO on 2026-08-03, and that was a correction found
  by review rather than a tidy-up. `STORAGE_REFUSED` says *"read or keep"*, which is only true where
  `indexedDB` is absent entirely; a full quota and an ITP eviction read perfectly and refuse only
  the write. The first version of the `/compare` fix used the read-or-keep sentence on the write
  path, so a drop would have told the flyer their browser could not READ a logbook directly above a
  logbook list rendering their flights — the same two-surfaces-one-viewport contradiction it was
  written to end, pointing the other way. `STORAGE_WRITE_REFUSED` is the write half.
  So: two shared constants across three surfaces (`compareFromLogbook` and the `?open=<id>` deep
  link read; the `/compare` drop note writes), two bespoke sentences that are RIGHT to be bespoke —
  the import path (*keep the file*) and the `/compare` drop box (*this surface cannot assemble a
  comparison at all*) — and one still unwritten: the analyze page's.

- **2026-08-03 — the report's caption panel promises durability it cannot deliver when writes are
  refused and the flight was already in the logbook.** `FlightReport.tsx:1001` says *"Kept with this
  flight on this device, so it is still here when you come back to it"* whenever `onCaption` is
  passed, which follows `state.savedId`. On a quota-full device reopening a stored flight,
  `saveRecent` correctly returns the pre-existing id (the row survives the rollback, so the address
  is real) — but `saveCaption` writes through the same refused path, so a caption typed there is
  lost on reload while the copy says it is kept.

  **Pre-existing, not introduced 2026-08-03** — the old `saveRecent` returned a non-null id on
  every abort, so this exact wording rendered in this exact case already; the fix narrowed the case
  rather than creating it. Filed rather than fixed because the honest repair is a real one:
  `SaveResult` needs to separate *"this flight has an address"* from *"this write landed"* (an
  `id` and a `stored` flag), and then `onCaption` gates on the second while `rememberOpenId` keeps
  using the first. That also gives `Analyzer.tsx:293`'s missing `else` — the entry below — the
  signal it needs, so the two should be done together. **Reproduce:** analyse a file, clamp the
  quota, reopen the flight from the logbook, type a label, reload.

  **A THIRD consumer wants the same flag, added 2026-08-03:** `useLogbook`'s `write-blocked` status
  is one-way, cleared only by a save that lands, because the obvious per-call-site boolean would
  clear it on exactly this path — a re-save that aborts still returns an id. So a flyer who frees
  space and drops a single file on `/` (the one save path that does not call `reportArrived`) keeps
  the caveat until they navigate. That is the safe direction to fail, and it is still a defect. All
  three fall out of one change; do them together or not at all.
- **2026-08-03 — the storage-refused message takes §2's `warn` (amber), and §2's own word for a
  refusal is `danger`.** Recorded as a decision rather than left to be re-derived: `ErrorState` is a
  `Card tone="danger"` with `role="alert"`, which fits an operation the flyer just attempted and
  that failed — a file that would not parse. Nothing here failed on their command, the analysis
  still works, and the in-app precedent for a caveat about the logbook's own capability is amber
  (`RecentFlights.tsx`'s nearly-full warning). **The counter-argument is real** — §2 lists "a
  refusal" under `danger` in as many words, and a reviewer read the amber choice as straining that.
  If a future run decides §2 means it literally, this is one class change and one comment; do not
  re-derive the argument from scratch.
- **2026-08-02 — P1 item 5's headline numbers count the wrong thing, and the entry should be
  re-measured before it is spent against.** It reads "the denominator is 15 data surfaces … and
  `StitchSurface` is the only one implementing more than one state". An audit found that number is
  counting `ui.tsx` PRIMITIVE adopters (`EmptyState` / `ErrorState`), not states — which is why it
  read 1 — and that at least five surfaces implement two or more. The logbook's loading and
  storage-refused states are closed (see `ROADMAP.md`); the rest of the item still wants a real
  census, and the standing question of whether `DESIGN.md` should assert an offline state per
  surface at all is unchanged and owed to both repos.
- **2026-08-02 — `components/Analyzer.tsx:293` silently swallows a failed save.** `if (saved.id)
  set(...)` — `lib/recents.ts` catches the storage failure and returns `{ id: null }`, and no caller
  reports it, so `state.savedId` stays unset and nothing on screen says the flight was not kept.

  **Worth MORE as of 2026-08-03, not less, and the fix got cheaper.** This condition used to be
  nearly unreachable — `saveRecent` returned a non-null id on a quota abort, so the only case that
  reached the `else` was IndexedDB missing entirely. It reports its transaction's outcome now, so
  `saved.id === null` is the *common* refusal (a full quota, ITP eviction) and this branch is where
  a flyer's flight quietly fails to be kept. `STORAGE_REFUSED` and the three-way shape are both
  written; this is one `else` and one live region away from done. **It is the last surface in the
  family** — see the count in the entry above.
  `FlightReport.tsx:1009` does say it in that case, but inside a disclosure `ui.tsx:749` defaults
  CLOSED and titles "Label this report (optional)" — so the one sentence that tells a flyer their
  flight was not remembered is behind a collapsed panel named for something else. Reproduce: block
  site storage, analyse a file, look for any visible signal that it was not saved.
- **2026-08-02 — `Figure` does not forward a `ref`, so two call sites hand-roll a bare div inside
  it.** `components/FlightReport.tsx:1194` (`altChartRef`, consumed at `:464`) and
  `components/CompareView.tsx:1100` each wrap `Figure`'s children in a ref-only `<div>` whose sole
  job is `querySelector('canvas')` for the PNG/SVG export — while the `Card` that `Figure` renders
  already accepts `ref` (`ui.tsx:187`), and `ChannelExplorer.tsx:501` and `GroundTrack.tsx:519`
  already use exactly that. Forwarding `ref` through `Figure` deletes both divs with no change to
  what the export finds. ~~**Worth more than the two divs:** the `savePng` bodies … are
  byte-identical apart from the output filename.~~ **That half is DONE 2026-08-03** —
  `lib/plotPng.ts` is the one implementation, pinned by *"composites a plot to an image from
  exactly one place"*. The line numbers above are re-pointed after that deletion, which is the
  other half of striking an entry: a citation that has moved is a citation that sends the next
  session to the wrong place.

  **A caution for whoever forwards the `ref`:** `savePlotPng` takes the FIRST canvas inside the
  host it is given. That is unambiguous at today's three call sites, and it is not at
  `GroundTrack.tsx:519`, whose `Card` holds two canvases (`:521` base, `:548` overlay) — pointing
  the export there would silently save the base and drop the overlay.
- **2026-08-02 — two recordings of ONE flight disagree about whether a charge fired, and the one
  that is wrong is the one that landed.** On `iss-irec2023`, sampled in 5 s buckets after apogee,
  **both** `irec_2023_easymega` and `irec_2023_telemega` fall at **34–35 m/s** and **both break to
  10 m/s at t≈60 s and ≈7,72x m** — a 3:1 step at the same second and the same height on two
  independent altimeters, which is a canopy opening. `easymega` resolves it and reports a main leg
  of 13.11 m/s; **`telemega` resolves nothing and reports a whole-descent 11.30 m/s**, even though
  it is the recording that rides that canopy all the way to the ground (13.5 → 6.5 m/s as the air
  thickens, flat at 170 m from t=796 s). **Cause:** `telemega`'s last ~2 s sit at rest, so the
  terminal median falls under `lib/analyze/index.ts`'s `mainTerminal > 1` guard and the walk-back
  aborts. **Reproduce:** analyse both files and print `mainDescentRate` / `wholeDescentRate` and the
  post-apogee rate profile. **Why it matters:** the comparison's cross-check note then tells the
  flyer their two boards disagree about a deployment when both traces show the same one — the note's
  wording is fixed, the detector is not. The honest fix is to stop the at-rest tail defeating the
  terminal median (take the median over the moving part of the descent), which is an analysis change
  and wants its own corpus sweep and gate.

  **It happens twice, which makes it a pattern rather than one odd file.** `intrepid3tf2` is the
  same shape: `AL1 March launch data.pf2` resolves a main at 235.3 s / 584 m and its record ends
  2.1 s later at 572 m, while its sibling `AL0` — same flight — descends ~16 m/s to 238 s and then
  **4–8 m/s from ~564 m down to 272 m**, confirming that main independently, and resolves nothing
  itself because its last 10 s sit flat at 271 m. **In both pairs the recording that is WRONG is the
  one that reached the ground.** So the guard meant to stop a noise-floor terminal is being tripped
  by a real one: the rocket is on the ground, the median over the tail is ~0, and the search aborts.
- **2026-08-02 — a canopy opening at 93% of apogee is labelled "Main deploy".** Same flight: the
  only deployment `easymega` records fires at **7,717 m AGL — 25,318 ft**, and Debrief calls it
  *Main deploy* and its leg *Main descent*. It is a real event and 13.11 m/s is a faithful reading
  of it (the sibling reads ~12.2 m/s over the same window), but "main" means something specific to a
  flyer — the second, slower canopy — and a single-deploy recovery from 27,000 ft is not it. The
  label, not the number, is what is wrong. **This entry exists because a fix for the NUMBER was
  written, gated and very nearly pushed before an adversarial re-check refuted the premise** — see
  `HANDOFF.md`. Any future attempt starts by reading the 5 s rate profile of BOTH recordings.
- **2026-08-02 — the chart draws a peak 295 ft ABOVE the Apogee tile beside it, on the same screen.**
  `lib/analyze/index.ts:1275` cleans the altitude with a Hampel filter over a **0.3 s** window
  (`windowFor(dt, 0.3)`), which by construction cannot remove an ejection transient wider than the
  window — and `lib/analyze/types.ts` documents `series.altitude` as *"spike-cleaned — what the
  report shows"*. **Measured over all 38 corpus records that analyse: 3 draw above their own
  reported apogee, and only one materially** — `blueraven trf-lemiv-l3 LR` peaks at **3,675.98 m
  (12,060.9 ft) at t=30.16 s against a reported apogee of 3,586.12 m (11,765.3 ft) at t=26.22 s**,
  a gap of **89.9 m / 2.51%**. The other two are 6.2 m (0.07%) and 1.2 m (0.06%) — rounding, not
  visible. **The apogee metric is right**: it matches the Blue Raven's own summary of 11,765.53 ft
  to four significant figures. What is wrong is that `components/FlightReport.tsx`, `lib/explore.ts`
  and `lib/compare.ts` all consume `series.altitude`, so the trace, the channel explorer and the
  multi-recording resample top out above the tile. **Reproduce:** open that corpus file and read the
  chart's y-extent against the Apogee tile. Not fixed here: widening the filter window is a
  calculation change that touches every flight, and it needs its own corpus sweep and its own gate.
- **2026-08-02 — the logbook stars a "best" the comparison refuses to crown and the report caveats:
  three surfaces, one flight, two different claims.** `lib/logbook.ts:93`'s `personalBests` takes a
  raw `uniqueMaxId(flights, r => r.apogeeM)` off `RecentMeta` — and `lib/recents.ts:10-45` carries
  **no** `apogeeIsFloor`, no clipped flag and no source flag, so it cannot know. `lib/report.ts:856`
  sets `rankBlocked: anyFloor` on the comparison's Apogee row for exactly this reason, and the
  report renders the same flight as `… (at least)`. **Reproduce in under a minute:** remember a
  flight whose apogee saturates (any corpus record that prints "(at least)"), remember a lower
  second flight, and read the three surfaces — the report says the peak is a lower bound, the
  comparison withholds the crown, the logbook stars it "Highest of your remembered flights".
  A superlative over a set containing a floor is not settleable, and this is the
  caveat-here/confident-claim-there shape `MAINTAINING.md` names. **Not folded into the hue fix that
  found it**: closing it means adding a flag to the PERSISTED store and deciding what an entry saved
  before that field existed may claim, which is a schema decision and its own increment. Found by
  the pre-push review agent, not by the author.

- **2026-08-02 — the three cold walks ran (desktop first use, desktop tenth use, phone), and the
  phone one measured rather than eyeballed.** Ranked by what a flyer loses. Fixed this run: the
  metre-in-a-feet-report caveat (its own commit). Everything below is filed, not fixed.

  **FIXED 2026-08-02, later the same day: the chart's one-finger reading, the comparison's sort
  cue and the colour swatches' tap target. The rest below stands.**

  **~~The one worth taking first — a chart is mouse-only, and the legend advertises otherwise.~~
  FIXED.**
  All six charts (five on `/`, one on `/compare`) render a live legend reading `time — altitude —`
  that NEVER fills in under touch: `Chart.tsx`'s touch handlers `return` unless
  `e.touches.length === 2`, so a single finger is pinch-zoom or nothing, and the uPlot cursor is
  bound to mouse events. Measured at 390 px with `hasTouch`: one-finger drag leaves the legend at
  `time—altitude—`; the identical drag through `page.mouse` fills it with `time 47.14 s /
  altitude 6,402`. **Reading a value at a time is what a chart is FOR at the range**, `DESIGN.md`
  §8 forbids a hover-only state outright, and an empty legend sitting there advertising the
  feature is worse than not offering it. The same walk found no keyboard path to a chart readout
  either — no `role`, `tabindex` or focusable element inside any plot on either surface, while the
  ground-track canvas beside them has `role="img"` and `tabindex="0"`.

  **Touch targets that are genuinely under 44 px — 11, not the 22 a naive sweep reports.** The
  walk measured `::after` as well as the box and checked occlusion (0 of 124 controls had their
  centre stolen by a neighbour), so these are the honest survivors:
  - ~~**`input[type=color]` ×3 at 12×44** in the figures panel.~~ **FIXED** — the tap target moved
    to a wrapping `<label>`, which is the only place it could go. A colour input is a REPLACED
    element, so it cannot generate an `::after` at all (measured 0×0) — `.touch-area` could not
    rescue these even if applied, and only `globals.css`'s coarse `min-height` lands. The
    documented gesture on them is double-click-to-reset. This one needs a different control, not
    a bigger box.
  - the footer's observance link at **92×16**, because `globals.css:92`'s `footer p a
    { padding-block: 0 }` explicitly cancels the floor for footer prose — and this one is a live
    external helpline, not decoration;
  - `← Back to Debrief` on the three docs routes at **102×16**. `globals.css:85` justifies the
    small in-prose links on the grounds that each has a nav-sized twin; this is a navigation
    control and has none;
  - the footer's `Privacy` link at **42×44** — the one footer link that is site navigation, two
    pixels short on one axis.

  **Hover-gated affordances that do not exist on a phone. ~~The sort arrow~~ FIXED; the new-tab
  cues stand.** `CompareView.tsx:922`'s sort arrow was `opacity-0 group-hover:opacity-40`, and
  `(hover: hover)` is false at 390 — so every non-active column header rendered its arrow at
  computed opacity 0 and **nothing on a phone said the table sorted at all**. It now carries
  `pointer-coarse:opacity-40`, pinned in `e2e/touch.spec.ts`. `SiteFooter.tsx:66` and `FusionSpaceBadge.tsx:27` hide their `↗` new-tab cue the
  same way; cosmetic, but it is the whole cue.

  **The docs routes have no way to navigate them.** `/methods` is **30,707 px — 36.4 screens —
  with 48 `h2` sections and `querySelectorAll('a[href^="#"]').length === 0`**: no contents list,
  no jump links, no back-to-top. `/validation` is 17.0 screens and `/privacy` 5.1, both the same.
  The report's `?` deep links do land correctly (`#apogee` at y=5074), so the anchors exist and
  nothing surfaces them.

  **The answer is below the fold, behind the things you do after reading it.** At 390 px with a
  flight loaded: header 279 px, then 15 Copy/Print/Save controls from y=663, and **Apogee only at
  y=1380** — 1.64 screens down; the first chart is 4.9 screens down against 2.7 at 1440. The
  desktop walk measured the same shape independently: 22 export controls above the first number,
  APOGEE at y=919 and below the fold at 1440×900. AltosUI puts apogee and max speed on screen
  immediately.

  **Measured CLEAN, and worth keeping so a later run does not re-derive it:** zero controls that
  render at 1440 and not at 390 (161 vs 161 on the report with every disclosure forced open, 120
  vs 120 on `/compare` with four corpus flights — `/compare` paginates columns with a sticky first
  column rather than dropping anything); zero horizontal body scroll on all six routes, including
  `/methods` at 36 screens; and **offline is better than the promise** — after visiting only `/`,
  `debrief-runtime-v1` holds 39 entries and all six routes return 200 with full content offline,
  the sample flight parses and renders with no network, and there were zero failed requests or
  console errors.

- **2026-08-02 — a real Blue Raven serial log publishes a 31 ft apogee for a 6,939 ft flight, and
  says nothing.** `blueraven__issuiuc-sg1.2-20231118__…BlueRaven-Low.txt`. The corpus already
  carries this as a `knownIssue` ("raw ISSUIUC @LOG_LOW space-delimited log misparses to ~31 ft …
  true apogee ~6939 ft (TeleMega)", noted `PARSER BUG CANDIDATE`), so the gap is documented — but
  the documentation is in the corpus and the **31 ft reaches the flyer as an unqualified reading**,
  and `/compare` then headlines "differ by 177% on apogee" against the TeleMega on the same
  airframe.

  Measured this run, and it sharpens the diagnosis: the `Bo:` pressure token spans only
  **48821–48897 of 50000 (0.9764–0.9779 atm) across the entire record** — flat to 0.15%, worth a
  few tens of feet. So the 31 ft is a *faithful* read of a barometric channel that does not
  contain the flight. Meanwhile the same lines' `Pos:` tokens span −3143..9, −13..5405 and
  −308..3495, so the file plainly holds thousands of feet somewhere the parser is not reading.
  Two candidate fixes, and they are not the same work: read the serial format's inertial position
  properly (a parser fix, D-track), or refuse to publish an apogee whose own record cannot support
  it. **The second SHIPPED 2026-08-02** — a record whose climb takes more than four times a
  vertical throw to the same height now says so, bound measured across the corpus (worst real
  flight 1.52, this file 22.2), pinned by `lib/analyze/ascent.test.ts` which asserts the tripped
  set BY NAME. **The parser half is still open and is the one that would recover the real 2,115 m**
  — the `Pos:` tokens on those same lines span −3143..9, −13..5405 and −308..3495, so the height is
  in the file somewhere the parser is not reading.

- **DONE 2026-08-02 — a StratoLogger column whose every cell reads `58.7F` was prefilled as C, and
  it was a CASE MISMATCH, not a missing inference.** Walk B measured GROUND TEMP **138 °F** on
  `perfectflite__…StratoLogger1.txt`; 58.7 read as Celsius is 137.66 °F, so the walk's number is
  exactly this defect. Reproduced before scoping, and reproducing it moved the fix: `unitFromCells`
  was reading the in-cell `F` **correctly** all along and resolving it to the canonical `'f'`.
  `ColumnMapper.rowFor` then tested `unitOptionsFor('temperature').includes('f')` against
  `['C','F','K']` — spelled for a reader — which is false, so it fell through to `options[0]`.
  Temperature is the only role it could bite, being the only one whose options are not already in
  canonical spelling, which is why nothing else showed it.

  Fixed in `lib/flight/mappingOptions.ts` as `prefillUnit`, matching case-insensitively and
  returning the option list's OWN spelling, so what is stored is always a string the `<select>`
  offers and `build.ts` can look up. The fix is there rather than in a re-spelling of that one
  list, because the next role added with a capital in it would do the same thing silently.

  **The compounding half is closed by the same change** — a saved template replays its stored unit
  through the same path — **and one more site was found while fixing it**: `setRole` reset to
  `options[0]` whenever a flyer corrected a role by hand, throwing the file's own unit away one
  interaction later. It now prefills from what that column actually said. Pinned by five cases in
  `lib/flight/mappingOptions.test.ts` and by `e2e/mapper.spec.ts` → *"a temperature the file states
  in Fahrenheit is not preselected as Celsius"*, which also re-picks the role. Two mutations run;
  restoring the case-sensitive test turns three unit cases and the e2e red.

- **2026-08-02 — a launch day cannot be fed in one pass.** The drop zone takes 6 files and
  **discards the rest outright** — drop 14 and it reads "Showing 6 of 14 files" with the other 8
  neither parsed nor kept nor logged. And a multi-drop where only one file parses names the
  unmapped ones in prose with **no Map button anywhere**, though `/compare` renders those buttons
  on the same condition; the only exit is to go back and feed each file alone.

- **2026-08-02 — a comparison is destroyed by a reload, and a single report is not.** `/compare`
  only gains an address if the flyer notices and presses "Give this comparison an address →";
  a report gets its `?open=` automatically. Reload or Back and the whole reconciliation is gone.
  "← Back to a single flight" is the same trap: it wipes every parsed flight and returns to the
  drop zone rather than to a flight.

- **2026-08-02 — the summary exports paste as text, never as numbers.** "Copy table" on the report
  yields `Apogee\t6,933 ft`; on `/compare`, `Apogee\t31 ft\t6,933 ft\t10,086 ft\t177`; the logbook
  copy heads a column `Apogee (ft)` and still puts `10,086 ft` in the cell. Every value carries a
  thousands separator and a unit suffix, so a six-flight table needs ~30 cells cleaned before it
  computes. **`compare-data.csv` inside the bundle IS clean numeric**, so the summary copies are
  the outlier rather than the rule. Worse, a withheld value's PROSE lands in a numeric column:
  `Max velocity\twithheld — the speed this trace gives is not physically possible`.

- **2026-08-02 — smaller things the walks measured, each with its site.** The logbook's sort order
  is the one control that forgets (no `localStorage` key, where units, chart channel, report
  label, comparison label and column order all persist). The report gives two clocks for one event
  with nothing labelling either — metric grid "19.3 s to apogee" against event chip "Apogee
  21.3 s", burn time 6 s against a burnout chip at 8 s. The flight-timeline strip is captioned
  "19.3 s liftoff to the end of the record" on a record that runs to 32 s, and spans only
  Boost+Coast while the descent is analysed below it. "Too big to link" is an enabled control that
  no-ops for every real log. A typed export label never reaches the filename. `Δ` is used as a
  stats-table column head and defined nowhere. Max-Q is shown in psi where every sim a flyer
  cross-checks against reports psf. Rail exit reports a speed off a silently defaulted 8 ft rail
  in the same voice as the measured readings.

- **2026-08-02 — meraki logs a board-MEASURED roll rate that Debrief still ignores while
  publishing the integrated angle beside it.**
  `blueraven__reddit-meraki2-121km__BlueRaven-LR.csv` column 99 is `Roll Rate (HZ)`, 36,700
  samples. `lib/parsers/blueraven.ts` maps no rate column, so Debrief now shows the drift-prone
  DERIVED quantity from that file and drops the direct measurement in it. The unit path is ready —
  `hz` resolves to `rev/s` as of this run — so this is a mapping and a `railed()` flag away.
  **When it lands it must carry the saturation**: the column holds at exactly ±6.38889 rev/s
  (2,300 °/s) for 46 of its 36,700 samples, so the rate is a floor and so is the angle built from
  it. The other three Blue Raven LR files have no rate column, which is why the corpus assertion
  in `blueraven.test.ts` says "no rate INVENTED from the angle" rather than "these flights have no
  roll rate" — do not read that line as a decision against this.

- **2026-08-02 — a header unit Debrief cannot resolve becomes the mapper's FIRST unit option, and
  the flyer is never told.** This entry's first version blamed `unitFromHeader` returning null and
  called the column "assumed canonical"; a review corrected it and the real mechanism is worse.
  `rowFor` in `components/ColumnMapper.tsx` does `wantUnit && units.includes(wantUnit) ? wantUnit :
  (units[0] ?? '')`, so when the header's unit does not resolve the UI **positively selects** the
  first option and submits it. `buildFlight` then converts faithfully against a unit the file never
  stated, and no "unrecognized unit" note fires because from the builder's side nothing was
  unrecognised.

  Found via `Roll Rate (HZ)`, where the first option is `deg/s` and 6.4 rev/s would print as
  6.4 deg/s — 360× low. Fixed for Hz by adding the alias; **the shape is general and the blast
  radius is every mapped role**: an unresolvable header unit silently becomes `ft` for altitude,
  `m/s` for velocity, `Pa` for pressure, `C` for temperature. The honest fix is for the mapper to
  distinguish "the header stated no unit" from "the header stated one I could not resolve" and to
  say so at the field rather than choosing for the flyer.

- **2026-08-02 — `lib/flight/build.ts:87` resolves the TIME column's unit with no quantity check.**
  `resolveUnit(timeMap.unit ?? 's')` is not guarded the way the channel branch below it is, so a
  time column carrying a rotation unit would scale the whole clock by 360. Unreachable from the
  mapper, whose time options are `s`/`ms`/`min` — but `lib/reopen.ts:37` replays a STORED unit
  unvalidated, so a hand-edited or future-version mapping can reach it. Pre-existing; newly worth
  naming because adding the `hz` alias put a 360× factor within reach of it.

- **2026-08-02 — a saved mapping template or a remembered flight replays a stored role, so a
  correction to role DETECTION never reaches the flyers who already hit the bug.**
  `components/ColumnMapper.tsx:46` prefers a saved template over the fresh guess and
  `lib/mappingTemplates.ts` did not bump `debrief.mappings.v1`; `lib/reopen.ts:37` replays a stored
  mapping with `m.role as ColumnRole`, unvalidated. So a column remembered as `rollRate` stays
  `rollRate` — degrees published as deg/s indefinitely — for exactly the flyer the fix was for.
  Needs a storage version bump plus a re-guess-on-mismatch path; not attempted this run because it
  is a migration with its own failure modes.

- **2026-08-02 — `tilt` and `rollAngle` share one `°` axis bucket in the channel explorer.**
  `lib/explore.ts:75`'s `planAxes` groups by DISPLAY UNIT, so plotting both puts a 0–90° tilt and a
  cumulative roll that reaches 26,099° on the same scale and flattens the tilt to a line. Two
  channels in the same unit are not necessarily on the same scale.

- **2026-08-02 — the roll-angle caveat is emitted when the COLUMN exists, not when the channel has
  data.** `lib/parsers/blueraven.ts` pushes the note off `rollAngleIdx >= 0`, but
  `lib/explore.ts:239` drops an all-NaN channel, so a blank `Roll_Angle` column produces a sentence
  in "How this file was read" about a channel the flyer cannot see. The test covers column-absent,
  not column-present-but-empty.

- **2026-08-02 — nothing READS `rollAngle`, so no reading is grounded on it.** The channel is
  plotted and exported and that is all; `lib/analyze` computes no figure from it, although
  revolutions falls straight out (25,333° / 360 = 70.4 turns on meraki). The natural first reading
  is total revolutions, and it must be labelled a floor wherever the rate it came from saturated.

- **2026-08-02 — the corpus release CI fetches is three merged pull requests behind the fixtures
  repo, and `VERSION` cannot tell you so.** Measured in the attached checkout: `v1.0.0` and
  `v1.1.0` are **the same commit** (`c0cdd23`), `VERSION` reads `v1.0.0` at both tags AND at
  `HEAD`, and `HEAD` (`0e90bfd`) is 3 commits ahead of the tag `corpus.lock.json` pins. The diff
  is `.gitignore` plus **162 lines of `expected.json`** — `maxVelocity` and `maxAccel`
  assertions added by fixtures#3, none of which exist in the pinned release.

  So the local corpus is a **strict superset** of the one that gates CI: same files, more
  asserted. A local green is the stronger signal on those files, and CI cannot catch a
  regression the new asserts catch. The previous handoff read this as "not provably the same",
  which is true but understates it — the direction is knowable and it is this one.

  **Fixing it is an owner action**: cutting a `v1.2.0` corpus release and re-pinning
  `corpus.lock.json`. The MCP GitHub tools in this session are read-only for releases
  (`list_releases`/`get_latest_release` exist, no create), so a session cannot do it.

- **2026-08-02 — `useReturnFocus` names a contract it does not enforce, and one close path
  still drops focus to the body.** Both from the pre-push review of the commit that added it.
  - `dismiss()` no-ops silently when the trigger has unmounted. The hook's doc makes "the
    trigger stays MOUNTED" its central contract and nothing checks it, so the next call site
    that gets it wrong reproduces the exact bug the hook exists to prevent, now wearing a
    primitive's name.
  - `RecentFlights.tsx:159`'s `presentKey` disarm closes the panel without returning focus:
    open Clear on 3 flights, then press a row's ✕. The panel and the ✕ both unmount and focus
    lands on `<body>`. **Deliberately NOT routed through `dismiss()`**, and the reason is worth
    keeping: the effect also runs on mount, so an unconditional `dismiss()` there would steal
    focus on page load, and a conditional one would send focus to **Clear** — putting a
    delete-everything confirm one Enter away from a flyer whose last action was "remove one
    row". Dropping to body is bad; arming the irreversible control is worse. The right fix is
    for the row list to take focus after a removal, which is its own change.
  - The open-effect fires on any false→true transition and has no guard for a call site whose
    surface starts open; harmless at today's two, but it is a primitive now.

- **2026-08-02 — a recorded channel's label carries its unit, and the axis then prints the unit
  twice.** `lib/flight/build.ts` labels every mapped channel with the raw header, so the Blue
  Raven's angles reach the explorer as `Tilt_Angle_(deg)` and `Roll_Angle_(deg)` while ALSO
  carrying `unit: '°'` — the axis caption reads `Roll_Angle_(deg) (°)`. `DESIGN.md` §6 is
  explicit that the unit is never baked into the label string. Pre-existing on tilt and every
  other recorded channel; a `label` override on `ColumnMapping` would fix the whole class.

- **2026-08-02 — `lib/explore.ts:28`'s `display()` converts four units and passes every other
  through raw.** Only `m`, `m/s`, `m/s2` and `c`/`°c` follow the flyer's unit system; the
  default arm returns the canonical string unchanged. So a channel in any other unit is shown
  in the file's unit while the header, the report and the CSV beside it are in the flyer's.
  Degrees are correct by accident (an angle is an angle in both systems); a `rad`-valued
  column would not be.

- **2026-08-02 — three `ChannelKind`s can never be chosen in the column mapper, and a fourth
  class of them has no unit list.** `lib/flight/mappingOptions.ts:7`'s `ROLE_GROUPS` offers 12
  roles while `ColumnRole`/`ROLE_TO_KIND` support 15: `altitudeInertial`, `altitudeGps` and
  `satellites` exist as kinds and are unreachable by hand. Separately `UNIT_OPTIONS` has no
  entry for `tilt`, `rollAngle`, `latitude`, `longitude`, `altitudeGps`, `altitudeInertial` or
  `satellites`, so `unitOptionsFor` returns `[]`. For the angle kinds that is CORRECT and
  deliberate — there is no `angle` quantity in `lib/units.ts`, only `rotation`, which is a
  rate, so offering `rad` would store radians labelled `°`. Supporting radians means adding an
  angle quantity to the converter first.

- **2026-08-02 — one channel, two kinds: `Satellites` is `'other'` in
  `lib/parsers/featherweightGps.ts:102` and `'satellites'` in `lib/parsers/altosEeprom.ts:543`.**
  Any surface gating on `getChannel(flight, 'satellites')` is therefore right for one logger and
  wrong for the other.

- **2026-08-02 — a saved chart view can restore a DIFFERENT channel than the one it saved.**
  `lib/plotView.ts:51` keys a recorded channel by its LABEL (`l:${label}`) and `resolveView`'s
  Map at :58 keeps the LAST channel per id. A file with two identically-named columns (an empty
  header twice, or `Accel` twice) silently restores the wrong trace — a wrong-trace bug, not a
  missing-trace one.

- **DONE 2026-08-02 — the KML export drew the GPS track at BAROMETRIC height and said nothing.
  Reproduced first, and reproducing it changed what the fix was.** The filing assumed the height
  was WRONG. It is not: KML's `relativeToGround` means height above the ground, which is exactly
  what a barometric AGL series measures, and the barometer is the better vertical instrument. A
  receiver's altitude is measured above the ELLIPSOID and is a different quantity — measured over
  the corpus, the **nine** flights carrying both disagree by **197–1,771 m on average** and by up
  to **2,949 m**. Swapping to `altitudeGps` would have been a regression dressed as a fix.

  The real defect is the one the invariant names: a document that shows a trajectory drawn by two
  independent instruments — the receiver put each fix on the map, the barometer put it at a height
  — with the provenance stripped off. The KML now carries a `<description>` saying so, and says it
  differently where the flight also holds a receiver altitude that was NOT the one drawn, so a
  single-instrument file is not told about a disagreement it cannot have.

  The GPX's silence was the same defect in the other direction, and it stays silent for a stated
  reason: GPX elevation is defined as height above the ellipsoid, so writing Debrief's above-the-pad
  height into an `<ele>` would put a correct number under a label meaning something else. It now
  carries a `<desc>` saying it is a ground track and pointing at the KML — so the two exports of one
  flight no longer disagree in silence about whether the track has a height. Pinned by four cases in
  `lib/gps.test.ts`, three mutations run against them.

- **2026-08-02 — the design-system audit ran for the first time and returned 40 divergences.**
  `MAINTAINING.md` calls this "the audit that has never been run". The full ranked list is in the
  run's report; the ones worth naming here, none yet fixed:
  - **§2's colour-by-magnitude clause, twice.** **FIXED 2026-08-02** — both hues are neutral now and
    both surfaces carry the same ★, with every title and screen-reader string kept. Pinned by
    `lib/design-system.test.ts` → *"never carries a superlative in a semantic colour"*, which scans a
    symmetric window because the logbook's LEGEND writes the class before the word it explains and a
    forward-only scan called that site clean. The audit filed this defect THREE times over two runs
    at three different line numbers — `:647,658`, `:630,638` and once unnumbered — which is its own
    finding about a ledger that is appended to rather than searched.
    `RecentFlights.tsx:647,658` paints an
    **amber** ★ immediately left of the apogee and max-speed values to mark a personal best —
    and §2 gives amber one meaning, "an estimate outside its envelope, an extrapolation, a
    caveat", so the glyph reads as a caveat on the number it is praising. `CompareView.tsx:931`
    recolours the winning cell `font-semibold text-indigo-600`, and indigo is §2's
    interactive/selected. **The audit's wording overstated the second one and the correction
    matters**: it said "every comparison row", and it is only rows marked `rank: true` in
    `lib/report.ts` — apogee, velocity, Mach, acceleration, max-Q — with `rankBlocked`
    withholding the crown on a clipped peak, a floor apogee or a mixed source. Descent rates,
    burn time and flight time carry no crown at all. So the basis §2 asks for is there; what is
    off is the HUE, on both surfaces.
  - **Seven byte-identical hero readouts** (`DeployAltitude:84`, `DragCoefficient:147`,
    `DrogueCd:109`, `EjectionDelay:70`, `LandingEnergy:114`, `ParachuteCd:107`, `RailExit:110`)
    where `Readout size="hero"` renders the identical string. They differ from the primitive
    only in laying the sub BESIDE the value instead of under it, and in having no label — the
    card's own title is the label. `GroundTrack.tsx:731`'s `Stat` is an eighth, stacked, and it
    is missing `tabular-nums` on the walkback figures and uses `text-[11px]` for a label where
    `Readout` uses the caption size.
  - **`Disclosure` is hand-rolled twice** — `LogDetails.tsx:28` and `app/page.tsx:21`, the
    second on the app's first screen, both byte-identical to the primitive.
  - **`Segmented`'s selected pill is `dark:bg-zinc-700`** (`ui.tsx:391`), off the three-surface
    ramp, and every adopter inherits it — the one place a drift cannot be contained.
  - **16 panel headings hand-rolled** as `text-sm font-semibold` while `Card`'s own `title` slot
    renders `text-base font-medium`; the report shows both on one scroll.
  - **`ChannelExplorer.tsx:248` and `GroundTrack.tsx:466` return `null`** with no empty or error
    state — §5's "a surface with no empty state is not finished".
  - **`ChannelExplorer.tsx:452` sets `focus:outline-none` with no replacement ring**, unlike
    every other input in the app.

- **2026-08-02 — the competitive probe verified the fact D8 slice 1 assumed away, and it is good
  news.** Slice 1 refused to map any axis to `accelAxial`/`rollRate` because "the board is
  mounted differently in different rockets". The Blue Raven's own manual states the board
  resolves this itself: *"The Blue Raven can be mounted in any orientation, and so it measures
  which direction, relative to its sensors, is the rocket axis by measuring the direction of the
  initial motion while the rocket is on the rail."* AltosUI names its axes in the BODY frame
  (`Roll Rate`, `Accel Along`, `Accel Across`, `Accel Through`) because Pad Orientation is a
  required board config it can read. Debrief has neither input wired — but for Blue Raven the
  mounting is knowable, which is a route out that slice 1 believed did not exist.

  Also verified and unbuilt: **Debrief is the only tool holding both a board-reported tilt and an
  independent quaternion series on one clock**, so it is the only one positioned to cross-check a
  derived attitude against the board's own. AltosUI derives tilt with nothing to check it
  against; the Blue Raven reports tilt and exposes no derivation.

- **2026-08-02 — §8's touch floor: 3 plain `<a>` elements are genuinely under 44 px, not 20.**
  **This entry CORRECTS its own first version, which said 20 and was wrong by 4x** — it is left
  standing rather than deleted because the way it was wrong is the reusable part.

  Measured on the built export at a 390 px viewport with a flight open, counting the EFFECTIVE tap
  target rather than the element's box: **15 of the 20 are already compliant** through
  `app/globals.css`'s `.touch-area`, which centres a 44x44 `::after` on a control "so the target is
  44 px while the ink is not — the standard way to do this without moving anything". A
  `getBoundingClientRect()` sweep cannot see that, and counted every one of them as a defect.

  **Two measurement traps, and a run that hits both reports 119 where the answer is 3:**
  Playwright's default context is `pointer: fine`, so the coarse-pointer floor over `button`,
  `select`, `[role="button"]` and `input` does not apply at all (119 -> 20 with
  `test.use({ hasTouch: true })`); and the element box is not the tap area (20 -> 5 once `::after`
  is read).

  **What genuinely remains, all plain `<a>` — the elements the CSS block deliberately does not
  reach, and what `TOUCH_TARGET` exists for:** `components/MethodsPointer.tsx` at 18 px (**fixed
  2026-08-02**); `components/SiteHeader.tsx:14`'s "Compare" nav link at 18 px; and
  `components/SiteFooter.tsx:91`'s observance link at 16 px. **The last two are NOT fixed here on
  purpose** — §10 makes the header/footer/nav pattern shared and non-negotiable across both repos,
  so a one-sided edit forks it. Owed to a run that can push Loft as well.

  Not defects, checked rather than assumed: the report's "Label" and "Notes" `<label>`s measure
  16 px, but each captions an `<input>` sitting directly below it that the coarse-pointer floor
  already takes to 44 px. Growing the caption would add 28 px of dead space above every field.

- **2026-08-02 — a "best" cell in the comparison wears the ACCENT colour, which §2 reserves for
  interactive.** `components/CompareView.tsx:931` renders the row's highest value
  `font-semibold text-indigo-600 dark:text-indigo-400`; §2's table gives `indigo` one meaning —
  "interactive, selected, the focus ring" — and a table cell is none of those. Reproduce: open
  `/compare` with any two flights and look at one cell per row. **Not a safety issue and NOT the
  "never colour a number by whether it is large" clause** — the ranking is legitimate, computed as
  `row.best`, blocked where methods differ, and already announced `sr-only` as "(highest)". It is a
  token misuse: `font-semibold` alone already marks it, and §3 gives that weight exactly this job.
  One line, deliberately not taken this run because it is churn beside the item-2 work above it.

- **2026-08-02 — a leaderboard is painted in the CAVEAT colour. FIXED 2026-08-02**, same day, with
  the comparison table's indigo crown beside it — see the design-system audit entry above for the
  check and the falsification. `components/RecentFlights.tsx:647`
  and `:658` mark the fastest and highest flights with a `text-amber-500` star. §2 reserves amber
  for `warn` — "an estimate outside its envelope, an extrapolation, a caveat" — and `KofiButton`'s
  own docblock cites that rule. Spending the caveat colour on a leaderboard is what makes a real
  caveat stop reading as one. Reproduce: scroll the logbook with three or more flights.

- **2026-08-02 — three more decision-grade numbers are still at a size §3 reserves for axis ticks.**
  `components/RecordingPicker.tsx:81` and `components/FlightPicker.tsx:71` render each recording's
  apogee and max velocity at `text-[11px]` — these are the numbers a flyer picks WHICH INSTRUMENT TO
  TRUST by — and `components/GroundTrack.tsx:542` puts the walkback distance and bearing at
  `text-xs`. Same class as the events grid fixed 2026-08-02 under P1 item 2, and the next instances
  of it. Reproduce: open a flight with two recordings, then tap the ground track.

- **2026-08-02 — three label/value tile treatments exist for one thing.** `GroundTrack.tsx:724`'s
  `Stat` and `LogDetails.tsx:36` each hand-roll what `Readout` is (§5), both at `text-[11px]` label
  size and neither with `tabular-nums`, one scroll apart from `MetricGrid`'s tiles on the same
  report. Reproduce: open a GPS flight's report and compare the map's stat tiles, the metric grid
  and "Log details".

- **2026-08-02 — REFUTED, recorded so it is not re-filed: `DataTable`'s empty state.** Its default
  string is "Nothing to show yet.", which the prop's own doc forbids by §5, and no call site passes
  `empty`. But the state is UNREACHABLE at both call sites: `DeviceSummary` is rendered only inside
  `flight.reported && flight.reported.length > 0` (`FlightReport.tsx:1044`) and `GpsApogee` returns
  null without a GPS fix and passes a literal one-row array. `Figure` already settled this shape —
  a guard that fires on nothing is worse than none. Do not build it without a call site that reaches
  it; the honest fix if one ever appears is to make `empty` required.

- **2026-08-02 — the serial `@ LOG_HIR` high-rate capture is still refused, deliberately.**
  `blueraven__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-BlueRaven-High.txt` is the fifth
  high-rate file in the corpus and the one D8 slice 1 does not read: its columns are unlabelled
  positional tokens, and reading them would be a guess at the vendor's field order. The Sept 2025
  manual documents the field order for the phone-app export; if it also documents the serial
  stream's, this becomes readable and the entry can close.

- **2026-08-02 — Altus Metrum's EasyTimer has no barometer at all, and AltosUI analyses its logs.**
  `lib/analyze/index.ts:1162` throws "This file has no altitude or pressure data to analyze", so
  Debrief treats altitude as mandatory where the field's leader treats it as optional
  (<https://altusmetrum.org/AltOS/doc/altusmetrum.html>). Not a defect today — no corpus fixture is
  a baro-less board — but it is the assumption D8 slice 1 had to work around, and the reason the
  high-rate stream can never be a logbook row of its own. Worth a fixture before it is worth a fix.

- **2026-08-01 — "Burn time" on the corpus's staged flight is 23.9 s, of which 15.8 s the motor was
  not burning.** `lib/analyze/index.ts:2666` defines `burnTime` as `time[burnoutIdx] − liftoffTime`,
  which is the span from liftoff to the end of powered flight — the same number as the burn
  duration on every flight with one continuous burn, and not the same number on a staged one.
  Measured on `altusmetrum__reddit-meraki2-121km__Mega38-1_TeleMega.csv` (manifest: **O7800 booster
  + N3100 sustainer**): two ascent thrust runs on the signed axial channel, **T+0.00–4.46 s and
  T+20.25–23.83 s**, so 8.04 s under thrust across a 23.91 s span. The tile reads "Burn time 23.9 s
  — derived from the speed peak", which says how the instant was found and not that two thirds of
  the span was a coast. `avgBoostAcceleration` is averaged over the same span and so is diluted by
  it (138.5 m/s² reported). **Reproduced by me**, twice: the thrust runs against the file's own
  axial trace, and the ignition itself — the axial steps −15.7 → +92.7 in one 0.25 s sample and
  peaks at 549 m/s² while the speed goes 427 → 1,663 m/s.
  **Not fixed, and the blocker is stated rather than glossed:** `iss-endurance`, a single-motor
  flight, also produces a second run (T+5.65–6.95, peak 80.7 m/s²) inside a stretch where the
  record repeats a sample and its altitude goes backwards. A detector separating one example from
  one example is fitting, not measuring. What would settle it: a second staged record in the
  corpus, or endurance's second run corroborated or refuted against its StratoLogger. `ROADMAP.md`
  D7 carries this as the next slice.
- **2026-08-01 — `dark:bg-zinc-800` is a FOURTH dark surface level and `ROADMAP.md` P1 item 3's
  census says it is not.** That entry records the post-sweep state as `dark:bg-zinc-900` ×52,
  `dark:bg-zinc-900/50` ×8, "everything else 0". Measured now with
  `grep -rohE 'dark:bg-zinc-[0-9]+(/[0-9]+)?' components app | sort | uniq -c`: `zinc-800` ×2
  (`FlightReport.tsx:773`'s section-nav active chip, `DeviceSummary.tsx:115`'s "consistent"
  agreement chip), `zinc-700` ×1 (`ui.tsx`'s `Segmented` active thumb) and `zinc-100` ×1
  (`SiteHeader`'s inverted active nav pill). The sweep was scoped to the `/40`, `/30` and `/60`
  opacity forms, so it could never see a bare shade — and the `Segmented` one is inherited by all
  five adopters, which makes the off-system surface the most-rendered one in the app. Item 3's
  claim is corrected in `ROADMAP.md` in the same commit as this entry. Not reproduced beyond the
  grep.

  **Re-measured 2026-08-03 and the total is unchanged at ×2, but one of the two MOVED and that is
  the interesting half.** `DeviceSummary.tsx:115`'s "consistent" chip no longer carries
  `dark:bg-zinc-800` — it took §5's `Chip`, and the shade went INTO `CHIP_TONES.default`
  (`ui.tsx:765`). So the census now reads `zinc-800` ×2 (`FlightReport.tsx:783`'s section-nav active
  chip, and the primitive), `zinc-900` ×38, `zinc-900/50` ×8, `zinc-950` ×6, `zinc-700` ×1, and
  `zinc-100` ×1. **The off-system shade is now MORE rendered, not less**, since every `default` chip
  inherits it — the same "inherited by all five adopters" shape this entry already names for
  `Segmented`. It is also now deliberate and documented: a `default` chip must NOT share a fill with
  any `CARD_TONES` entry or it renders as a bare outline against its own container, which is pinned
  by a test asserting that relationship. **So the open question this entry raises has an answer for
  the chip and not for the others**: if §2 wants a sanctioned raised-on-sunken fill, `zinc-800` is
  what two independent surfaces picked, and naming it as a token would close both remaining uses.
- **CORRECTED 2026-08-02, hours after being filed — neither "vanishing surface" is what it was
  filed as, and both were written from reading the code rather than driving it.** This is the
  failure `MAINTAINING.md` warns about ("a finding is a claim until you have seen it yourself"),
  committed by me and caught by trying to reproduce before scoping a fix. Corrected in full rather
  than deleted, because the next session would otherwise re-derive both:
  - **`ChannelExplorer.tsx:248` is NOT a one-way door.** The entry claimed a flyer reaches
    `selected.length === 0` by unticking every channel. They cannot: `:332` renders the remove
    control behind `selected.length > 1`, so the last channel has no ✕. And `yKeys` is
    `useState(channels[0] ? [channels[0].key] : [])` — seeded from the flight's OWN channels on
    every mount, never persisted — so a stale selection cannot empty it across flights either.
    `buildPlotChannels` emits altitude, raw altitude and velocity on all 48 analysable corpus
    files, so `channels` is never empty in practice. The `return null` is unreachable.
  - **`GroundTrack.tsx:466` is narrower than filed.** `FlightReport.tsx:1391` only renders the
    component when `gpsLat && gpsLon` exist, so a baro-only log does not hit that `return null` —
    the surface is absent because the flight has no GPS, which is a different thing from a surface
    that disappears. The reachable case is GPS columns PRESENT but unusable (all-NaN, or a fix that
    never resolves), and **whether any corpus file reaches it is unmeasured.** Measure before
    building.
  - **What survives from both, and it is a real product question rather than a defect:** a flyer
    whose board recorded no GPS is never told the recovery surface exists. `MAINTAINING.md` names
    "a feature reachable only by knowing it is there" as a tell. That is P3 or P1 item 5 work, and
    it is about ABSENCE, not about a vanishing panel.
- **2026-08-01 — `components/GroundTrack.tsx:466` returns `null` when there is no GPS fix**, so on a
  baro-only log the whole recovery-map surface — ground track, walkback distance and bearing, wind
  aloft — is not merely empty, it does not exist and nothing on the page says the feature is there.
  `DESIGN.md` §5: "a surface with no empty state is not finished; it is the state a flyer sees
  first." Reproduce by opening any StratoLogger or Eggtimer corpus file and searching the report
  for "Ground track". P1 item 5's most visible instance.
- **2026-08-02 — the site header's nav links are 58×18 px on a phone**, measured at a 390 px
  viewport with `hasTouch: true` on the built export. `components/SiteHeader.tsx:14` renders them as
  plain `<a>`s, and `app/globals.css`'s `@media (pointer: coarse)` floor covers `button`, `select`,
  `[role="button"]` and `input` — **not a bare `<a>`**, which is exactly the gap `components/ui.tsx`
  records as the reason `TOUCH_TARGET` exists on the primitives. So the one control present on
  EVERY route is the one furthest under §8's 44 px minimum, and it is 18 px tall against a 44 px
  contract. Reproduce: serve `out/`, open any route at 390×844 with touch, measure `header a`.
  Distinct from the 27 `<label>`s the previous run filed — a label wrapping a 44 px control is still
  tappable through the control; a nav link has nothing inside it. P4's first real finding, and it
  is a `SiteHeader` change owed to both repos under §10.
- **FIXED 2026-08-02 — `NumberField` exists, and the defect was not the missing bound.** Every
  panel already clamped; the clamp was SILENT. A typed 50,000 ft became 29,528 with nothing saying
  why. Six of the seven same-shaped inputs are on the primitive, which states the bound where the
  flyer is typing and announces it when they cross it. **The implementation detail that cost a
  build:** these fields are controlled by the already-clamped value, so a bound read off `value` can
  never fire — the primitive has to keep what was typed. Caught by the e2e, not by review or the
  type-checker. `Figure` and `Panel` from the entry below are still absent.
- **2026-08-01 — three of `DESIGN.md` §5's named primitives do not exist at all**, and each has a
  duty the section assigns it. `NumberField` — "every numeric input in either app is this", and it
  owns the SAFETY refusal — is hand-rolled at **9 sites** (`grep -rn 'type="number"' components`),
  each re-deriving its own bound: `DeployAltitude.tsx:68` silently `Math.min`s to
  `MAX_REASONABLE_DEPLOY_M` while `DragCoefficient.tsx:125` only sets `min={0}`. `Figure` — a chart
  with its own empty and extrapolated states — is absent, and `Chart.tsx` renders a bare uPlot with
  none of the five states, so a short or failed series draws a blank canvas saying nothing.
  `Panel` — a dismissible `Card` that "owns focus return (see `useReturnFocus`)" — is absent, and
  `grep -rn 'Panel|useReturnFocus' components app` returns 0 while `UnitsControl` and
  `FigureChooser` each hand-roll their own. These are P1 scope, recorded here so the measurement is
  not lost.
- **2026-08-01 — decision-grade numbers still render at caption size on six surfaces**, which is
  the specific breach `DESIGN.md` §3's floor exists to stop, and the §9 inverted-FILES count cannot
  see any of them because each file's captions legitimately outnumber its body text. Measured:
  `FlightReport.tsx:1324` (event times, altitudes, ejection shock — `font-mono text-xs`, no
  `tabular-nums`), `GroundTrack.tsx:700` (wind aloft, read layer against layer),
  `GroundTrack.tsx:542` (the scrub readout's distance and bearing from the pad — what a flyer walks
  on), `GroundTrack.tsx:720` (`Stat` hand-rolls `Readout` at `text-[11px]`),
  `FlightTimeline.tsx:93` (phase descent rates, compared row to row), and `FlightPicker.tsx:71` /
  `RecordingPicker.tsx:81`, where the apogee is at `text-[11px]` — two sizes below the floor, in
  the two controls whose entire job is choosing which recording to trust.
- ~~**2026-08-01 — `Chip` has 3 adopters against ~31 chip-shaped hand-rolls**~~ (`rounded-md border`
  with `text-xs` or `text-[11px]`, outside `ui.tsx`), so §5's chip is effectively unadopted;
  `RecentFlights.tsx:629`'s format label at `text-[11px] px-1.5 py-0.5` is the worked example
  against §5's `text-xs rounded-md px-2 py-1`.

  **MOSTLY DONE 2026-08-03 — `Chip` 3 → 7 adopters, and the ~31 was measuring something looser than
  it sounds.** A scanner requiring all four of `rounded-*` + `border` + `px-*` + caption size, over
  `<span|li|div>` opening tags, found **12** hand-rolled chip-shaped elements, not ~31 — the older
  figure counted class-string occurrences rather than elements, and matched partial shapes. Seven
  converted. **Five remain and each is named with a reason** in `lib/design-system.test.ts`'s
  `DELIBERATE` list, so this is now an allowance rather than a backlog: two are inline notices
  holding a paragraph (not tokens), two are `text-[11px]` dense-list tokens whose conversion is a
  product decision about logbook row density, and one wants `Chip` to take an `as` prop — filed
  separately under *Craft & product feel*. The worked example this entry names,
  `RecentFlights`'s format label, is one of the two dense-list ones and is deliberately still
  hand-rolled. Related, and still open: `text-[11px]` has **12 non-chart uses
  across 8 files**, where §3 restricts it to axis ticks and diagram annotations — the smallest size
  in the system is being normalised as a general caption size, which is how a seventh size arrives.
- **2026-08-01 — two controls reach past the primitive that covers them.** `RailExit.tsx:94` uses a
  native `<select>` for the 5 rail lengths in `lib/rail.ts` where §5 says `Segmented` is "preferred
  over a select" at 2–5 options and the app already has 5 `Segmented` adopters; and
  `ChannelExplorer.tsx:33` declares a file-local `SELECT` class constant used at :346 and :379 —
  the same shape as the `ACTION_BTN`-declared-in-six-files finding P1's opening audit killed, now
  restarting for selects, because there is no `Select` primitive.
- **2026-08-01 — "a cert document" is the wrong framing for anything staging-related, and two
  primary sources settle it.** NAR: "Multiple stage and clustered rockets are specifically
  disallowed for certification flights"
  (<https://narocket.clubexpress.com/content.aspx?page_id=22&club_id=114127&module_id=673325>).
  Tripoli: "Staged or Clustered rockets may not be used for certification flights"
  (<https://tripoli.org/content.aspx?page_id=22&club_id=795696&module_id=479470>). A staged
  flight's figures are for a club post, a build thread or a records claim — never a cert package.
  Recorded because the composite surface's own copy and `ROADMAP.md` D4 both reach for the cert
  framing, and it is simply not a use that exists.
- **FIXED 2026-08-01 — `apogeeIsFloor` was computed and then dropped by three exporting surfaces.**
  `lib/analyze/types.ts:27` defines it; a record whose log ends at its own peak reports a LOWER
  BOUND, and `apogeeSub` has always said so on screen and in the text exports. But `jsonMetrics`
  omitted it, so `analysisJson` and `compareJson` emitted a flat `apogee` a cert document could not
  tell from a measurement; `flightCard.ts` printed Apogee bare on the artefact built to be posted
  to a club chat, beside a velocity it already qualifies as "derived" and an acceleration it
  already qualifies as "may be clipped"; and the comparison's Apogee row carried `rank: true` with
  no `rankBlocked`, so a floor could take the "highest" crown from a settled reading. **Reachable
  on real files: two corpus records** — `issuiuc-intrepid1` (996.2 m) and `issuiuc-intrepid2`
  (1,081.6 m). Fixed by mirroring the `accelerationClipped` / `anyClipped` conventions that were
  already there for the sibling caveat. Pinned in `lib/report.test.ts` and `lib/flightCard.test.ts`,
  three mutations, each red.
- **FIXED 2026-08-01 — `jsonMetrics` omitted `maxVelocityWithheld`**, so a withheld peak exported
  as `maxVelocity: null`, which `lib/analyze/types.ts` says is "the only case where 'not in this
  log' is true". A refusal and an absence were the same JSON, and the type had already written down
  why that is actively wrong: 'gap' and 'implausible' are "Debrief declining to report a number
  from data that IS there". The key now rides with its value, like `apogeeIsFloor` and
  `accelerationClipped`. Pinned in `lib/report.test.ts` across both reasons, falsified by removing
  the key.
- **2026-08-01 — `lib/gps.ts:189`'s `trackKml` substitutes 0 for any non-finite altitude sample**,
  so an altitude the analyzer WITHHELD exports as 0 m into a file a flyer opens in Google Earth.
  Not reproduced by me.
- **2026-08-01 — `burnoutVelocity`, `coastEfficiency` and `dragLossAltitude` gate on
  `velocityImplausible`, not on `series.velocityUnusable`** (`lib/analyze/index.ts:2665`, `:2527`).
  On a `gap` flight the headline peak is withheld while a speed read off the same trace is still
  published on the metric tile, the .txt/.md/.html row and the .json — and `dragLossAltitude` is
  printed as "N ft short of a drag-free coast", a drag figure, on the very flight where the new
  card says a drag figure is withheld. **No corpus record reaches this state today** (all 15
  withheld records are `implausible` or have no coast), which is why it was filed rather than
  fixed: a guard that fires on zero real files is worse than nothing until a fixture exists.
- **2026-08-01 — `RecentMeta` stores `apogeeM` with no provenance flag beside it**
  (`lib/recents.ts:15`, written at `lib/ingest.ts:168` and `Analyzer.tsx:271`). This BLOCKS putting
  each recording's reading on D6's "Reported by" control, which is where a flyer would most want
  it — a bare number there pushes them toward the larger of two figures when the larger may be the
  floor. Storing the flag is the prerequisite; note `lib/recents.ts` warns that three further
  rebuilds (`toMeta`, `serializeLogbook`, `normalizeFlight`) must each name a new field and fail
  SILENTLY if they do not.
- **2026-08-01 — `components/ui.tsx`'s `Segmented` root is `inline-flex` with no `max-w-full`, no
  wrap and no `overflow-x-auto`**, so any adopter passing an unbounded label scrolls the whole
  DOCUMENT sideways rather than the control. Measured at a 390 px viewport with a 25-character
  label: `document.scrollWidth` 423 px against a 390 px client, and 108 px over at body size.
  Debrief bounds the label at the call site instead, because the primitive's signature is shared
  with the sibling repo — **the hardening is owed to a run that can push both.**
- **2026-08-01 — five primitives `DESIGN.md` §5 declares as the vocabulary do not exist in
  `components/ui.tsx` at all:** `NumberField`, `DataTable`, `Panel`, `Tabs`, `Figure`. The nine
  hand-rolled `<input type="number">` across `DragCoefficient:125,142`, `ParachuteCd:96`,
  `DeployAltitude:69`, `LandingEnergy:104`, `EjectionDelay:60` and `CropControl` are what
  `NumberField` would collapse. Filed as one entry because the fix is one decision: build them or
  change §5, and §5 is owed to both repos either way.
- **2026-08-01 — `components/KofiButton.tsx:17` spends `amber` on a tip jar in the persistent site
  header.** §2 reserves amber for `warn` — "an estimate outside its envelope, an extrapolation, a
  caveat" — and says semantic colours are "never for decoration". Every other amber in the tree is
  genuinely semantic (`Card tone="warn"`, `Extrapolated`, `RailExit`'s stability caution,
  `GpsApogee`'s source-disagreement chip). A flyer learns amber means "this number is caveated";
  spending it on chrome devalues the one signal the safety posture leans on. `components/
  ThemeToggle.tsx:73` sits beside it hand-rolling `BUTTON_VARIANTS.secondary` at a different
  padding, so the two convert together or the header pairing breaks.

## SEV-1 — none open

- **FIXED 2026-08-04 (was Sev-1, live in production until PR #121 merges): thrust-to-weight was
  averaged over a COUNT OF SAMPLES, not over a window of time, so the figure quoted against the
  5:1 rail rule read up to 25% low and disagreed with itself across two exports of one flight.**
  `lib/analyze/index.ts` took `round(0.2 / dt)` samples where `dt` is the median interval of the
  *whole record* — and a flight log's rate is never one number: AltusMetrum writes the pad slowly
  and the boost fast, and the same board's `.csv` and `.eeprom` are written at different rates
  again. So "a moment off the pad" was 0.2 s on a uniform record and as little as 0.02 s on the
  rest, always short, always sampling before the motor was up to pressure.

  Measured over all 18 corpus flights that publish one, every single value moved **up**:

  | flight | published | correct |
  |---|---|---|
  | Kairos Booster `.csv` (median dt 0.04 s → 0.050 s window) | 4.98:1 | **6.44:1** |
  | Kairos Booster `.eeprom` (median dt 0.10 s → 0.020 s window) | 4.83:1 | **6.44:1** |
  | irec2023 TeleMega (0.05 s → 0.040 s window) | 9.49:1 | **11.95:1** |
  | irec2023 EasyMega, same airframe (0.01 s → 0.200 s) | 11.23:1 | 11.34:1 |
  | lilnuke 1785, one of four in one airframe | 14.48:1 | **16.30:1** |

  The Kairos row is the one that names the defect exactly: **one device, one launch, two export
  formats, two different published thrust-to-weights** — and the truth identical for both. The
  four-altimeter lilnuke group, the tightest corroboration in the corpus, tightened from a 17%
  spread to 5.6% as a side effect, which is independent evidence the new reading is the right one.
  Under a 5:1 rule this is the difference between a flight that passes and one that does not.

  Fixed by taking the window off the clock and time-weighting the mean (an index mean over a
  stretch whose rate changes weights the densely-sampled part — at liftoff, the part after the
  motor is already up). Pinned by two corpus invariants that both fail on the old code with the
  numbers above: two recordings of one launch must agree within 10%, and two exports of one
  recording within 2%. **The same index-mean-over-a-variable-rate-stretch shape sits on
  `avgBoostAcceleration` two lines away** — its window is the whole boost, so the window is right
  and only the weighting is in question.

- **FIXED 2026-08-04 (`#124`): `avgBoostAcceleration` averaged the boost over samples.** The window
  (liftoff → burnout) was always right and only the weighting was wrong; it is `timeMean` now.

  **The part worth keeping is how it had to be justified, because the obvious evidence was the
  wrong evidence.** The thrust-to-weight fix above was settled by corroboration — two exports of one
  recording published two ratios and the fix collapsed them onto one. The same check run here does
  **not** tighten: irec2023 2.2% → 2.2%, lilnuke 8.4% → 8.7%, stargazer1 17.2% → 17.2%. Chasing that
  last one found why, and it is a different finding: `stargazer1`'s two exports detect **burnout
  0.58 s apart** (4.190 s against 3.910 s) on *identical* peak acceleration, so they average over
  different windows — and `corpus.test.ts` already records that loggers legitimately disagree about
  where a burn ends. Corroboration could never have settled this.

  So the evidence is the definition. "The average acceleration over the boost" is `∫a dt / T`, the
  quantity that integrates to the burn's Δv; a mean of the samples answers a different question and
  coincides only under uniform sampling. Pinned analytically rather than against the corpus: a boost
  that ramps linearly, sampled ten times finer through its second half, where the time average is
  the ramp's midpoint exactly and a sample mean is dragged toward the top. The test computes both
  from the trace it built and asserts they are far enough apart to tell apart before asserting which
  one Debrief reports — **162.09 against the true 129.70** on the old code.

  *The original entry follows, for its numbers.*

- **`avgBoostAcceleration` averages the boost over SAMPLES, not over time — measured 2026-08-04 at
  up to 16%.** The remaining half of the Sev-1 above. The window (liftoff → burnout) is correct; the
  weighting is not, and the average acceleration over a burn is a TIME average — it is what relates
  to Δv, `∫a dt / T`. Measured by swapping `mean` for `timeMean` in place and reading the metric,
  which reproduces the analysis's own channel handling exactly; a first probe that reimplemented the
  channel read was inconclusive because it missed the gravity-add-back correction and reported the
  resulting one-gravity offsets as errors, which is worth recording as the way to get this wrong.

  | flight | index mean | time-weighted |
  |---|---|---|
  | `issuiuc-intrepid1` | 181.48 m/s² | **210.68** (+16.1%) |
  | `issuiuc-endurance` | 110.13 | 115.27 (+4.7%) |
  | `jimheaney` L1 group (×4) | 162–179 | +2.3% to +3.1% |
  | `issuiuc-kairos` sustainer | 77.27 | 78.81 (+2.0%) |
  | the other 17 | — | under 1.3% |

  Sev-2, not Sev-1: unlike thrust-to-weight this is not quoted against a range rule, and it does not
  disagree with itself across two exports of one flight. Its own increment when it ships, with the
  digest snapshot regenerated in the same commit — the same shape as the fix above.

- **FIXED 2026-08-01 (was Sev-1, live in production until PR #72 merges): five corpus flights
  published a drag coefficient and a Mach window off a velocity trace the analysis had refused.**
  `canMeasureDrag` asked about the altitude source and the coast geometry and never about
  `velocityUnusable`. The `issuiuc-kairos` booster published **Cd 0.00 over "Mach 9.90 – 23.10"**
  with its own Max velocity row reading *withheld* a few centimetres up the page; an L1 sport
  flight published **Cd 2.52** where the real range is about 0.3–0.75. Measured: 15 analysed
  records carry the flag, 5 have the coast geometry. Cd is v² in the numerator, so a refused trace
  does not soften the answer, it squares it. Rail-exit velocity had the same hole from the other
  side (`velocitySource === 'device'` only) — **latent, not live**: all 15 withheld corpus records
  are barometric. Pinned by `lib/drag.test.ts`, `lib/rail.test.ts` and a corpus invariant, each
  falsified by mutation. Walked on the built export of `0b87b17`: the panel now says *"Withheld…"*
  and **zero Mach claims appear anywhere on that page**.


- **FIXED 2026-07-31 (was Sev-1, and was OPEN for three commits of this same run):
  `perfectflite__issuiuc-endurance-20211030__StratoLogger.csv` stated Mach 1.19 and a Mach-1
  crossing 30.5 m off the pad.** It published **410.80 m/s (Mach 1.1875)** with `transonicTime = 0`
  and **max-Q 99.7 kPa**, from a peak **one sample (0.050 s) after liftoff** at **30.5 m AGL** — an
  implied mean acceleration of **398 g**. The **TeleMetrum on the same flight measured 315.08 m/s
  (Mach 0.93)**, subsonic, and `app/validation/page.tsx` already cited that exact pair as a baro
  trace that "stops being a reading of the speed at all". Same opening-transient pathology as the
  XPRS record (−31 → −27 → −14 → +9 → +30 ft), and `velocityPeakAtLiftoff` missed it by one index.

  **Fixed by widening the ascent-noise guard to the whole climb** — the change that had been
  reverted earlier in the same run on a measurement that turned out to be an artefact of a sweep
  skipping the eleven column-mapper records. What unblocked it was one small measurement, taken per
  record over all 50 by which warning fires: **`velocityOutclimbsItself` reaches ZERO corpus records,
  before and after.** The objection to widening was that it might shadow that guard on real files;
  it has no real-file coverage to shadow, because every record it would catch is already caught by a
  guard ahead of it in the chain. It stays as a backstop.

  Corpus: **49 of 50 byte-identical, 1 moved deliberately**; the digest moved exactly one line. Two
  corpus assertions were updated rather than loosened, and both were asserting something weaker than
  they looked: the derived-reads-high enumeration loses this pair because there is no derived peak
  left to compare (the second pair it has lost that way), and the max-Q list loses it because a
  figure derived from an unusable speed is not a max-Q. Neither tolerance moved.

- **FIXED 2026-07-31 (was Sev-1): a peak speed read off the opening barometric transient published
  Mach 7.06 and a max-Q 10.9× the flight's own.**
  `missileworks-rrc3__xprs2015__XPRS_Scratch_2015.rff` printed **7,876 ft/s (2,400.6 m/s)** and
  **Mach 7.06** against the manifest's ground truth of **~2,450 ft/s (~Mach 2.2)** — 3.2× — with
  **max-Q 3,498 kPa** beside it where the same flight's real boost load case is ~320 kPa. Not
  withheld, no caveat: every warning on screen was about the ALTITUDE baseline, and none mentioned
  the velocity. Excluding the first 2 s the same trace peaks at 2,226 ft/s, close to the stated
  figure.

  The cause is a self-contradiction, not a tolerance: `maxVelIdx === liftoffRef` — the trace said
  the fastest instant of the whole climb was the moment liftoff was detected, when the rocket is at
  rest. The log opens part-way in, and its altitude runs −451 → −389 → −286 → −29 → +96 m in 0.2 s;
  that jump is fast enough to be read as the launch and is then reported as the top speed.

  **Neither existing guard could catch it, and the reason is structural.** `velocityNoiseDominated`
  divides the worst negative swing by the peak, so the more absurd the spike the SMALLER its own
  ratio: this flight swings to −182 m/s against a "peak" of 2,401, which is 7.6% and inside the 20%
  tolerance, where the same −182 against its real 679 m/s peak is 27% and refused at once. Its
  window also ran `liftoffRef..maxVelIdx`, which here was **one sample**, so `worst` could only ever
  be 0. `velocityOutclimbsItself` missed by 1.4×: 1.39% against a 1% floor, because a peak pinned at
  t≈0 puts the whole climb in its numerator.

  Fixed by `velocityPeakAtLiftoff`, which needs no constant. Corpus: **49 of 50 records that analyse
  byte-identical, 1 moved, deliberately** — the digest snapshot moved exactly one line. Pinned by
  `withholds a peak that lands on the very sample liftoff was detected on`
  (`lib/analyze/analyze.test.ts`, falsified by mutation) and `withholds the XPRS peak that was the
  opening barometric transient, and says why` (`lib/parsers/corpus.test.ts`).

  **Three numbers in the first version of this entry were wrong, and the cause is worth more than
  the correction.** It said "38 records that analyse" and "every other published peak comes at least
  0.700 s later". The sweep behind both only took files `importFlight` returns as `kind: 'flight'`,
  so it silently skipped the **eleven records that reach analysis through the column mapper** — and
  the true figures are **50 records, 35 publishing a peak, nearest at 0.050 s**. The skipped subset
  is exactly where the counterexample lives, so the sweep did not merely under-count: it removed the
  evidence that the class was not closed. It also underwrote a claim on the PUBLIC validation page.
  A hand-rolled sweep is a hint; the corpus suite is the measurement.

- **Widening the ascent noise guard to the whole climb: the case FOR it, corrected.** An earlier
  version of this entry said it "flags zero additional corpus flights" and withholds "a sound read".
  Both came from the 38-file sweep above and both are false. Re-measured over all **50**: it changes
  exactly one record, `perfectflite…endurance-20211030`, which is the open Sev-1 at the top of this
  file and is not sound. Two details of it are principled rather than patches — excluding the apogee
  sample (where vertical velocity passes through zero BY DEFINITION, and where `perfectflite…
  intrepid3tf1` has its whole-ascent minimum, −38.1 against a 146.3 m/s peak) and a 3-point median
  (without which `eggtimer…skyward-lynx` loses a sound Mach 1.27 peak to ONE glitched row at
  t = 5.65 s: altitude 4,274 → 3,996 → 4,096 ft, raw velocity −5,560 ft/s between +1,520 and
  +2,000). What blocks it is coverage, not correctness — see the open Sev-1.

- **The corpus asserts a velocity on almost none of its fixtures, and that is where the surviving
  bugs are.** The Sev-1 above sat in a file whose `corpus-overrides.json` entry asserts **apogee
  only** — so the suite was green while the same file published Mach 7.06. Golden values pin the
  numbers somebody thought to assert; the digest snapshot catches CHANGE but blesses whatever was
  wrong when it was written. Worth a pass that adds a velocity/Mach assertion to every fixture whose
  manifest row carries one, starting with the files whose ground truth names a speed.

- **The one measured thing this run did NOT close, stated so it is not mistaken for done:
  `rounded-lg` is still 22 and was untouched all run.** `DESIGN.md` §2 says it is not in the
  system at all — containers are `xl`, controls are `md` — and "convert on sight". It is spread
  thin (14 files, at most 3 each), so unlike the card and button conversions it is a sweep rather
  than a conversion onto a primitive: `<Card>` does not reach it, because these are controls,
  insets and scroll containers rather than containers. Whoever takes it should expect no
  adoption-count movement from it, only the radius count.

- **FIXED 2026-07-31 (was Sev-1): the channel explorer's "mean" was an index mean, so a flyer
  zooming to the drogue leg read a descent rate 23.9% low.** `lib/explore.ts` `windowStats`
  returned `sum / count` — the exact defect `timeMean` had just been written out of the analyzer
  for. On `fwgps__trf-f1machbuster-jan10` (cadence 0.099–4.900 s) the explorer printed **−49.31 m/s**
  over the apogee→main leg while the flight's own report said **64.81**, reproducing the analyzer's
  pre-fix 49.33 to 0.04%. Now time-weighted: **−64.78**, 0.0% off the analyzer's own `timeMean`.
  The window mean reaches no export, so the blast radius was that one panel.

- **The explorer's velocity mean and the flight's reported descent rate are DIFFERENT ESTIMATORS,
  and three corpus flights disagree wildly — unexplained.** Sweeping all 36 analysable flights /
  16 descent legs, the median gap between the two fell 6.4% → 3.3% with the time-weighting fix,
  but three Blue Raven legs are unaffected and enormous: `meraki2` drogue **3600%**,
  `lemiv-l3` drogue **608%**, `lemiv-l3` main **3499%**. One leg got worse
  (`eggtimer euroc-aris` drogue, 5.0% → 12.6%). This is why **no corpus-wide agreement invariant
  was asserted**: the reported rate is altitude-derived over the analyzer's own leg bounds and the
  explorer mean is over the velocity channel, so they are not the same quantity and a tolerance
  would be invented rather than measured. The three Blue Raven outliers are worth a look on their
  own — they are the same files whose inertial channel wraps at 2¹⁶ (below).

- **REFUTED 2026-07-31 — "five data surfaces `return null` with no empty state" is wrong on all
  five, and P1 item 5 must not be scoped against it.** An audit this run counted five violations of
  `DESIGN.md` §5's *"a surface with no empty state is not finished"*. Checked in both directions,
  as `MAINTAINING.md` requires, and none survives:
  - `ChannelExplorer.tsx:212` (`selected.length === 0`) was called the worst because it is
    "reachable by ordinary interaction". **It is not reachable at all.** The ✕ that removes a
    channel is rendered only `{selected.length > 1 && …}`, so the last channel cannot be
    deselected; and `buildPlotChannels` returns the altitude channel unconditionally, so the list
    is never empty for a flight that analysed. Dead defensive code, not a blank screen.
  - `GroundTrack.tsx:466` — the parent already gates it: `{gpsLat && gpsLon && <GroundTrack …>}`
    (`FlightReport.tsx:1305`). An `EmptyState` there would be unreachable too.
  - `GpsApogee.tsx:15`, `FlightTimeline.tsx:31`, `EventChips.tsx:43` — conditional PANELS, not
    surfaces. Their null return IS the "this flight has no GPS apogee / too few phases / no
    events" case, which is most flights. An empty box on each would put three explanatory
    rectangles on every ordinary flight, which is worse than silence and is the "generous
    whitespace reads as a marketing page" failure §4 warns about.

  The real gap §5 names is still open, and it is narrower than the count suggested: what a flyer
  cannot learn is that their BOARD did not record GPS, and the place for that is "How this file
  was read", not five empty containers. Note also `components/ui.tsx` exports no `LoadingState`
  and no `OfflineState`, and `navigator.onLine` appears **0 times** in the repo — so two of the
  five required states have no primitive to adopt yet, which P1 item 5 does not budget for.

- **`truncateInertial`'s divergence bound uses the RAW barometric peak, which two known effects
  inflate.** Both make the bound more permissive — they can leave a bad sample in, never cut a
  good one out — so the direction is safe, but it is slack that could be recovered. (a) The raw
  trace spikes after the deployment charge: on `lemiv L3` the highest raw sample reads 12,060 ft
  several seconds after velocity went negative, against a true peak nearer 11,700 — about 2.5%.
  (b) It runs in the PARSER, before the analyzer splits a launch-day download, so on a file
  holding two flights `peak` is the taller of the two; `jan18` is exactly such a file and is
  silent only because both its flights reach nearly the same height. A download whose SECOND
  flight is much taller than its first is where this would bite. Tightening it needs a cleaned or
  per-flight peak, which the parser cannot reach without knowing about the analysis — so this is
  a real limit of where the bound lives, not an oversight. The wrap bound is unaffected, being a
  property of the field rather than of the flight.

- **`DESIGN.md` §4 does not say which half-steps are on the spacing scale, and the code uses four of
  them 148 times.** §4 states the scale as `1 2 3 4 6 8 12` and "nothing else, no arbitrary values",
  but §4's OWN table then sanctions `px-3 py-1.5` and `px-2 py-1` for controls — so `-1.5` is
  simultaneously forbidden by the sentence and required by the table. Measured 2026-07-31 over
  `components/` and `app/`: `-1.5` ×78, `-0.5` ×48, `-2.5` ×21, `-3.5` ×1. The widened §9 spacing
  grep deliberately excludes half-steps for this reason and says so, rather than reporting 148
  breaches of a rule the file
  contradicts itself on. Settling it means one sentence in §4 naming the sanctioned half-steps —
  a change to `DESIGN.md` in BOTH repos, which is why it is filed rather than taken.
  **Amended 2026-08-01, and the amendment is mostly a correction to the count above.** `GroundTrack`'s
  `Stat` tile was `py-2.5` and became `py-2` while it was being folded into `<Frame>`, because
  leaving a half-step inside a conversion is how a ledger silently stops matching the tree. But
  re-measuring before writing "21 → 20" gave **11 real uses, not 20** — the 21 was taken
  2026-07-31 and other conversions have removed the rest since without anyone updating this line,
  which is the same drift item 3 of `ROADMAP.md` P1 turned out to have. The honest state, measured
  today over `components/` and `app/` and with comment lines excluded: `-2.5` at **11 sites** —
  `px-2.5` in the four note/label inputs (`FlightReport` ×2, `CompareView` ×2), `RecentFlights`'s
  filter input, `FlightReport`'s section-nav chip, and `mt-2.5`/`mb-2.5` on four panel
  descriptions (`GpsApogee` ×2, `RecognizedFormats`, `DeviceSummary`). The other three figures in
  this entry are from the same stale sweep and should be re-measured before being spent against.
  **Do not read this as the entry being half-done**: a run that swept the rest without changing §4
  would be removing occurrences of a rule the file has not yet made.
- **`components/RecentFlights.tsx:630,638` marks the fastest and highest remembered flights with a
  `text-amber-500` ★. FIXED 2026-08-02** — the third filing of one defect, and the line numbers had
  moved twice by the time it was cleared. `DESIGN.md` §2 reserves amber for "an estimate outside its envelope, an
  extrapolation, a caveat" and says outright never to colour a number by whether it is large. A
  magnitude superlative painted in the warn token reads, next to a figure, as a caveat ON that
  figure. Unreproduced as a user complaint; filed as a system breach with the rule it breaks.
- **The attached fixtures checkout and the corpus `corpus.lock.json` pins are DIFFERENT CORPORA,
  and the difference changes what Debrief may claim.** Proved 2026-08-01: a derived-vs-measured
  sweep found **4 pairs locally and 6 in CI**, and one of the two CI-only pairs (the sg1.1
  PerfectFlite StratoLogger) reads **13.7% LOW** where every local pair reads high — which is the
  difference between "a derived peak is an upper bound" being true and being a false safety claim.
  `VERSION` reads `v1.0.0`; the lock pins `v1.1.0`. **A green local corpus run is therefore not
  evidence about the corpus that gates CI**, and any statistic computed from the local checkout
  must be written as a superset or a floor, never as an exact population. Fixing this properly
  means either cutting a release that matches the checkout or attaching the pinned one.
- **Nothing tells a session that a published constant was derived from a narrower corpus than CI
  runs.** `lib/derivedPeak.ts` handles it by asserting containment rather than equality, which is
  the right shape but is a per-file decision that the next such constant will have to rediscover.
  Worth a note in `CONTRIBUTING.md` if a second one appears.
- **A copy test that clicks and then reads the clipboard in the next statement RACES the write,
  and passes locally while failing on a slower CI runner.** Shipped one on 2026-08-01
  (`e2e/stitch.spec.ts` "the composite timeline copies as a real table") — 3/3 locally and green on
  both CI jobs of the PR that added it, then failed twice, including the retry, on the next CI run:
  `clip['text/plain']` was `undefined`, because `navigator.clipboard.read()` returned before the
  handler's `await copyTable(...)` had written anything. Fixed forward on both tests that had the
  omission by waiting for the app's own `role="status"` announcement first, which is what every
  older copy test in the suite already did. **The general rule: after any control whose handler is
  async, wait for the app to SAY it finished before asserting on what it did.**
- **Four unit `<select>`s measure 43x44 px at a 390 px viewport — one pixel under the touch
  floor on the WIDTH.** Measured 2026-08-01 on the built export of `382d37b`, `hasTouch: true`
  (without which every figure here is wrong). `Speed`, `Acceleration`, `Temperature`, `Pressure`
  in the units control; `globals.css`'s `@media (pointer: coarse)` block floors `min-height` and
  reaches them, so the height is right and the width is what a four-across row leaves. Not a
  regression from this run and possibly not worth fixing — filed because 43 is a measurement and
  "about 44" is not.
- **`<label>` and other elements the coarse-pointer floor does not reach are the real touch gap:
  27 elements under 44 px at 390 px, the smallest a "Compare" label at 58x18 and a logbook
  "Label" field label at 324x16.** `globals.css` covers `button`, `select`, `[role="button"]` and
  `input` and not `<label>`, `<summary>` or a plain `<a>` — which is exactly why `TOUCH_TARGET`
  exists on the primitives. **Unverified as a real defect:** a `<label>` wrapping a 44 px control
  is still reachable by tapping the control, so the count is an upper bound on the problem and not
  the problem. Establish which of the 27 actually have no reachable target before spending an
  increment on it.
- **`ChannelExplorer`'s window-stats table, `ColumnMapper`'s and `StitchSurface`'s tables still
  cannot be sorted or copied.** `DataTable` exists now (`components/ui.tsx`) and the two cross-check
  tables are on it, so each of these three is a small conversion rather than new work. Measured
  2026-08-01: 6 `<table>` elements left in `components/`, 4 copyable, 0 with arrow-key cell
  navigation.
- **`DataTable` does not implement arrow-key cell navigation, so `DESIGN.md` §5's
  "keyboard-navigable" is only partly delivered.** Every affordance is on the Tab path; cell-to-cell
  movement is not. Either build it or amend §5 — and amending §5 is a change owed to the sibling
  repo in the same run, which is why it is filed rather than done.
- ~~**The agreement badge is hand-rolled identically in `DeviceSummary` and `GpsApogee`**~~ —
  **DONE 2026-08-03.** The same emerald/amber `inline-flex … rounded-md border … px-1.5 py-0.5
  text-xs` pair in both, 4 variants over 2 files. This entry said `Chip` was the primitive it wanted
  but that adding `ok`/`warn` changes a signature `DESIGN.md` §5 shares with the sibling repo, and
  filed it rather than diverging. **That was the right call and the resolution is the one it
  implied**: §5 itself gained `good` · `warn` · `danger`, so the signature changed in the shared
  document first and both repos get the same word. Both files now take `<Chip tone=…>`; the debt to
  `nrdptel/fusionspace-loft` is recorded in `HANDOFF.md`. The *text* was already shared
  (`agreementText`), so the two could never disagree about what they said — only about how they
  looked, and now not that either.
- **`debrief-fixtures` `VERSION` says `v1.0.0` while `corpus.lock.json` pins `v1.1.0`.** Local runs
  read the attached checkout and CI fetches the release, so the two are not provably the same
  corpus. Measured 2026-08-01; the fixtures repo carries no tags to reconcile it against. CI passing
  on this run's new 2% tolerances is evidence they agree on the files that matter, not proof.
- **Descent rates are asserted on no corpus fixture at all**, while 17 manifest rows carry a
  `stated_descent_rates` ground truth. Measured 2026-08-01 alongside the velocity work, which closed
  the same gap for peak speed (3 → 11) and acceleration (4 → 10). The blocker is that the column is
  free text ("drogue 17.0 m/s; main 8.8 m/s") rather than machine-readable, and two of the flights
  it names are ones Debrief withholds a rate for on purpose.
- **`e2e/logbook.spec.ts:677` "the label and notes a flyer types stay with the flight" flaked once**
  in a full-suite run on 2026-07-31, immediately after the disclosure conversion — which made it look
  exactly like a regression in that conversion, and it is not. **Checked before being called a flake,
  because the conversion touched this precise control.**

  The specific worry was real and worth recording: `Disclosure` renders `<details open={defaultOpen}>`
  where the hand-rolled markup it replaced had **no `open` prop at all**, so the conversion introduced
  a React-managed attribute onto an element the user toggles by hand. If React re-applied
  `open={false}` on re-render, then typing into the label field — which sets state in `FlightReport`
  and re-renders — would snap the panel shut mid-type, and this is the one test that types into it.
  That is a perfect match for the symptom.

  **Refuted empirically rather than by reasoning about React's diffing.** A throwaway spec opened the
  panel, filled both fields, and asserted the `open` attribute survived each re-render: it does.
  React does not touch the DOM attribute when the prop value is unchanged between renders. The test
  then passed 5/5 in isolation, passed its whole file, and passed a full-suite re-run at 236.
  Second flaky test now recorded in this file; if a third appears, the shared cause is worth hunting
  rather than the individual tests.

- ~~**`e2e/compare.spec.ts:434` is flaky, twice in ~10 full-suite runs on 2026-07-31, and green on
  every re-run.**~~ **FIXED 2026-08-01, on its third occurrence and exactly as diagnosed below.**
  The assertion now waits for the navigation (`page.waitForURL(/\/compare\?ids=/)`) before the
  heading, rather than racing it; 5/5 in isolation and green in the full suite after. The diagnosis
  below was correct and cost nothing to act on — it is kept because the *shape* recurs: two of the
  three flakes recorded in this file are assertions that follow a state write, and this one is the
  first with a confirmed cause. *"a file a batch drop could not read can be mapped into the
  comparison it arrived with"* failed waiting for `Comparing 3 flights` after the column mapper's
  *Analyze flight*, with
  Playwright's log showing `waiting for "…/compare?ids=a,b,c&u=ft" navigation to finish`. So the
  address is already correct and the assertion is racing the navigation that follows the mapping,
  not a wrong result. It passes alone every time and passed the immediately following full run
  twice, so it is a wait, not a defect in the app. Fix it by awaiting the heading through the
  navigation (`waitForURL` first, or assert on the surface's own state) rather than by adding a
  retry — a flaky check in a suite nobody reads for a fortnight teaches the next session to wave
  real failures through, which is the exact failure `MAINTAINING.md` names.

- **A loaded comparison's only `<h1>` is the brand wordmark, at 24 px.** Measured 2026-07-31 on the
  built export: on `/compare` before flights load the page title is "Compare flights" at 30 px, and
  once a comparison is on screen the surface's own heading steps down and the brand becomes the
  route's only `<h1>`. `DESIGN.md` §3 says a page title is `text-3xl`, once per route — in that
  state the route has no title of its own. The same walk found an `<h3>` at 14 px there, which is
  `text-sm`: a heading at body size. `e2e/touch.spec.ts:241` already notes the header "steps aside
  on /compare, and loading the flights used to leave no h1 at all", so this is the tail of a fix
  rather than a new fault — but it is still a route whose title is the product's name.

- ~~**Off-scale spacing has not moved: 25 values, concentrated in the docs routes.**~~ **DONE
  2026-07-31 — all 25 cleared, and the count is a GUARD at 0 now rather than a ratchet**, so it may
  never rise again. Each was mapped to its nearest scale value in the direction that keeps the
  rhythm: 5 → 4 between related things, 10 → 12 for a section break or page gutter, except the list
  indent where rounding down would put the marker on the edge.

  Two things this entry got wrong, both worth keeping. **The count was never 25** — the §9 grep that
  produced it enumerated the values somebody had in front of them and never matched `gap-` or
  `space-y-` at all, so it read 0 for a whole run while eight occurrences sat in the tree. And the
  first fix for that grep was itself blind to a live `gap-y-5`. The lesson is in
  `lib/design-system.test.ts`: **a compliance grep anchored on the values you already know about can
  only find the drift you already know about.**

- **`ChannelExplorer`'s preset row is half-converted and reads worse than either state.** The
  "+ Save this view" control is now a `Button` at the primitive's height while the built-in view
  chips beside it are still hand-rolled at `min-h-[1.75rem] px-2 py-0.5` — an arbitrary value that
  is not on the spacing scale either. At around 500 px wide the row shows 44 px controls next to
  28 px ones. Convert the chips in the same pass that takes the rest of that surface.

- **Two surfaces still publish a figure derived from a peak speed the analysis refused, and they are
  the same defect PR #57 shipped to close, one layer over.** Neither tests `series.velocityUnusable`.
  `components/RailExit.tsx:59` gates only on `series.velocitySource === 'device'`, then integrates
  `series.velocity` from liftoff and prints a rail-exit speed AND a Mach — a stability number with a
  "marginal" warning attached to it. `lib/drag.ts:43` `canMeasureDrag` gates only on the altitude
  source and the events, so `DragCoefficient.tsx` prints "over Mach x–y" off the same trace. Both are
  reachable whenever a DEVICE velocity is judged unusable (`maxVelocity > IMPLAUSIBLE_VELOCITY`, or
  noise-dominated), and on such a flight the page contradicts itself twice: the metric grid shows
  "Max velocity —" and the explorer withholds its Mach channel, while these two publish. **Latent, not
  live: no corpus fixture is device-velocity AND unusable today**, which is precisely how the previous
  instance of this survived to reach production. Reproduce by scaling the velocity channel of
  `altusmetrum__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-TeleMega.csv` by 20 —
  `maxVelocityWithheld` becomes `'implausible'` while `railExitVelocity(...)` returns 437.8 m/s and
  `dragCoefficient(...)` returns Mach 6.71–16.54. Two one-line gates plus a corpus invariant that
  holds every speed-publishing surface to the one flag.

- **`burnoutVelocity`, `coastEfficiency` and `dragLossAltitude` still gate on the OLD single reason.**
  `lib/analyze/index.ts` computes them behind `!velocityImplausible` rather than behind the peak
  having been withheld at all, so a record whose peak is withheld for `'gap'` publishes all three to
  the burnout tile, the report row and `analysisJson`. Reachable: `ascentGapBreaksPeak` needs
  `velocitySource === 'baro'`, and the accelerometer burnout branch needs only a signed axial channel
  — a baro-altitude logger with one signed axial channel and an ascent dropout satisfies both. Latent
  today: of the corpus fixtures with a withheld peak, the two `'gap'` ones are Featherweight GPS logs
  that find no burnout. `analysisJson` also omits `maxVelocityWithheld` entirely, so a JSON consumer
  sees `maxVelocity: null` beside a live `burnoutVelocity` with no reason given.

- **Four controls are under the 44 px touch floor at a 390 px touch viewport, and all four are plain
  `<a>` links.** Measured 2026-07-31 on the built export with `hasTouch`/`isMobile` set, which is what
  arms `app/globals.css`'s `@media (pointer: coarse)` block — a narrow viewport alone does not, and
  measuring without it reports 106 false positives. That block covers `button`, `select`,
  `a[download]`, `[role="button"]` and `input`, and `nav a` gets padding, but a plain in-content link
  gets neither: `Compare` **58×18**, `Read the methods →` **136×18**, `Privacy` **42×44** (two pixels
  short on width), `ADA.gov →` **59×16**. The `?` links on the reading tiles are NOT among them —
  they carry `.touch-area`, whose 44×44 `::after` gives them a real hit target without changing
  layout, and any measurement that reads `getBoundingClientRect()` on the element will wrongly flag
  them. This is P4's headline metric and the honest starting number is 4, not 0 and not 106.

- **The logbook row keeps the WHOLE-FILE apogee between cropping a flight and next opening it.**
  `lib/recents.ts:370` `saveReadWindow` merges only `read` into the stored row and never rewrites
  `apogeeM`/`maxVelocityMs`; the only writer of those is `saveRecent` on open, and
  `components/Analyzer.tsx:335` does not refresh the logbook after a crop. So the row carries a `read`
  that says it is cropped beside a figure that is not, with no crop indicator — and the number changes
  by itself on the second visit. It also makes the logbook's Apogee sort rank a cropped flight by a
  stretch nobody is reading. `RecentMeta`'s own docstring ("a cropped recording's stored apogee is the
  CROP's apogee") is false for that window. `recordingSpread` is unaffected — it bails on any `read`.

- **`lib/stitch.test.ts:111-118` cannot fail on the claim it names.** The loop that proves the removed
  burn-agreement gate "cannot see the staging delay" never varies its input with `delay` — every
  iteration calls `alignStages` with the same literals, so the reported error and the unchanged spread
  are arithmetic identities of the loop variable rather than measurements of the module. Change 5000
  to any number and it stays green. This is the repo's own stated failure mode applied to the test
  guarding the most tempting regression in D4. Constructing the sustainer's events FROM `delay` makes
  it a real measurement at no cost.

- **`/compare` will cross-check two STAGES as though they were two recordings of one flight.** Feeding
  the corpus Kairos booster and sustainer through `buildComparison` + `crossCheck` yields an apogee
  spread of 30.5% (2,973 m vs 4,045 m), time-to-apogee 19.6% and max acceleration 159.6%, printed
  under *"If these are recordings of the same flight, the independent readings differ by …"* against a
  10% wide threshold. `lib/parsers/corpus.test.ts` says in a comment that a cross-check must not be run
  over these; nothing enforces it. It is hedged rather than asserted, so it is not a lie today — but
  D4's composite surface must actively suppress that panel once a flyer states these are stages, or it
  ships a 30%-disagreement warning on a flight behaving exactly as designed.

- ~~**Eight descent legs still disagree with their own chord by 5% or more.**~~ **CLOSED
  2026-08-04 — all eight, and the count is pinned at 0.** The leg rate IS the chord now, measured
  on the recorded altitude. The entry below is kept because its reasoning was most of the way
  there and because **its closing instruction was wrong in a way worth recording**: it said "Do NOT
  fix it by using the chord directly", on the evidence that the `eggtimer euler-explosion` chord
  implies 303 m of descent on a flight reading 292 m of apogee. That arithmetic is exactly right.
  The premise under it is not — it assumed the smoothed figure was the sounder of the two on that
  file, and measurement says otherwise: **7.31 m/s over that 15.3 s leg implies 112 m of descent,
  contradicting the same trace by 191 m, where the chord's 303 m matches it.** Both are readings of
  an unsound trace (apogee at t=1.0 s, 0.8 s after liftoff — a blast pressure spike, not a climb,
  on a rocket that exploded at Mach 2.4). Neither is trustworthy. But the smoothed one was not
  *more* trustworthy, only more plausible-looking, which is the worse of the two failures.
  Same for `meraki2` at 121 km, where the barometric model has no validity at all.
  **What is genuinely still open is narrower and is filed separately below:** Debrief publishes a
  descent rate at all on those two records, and should not.
  Verified across the corpus: 6 of 8 closed because the chord is simply right — proved by the
  same-flight pairs, which agree far more closely afterwards (7 of 8 groups tightened, none
  widened: XPRS 2015 40.1% → 1.8%, Stargazer 1 9.0% → 0.3%, sg1.1 drogue 10.6% → 0.5% and main
  11.5% → 0.8%, lemiv L3 main 19.9% → 4.3%) and by the files' own speed columns.
  **Note what this does NOT prove, because the pin moved for exactly this reason:** all eight closed
  *by construction* once the published rate became the chord, so "8 → 0" on that comparison is
  arithmetic, not evidence. The check compares against the device's own speed channel now. The
  original entry follows.

- **[SUPERSEDED — see above] Eight descent legs still disagree with their own chord by 5% or more, and the cause is only
  half established.** Separate from the index-weighting Sev-1 fixed 2026-07-31 and not closed by it.
  Measured over the **41 reported legs** the corpus test sweeps, after that fix: **median |error vs
  own chord| 0.755%, mean 4.574%** — so this is a tail, not a bias. The eight:
  `issuiuc-endurance TeleMetrum` drogue **+17.0%**, `blueraven meraki2-121km` drogue **−22.6%**,
  `meraki2 Mega38-1 TeleMega` drogue **+11.7%**, `trf-lemiv-l3 Blue Raven` main **+11.1%**,
  `sg1.1-Booster TeleMetrum` main **+10.9%** and drogue **+8.2%**, `stargazer1 EasyMega` whole
  **−12.0%**, `eggtimer euler-explosion` drogue **−63.1%**.

  **The likely mechanism is the 0.6 s smoothing bleeding across the leg boundaries** — `descent` is
  `movingAverage(-baroVel, windowFor(dt, 0.6))`, so the window at the start of the main leg pulls in
  the fast drogue rate and the window at the start of the drogue leg pulls in the near-zero rate
  either side of apogee. **That prediction holds for main legs and does NOT hold for drogue legs**,
  and saying otherwise would be reading the evidence backwards: both main legs read high as
  predicted, but of the five drogue legs three read HIGH and two low. So the drogue cases have some
  other cause, or more than one — two of them (`meraki2` ×2, a 121 km space-shot outside the
  barometric model's valid range, and the `eggtimer` motor explosion) are files where the altitude
  trace over the leg is itself suspect, which makes the chord the doubtful figure there rather than
  the reading. Establish the cause per file before changing anything.

  **Pinned as an exact count** by `reports a rate that matches its own leg, across the whole corpus`
  (`lib/parsers/corpus.test.ts`), which asserts eight and prints the leg count, median and mean in
  its failure message — so closing any of them fails the test and forces the number down in the same
  commit. Do NOT fix it by using the chord directly: on the eggtimer file a 15.3 s leg on a flight
  Debrief reads to 292 m gives a chord implying 303 m of descent, and that chord is contaminated.
  The likely honest fix is to shrink or one-side the smoothing window at a leg boundary.

- **The `iss-sg1.2` group's whole-descent cross-check got WORSE when the descent Sev-1 was fixed,
  from 74.7% to 89.1%**, while `reddit-meraki2` drogue improved 32.6% → 8.8% and `trf-lemiv-l3` main
  22.9% → 16.1%. Net win across the redundant-recording groups, and the fix is right on its own
  evidence — the device's own vertical-speed column settles it — but one group moved the wrong way
  and that should not go unrecorded. `iss-sg1.2` pairs a TeleMega sustainer at 2,113 m with two
  StratoLogger boosters at 465 m and a 9.5 m fragment: it is the corpus's own negative case for
  same-flight grouping, so a widening spread there may be the cross-check correctly reporting that
  these are not recordings of one flight. Worth confirming before anyone reads it as a regression.

- **The Featherweight GPS log carries the tracker's own `VERTV` vertical-speed column and Debrief
  ignores it, deriving a speed from the altitude instead.** `velocitySource` on
  `fwgps__trf-f1machbuster-jan10` is `baro`. The column is good enough to have served as the ground
  truth that caught the descent-rate Sev-1 on 2026-07-31 — it agrees with the leg's altitude chord to
  0.9% — so a *measured* vertical speed is sitting in the file beside a *derived* one. Ingesting it
  would give that flight a measured descent rate and a second opinion on the derived peak, which is
  exactly the cross-check posture the safety spine asks for. Not done here because it is a parser
  change and the Sev-1 was an analysis change; they get separate gates.

- **DONE — a warning told flyers to subtract a number that was already right, and on the corpus's
  own cert flight that instruction was 63% wrong.** Where a log's baseline was doubted and its
  record ended away from zero, Debrief said: *"it comes to rest N m above where the record begins…
  A rocket at rest is on the ground… every altitude here (apogee included) reads about N m too
  high… subtract that."* On the Kairos sustainer that read **2,540 m**, against an apogee of
  **4,045 m** — which matches the file's 13,268 ft cert figure **to 0.9 m**. A flyer following the
  instruction would have filed **1,505 m, 63% low**. Worse, the same warnings list already carried
  *"never reaches the ground… **the record doesn't settle which**, so no landing is marked"*: one
  note said the record could not settle it, the next asserted it had. `landedInRecord` was **false**
  and `flightTime` **null** — Debrief's own conclusion contradicted the warning's premise, because
  `landingIdx` defaults to `n - 1` (`lib/analyze/index.ts:1939`) and only means *rest* when
  `landingFound`. **Measured over the corpus:** the note fires on **12 of 50** analysable flights;
  **8 can be checked** against a device summary or the manifest, and subtracting HELPS exactly one
  — `intrepid3tf2 AL0`, +5.8% → −0.0%, the single case the original wording was reasoned from — and
  HURTS the other seven (`iss-endurance` −0.4% → −3.7%, `xprs2015` ×2, `euroc-skyward-lynx` −0.1% →
  −34.2%, `euroc-stacarl2` +1.2% → −34.3%, `irec_2023_easymega` −0.2% → −66.2%, Kairos 0.0% →
  −62.8%). **No rule separates the one from the seven**: not the resting fraction (3.3% hurts, 5.5%
  helps, 7.5% hurts), not `landingFound` (false on AL0 *and* on Kairos), not "did the never-reaches-
  the-ground note fire" (it fires on both). The difference is whether the record came to rest or
  merely stopped, and nothing in a record settles that. So the note now states the observation and
  **both** readings of it, says the record does not settle which, and instructs nothing — pointing
  instead at the flyer's own altimeter summary, which is what settled AL0. Pinned by five corpus
  cases asserting each reads right now and would read worse if the height were taken off, by the
  AL0 case asserting both readings are present, and by a sweep of every analysable fixture asserting
  no firing carries an imperative. Seven mutations, seven caught — including reinstating the old
  wording verbatim and making the analyzer actually apply the subtraction. Exactly **12** digest
  lines moved, matching the 12 firings: the blast radius is the warning and nothing else.
  **Found while measuring the corpus for D4's composite surface, which renders that very file.**

- **DONE — `lib/stitch.ts` shipped a safeguard with zero power against the failure it named, and it
  rejected two of the corpus's six redundant-board groups.** The alignment lines per-stage logs up on
  their shared liftoff, and it corroborated that against the burnout the boards both recorded,
  refusing above 1 s. Both halves were wrong. **Zero power:** lined up on liftoff, the gap between
  two boards' burnouts is exactly |burn duration_i − burn duration_j|, so the staging delay — the one
  error the check existed to catch, and an unbounded one — is not a term in it. Sweeping the delay
  from 2 s to 5,000 s leaves the reported figure at 0.30 s while the composite is wrong by the whole
  delay. **False refusals:** run over the six groups where several boards are bolted into ONE
  airframe recording ONE burn — the check's premise stated exactly — it refused `iss-endurance`
  (TeleMetrum 2.900 s against StratoLogger 0.050 s) and `trf-lemiv-l3` (3.160 / 2.300 / 1.750 /
  1.550 s across four boards in one rocket). All nine files carry `knownIssue: None`; the analyzer
  simply does not define burnout the same way twice, a `measured` burn running 0.769–6.040 s across
  the corpus against a `derived` one's 0.050–23.910 s. **And it never separated flights anyway:** the
  genuine staged pair agrees to 0.290 s, but the Kairos booster paired against 32 unrelated corpus
  flights was accepted three times, at 0.750 s (a June 2023 IREC flight) and 0.910 s. Removed rather
  than widened — a guard that fires on correct data is worse than none, and this one bought nothing
  for it. The burn durations still ship, now named per recording and provenance-labelled, because a
  2.85 s spread means nothing until you know one board measured that moment and the other derived it.
  The six groups are a corpus test now (`recordings of one launch line up on it, whatever their
  burnouts say`), so reinstating the gate is a red build rather than an argument. **Not user-facing
  at any point** — `alignStages` had no caller outside its own tests — but the module's own header
  and `ROADMAP.md` both stated the refuted claim, which is the class MAINTAINING.md forbids outright.

- **DONE — reopening a cropped flight threw the crop away, so it survived one reload and not two.**
  `saveRecent`'s replace-in-place carried the note, the paired device summary and the report caption
  forward by name, and `read` — the stretch a flyer had said was THEIR flight — was not on that list.
  Reopening a flight IS a save, so the crop was read from storage on the way in (which is why one
  reload looked fine, and why the D1 walk that reloads once was green) and wiped on the way out: the
  second visit silently read the whole record again, printing a flight time that spans two flights
  off a launch-day file. That is D1's *and it is remembered* clause failing on the second use rather
  than the first, which is the worst way to lose a thing. **Reproduced before it was touched** with a
  walk that crops, reloads, reloads again — the second assertion failed. Closed structurally rather
  than by adding a fourth name to the list: `replaceInPlace` is pure, exported and unit-tested (five
  cases, including that a member is found on whichever stored copy has it), and a compile-time check
  fails when a member of `RecentFlight` is classified as neither the file's nor the flyer's. The
  e2e walk now reloads TWICE. **This is the fourth member that field-by-field rebuild has silently
  lost** — the report caption, then the chosen stretch through the backup, then the file's own bytes,
  now the chosen stretch again through the reopen.

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

- **DONE 2026-07-31 for TWO of the three routes — and the third was never the same shape.**
  `/privacy` (6 sections) and `/validation` (8) are now built from `<Section>`: measured on the built
  export, both go `text-3xl` (30 px) → `text-xl` (20 px) → `text-base` prose (16 px), with 32 px
  (`mt-8`) between sections, in both themes. All three obstacles below were real and each was taken
  as written: the wrapper lost `space-y-6`, every first child lost its `mt-2`, and the prose
  question was decided rather than dodged — `text-sm` → `text-base`, because §3's own table gives
  `text-base` to "prose in docs". The device-data reference list keeps `text-sm` explicitly, since
  it is a dense enumeration of storage keys rather than prose.

  **`/methods` is NOT that shape and converting it would have been wrong.** It has ONE `<h2>`, in a
  `Method` helper rendered 47 times inside a `sm:grid-cols-2` glossary; those headings are
  definition terms carrying `id` anchors, not section headings, and `Section`'s `mt-8` block
  structure would destroy the two-column layout. So the primitive was not forced onto it.

  **A first draft of this entry claimed those `<h2>`s "render at 14 px — below the 16 px prose
  around them". That was wrong and is corrected here rather than quietly deleted:** the glossary
  grid is `text-sm`, so its prose is 14 px too and the headings were the SAME size as their own
  body, not below it — a heading with no size cue at all, which is a different defect from the one
  claimed. It was written from the shape of the other two routes rather than from a measurement of
  this one, which is exactly what `MAINTAINING.md` forbids. Caught by the pre-push review.
  Fixed in the same commit: the term is now `text-base font-medium` — §3's subsection heading, one
  step above its `text-sm` definition body — and the page lede joins the other two routes at
  `text-base`. The 47-entry grid stays `text-sm`, the same call as privacy's device-data block:
  a dense reference list is not prose.

  **What adoption found that shipping the primitive had not:** `Section`'s `title` was typed
  `React.ReactNode` intersected with `HTMLAttributes`, which resolves to `ReactNode & string` — so
  it rejected every heading carrying markup. Fourteen sections failed `tsc` at once. `Card` already
  carries the `Omit<…, 'title'>` that prevents this, with a comment explaining it; `Section` was
  missed because it had no adopters to execute its contract.

  Original entry: `/methods`, `/validation` and `/privacy` go `text-3xl` (the `<h1>`) straight to
  `text-base` (every `<h2>`), skipping `text-xl` entirely — and `DESIGN.md` §3 gives `text-xl` to
  "section heading" and `text-base` to "subsection heading, and prose in docs". These `<h2>`s are
  direct siblings of the `<h1>`, so they are section headings sitting a level small. That is the
  measurable half of why `BACKLOG` has long said these pages read as a different author's.

  **`Section` (`components/ui.tsx`) implements exactly the right thing and has ZERO adopters**, so this
  looks like a one-line swap. It is not, and the three obstacles are why it was filed rather than
  rushed at the end of a run:

  1. **Spacing collides.** The sections sit inside `<div className="mt-8 space-y-6 …">`, and `Section`
     carries its own `mt-8 first:mt-0`. `space-y-*` and a sibling `mt-*` both set margin-top on the
     same elements; the parent wrapper has to lose `space-y-6` in the same change, not just the
     children gain a component.
  2. **`Section` wraps children in `mt-4`**, where these sections' first `<p>` carries `mt-2`. One of
     the two has to go or the gap doubles.
  3. **The prose size is a separate question that will get conflated with this one.** The wrapper is
     `text-sm`, while §3 says `text-base` is "prose in docs". Changing the headings without deciding
     the body is how a page ends up with a rhythm that is half one system and half another. Decide
     both, in one pass, and say which.

  Worth doing — it closes a zero-adopter primitive and fixes a real rhythm break on three published
  pages — but it is a deliberate pass over three public documents with both themes checked, not a
  sweep.

## Correctness / honesty

- **FIXED 2026-08-04 (`#125`): Max Q carries the speed's provenance now, in its own words.**
  `maxQProvenance` sits beside `velocityProvenance` and says what the speed's caveat cannot: not
  merely that the figure came from a derived speed, but that `q = ½ρv²` squares it, so a peak that
  "usually reads high" carries that tendency through roughly doubled. A measured speed gets no
  clause at all — inventing a caveat where there is nothing to warn about teaches a flyer to skip
  the ones that matter.

  **And the entry's prediction that "the fix is a call, not a mechanism" was half right.** The tile
  was one call. The SAVED REPORT was a second site that had to be taught separately — `report.ts`
  builds its Max Q row independently of `metricTiles` — which is precisely the failure this entry's
  own text describes the peak speed having had once already: *the document a flyer files has to
  carry the qualifier the screen shows*. The test asserts both, and dropping either one fails it.

  *The original entry follows.*

- **Max Q carries no provenance, and it is the reading that needs it most.** `lib/readings.ts:341`
  gives the tile a `sub` of `at <altitude>` and nothing else. Its neighbour does better: peak speed
  goes through `velocityProvenance`, which says *derived, which usually reads high at the peak* on
  any flight with no measured speed channel — and Mach rides inside that same `sub`, so Mach is
  qualified too. Max Q is `½ρv²`. It is **quadratic** in exactly the speed that carries the
  caveat, so on a barometer-only flight the tendency the speed's qualifier warns about is squared
  before it reaches the tile, and the tile is the one that says nothing. It reaches the .txt, .md,
  .html and the clipboard the same way. This is the identical failure the peak-speed entry above
  already fixed once — a qualifier that existed but was not reachable from the reading that needed
  it — and `velocityProvenance` is exported now, so the fix is a call, not a mechanism. Sev-2:
  a max-Q figure is a structures number, and an unqualified one on a derived speed is the exact
  overclaim the safety invariant exists to stop.

- **FIXED 2026-08-04 (`#126`): `gpsAscentFixes` counts solutions now, and the entry UNDERSTATED it
  by an order of magnitude.** Filed at "about 20:1" from the distinct-value-run ratio on the GPS
  altitude column. Measured properly against the published metric it is far worse, because the
  count runs to apogee rather than over the whole record: `irec2023` published **4,010** behind an
  apogee resting on **40** — 100:1 — and `sg1.1` published 1,232 for 6, which is 205:1.

  **And it had the Kairos shape, which the filing missed entirely.** The same booster's two export
  formats reported **2,259 (`.csv`) and 24 (`.eeprom`)** for one flight with 24 true fixes; `sg1.1`
  reported 1,232 and 13 for 6. The `.eeprom` looked nearly right only because AltusMetrum happens
  to write it at the receiver's own rate — which is the tell that the figure was a property of the
  file's sample rate rather than of the flight, and it is the same tell as the thrust-to-weight
  Sev-1 above.

  A new solution is one whose position differs from the last — altitude, latitude or longitude.
  **The `satellites` channel is deliberately not consulted**, though the entry proposed it: a
  sample with none is a held-over value *by definition*, so it cannot differ from what it was held
  over from, and across every corpus flight stating a GPS apogee the satellite gate changes not one
  count. Implied rather than ignored, and measured rather than assumed.

  **Two tests asserted the defect and had to be rewritten**, which is worth its own line: both
  `real-files.test.ts` and `e2e/analyze.spec.ts` asserted `gpsAscentFixes > 50` on a fixture whose
  true count is 3. A test written against a wrong number defends it.

  *The original entry follows.*

- **`gpsAscentFixes` counts SAMPLES, not fixes — by about 20×.** `lib/analyze/index.ts:2736`
  increments `fixes` for every row with a finite GPS altitude before apogee. A receiver that has
  no new fix does not write nothing: it holds its last position, so a 100 Hz log with a ~5 Hz
  receiver repeats each fix around twenty times. Measured over the corpus, counting distinct
  value-runs against finite samples in the GPS altitude column: `issuiuc-irec2023` 15,938 samples
  / 800 runs, `issuiuc-endurance` 590 / 29, `issuiuc-sg1.1` 4,118 / 65, `issuiuc-intrepid2`
  346 / 3. The number is published on screen, in `debrief.flight/1` (`lib/report.ts:1388`) and
  wherever the GPS apogee is qualified — and its whole job is to say how much receiver evidence is
  behind that apogee, which is precisely the claim it inflates. `lib/parsers/corpus.test.ts:170`
  asserts only `> 0`, so nothing catches it. The parser already reads a satellite-count column for
  this exact reason (`lib/parsers/altusmetrum.ts:181` — "a receiver with none does not report
  nothing — it holds its last position and altitude"), so the honest count is available; distinct
  value-runs is the fallback where it is not. Sev-2.

- **Whether OpenRocket's `maxacceleration` counts gravity is unverified, and Debrief now says so
  rather than guessing.** Debrief reports the specific force an accelerometer measures (1 g on the
  pad); a device reporting acceleration net of gravity is named as such, on the strength of a
  measured +1.00 g regularity across every AltimeterCloud file in the corpus. The `.ork` schema
  states no convention, so `isGravityConvention` is gated to `source === 'device'` and the design's
  own note carries the caveat instead. **What would close this:** a corpus flight with both a
  design and a log, or OpenRocket's own source. Until then the acceleration row of a
  predicted-vs-flown table may be off by a gravity for a reason that is not the flight, and the
  only thing standing between a flyer and that misreading is a sentence. Sev-3, and it is the one
  row of the ten where Debrief cannot yet say what it is comparing.

- **`e2e/logbook.spec.ts` → "the label and notes a flyer types stay with the flight" flaked once,
  2026-07-31.** Failed in one full-suite run (238/239) immediately after the logbook's sort control
  moved onto `<Segmented>`, then passed alone and passed a clean full-suite re-run at 239/239. The
  changed code is reachable from that test — it types into a note editor on a surface whose toolbar
  just changed — so this is worth a second look before it is dismissed, but two green runs say
  timing rather than regression. This is the second flake recorded in this file with the same
  shape (see the compare-spec entry below); both are assertions that follow a state write. If a
  third appears, the pattern to fix is the default 5 s timeout on an assertion whose neighbours
  carry 15–20 s, not the individual test.


- **`e2e/compare.spec.ts` → "a file a batch drop could not read can be mapped into the comparison
  it arrived with" is flaky.** Failed once in a full-suite run (`Comparing 3 flights` heading not
  found within 5 s at the step after the mapper submits), then passed twice individually and
  passed in a clean full-suite re-run — 223/223. The changed files that run could not reach it
  (`lib/stitch.ts` reaches no app code — its only importers are its own test and the corpus suite),
  so it is timing, not a regression: the
  assertion after the mapper's redirect carries the default 5 s where the surrounding steps use
  15–20 s, and the redirect waits on a logbook save. Give that one assertion the same timeout as
  its neighbours.

- **Switching recording on a flight report drops keyboard focus to `<body>`.** `onOpen` →
  `openRecent` sets `phase: 'loading'`, which unmounts the whole `FlightReport` subtree for a full
  re-parse and re-analyse — measured at six seconds on a phone with an 11 MB log — so a keyboard or
  screen-reader flyer is returned to the top of the document and has to find their place again. The
  wait itself IS announced (`role="status"`), so what is lost is the reading position, not the
  news. Same shape as opening a flight from the logbook, so fix it once for both.
- **A folder drop that yields exactly one readable flight gets no recording strip and no
  `recording` line in any export**, because that branch of `onFiles` (`components/Analyzer.tsx`)
  never puts `savedId` into state — the id is right there on the line above, used for
  `rememberOpenId`. `onCaption` is gated on the same thing and has been missing on this path for
  longer, so it is one fix for both: thread `r.savedId` into the report state. It means "the report
  says which recording it is reading" is not true on one of the three ways a report gets on screen.

- **NAR high-power competition scores several altitude systems on one flight as their AVERAGE**,
  rounded up to the next foot (<https://www.nar.org/contest-flying/high-power-competition/>), and
  Debrief deliberately computes no such mean — a blended number on a measurement surface is what
  the safety spine forbids. That reasoning is right for the headline reading and it leaves a real
  flyer without a number a governing body asks them for. Worth reconsidering as an explicitly
  labelled, explicitly cited COMPETITION figure on the comparison surface, beside the individual
  readings and never instead of them — the same shape the logger's own reported figures already
  take. Note the contrast that makes the call non-obvious: Tripoli's record form does the opposite,
  naming one altimeter of record (<https://tccrockets.com/v2/tcc-documents/recordform.pdf>).
- **The logbook is a list of FILES a flyer opened, where a real flight log is a list of FLIGHTS a
  ROCKET made.** Benchmarked against what flyers actually fill in: a club flight card asks for
  rocket name and make, every motor with manufacturer and delay, all-up weight, recovery
  configuration, "First Flight?", "Cert Flight?", and a post-flight evaluation with "Good Flight?"
  (<https://www.crmrc.org/CRMRC%20Flight%20Card.pdf>); Tripoli's record form adds total impulse,
  stage count, field elevation and launch temperature
  (<https://tccrockets.com/v2/tcc-documents/recordform.pdf>). Debrief has one free-text note for all
  of it. Ranked, the three that would be missed most: (1) an AIRFRAME the flights hang off, so the
  logbook answers "how has this bird flown"; (2) motor and recovery-outcome fields, i.e. whether the
  flight was any GOOD — apogee and speed cannot say that; (3) career counters, which mDACS reads off
  the altimeter as Total Flights, Total Flight Time and Total Ascent Elevation
  (<https://www.apogeerockets.com/downloads/PDFs/mDACS-usb-io-user-manual.pdf>). This is roadmap
  material, not a defect — filed here so the next decomposition has the citations.

- **The report's recording strip pops in after the report has rendered.** `savedId` arrives
  asynchronously — `openRecent` fires `saveRecent` un-awaited and folds the id into state when it
  resolves (`components/Analyzer.tsx`) — and the strip is keyed on it, so a two-altimeter flight's
  report paints, then grows a 99–203 px band above the readings a beat later and everything below
  it moves. Measured on the built export of `2396eb1`: absent immediately after the report heading
  appears, present at both 390 px (358×203) and 1280 px (1232×99) within 2.5 s. Not wrong, just
  late; the fix is to carry the id into the report state rather than after it. Worth knowing that
  this also makes any test that checks the strip immediately after the heading a flake.

- **DONE (2026-07-30) — the APOGEE spread between a flight's recordings is on its logbook row**,
  amber past 10%. Apogee only, and the corpus is why: over the six same-flight groups the apogee
  spread runs 0.03%–2.29% while the top-speed spread runs 2.56%–81.65%, the two widest being
  exactly the groups that pair a device-measured speed with a derived one. Showing a top-speed
  spread would have flagged two documented, correctly-grouped corpus flights as wrong, and the
  logbook stores no `maxVelocitySource` to caveat it with. Suppressed entirely when any recording
  carries a crop, since a cropped recording's stored apogee is the crop's apogee. **What is still
  missing** is a caveated speed spread on the COMPARISON surface, which has the analyses and
  already computes `mixedSource` — that is where it belongs, not on the row.
- **A grouped flight has no one-click overlay of its own recordings.** Ticking them and pressing
  Compare works, which is two more steps than a surface that already knows they are one flight
  should charge. Blocked behind the `compareFromLogbook` crop bug below, because a comparison
  button on a grouped flight multiplies that defect by the number of recordings.
- **The comparison still hedges about what it is comparing.** *"If these are recordings of the
  same flight, the independent readings agree to within …"* (`components/CompareView.tsx`, and the
  same sentence in `compareMarkdown` and `compareJson`'s `sameFlight: {verdict:'unknown'}`) was a
  hedge because nothing knew. `RecentMeta.flightId` now knows. A comparison built from one flight's
  recordings can state it, and one built across flights the files date days apart already refutes
  it — those two answers should not both read as "unknown".

- **`logbookRowNames` disambiguates a grouped flight's row against recordings the flyer cannot
  see.** It is still called with the whole `recents` list (`components/RecentFlights.tsx:214`), so
  where a flight is reported by one of four identically-named AltimeterCloud files, the accessible
  name of its ✎ and ✕ controls can be qualified by an apogee that is on a hidden recording rather
  than the one the row paints. Measured shape: four `mercury__altimetercloud` files, one distinct
  name; grouped, the list shows one row and the namer is still resolving four. Fix: name over
  `FlightGroup[]`, so the disambiguator sees what the screen shows.
- **The logbook's prune counts rows, so it can take one recording of a grouped flight and leave the
  rest.** `saveRecent` keeps the most recent `UNNOTED_MAX` un-noted ROWS
  (`lib/recents.ts`); a two-recording flight occupies two of the twelve, and a launch day can push
  one half out while the other stays — the flight silently changes which recording reports it (the
  survivor is promoted) and the "N flights were forgotten" note names a file, not a flight. Fix:
  prune by flight, and name the flight.
- **A comparison built from ids still re-reads each flight whole, so a cropped flight joins a
  comparison uncropped** — `lib/compareFromLogbook.ts:54` calls `analyzeAsync(result.flight)` with
  no `{ read: window }` although `getRecent` has already returned `rec.read`; `importRecent`
  (`lib/reopen.ts:23`) does not accept it either, and `readToWindow` sits in
  `components/Analyzer.tsx:98`, on the wrong side of the lib/components line. Already filed further
  down this file; re-filed here because D3 multiplies it by the number of recordings, and it should
  be fixed before a grouped flight gains a one-click overlay of its own recordings.
- **The `same_flight_group` column in the fixtures manifest is not a same-flight signal**, and
  anything automatic must not read it as one. It conflates three relations: genuinely independent
  instruments (`iss-irec2023`, `ac-lilnuke`), the SAME recording exported into two containers
  (`iss-stargazer1`'s `.eeprom` + its AltosUI CSV, `trf-rrc3-xprs2015`'s `.rff` + its mDACS text),
  and different STAGES of one launch (`iss-kairos`, `iss-sg1.2` — a TeleMega sustainer at 2,113 m
  beside two StratoLogger boosters at 465 m and a 9.5 m fragment). Reading it as "recordings of one
  flight" would group a booster with a sustainer, which is D4's job and a wrong composite.
  `RECON_GROUPS` in `lib/parsers/corpus.test.ts` already carries the honest subset — 6 of the 15.
- **Three genuinely-redundant instrument pairs in the corpus are not asserted by `RECON_GROUPS`**:
  `iss-intrepid3tf2-20230305` (two StratoLogger CF units, apogee 4,957.0 vs 4,939.6 m — 0.35%; max
  speed 847.6 vs 846.1 — 0.18%), `trf-f1-jan18` (Blue Raven LR 1,918.0 m + Featherweight GPS
  1,909.4 m — 0.45%), and `iss-sg1.2`'s two StratoLoggers, which both read 465.1 m — a 0.00% spread
  and the exact tie that used to cost a flyer their crown. Adding them widens the reconciliation
  guard at no cost; the first pair is `knownIssue` today, so check what arming it implies first.
- **`RECON_GROUPS` asserts `inputs.length >= 2`, not `=== g.files.length`**
  (`lib/parsers/corpus.test.ts`), so a parser regression that stopped reading two of the four
  `ac-lilnuke` recordings would still pass the four-altimeter group — the tightest corroboration in
  the corpus quietly degrading to a pair.

- **The MS5607 conversion ignored the `ms5611` flag AltOS writes beside its coefficients** —
  fixed. The two parts share a calibration block and a formula and differ in the scaling of the
  offset and sensitivity terms by one binary place, and the reference implementation switches on
  that flag. Both corpus boards write `false`, so the sample-for-sample check against AltosUI
  could never have caught it: a 5611 read as a 5607 gives a pressure about an atmosphere out.
  Found by writing the conversion a SECOND time from the vendor's implementation rather than
  from the datasheet — which also settled a real open question, that every division in it floors
  (an arithmetic shift on a signed long) rather than truncating toward zero. Those two agree
  above the calibration reference temperature, which is every reading in the corpus, and
  disagree by one count below it.
- **The MS5607 cold-weather branch and the MS5611 branch are still unverified against a real
  reading**, because no corpus download enters either — every AltOS flight here stays above
  20 °C and both boards are 5607s. What holds them is the second transcription above, which
  catches a slip in the shipped code and NOT a misreading of the datasheet, since both readings
  are the same person's. An earlier attempt tested only that the correction is *continuous* at
  its boundary and caught none of three deliberate mutations — every term vanishes at the
  boundary whatever its coefficient. **Get an AltOS `.eeprom` from a flight above ~11 km, or
  from a board with a 5611, and replace it with a real comparison.** `groundPressureAgrees` is
  the backstop until then: a board decoded with the wrong scaling disagrees with its own stated
  ground pressure and is refused rather than read.
- **DONE — `normalizeFlight` had silently dropped three different members of `RecentFlight` on the
  way back in from a backup**: the report caption, the chosen stretch, and the file's own bytes,
  the last of which made the one documented way to move a logbook between machines restore every
  raw download as mojibake. Each was found after shipping the member, two of them by review rather
  than by the suite. The rebuild is field by field on purpose — a hand-edited backup must not be
  able to inject a shape the app then trusts — so the fix was not to spread the object but to make
  the second listing impossible to forget. `lib/recents.test.ts` now round-trips a fixture typed
  `Required<RecentFlight>`: adding a member to that interface, optional or not, stops the file
  COMPILING until the fixture populates it, and then fails the round-trip until `normalizeFlight`
  carries it. Both halves verified by mutation — the typecheck names the missing property, the
  test names the member that did not survive.
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
  `report.hiddenFigures`, `report.order`, `report.figureOrder`, `theme`, `units`. Line 65-66 then
  says clearing browser data "or using the 'clear' control on the recents list" removes all of it —
  but `components/useLogbook.ts:62` clears IndexedDB and `compare.captions` only, so **18 keys
  survive** (17 when this was written; `report.figureOrder` was added 2026-07-31 and survives Clear
  exactly like the rest). A flyer lending a laptop presses Clear and the device still holds their rocket's
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
      same physical instant is +124.880 s on the LR clock. Any merge must be against the FIRST copy
      only — which the analyzer already isolates (`nextFlightStart`).
    - **RETRACTION — "the HR file has no second copy" was WRONG, and wrong in the way that matters.**
      That claim stood here and in PR #29, inferred from `Flight_Time` being monotonic. It **is**
      monotonic: re-measured 2026-07-31, **0 backward steps across all 93,164 rows**, and 93,164
      distinct stamps. That is precisely why the inference was invalid — neither the flight clock nor
      the wall clock marks the seam. Measured directly instead: **45,768 of 93,164 rows (49.1%) repeat
      an earlier row's sensor columns byte-for-byte**, at fixed lags of **30,654 samples (61.308 s)**,
      **14,139 (28.278 s)** and **44,793 (89.586 s)** — the device re-emits whole blocks of the flight.
      The seam that IS visible is the attitude solution: the quaternion returns to exact identity
      `1,0,0,0` at **t = 26.256, 59.286 and 87.564 s**, and at the file's start (−2.022).
      **The consequence is a wrong number, not a missing one.** Aligned naively on the shared zero, a
      merge would print an apogee shock labelled MEASURED for an event the device's own summary states
      at 115.8 Gs. Any HR merge must isolate the first copy the same way the LR merge does. Every
      figure in this bullet was reproduced from the file this run, not carried over.
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

- **A probe script in the repo root fails `npm run build`, which is the one command it must not.**
  `.gitignore` matches `*-tmp.*` so a stray `git add -A` cannot ship one — that half works. But
  `tsconfig.json` includes root `.ts` files, so `npm run build` type-checks the probe: three
  throwaway scripts written while measuring the thrust-to-weight defect turned the gate red on
  `TS2339` in code that was never going to ship. The workflow the manual prescribes is to write a
  probe, keep it until the finding is pinned, and delete it after — so the gate is red for exactly
  the stretch where it is being leaned on hardest, and the failure names a file the flyer will
  never see. Excluding `*-tmp.*` from `tsconfig.json` costs one line. Sev-3, and pure friction
  rather than a defect in the product.

- **FIXED 2026-08-04 (`#122`, live): `FigureChooser` hand-rolled a chip-shaped toggle the census
  could not see.** Both halves shipped in one increment, the measurement first: the three identical
  copies of the tag-scanning walk are one `openingTag` that skips `//` comments, block comments and
  string literals, and treats a template's `${…}` as the nesting it is. Falsified both ways — with
  the hand-roll present the old scan passes 20/20 green and the fixed one fails naming the file. The
  toggle then took `ChipButton` with `tone="accent"`, keeping `line-through` on the off state with a
  reason recorded: the other chip toggles in the app are view settings, and this one says which
  plots go in a document, so its off state means *left out* rather than *not chosen*. `DESIGN.md` §5
  now records that the class error has two members — enumerating the tag in front of you, and
  reading a comment as code — and that the second is the more dangerous, because the widening that
  fixes the first is visible in a diff.

  *The original entry follows, because its account of the mechanism is the part worth keeping.*
  `components/FigureChooser.tsx:90` is a `<button>` with `aria-pressed`, `rounded-md border`,
  `px-2 py-0.5 text-xs font-medium` and an indigo-on-pressed / zinc-with-`line-through`-on-unpressed
  ramp — which is the `ChipButton` primitive, at DESIGN §5's chip geometry minus one step of
  vertical padding (`py-0.5` against §5's `py-1`, i.e. off the touch contract as well as off the
  scale). The reason it survived the widened chip census in `lib/design-system.test.ts` is worth
  more than the fix: the scanner walks brace depth to find the end of a component, and it stops at
  a `>` inside a `//` comment — this file has `<title> figure` in the comment directly above the
  element (line 83), so the scan ends before reaching it. **Any hand-rolled chip under a comment
  containing an angle bracket is invisible to that test**, so the count it reports is a floor and
  reads as a total. Fix the scanner first (it is the measurement), then the call site. Sev-3.

- **§9's off-scale-spacing count says 0 while 124 half-step values exist, and the grep cannot see
  one of them.** Measured 2026-08-03 over `components` + `app`:
  `grep -rohE '\b((p|m)[xytblr]?|(gap|space)(-[xy])?)-[0-9]+\.[0-9]+\b'` returns **124** —
  `py-1.5` ×27, `py-0.5` ×17, `gap-1.5` ×17, `mt-0.5` ×15, `mt-1.5` ×9, `px-1.5` ×8, `px-2.5` ×7,
  `py-2.5` ×2, `mt-2.5` ×2, `mb-2.5` ×2, and a long tail. **§9's own command is
  `…-[0-9]+\b`, and `\b` matches before the `.`** — so in `py-1.5` it matches `py-1`, finds `1` on
  the scale, and passes. Every half-step in the repo is structurally invisible to the count that
  exists to find off-scale spacing.
  **This is NOT "124 breaches", and saying so would be the over-claim this ledger keeps catching.**
  §4's table sanctions `px-3 py-1.5` (inside a control) and `px-2 py-1` (a `text-xs` chip)
  explicitly, so a large share of the 124 is correct. What §4 names nowhere is the `2.5` family
  (`py-2.5`, `mt-2.5`, `mb-2.5`, `px-2.5` — 13 between them), and `GroundTrack`'s `Stat` has already
  been fixed once for exactly that. **The work is two steps and they must not be merged:** decide
  in §4 which half-steps are sanctioned and say so in the table, THEN widen the grep to catch the
  rest. Widening first would light up 124 sites with no rule to judge them by.
  **§4 and §9 are carried identically by `nrdptel/fusionspace-loft`**, so both steps are owed to
  both repos — which is why this is filed rather than done.
  *This is the third census found blind in one run — and the only one of the three that is §9's
  own.* The other two are in `lib/design-system.test.ts`, not in §9's shell block: the **chip**
  census scanned `<span>` only and missed a chip written as an `<li>`, and the **notice** census
  enumerated `div|section|aside|li|ul` and missed half its population, written as `<p>`. *(A first
  version of this line said "the card census that matches `rounded-xl` only" — that blindness is
  real and documented, but it was found on 2026-07-31, two runs before this one, so citing it here
  put a stale finding inside a claim about this run. The card census IS one of §9's six commands;
  the chip and notice ones are not commands at all.)* The pattern is the same every time and it is
  the reason to state it: **a measurement scoped to the form the drift was first noticed in, then
  read as covering the class.**
- **Is the `500/30` border ramp heavy enough on PAPER?** §5's hued chips and cards border at
  `<hue>-500/30`, which over white resolves near `#d0d1fb` for indigo — visibly lighter than the
  `border-indigo-300` (`#a5b4fc`) that `FlightReport`'s format chip hand-rolled before it converted
  on 2026-08-03. `globals.css` sets `print-color-adjust: exact` and its comment names "the
  format/event chips" specifically, and the report strip is not `print:hidden`, so this lands on
  the artifact a certification package is built from. The conversion recovered the weight
  (`font-medium` now applies to every hued tone) but not the border. **Not fixed at the call site
  on purpose** — one chip is not a reason to break a family, and the question is whether the whole
  ramp wants a `print:` variant one step darker. Wants a printed page looked at, not a number
  reasoned about: measure it on paper or in a print-preview screenshot before changing a token
  four components share.
- **`Chip` cannot render as an `<li>`, so the one remaining real hand-rolled chip stays
  hand-rolled.** `RecognizedFormats.tsx:28` is a genuine filter token — §5's own words — inside a
  `<ul>`, and `Chip` renders a `<span>`. Converting it today would strip the list semantics a
  screen reader announces, which is the exact trade `Readout`'s comment records refusing for
  `GroundTrack`'s `Stat`. `Card` already solved this with an `as` prop; `Chip` renders two nested
  spans, so `as` would apply to the outer one only, and that is the whole change. Named in
  `lib/design-system.test.ts`'s `DELIBERATE` list so it is an allowance with a reason rather than
  a silence.
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
  hand. Read against what this entry actually asked for, though, the parity was on the REPORT
  and not in the logbook. **D3 (2026-07-30) closed half of that and only half**, so read the
  two carefully:

  - *Several recordings of one flight are one logbook row* — DONE. `RecentMeta.flightId`, one
    entry, counted once by the crowns, each recording still openable.
  - *A launch day's SEVERAL FLIGHTS in one file are still one row* — STILL OPEN, and it is a
    different problem: it is one FILE holding several flights, where D3 solved several files
    holding one flight. The row still carries the FILE's apogee whichever flight is on screen.
    The grouping mechanism does not help, because a recording is a row and these flights share
    one. It needs the crop to be addressable, which is where the entry below about
    `compareFromLogbook` dropping `rec.read` becomes load-bearing.

  A comparison built from ids also still re-reads each flight whole. Original entry:
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
