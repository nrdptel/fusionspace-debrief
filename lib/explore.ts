// Flexible plotting: turn a flight into a flat list of "plottable channels" so an
// engineer can put any one of them on either axis. Everything is aligned on the
// same sample clock (the analysis series shares the raw flight's time base), so
// any channel can be plotted against time or against any other channel.

import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';
import { type UnitSystem, lengthIn, speedIn, accelInG, tempIn, pressureIn, pressureUnit, UNIT_LABEL } from './display';
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
  toDisplay: (v: number, sys: UnitSystem) => number;
  /** Axis unit label for the chosen unit system. */
  unitLabel: (sys: UnitSystem) => string;
}

/** Map a canonical unit string to a display conversion + label. Lengths, speeds,
 * accelerations and temperatures follow the user's unit system; everything else
 * (pressure, voltage, angles, counts…) is shown in its native unit. */
function display(unit: string): Pick<PlotChannel, 'toDisplay' | 'unitLabel'> {
  switch (unit.toLowerCase().replace('²', '2')) {
    case 'm':
      return { toDisplay: (v, sys) => lengthIn(v, sys), unitLabel: (sys) => UNIT_LABEL[sys].length };
    case 'm/s':
      return { toDisplay: (v, sys) => speedIn(v, sys), unitLabel: (sys) => UNIT_LABEL[sys].speed };
    case 'm/s2':
      return { toDisplay: (v) => accelInG(v), unitLabel: () => 'g' };
    case 'c':
    case '°c':
      return { toDisplay: (v, sys) => tempIn(v, sys), unitLabel: (sys) => UNIT_LABEL[sys].temp };
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
 * values are ignored; returns null when no sample is in range. */
export function windowStats(x: Float64Array, y: Float64Array, lo: number, hi: number): WindowStats | null {
  const n = Math.min(x.length, y.length);
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let firstI = -1;
  let lastI = -1;
  for (let i = 0; i < n; i++) {
    const xv = x[i];
    if (!(xv >= lo && xv <= hi)) continue;
    const yv = y[i];
    if (!Number.isFinite(yv)) continue;
    count++;
    sum += yv;
    if (yv < min) min = yv;
    if (yv > max) max = yv;
    if (firstI < 0) firstI = i;
    lastI = i;
  }
  if (count === 0) return null;
  const delta = y[lastI] - y[firstI];
  const dx = x[lastI] - x[firstI];
  return { count, min, max, mean: sum / count, delta, rate: dx !== 0 ? delta / dx : NaN };
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
    { key: 'd-acceleration', label: 'Acceleration', group: 'Debrief', values: series.acceleration, ...display('m/s2') },
  ];

  // Mach number and dynamic pressure — the quantities a rocket is designed
  // around (transonic region, max-Q). Both ride on the derived velocity and the
  // flight's atmosphere, so they're only as good as it; offered when defined.
  if (Number.isFinite(series.speedOfSound) && series.speedOfSound > 0) {
    const mach = new Float64Array(series.velocity.length);
    for (let i = 0; i < mach.length; i++) mach[i] = series.velocity[i] / series.speedOfSound;
    // Unitless, so it sits on its own axis cleanly and reads straight off as Mach.
    out.push({ key: 'd-mach', label: 'Mach', group: 'Debrief', values: mach, ...display('') });
  }
  if (hasData(series.airDensity)) {
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
