# Backlog

Things noticed but not done — rough edges, missing affordances, formats seen in the
wild, ideas too big for one pass. One line each, newest first. Not a roadmap; a
memory, so a later pass doesn't have to rediscover them.

## Correctness / honesty

- An AltimeterCloud export's own peak acceleration sits exactly 1 g below Debrief's
  read on all five corpus files (31.3 G vs 32.3 G, etc.) — the device reports
  acceleration net of gravity, Debrief reports the specific force the accelerometer
  measured. Both defensible; decide which the cross-check should compare and say so.
- The Jolly Logic AltimeterThree official sample reads 9.0 g where its own `TotalAcc_g`
  column peaks at 19.14 g — the generic mapper doesn't recognise `Xacc_g/Yacc_g/Zacc_g`
  as body axes or `TotalAcc_g` as the magnitude, so acceleration comes off the altitude.
  A named Jolly Logic parser (a very common consumer altimeter) would fix it.
- A 30-column SRAD 9-DOF log (`Lyrid-04252021`) maps its `Baro` column (hPa) rather
  than the `AltiM`/`AltiF` altitude columns sitting right beside it, and its header row
  runs into the first data row with no newline. Prefer an explicit altitude column over
  a raw pressure column, and check the header-run-on case.
- Two `jimheaney` L1 logs read max acceleration ~40% under the file's own max |Acc|
  (23.8 g vs 39.2 g) while their two sibling files agree to 0.2% — worth checking
  whether the peak sits outside the boost window Debrief reads, and whether that's right.
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
