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

/** Every channel worth plotting: Debrief's three derived series first (the cleaned
 * canonical altitude/velocity/acceleration), then each channel the file recorded. */
export function buildPlotChannels(flight: RawFlight, series: FlightSeries): PlotChannel[] {
  const out: PlotChannel[] = [
    { key: 'd-altitude', label: 'Altitude (AGL)', group: 'Debrief', values: series.altitude, ...display('m') },
    { key: 'd-velocity', label: 'Velocity', group: 'Debrief', values: series.velocity, ...display('m/s') },
    { key: 'd-acceleration', label: 'Acceleration', group: 'Debrief', values: series.acceleration, ...display('m/s2') },
  ];
  flight.channels.forEach((c, i) => {
    if (!hasData(c.values)) return; // skip channels the file declared but never filled
    out.push({ key: `r-${i}`, label: c.label, group: 'Recorded', values: c.values, ...display(c.unit) });
  });
  return out;
}
