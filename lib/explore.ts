// Flexible plotting: turn a flight into a flat list of "plottable channels" so an
// engineer can put any one of them on either axis. Everything is aligned on the
// same sample clock (the analysis series shares the raw flight's time base), so
// any channel can be plotted against time or against any other channel.

import type { RawFlight } from './flight/types';
import type { FlightSeries, FlightMetrics } from './analyze/types';
import { ACCEL_CLIPPED_CAVEAT, accelIsClipped, apogeeCaveat, apogeeIsQualified, withheldReason, type AccelCaveatFacts, type ApogeeCaveatFacts } from './readings';
import { type UnitSystem, lengthIn, speedIn, accelInG, tempIn, pressureIn, pressureUnit, unitsOf, type UnitChoice, accelIn } from './display';
import { formulaGuard } from './csv';
import { Q_ASCENT_CAVEAT, dynamicPressureSeries } from './dynamicPressure';
import { PROVENANCE_COLUMN, PROVENANCE_MIXED, provenanceCell, syntheticHeader } from './synthetic';

export interface PlotChannel {
  key: string;
  /** Display name (an original column label for recorded channels). */
  label: string;
  /** Which list it belongs to: Debrief's derived series, or what the file recorded. */
  group: 'Debrief' | 'Recorded';
  /** Stored values, in the canonical/native unit, aligned 1:1 with the time base. */
  values: Float64Array;
  /** Convert a stored value to the displayed value for the chosen unit system. */
  toDisplay: (v: number, sys: UnitChoice) => number;
  /** Axis unit label for the chosen unit system. */
  unitLabel: (sys: UnitChoice) => string;
  /** Why a statistic taken off this channel is not a reading Debrief stands behind.
   *
   *  The velocity trace is deliberately still offered when the peak speed was withheld, so a
   *  mis-scaled column can be seen and diagnosed — but the stats table beside it publishes a
   *  `max`, calls those "the numbers a cert document quotes", and copies them to the clipboard.
   *  A trace kept for diagnosis and a maximum offered for a document are different claims, and
   *  the second one needs the headline's caveat travelling with it. */
  caveat?: string;
  /**
   * What stretch of the flight this channel is drawn over, when it is not the whole record.
   *
   * **Deliberately NOT `caveat`, and the distinction is the point.** A caveat says *these numbers
   * are not ones to quote* and is rendered in §2's warning hue, on "the one row whose numbers the
   * report refused". A scope says *these numbers are exactly right, over this stretch* — the
   * dynamic-pressure curve is read over the ascent because that is where a load case exists, and
   * its max IS the max-Q the report publishes. Putting that in `caveat` would paint every flight's
   * row amber forever, and `explore.test.ts` already states the rule it would break: *a caveat on
   * every flight is a caveat nobody reads*. Two meanings, two fields, so the warning hue keeps
   * meaning one thing.
   */
  scope?: string;
}

/** Map a canonical unit string to a display conversion + label. Lengths, speeds,
 * accelerations and temperatures follow the user's unit system; everything else
 * (pressure, voltage, angles, counts…) is shown in its native unit. */
function display(unit: string): Pick<PlotChannel, 'toDisplay' | 'unitLabel'> {
  switch (unit.toLowerCase().replace('²', '2')) {
    case 'm':
      return { toDisplay: (v, sys) => lengthIn(v, sys), unitLabel: (sys) => unitsOf(sys).length };
    case 'm/s':
      return { toDisplay: (v, sys) => speedIn(v, sys), unitLabel: (sys) => unitsOf(sys).speed };
    case 'm/s2':
      return { toDisplay: (v, sys) => accelIn(v, sys), unitLabel: (sys) => unitsOf(sys).accel };
    case 'c':
    case '°c':
      return { toDisplay: (v, sys) => tempIn(v, sys), unitLabel: (sys) => unitsOf(sys).temp };
    default:
      return { toDisplay: (v) => v, unitLabel: () => unit };
  }
}

const hasData = (v: Float64Array) => v.some((x) => Number.isFinite(x));

export interface CsvColumn {
  label: string;
  unit: string;
  values: Float64Array;
  /** Did Debrief MAKE UP the flight these numbers came from?
   *
   *  Per column rather than per call because the comparison overlay writes one column per flight,
   *  so a single file can hold a made-up flight beside a recording. */
  synthetic?: boolean;
  /**
   * The qualification this channel carries on screen — a withheld peak, a floor apogee, a railed
   * accelerometer, a curve drawn over the ascent only.
   *
   * **It is here because the panel's clipboard and the panel's FILE disagreed about it.**
   * `Copy these stats` writes `label — caveat` per channel, and `Save .csv` beside it wrote the
   * bare label, so the same numbers left the same panel by two routes and only one of them said
   * what they could not be used for. A CSV has no comment syntax every reader agrees on — which is
   * this repo's standing reason for not writing a build stamp into one — so it rides in the column
   * HEADER, the one field every reader must already parse. That is row 41's precedent, the same
   * one the provenance column above is built on.
   */
  caveat?: string;
  /** The stretch this column is drawn over, when it is not the whole record — see
   *  `PlotChannel.scope`. Written into the header beside the caveat, because a reader opening the
   *  file cannot see that the column stops early or ask why. */
  scope?: string;
}

function quoted(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function csvHeader({ label, unit, synthetic, caveat, scope }: CsvColumn): string {
  // The label is file-derived (a logger's column name, or a flight's file name), so defang any
  // spreadsheet-formula text — BEFORE tagging it, not after. `formulaGuard` inspects the first
  // character only, so a `SYNTHETIC — ` prefix in front of it hides a leading `=` and the guard
  // silently stops applying to exactly the columns this slice added. Found by the pre-push review.
  const named = syntheticHeader(formulaGuard(unit ? `${label} (${unit})` : label), synthetic);
  // After the synthetic tag, not before it: the made-up claim is the stronger one and stays first;
  // then the caveat (a refusal), then the scope (a domain), which is the order of decreasing force.
  const notes = [caveat, scope].filter(Boolean).join('; ');
  return quoted(notes ? `${named} — ${notes}` : named);
}

/** CSV of exactly what the explorer is plotting (X column then each Y series),
 * in the displayed units — the data an engineer would otherwise re-derive by
 * hand. Values are trimmed to 6 significant figures; gaps are blank.
 *
 * **A column whose flight Debrief made up says so twice, and the two say different things.** This
 * writer has two call sites of opposite shape — one flight's channels (`ChannelExplorer`) and one
 * column per flight per channel on a shared clock (`CompareView`'s `compare-data.csv`) — so the
 * claim goes on both axes a flight can vary along: the column HEADER carries it for a column that
 * travels alone (`SampleTable` copies exactly one), and a leading `Provenance` column carries it
 * for a block of rows selected without the header, which is the case `lib/synthetic.ts` documents
 * at length and `lib/report.ts`'s data CSV already answers this way. FIRST, like that one, so it is
 * the column a spreadsheet opens on.
 *
 * A file with no made-up column is byte-identical to what this wrote before the claim existed: the
 * column appears only where there is something to say, so a real flight's export is not reshaped
 * for a demonstration's sake.
 *
 * The comparison's shared clock is left untagged by its caller, because a liftoff-aligned time base
 * is nobody's recording — but it is counted like any other column here, so nothing about the rule
 * depends on which column a caller decides that is. */
export function exploreCsv(x: CsvColumn, ys: CsvColumn[]): string {
  const n = ys.reduce((m, y) => Math.min(m, y.values.length), x.values.length);
  const cell = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : '');
  // **Every column counts the same way, x included, and the sentence says "all" only when every
  // one of them is made up.** The first cut asked two independent questions — "is any y made up"
  // for whether to write the column, "madeUp === ys.length" for which sentence — and the second was
  // vacuously true at `ys.length === 0`, so the two could disagree about one file. Counting columns
  // once answers both. It also gives the right words for free on a comparison whose flights are ALL
  // made up: the shared clock is nobody's, so it is untagged, so "some of these columns" is what is
  // literally true of that file.
  const cols = [x, ...ys];
  const madeUp = cols.filter((c) => c.synthetic).length;
  // Quoted because both sentences carry a comma — `provenanceCell(true)` ends "made up by Debrief,
  // not flown" — and an unquoted comma in a data cell breaks the file's own column count for every
  // reader. Load-bearing today, not defensive against a future edit.
  const provenance = madeUp > 0 ? quoted(madeUp === cols.length ? provenanceCell(true) : PROVENANCE_MIXED) : null;
  const lead = provenance ? `${quoted(PROVENANCE_COLUMN)},` : '';
  const rows = [lead + [csvHeader(x), ...ys.map(csvHeader)].join(',')];
  for (let i = 0; i < n; i++) {
    const row = [cell(x.values[i]), ...ys.map((y) => cell(y.values[i]))].join(',');
    rows.push(provenance ? `${provenance},${row}` : row);
  }
  return rows.join('\n');
}

/** Bucket display-units onto a left and right axis, in the order they first
 * appear. Two distinct units share a chart cleanly (independent scales); a third
 * distinct unit has nowhere to go, so the UI prevents adding one. */
export function planAxes(units: string[]): { leftUnit?: string; rightUnit?: string } {
  const distinct: string[] = [];
  for (const u of units) if (!distinct.includes(u)) distinct.push(u);
  return { leftUnit: distinct[0], rightUnit: distinct[1] };
}

export interface WindowStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  /** Value at the window's last in-range sample minus its first. */
  delta: number;
  /** delta / (x at last − x at first); NaN when the x span is zero. */
  rate: number;
}

/** Summary stats for one y-series over the samples whose x falls in [lo, hi].
 * Used to measure whatever range is currently in view (zoom = selection). NaN y
 * values are ignored; returns null when no sample is in range.
 *
 * **`mean` is weighted by TIME, not by sample, and that is the whole point of the `time`
 * argument.** A mean over sample index answers "what did a typical sample read", which is the
 * same question as "what did this stretch of flight average" only when the samples are evenly
 * spaced — and plenty of loggers are not. This is the identical defect `timeMean` was written
 * out of the analyzer for (see its doc comment in `lib/analyze/index.ts`), still being printed
 * one panel over: measured on `fwgps__trf-f1machbuster-jan10`, whose cadence runs 0.099–4.900 s,
 * a flyer who zooms to the drogue leg to read a descent rate off the velocity channel got
 * **−49.31 m/s where the flight itself reports −64.81** — 23.9% low, on the reading a canopy is
 * sized against, and reproducing the analyzer's own pre-fix figure of 49.33 to 0.04%.
 *
 * Trapezoidal, weighting the INTERVAL rather than the sample, and matching `timeMean` case for
 * case — including the dropout rule, where an interval with one finite end is weighted at that
 * end rather than discarded. The naive form drops the gap that closes the window. Only intervals
 * between samples that are **adjacent in the record** are weighted, which is what makes this
 * correct when x is not time:
 * a velocity-against-altitude plot can select a scattered set of samples, and bridging a weight
 * across the unselected stretch between two of them would invent a duration that is not in the
 * selection. Where no interval qualifies — a single sample, a scattered selection, or no `time`
 * at all — it falls back to the sample mean, which is then the honest answer to the only
 * question the data can support. */
export function windowStats(
  x: Float64Array,
  y: Float64Array,
  lo: number,
  hi: number,
  time?: Float64Array,
): WindowStats | null {
  const n = Math.min(x.length, y.length);
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let firstI = -1;
  let lastI = -1;
  // The time-weighted accumulator, and the last selected sample with a finite y so an
  // interval can be closed against it.
  let wSum = 0;
  let wWeight = 0;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const xv = x[i];
    if (!(xv >= lo && xv <= hi)) continue;
    const yv = y[i];
    const finite = Number.isFinite(yv);
    if (finite) {
      count++;
      sum += yv;
      if (yv < min) min = yv;
      if (yv > max) max = yv;
      if (firstI < 0) firstI = i;
      lastI = i;
    }
    // `prev >= 0` is not redundant with `prev === i - 1`: on the first selected sample both
    // are -1, so the adjacency test passes, `time[-1]` is undefined and `dt` comes out NaN.
    // That happens to be harmless only because `NaN > 0` is false — correctness by accident,
    // and it broke the moment the duration guard was loosened during falsification.
    if (time && prev >= 0 && prev === i - 1 && i < time.length) {
      const dt = time[i] - time[prev];
      const a = y[prev];
      const fa = Number.isFinite(a);
      if (dt > 0 && (fa || finite)) {
        // One dropped sample costs its own two gaps, not the whole leg: an interval with a
        // single finite end is weighted at that end's value rather than discarded. This is
        // `timeMean`'s rule in `lib/analyze/index.ts`, and matching it is the point — an
        // earlier draft here skipped any interval touching a NaN, which silently removed
        // BOTH of a dropout's intervals from the denominator and made the two "identical"
        // implementations disagree by 31.25 against 29 on an ordinary sensor dropout.
        wSum += (fa && finite ? (a + yv) / 2 : fa ? a : yv) * dt;
        wWeight += dt;
      }
    }
    // Advances on any sample IN RANGE, finite or not, so a dropout does not break adjacency
    // on both sides. A sample outside the window never gets here, which is what keeps a
    // scattered selection from bridging a duration nobody selected.
    prev = i;
  }
  if (count === 0) return null;
  const delta = y[lastI] - y[firstI];
  const dx = x[lastI] - x[firstI];
  return {
    count,
    min,
    max,
    mean: wWeight > 0 ? wSum / wWeight : sum / count,
    delta,
    rate: dx !== 0 ? delta / dx : NaN,
  };
}

/** Every channel worth plotting: Debrief's three derived series first (the cleaned
 * canonical altitude/velocity/acceleration), then each channel the file recorded. */
export function buildPlotChannels(
  flight: RawFlight,
  series: FlightSeries,
  metrics?: Pick<FlightMetrics, 'maxVelocityWithheld'> & ApogeeCaveatFacts & AccelCaveatFacts,
): PlotChannel[] {
  // The peak speed the report refused, and why. `series.velocityUnusable` is the flag; the
  // REASON lives on the metrics, so the caveat is fuller when a caller has them — and a caller
  // that has none still gets the refusal rather than silence.
  const speedWithheld = series.velocityUnusable || metrics?.maxVelocityWithheld != null;
  const velocityCaveat = speedWithheld
    ? `not a reading Debrief stands behind — the peak speed is withheld${
        metrics?.maxVelocityWithheld ? `, ${withheldReason(metrics.maxVelocityWithheld)}` : ''
      }`
    : undefined;

  // **The same rule, one channel over.** This panel's stats table publishes each plotted
  // channel's max — and the max of the altitude IS the apogee, the reading every other surface
  // qualifies when the log ends at its own peak or when Debrief has disowned the channel. Only
  // the velocity carried a caveat here, so `Copy these stats` and the `.csv` beside it wrote a
  // bare apogee out of a report whose grid, print card and every export said it was a lower
  // bound. `apogeeCaveat` is the tile's own sentence, shared rather than restated.
  const altitudeCaveat = metrics && apogeeIsQualified(metrics) ? apogeeCaveat(metrics) : undefined;

  // **And one channel further over, for the identical reason.** The paragraph above was written
  // about the apogee and applies unchanged to the acceleration: the max of this trace IS the
  // peak the grid tags "may be clipped", the comparison tags "(clipped)" and the analysis warns
  // about outright — and this table published it bare into `Copy these stats` and the `.csv`
  // beside it. Found 2026-08-13 by the surface audit that followed the saturated sample, on the
  // one channel that sample exists to qualify.
  const accelerationCaveat = metrics && accelIsClipped(metrics) ? ACCEL_CLIPPED_CAVEAT : undefined;

  const out: PlotChannel[] = [
    { key: 'd-altitude', label: 'Altitude (AGL)', group: 'Debrief', values: series.altitude, ...display('m'), caveat: altitudeCaveat },
    // The pre-filter altitude — overlay it with the cleaned line to see exactly
    // what spike-removal took out (e.g. an ejection charge's pressure pop). It carries the same
    // caveat: a reader comparing the two lines is reading the same apogee off both.
    { key: 'd-altitude-raw', label: 'Altitude (raw)', group: 'Debrief', values: series.altitudeRaw, ...display('m'), caveat: altitudeCaveat },
    { key: 'd-velocity', label: 'Velocity', group: 'Debrief', values: series.velocity, ...display('m/s'), caveat: velocityCaveat },
  ];
  // Acceleration is offered only when it was measured. A baro-derived acceleration is the
  // second derivative of a coarse altitude and is pure differentiation noise — a real
  // corpus flight's trace swings ±450 g (and one mis-sampled file ±270,000 g), which
  // would just wreck the axis. Its peak is already withheld for the same reason, so the
  // trace isn't presented either; the velocity trace (a usable first derivative) stays.
  if (series.accelerationSource === 'device') {
    out.push({ key: 'd-acceleration', label: 'Acceleration', group: 'Debrief', values: series.acceleration, ...display('m/s2'), caveat: accelerationCaveat });
  }

  // Mach number and dynamic pressure — the quantities a rocket is designed
  // around (transonic region, max-Q). Both ride on the velocity and the flight's
  // atmosphere, so they're only as good as it; offered when defined — but not when the
  // peak speed was withheld, for ANY reason, since the analysis already withheld the Mach
  // and max-Q headlines derived from it (the velocity trace itself stays, so a mis-scaled
  // column can still be seen and diagnosed). One flag, so a new reason reaches here too.
  const velUsable = !series.velocityUnusable;
  if (velUsable && Number.isFinite(series.speedOfSound) && series.speedOfSound > 0) {
    const mach = new Float64Array(series.velocity.length);
    // Against the local speed of sound at each height (colder, slower aloft), like the report.
    for (let i = 0; i < mach.length; i++) mach[i] = series.velocity[i] / series.speedOfSoundProfile[i];
    // Unitless, so it sits on its own axis cleanly and reads straight off as Mach.
    out.push({ key: 'd-mach', label: 'Mach', group: 'Debrief', values: mach, ...display('') });
  }
  // **And the load case, which is the one this table got wrong for longest.** The max of this
  // trace IS the max-Q the grid, the report and every export publish — and until 2026-08-17 it
  // was built here over the whole record while the headline was built over the ascent, so this
  // table, `Copy these stats` and the `.csv` beside it republished the deployment transient the
  // analysis exists to refuse: 47,322 kPa against an ascent peak of 404 kPa on one corpus
  // flight. `lib/dynamicPressure.ts` is now the only place that computes it, for all four
  // surfaces, and it carries its own caveat so the truncated curve reads as a decision.
  // Built once and tested, rather than `hasDynamicPressure()` followed by a second identical
  // pass — this runs on every render of a report whose series can be 190k samples long.
  const q = velUsable && hasData(series.airDensity) ? dynamicPressureSeries(series) : null;
  if (q && q.some((v) => Number.isFinite(v))) {
    // Shown in the chosen system's pressure unit (kPa/psi), matching the report
    // and comparison — not raw Pa like a recorded barometric-pressure channel.
    out.push({
      key: 'd-q',
      label: 'Dynamic pressure',
      group: 'Debrief',
      values: q,
      toDisplay: (v, sys) => pressureIn(v, sys),
      unitLabel: (sys) => pressureUnit(sys),
      scope: Q_ASCENT_CAVEAT,
    });
  }
  const n = flight.time.length;
  flight.channels.forEach((c, i) => {
    // Skip channels the file declared but never filled, and any whose length
    // doesn't match the time base (a ragged array would break the shared x-axis).
    if (c.values.length !== n || !hasData(c.values)) return;
    out.push({ key: `r-${i}`, label: c.label, group: 'Recorded', values: c.values, ...display(c.unit) });
  });
  return out;
}
