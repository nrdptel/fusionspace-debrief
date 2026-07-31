// Flexible plotting: turn a flight into a flat list of "plottable channels" so an
// engineer can put any one of them on either axis. Everything is aligned on the
// same sample clock (the analysis series shares the raw flight's time base), so
// any channel can be plotted against time or against any other channel.

import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';
import { type UnitSystem, lengthIn, speedIn, accelInG, tempIn, pressureIn, pressureUnit, unitsOf, type UnitChoice, accelIn } from './display';
import { formulaGuard } from './csv';

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

interface CsvColumn {
  label: string;
  unit: string;
  values: Float64Array;
}

function csvHeader({ label, unit }: CsvColumn): string {
  // The label is file-derived (a logger's column name, or a flight's file name),
  // so defang any spreadsheet-formula text before quoting it.
  const h = formulaGuard(unit ? `${label} (${unit})` : label);
  return `"${h.replace(/"/g, '""')}"`;
}

/** CSV of exactly what the explorer is plotting (X column then each Y series),
 * in the displayed units — the data an engineer would otherwise re-derive by
 * hand. Values are trimmed to 6 significant figures; gaps are blank. */
export function exploreCsv(x: CsvColumn, ys: CsvColumn[]): string {
  const n = ys.reduce((m, y) => Math.min(m, y.values.length), x.values.length);
  const cell = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : '');
  const rows = [[csvHeader(x), ...ys.map(csvHeader)].join(',')];
  for (let i = 0; i < n; i++) {
    rows.push([cell(x.values[i]), ...ys.map((y) => cell(y.values[i]))].join(','));
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
export function buildPlotChannels(flight: RawFlight, series: FlightSeries): PlotChannel[] {
  const out: PlotChannel[] = [
    { key: 'd-altitude', label: 'Altitude (AGL)', group: 'Debrief', values: series.altitude, ...display('m') },
    // The pre-filter altitude — overlay it with the cleaned line to see exactly
    // what spike-removal took out (e.g. an ejection charge's pressure pop).
    { key: 'd-altitude-raw', label: 'Altitude (raw)', group: 'Debrief', values: series.altitudeRaw, ...display('m') },
    { key: 'd-velocity', label: 'Velocity', group: 'Debrief', values: series.velocity, ...display('m/s') },
  ];
  // Acceleration is offered only when it was measured. A baro-derived acceleration is the
  // second derivative of a coarse altitude and is pure differentiation noise — a real
  // corpus flight's trace swings ±450 g (and one mis-sampled file ±270,000 g), which
  // would just wreck the axis. Its peak is already withheld for the same reason, so the
  // trace isn't presented either; the velocity trace (a usable first derivative) stays.
  if (series.accelerationSource === 'device') {
    out.push({ key: 'd-acceleration', label: 'Acceleration', group: 'Debrief', values: series.acceleration, ...display('m/s2') });
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
  if (velUsable && hasData(series.airDensity)) {
    const q = new Float64Array(series.velocity.length);
    for (let i = 0; i < q.length; i++) {
      const v = series.velocity[i];
      q[i] = 0.5 * series.airDensity[i] * v * v;
    }
    // Shown in the chosen system's pressure unit (kPa/psi), matching the report
    // and comparison — not raw Pa like a recorded barometric-pressure channel.
    out.push({
      key: 'd-q',
      label: 'Dynamic pressure',
      group: 'Debrief',
      values: q,
      toDisplay: (v, sys) => pressureIn(v, sys),
      unitLabel: (sys) => pressureUnit(sys),
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
