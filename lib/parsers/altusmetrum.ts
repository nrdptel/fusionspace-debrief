// Altus Metrum (TeleMetrum / TeleMega / EasyMega / EasyMini …). AltOS exports a
// CSV with a few '#'-prefixed preamble lines, then one '#'-prefixed header line,
// then one row per sample, in SI units. The exact columns vary by device and
// firmware — TeleMega/EasyMega add IMU/GPS columns, and the velocity column is
// "accel_speed"/"baro_speed" on some builds and a single "speed" on others — so
// we detect on the stable trio state_name + height + pressure and map by name.
//
// Header (core): version,serial,flight,call,time,…,state,state_name,acceleration,
//   pressure,altitude,height,(accel_speed|speed)[,baro_speed],temperature,…,
//   battery_voltage,… Units: time s, acceleration m/s², height m (AGL), speed m/s,
//   temperature °C, voltage V.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { getChannel } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

function stripHash(cell: string): string {
  return cell.replace(/^#\s*/, '').trim();
}

function isAltosHeader(toks: string[]): boolean {
  return toks.includes('state_name') && toks.includes('height') && toks.includes('pressure');
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    if (isAltosHeader(rows[i].map((c) => stripHash(c).toLowerCase()))) return i;
  }
  return -1;
}

export const altusMetrumParser: Parser = {
  id: 'altusmetrum',
  label: 'Altus Metrum (AltOS)',

  detect(input: ParseInput): number {
    for (const line of input.text.split(/\r?\n/).slice(0, 60)) {
      const toks = line.toLowerCase().split(',').map((s) => s.replace(/^#\s*/, '').trim());
      if (isAltosHeader(toks)) return 0.97;
    }
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the AltOS header line.');

    const headers = rows[headerIdx].map(stripHash);
    const lower = headers.map((h) => h.toLowerCase());
    const minCols = Math.min(headers.length, 6);
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= minCols && r[0] !== '');

    // Map by exact column name (first occurrence). `height` is already AGL, so it's
    // the altitude channel; `altitude` (baro MSL, and a duplicate GPS column) is left
    // aside. Velocity is whichever speed column this build emits.
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = lower.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const mappings: ColumnMapping[] = [];
    const add = (index: number, role: ColumnMapping['role'], unit: string | null) => {
      if (index >= 0) mappings.push({ index, role, unit });
    };
    add(col('time'), 'time', 's');
    add(col('height'), 'altitude', 'm');
    add(col('acceleration'), 'accelAxial', 'm/s²');
    add(col('accel_speed', 'speed', 'baro_speed'), 'velocity', 'm/s');
    add(col('temperature'), 'temperature', 'c');
    add(col('battery_voltage'), 'voltage', 'v');
    // GPS, on the units that have it — drives the recovery (ground-track) view.
    add(col('latitude'), 'latitude', null);
    add(col('longitude'), 'longitude', null);

    const meta: Record<string, string | number> = {};
    for (let i = 0; i < headerIdx; i++) {
      const m = stripHash(rows[i][0] ?? '').match(/^([a-z_ ]+)\s+(.+)$/i);
      if (m && ['serial', 'flight', 'product', 'version'].includes(m[1].trim().toLowerCase())) {
        meta[m[1].trim()] = m[2].trim();
      }
    }

    const flight = buildFlight({
      source: input.name,
      format: 'altusmetrum',
      formatLabel: 'Altus Metrum (AltOS)',
      headers,
      dataRows,
      mappings,
      meta,
      notes: ['Altitude is the AltOS AGL "height" channel; values are read in AltOS’s native metric units.'],
    });

    // AltOS writes (0, 0) — and holds the last value — before a GPS lock; blank
    // those out so the ground track isn't dragged to the equator. A real launch
    // site is never at exactly 0,0 or out of range.
    const lat = getChannel(flight, 'latitude');
    const lon = getChannel(flight, 'longitude');
    if (lat && lon) {
      let any = false;
      for (let i = 0; i < lat.values.length; i++) {
        const la = lat.values[i];
        const lo = lon.values[i];
        const ok = Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
        if (!ok) {
          lat.values[i] = NaN;
          lon.values[i] = NaN;
        } else any = true;
      }
      if (any) flight.notes.push('A GPS track was found; the recovery view shows where it drifted and landed.');
    }

    return flight;
  },
};
