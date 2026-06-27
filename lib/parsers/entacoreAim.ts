// Entacore AIM (AIM XTRA flight computer, and the AIM BASE ground station that
// receives its telemetry). Like the Featherweight Raven export, every channel
// carries its own preceding `time` column because the sensors log at different
// rates, so there's no single clock in the file:
//
//   time,Gyro X,Gyro Y,Gyro Z,time,pressure,Pressure MSL,Pressure AGL,time,acceleration,…
//
// We read each channel as its own (time, value) series and resample onto the
// densest of pressure/accel. Altitude is derived from the barometric pressure;
// the "Pressure MSL"/"Pressure AGL" pair of columns makes the format unmistakable.

import type { Parser, ParseInput } from './types';
import type { RawFlight, Channel } from '../flight/types';
import { parseTable } from '../csv';
import { G0 } from '../units';
import { type Series, readChannel, resample, densest } from './multiTimebase';

interface ColRef {
  timeCol: number;
  valCol: number;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const low = rows[i].map((c) => c.trim().toLowerCase());
    if (low.includes('pressure agl') && low.includes('pressure msl')) return i;
  }
  return -1;
}

/** Map each value column to the `time` column that precedes it. AIM groups a run
 *  of channels under one bare `time` header until the next `time`. */
function mapColumns(headers: string[]): Map<string, ColRef> {
  const out = new Map<string, ColRef>();
  let timeCol = -1;
  headers.forEach((h, i) => {
    const name = h.trim().toLowerCase();
    if (name === 'time') {
      timeCol = i;
      return;
    }
    if (timeCol >= 0 && name && !out.has(name)) out.set(name, { timeCol, valCol: i });
  });
  return out;
}

export const entacoreAimParser: Parser = {
  id: 'entacore-aim',
  label: 'Entacore AIM',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 4000).toLowerCase();
    if (head.includes('pressure msl') && head.includes('pressure agl') && head.includes('time')) return 0.95;
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the Entacore AIM header.');
    const cols = mapColumns(rows[headerIdx]);
    const dataRows = rows.slice(headerIdx + 1);

    const ref = (name: string) => cols.get(name) ?? null;
    const read = (name: string): Series | null => {
      const c = ref(name);
      return c ? readChannel(dataRows, c.timeCol, c.valCol) : null;
    };

    const pressure = read('pressure');
    if (!pressure || pressure.t.length < 4) {
      throw new Error('This Entacore AIM file has no usable barometric channel.');
    }
    const accel = read('acceleration'); // axial specific force, in g

    // Master clock = the denser of pressure / axial accel (accel is the high-rate
    // channel on the AIM XTRA; on a BASE telemetry file pressure may win).
    const master = densest([pressure, accel].filter((s): s is Series => !!s)) ?? pressure;
    if (master.t.length < 4) throw new Error('Too few samples in the Entacore AIM file.');
    const time = Float64Array.from(master.t);

    const out: Channel[] = [];
    // Raw barometric pressure (Pa) — the pipeline sets the pad baseline and
    // derives altitude, the same path as any pressure-only logger.
    out.push({ kind: 'pressure', label: 'Pressure', unit: 'Pa', values: resample(pressure, time) });

    if (accel) {
      out.push({ kind: 'accelAxial', label: 'Axial accel', unit: 'm/s²', values: resample({ t: accel.t, v: accel.v.map((g) => g * G0) }, time) });
    }

    const temp = read('temperature');
    if (temp) out.push({ kind: 'temperature', label: 'Temperature', unit: '°C', values: resample(temp, time) });

    const compBatt = read('comp. bat. voltage');
    if (compBatt) out.push({ kind: 'voltage', label: 'Computer battery', unit: 'V', values: resample(compBatt, time) });

    const ejectBatt = read('eject. bat. voltage');
    if (ejectBatt) out.push({ kind: 'other', label: 'Ejection battery', unit: 'V', values: resample(ejectBatt, time) });

    // Lateral accelerations are handy in the explorer (coning, off-axis kicks).
    for (const [name, label] of [
      ['lat. x accel.', 'Lateral X accel'],
      ['lat. y accel.', 'Lateral Y accel'],
    ] as const) {
      const s = read(name);
      if (s) out.push({ kind: 'other', label, unit: 'g', values: resample(s, time) });
    }

    return {
      source: input.name,
      format: 'entacore-aim',
      formatLabel: 'Entacore AIM',
      time,
      channels: out,
      meta: { device: 'Entacore AIM' },
      notes: [
        'Entacore AIM export: altitude is derived from the barometric pressure channel, and the per-channel time bases were resampled onto one common clock so the curves line up.',
      ],
    };
  },
};
