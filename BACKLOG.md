# Backlog

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first. Not a roadmap; a
memory, so a later pass doesn't have to rediscover them.

## Correctness / honesty

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
- **The transonic artefact also runs the other way, and nothing catches it yet.** On the
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
- A Blue Raven also solves downrange/crossrange velocity and position (`Velocity_DR/CR`,
  `Inertial_DR_Position`, `Inertial_CR_position`) and a roll angle; all four are still
  dropped. They'd need a speed-quantity and a distance-quantity "extra channel" role, the
  same shape as the inertial-altitude one just added.
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
- Native binary logs still can't be *read*: an AltOS `.eeprom` (3 in the corpus), an
  Entacore `.bin`/`.xtra` and an RRC3 `.rff` now get an honest "no flight data here" with
  a route onward, but a real reader for the AltOS eeprom format (documented, open source)
  would cover files a flyer already has on disk — and each of those three has a paired CSV
  export in the corpus, so there is ground truth to check a reader against.
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

- Removed a real mechanism for "offline reload fails even though the page is cached": both
  this host and Cloudflare send `Vary: Accept-Encoding` on the shell, and the copies the
  service worker stores are fetched by the worker, whose Accept-Encoding needn't match the
  page's — so a cached shell could be invisible to the navigation it was stored for. Cache
  lookups now pass `ignoreVary`. Stressed 12x by cutting the network the instant the document
  was cached: 12/12 come up and run. (Honest caveat: the one ERR_FAILED that started this was
  seen once and never reproduced on demand, so the mechanism is removed rather than proven
  guilty.)
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
- Offline, a route that was never visited (`/methods/`) falls back to the cached `/` — so the
  app comes up, but showing the home page at the /methods/ URL. Better than an error, still a
  small lie; caching each visited route's own document, or an offline notice, would fix it.

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

## Benchmarked against the mature tools

Where AltosUI, the vendor apps and Excel still do a job better than Debrief does:

- Done: **named view presets.** Up to 8 views kept under names you choose, applied on any
  flight that has those channels (stored by channel label, so they survive moving between
  loggers). Re-saving a name updates it. Next in the same machinery: the report/export builder
  wants exactly this shape for "which tables and plots go in my document", and a preset can't
  yet be exported or shared — it lives in this browser only.

- **Per-quantity units.** Debrief has one feet/metres switch (acceleration is always g,
  pressure follows the system). AltosUI lets you choose the unit for each quantity, and a
  cert document may want mph or km/h for speed and °C for temperature regardless. North
  Star #2 asks for exactly this.
- **A raw sample table** — done, in the explorer. What's missing next to a spreadsheet:
  no per-column sort or filter, no cell selection (only whole-row text selection), and no
  "jump to an event" so a flyer can land on burnout without scrolling.
- **A per-device flight list.** The vendor apps read several flights off one device and
  let you pick between them; Debrief's logbook is close but is keyed on files, not flights
  from one download session.
- Found by driving a season into the logbook: it sorts but couldn't be *searched* — now it
  can (name, logger, note, launch day; all terms in any order), and the row shows the launch
  day the file stated rather than "3d ago". Three parsers read a date (AltOS and a
  Featherweight GPS state a GPS's UTC; a Blue Raven states its own clock); 12 of 28 corpus
  files and 3 of 5 fixtures carry one. Still open: the **column mapper can't carry a date at
  all** — a generic CSV with Year/Month/Day columns loses them, because there's no date role.
  That's the next step, and it would also cover a StratoLogger export (which states none) no
  worse than today.
- A corpus TeleMetrum states 27 Apr 2013 for a flight the ISSUIUC repo files under 2023-10-01
  — a decade out, on all 4,118 rows. Debrief reports what the file says (that's the device's
  own record, and the reason the label names whose clock it is), but it's worth knowing the
  stated date can be wrong when anything downstream is tempted to trust it: don't use it to
  group a launch day, dedupe, or order a stage assembly.

## Feature depth

- Everything lives on `/`. The product-shape invariant wants distinct surfaces —
  reading a flight, comparing/reconciling several, the report & export builder, the docs
  — each its own static route over the one model.
- No report/export builder yet: a table & plot picker with unit/colour/theme control and
  multi-format export in one place (North Star #2).
- Per-stage assembly (a staged flight logging each stage on its own device) isn't built;
  same-flight reconciliation handles redundant altimeters only.
