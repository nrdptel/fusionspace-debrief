# Backlog

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first. Not a roadmap; a
memory, so a later pass doesn't have to rediscover them.

## Correctness / honesty

- An AltimeterCloud export's own peak acceleration sits exactly 1 g below Debrief's
  read on all five corpus files (31.3 G vs 32.3 G, etc.) — the device reports
  acceleration net of gravity, Debrief reports the specific force the accelerometer
  measured. Both defensible; decide which the cross-check should compare and say so.
- The generic mapper doesn't recognise `Xacc_g/Yacc_g/Zacc_g` as body axes (`\bacc\b`
  finds no word boundary inside `xacc`), so the Jolly Logic sample's three axes go
  unmapped and only its `TotalAcc_g` magnitude is read. Harmless there, but a file with
  axes and no total column would lose them. A named Jolly Logic AltimeterThree parser —
  a very common consumer altimeter — is the better fix; needs the real app's header
  names, since the corpus fixture's were normalised when it was extracted from the
  official .xlsx.
- Checked, not a bug: three corpus files where Debrief's max acceleration sits far under
  the manifest's "max |Acc|" (Jolly Logic 9.0 g vs 19.14 g; jimheaney Discovery 23.8 vs
  39.2; The Gardener 23.5 vs 42.2). In each the file's peak is at deployment (t=7.2 s)
  or landing (t=107 s), not in the boost — Debrief reads boost acceleration and reports
  deployment shock separately, which is right. The manifest's ground truth is the naive
  whole-file maximum; worth correcting in the fixtures repo.
- Checked, not a bug: the `Lyrid-04252021` SRAD log reads 171 ft AGL against a manifest
  "6220 ft", which is MSL — its altitude record genuinely spans only the top 183 ft of a
  truncated capture, and Debrief now says so (no pad baseline, no clear ascent).
- The Altus Metrum native `.eeprom` files (three in the corpus) reach the column mapper
  with no roles, so they analyze as nothing. A native AltOS eeprom reader would cover
  them — the paired CSV exports parse fine, so there's ground truth to check against.
- The Blue Raven `_summary_` CSVs and the Featherweight GPS `_summary_` CSVs carry the
  device's own headline figures but map to no roles; they'd be first-class cross-check
  sources (reported values) rather than failed flights.
- `velocitySource: 'device'` still means "the file had a velocity column", which for a
  baro-only logger is barometric all the same. The alt-diff test catches the naive case;
  a device whose velocity column is a *filtered* baro derivative still reads as measured.

## Feature depth

- Everything lives on `/`. The product-shape invariant wants distinct surfaces —
  reading a flight, comparing/reconciling several, the report & export builder, the docs
  — each its own static route over the one model.
- No report/export builder yet: a table & plot picker with unit/colour/theme control and
  multi-format export in one place (North Star #2).
- Per-stage assembly (a staged flight logging each stage on its own device) isn't built;
  same-flight reconciliation handles redundant altimeters only.
