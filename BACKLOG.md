# Backlog

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first. Not a roadmap; a
memory, so a later pass doesn't have to rediscover them.

## Correctness / honesty

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
- Native binary logs still can't be *read*: an AltOS `.eeprom` (3 in the corpus), an
  Entacore `.bin`/`.xtra` and an RRC3 `.rff` now get an honest "no flight data here" with
  a route onward, but a real reader for the AltOS eeprom format (documented, open source)
  would cover files a flyer already has on disk — and each of those three has a paired CSV
  export in the corpus, so there is ground truth to check a reader against.
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
- **Wrong diagnosis first, then the real one: the service worker was serving navigations
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
- **A raw sample table** — done, in the explorer, and *jump to an event* is done too: a row of
  buttons scrolls straight to liftoff, burnout, apogee or a deployment and highlights the
  sample landed on (it places the event on whatever is on the x axis, so it works on an
  altitude-vs-velocity plot as well as against time). Still missing next to a spreadsheet:
  per-column sort, and cell/column selection — only whole-row text selection works, so copying
  one channel out means the CSV export.
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
