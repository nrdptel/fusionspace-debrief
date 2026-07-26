// Rocketry Ltd Mercury / AltimeterCloud — the CSV a flight page on altimetercloud.com
// hands back. A key-and-value summary block written by the device, then a header row and
// ~50–200 Hz samples.
//
// Two header flavours are in the wild, and both are here:
//
//   Time(ms),Altitude(m),Velocity(m/s),acceleration_x(mG),…,Board temp(C),pitch,roll,yaw,tilt
//   time(ms),altitude(m),velocity_pressure(m/s),…,bmp_temp(x100),pitch,roll,yaw,tilt,…
//
// The generic mapper already reads most of this well — apogee agrees with the device's own
// summary to 0.0% on all five corpus files — but it gets two things wrong that only a named
// parser can know:
//
//   • `bmp_temp(x100)` is centi-degrees. Mapped as a plain temperature it reads 2708 °C,
//     which the analysis then throws away as impossible, so the flight loses its ground
//     temperature and the speed of sound computed from it.
//   • `pitch`, `roll` and `yaw` are the Euler angles of the device's attitude solution. The
//     rates are in `gyro_x/y/z`, and which of those is the roll axis is not stated.
//
// Written from the exported files themselves (five in the regression corpus, from public
// altimetercloud.com flight pages); no vendor code is used or needed.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';
import { extractReportedSummary } from '../flight/reported';
import type { ColumnRole } from '../flight/columns';

/** `acceleration_total` and `tilt` beside a millisecond clock is the signature: the first two
 *  are this device's own naming, and no other export in the corpus carries both. */
const SIGNATURE = ['acceleration_total(mg)', 'tilt'];

const norm = (c: string) => c.trim().toLowerCase();

/** The columns this parser knows, by exact (lower-cased) header name. Anything not listed —
 *  the gyro axes, the Euler angles, the air-brake and apogee-PREDICTION columns — is left
 *  out on purpose: an unstated gyro axis is not a roll rate, and a prediction is not a
 *  measurement and has no business in a flight Debrief reads. */
const COLUMNS: Record<string, { role: ColumnRole; unit: string | null }> = {
  'time(ms)': { role: 'time', unit: 'ms' },
  'altitude(m)': { role: 'altitude', unit: 'm' },
  'velocity(m/s)': { role: 'velocity', unit: 'm/s' },
  'velocity_pressure(m/s)': { role: 'velocity', unit: 'm/s' },
  'acceleration_x(mg)': { role: 'accelAxial', unit: 'mg' },
  'acceleration_y(mg)': { role: 'accelAxial', unit: 'mg' },
  'acceleration_z(mg)': { role: 'accelAxial', unit: 'mg' },
  'acceleration_total(mg)': { role: 'accelTotal', unit: 'mg' },
  'board temp(c)': { role: 'temperature', unit: 'C' },
  // `bmp_temp(x100)` is handled separately: it is the same quantity in centi-degrees, and
  // the column is rescaled before the flight is built rather than given a made-up unit.
  tilt: { role: 'tilt', unit: null },
};

const CENTI_DEGREE_TEMP = 'bmp_temp(x100)';

/** The row holding the data header, or -1. The summary block above it is arbitrary length
 *  (one file opens straight on the header, another carries fifteen lines of settings). */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const toks = rows[i].map(norm);
    if (SIGNATURE.every((s) => toks.includes(s)) && toks.some((t) => /^time\(ms\)$/.test(t))) return i;
  }
  return -1;
}

export const altimeterCloudParser: Parser = {
  id: 'altimetercloud',
  label: 'Rocketry Ltd Mercury (AltimeterCloud)',

  detect(input: ParseInput): number {
    if (!/\.csv$/i.test(input.name) && input.name !== '') {
      // Still allow it — the flight pages hand back plain .csv, but a renamed file that
      // matches the header is unambiguous enough on the header alone.
    }
    return findHeaderRow(parseTable(input.text).rows) >= 0 ? 0.95 : 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text);
    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) throw new Error('Not an AltimeterCloud export.');
    const headers = rows[headerRow];
    const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== ''));

    const mappings: ColumnMapping[] = [];
    headers.forEach((h, index) => {
      const known = COLUMNS[norm(h)];
      if (known) mappings.push({ index, role: known.role, unit: known.unit });
    });

    // Centi-degrees → °C, in the values rather than through a unit that doesn't exist.
    const tempIdx = headers.findIndex((h) => norm(h) === CENTI_DEGREE_TEMP);
    if (tempIdx >= 0) {
      for (const r of dataRows) {
        const raw = r[tempIdx];
        if (raw !== undefined && raw !== '') {
          const v = Number(raw);
          if (Number.isFinite(v)) r[tempIdx] = String(v / 100);
        }
      }
      mappings.push({ index: tempIdx, role: 'temperature', unit: 'C' });
    }

    return buildFlight({
      source: input.name,
      format: 'altimetercloud',
      formatLabel: 'Rocketry Ltd Mercury (AltimeterCloud)',
      headers,
      dataRows,
      mappings,
      // The device's own headline figures, from the key-and-value block above the header —
      // the cross-check the report shows beside Debrief's independent read.
      reported: extractReportedSummary(rows.slice(0, headerRow)),
    });
  },
};
