# Backlog

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first. Not a roadmap; a
memory, so a later pass doesn't have to rediscover them.

## Correctness / honesty

- Checked, not a bug: the two jimheaney L1 logs that read Mach ~1.6 (1,838 and 1,809 ft/s
  on ~2,450 ft apogees) are faithful reads of a *startup transient* — both logs begin
  mid-boost with the baro filter still converging, and Debrief already warns that the log
  doesn't start on the pad and that a baro peak past Mach 0.9 bounds nothing. Their ascent
  velocity never goes negative, so the noise guard correctly leaves them alone. What would
  actually help is recognising that the opening samples of a log that starts mid-ascent are
  a filter transient, not flight.
- 12 of the corpus's 15 same-flight groups are not under reconciliation regression (only 3
  RECON_GROUPS exist). Several are genuinely comparable and would lock in agreement:
  ac-lilnuke (4 recordings, apogee within 0.04%), euroc-stacarl2 (1.4%), trf-f1-jan10
  (1.3%), trf-lemiv-l3 (4 analysable recordings, 2.7% spread).
- Two recordings of the Stargazer 1.1 *booster* genuinely disagree by 54% on apogee
  (TeleMetrum 2,502 ft vs StratoLogger 1,435 ft) — and each device's own summary states
  its own figure, so Debrief reproduces both faithfully. A real device disagreement worth
  surfacing, not a bug; do not add it as a reconciliation regression.
- The Blue Raven jan10 LR reads time-to-apogee 39.6 s where its paired Featherweight GPS
  reads 14.1 s on the same flight, and trf-lemiv-l3's four recordings spread 23.6–28.2 s.
  Apogee agrees to ~1% in both groups, so this is liftoff or apogee *timing*, not altitude
  — worth a look.
- The intrepid3tf2 AL1 recording reads a main descent of 2 ft/s where its AL0 partner reads
  57 ft/s on the same flight. AL1 is the power-loss file, but 2 ft/s is not a descent.

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
- A device summary file is now recognised and explained, but its figures still aren't
  *used*: dropping a summary and its log together should feed the summary's numbers into
  the cross-check as the device's side. That needs multi-file association — the next real
  step for reconciliation.
- Native binary logs still can't be *read*: an AltOS `.eeprom` (3 in the corpus), an
  Entacore `.bin`/`.xtra` and an RRC3 `.rff` now get an honest "no flight data here" with
  a route onward, but a real reader for the AltOS eeprom format (documented, open source)
  would cover files a flyer already has on disk — and each of those three has a paired CSV
  export in the corpus, so there is ground truth to check a reader against.
- `velocitySource: 'device'` still means "the file had a velocity column", which for a
  baro-only logger is barometric all the same. The alt-diff test catches the naive case;
  a device whose velocity column is a *filtered* baro derivative still reads as measured.

## Craft & product feel

- `e2e/worker.spec.ts` "a slow in-flight analysis does not overwrite a newer load" flaked
  once under full-suite parallel load and passed alone and on re-run — a timing assumption
  worth making load-independent before it costs someone a red CI.
- The comparison table sorts now, but doesn't filter, and columns can't be dragged into a
  deliberate order (booster/sustainer, or flight 1..n) — the next step for a launch day.
- Links inside prose stay 16–20 px tall on a phone, which is right — but check the few
  that act as navigation without living in a `<nav>` (the "Read the methods →" call to
  action, say) and move them into one.

## Benchmarked against the mature tools

Where AltosUI, the vendor apps and Excel still do a job better than Debrief does:

- **Per-quantity units.** Debrief has one feet/metres switch (acceleration is always g,
  pressure follows the system). AltosUI lets you choose the unit for each quantity, and a
  cert document may want mph or km/h for speed and °C for temperature regardless. North
  Star #2 asks for exactly this.
- **A raw sample table.** AltosUI has a data tab — a scrollable, copyable grid of the
  actual samples — and Excel *is* that. Debrief plots any channel and exports CSV but
  never shows the numbers on screen. Needs virtualisation for a 190k-row log.
- **A per-device flight list.** The vendor apps read several flights off one device and
  let you pick between them; Debrief's logbook is close but is keyed on files, not flights
  from one download session.

## Feature depth

- Everything lives on `/`. The product-shape invariant wants distinct surfaces —
  reading a flight, comparing/reconciling several, the report & export builder, the docs
  — each its own static route over the one model.
- No report/export builder yet: a table & plot picker with unit/colour/theme control and
  multi-format export in one place (North Star #2).
- Per-stage assembly (a staged flight logging each stage on its own device) isn't built;
  same-flight reconciliation handles redundant altimeters only.
