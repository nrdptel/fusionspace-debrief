// Flexible plotting: turn a flight into a flat list of "plottable channels" so an
// engineer can put any one of them on either axis. Everything is aligned on the
// same sample clock (the analysis series shares the raw flight's time base), so
// any channel can be plotted against time or against any other channel.

import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';
import { type UnitSystem, lengthIn, speedIn, accelInG, tempIn, UNIT_LABEL } from './display';

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
    { key: 'd-velocity', label: 'Velocity', group: 'Debrief', values: series.velocity, ...display('m/s') },
    { key: 'd-acceleration', label: 'Acceleration', group: 'Debrief', values: series.acceleration, ...display('m/s2') },
  ];
  const n = flight.time.length;
  flight.channels.forEach((c, i) => {
    // Skip channels the file declared but never filled, and any whose length
    // doesn't match the time base (a ragged array would break the shared x-axis).
    if (c.values.length !== n || !hasData(c.values)) return;
    out.push({ key: `r-${i}`, label: c.label, group: 'Recorded', values: c.values, ...display(c.unit) });
  });
  return out;
}
