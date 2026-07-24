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

// The AltOS *telemetry* CSV — the radio downlink log AltosUI saves — is a different
// shape from the on-board flight-log CSV above: one row per received packet, keyed by
// a "tick" clock and a numeric "ptype" packet type, with height/speed/acceleration in
// SI. It carries no `state_name`/`pressure` columns, so the flight-log detector misses
// it and it would otherwise fall to the generic mapper (which mis-reads voltage columns
// named `v_apogee`/`v_main` as altitude). Radio telemetry is lossy — downsampled and
// often cut off mid-descent when the signal drops — so it's a cross-check, not a
// substitute for the on-board log.
function isAltosTelemetryHeader(toks: string[]): boolean {
  return toks.includes('tick') && toks.includes('ptype') && toks.includes('height') && toks.includes('speed');
}

function findHeaderRow(rows: string[][], test: (toks: string[]) => boolean): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    if (test(rows[i].map((c) => stripHash(c).toLowerCase()))) return i;
  }
  return -1;
}

/** The modal value of a column over the data rows — used to keep only the dominant
 *  (sensor) telemetry packet type, so an interleaved GPS/config packet with stale or
 *  blank height doesn't enter the trajectory. */
function modalCell(dataRows: string[][], index: number): string | null {
  const counts = new Map<string, number>();
  for (const r of dataRows) {
    const v = r[index];
    if (v == null || v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) ((best = v), (bestN = n));
  return best;
}

/** Parse the AltOS radio-telemetry CSV (tick/ptype/height/speed/…, SI units). */
function parseTelemetry(input: ParseInput, rows: string[][]): RawFlight {
  const headerIdx = findHeaderRow(rows, isAltosTelemetryHeader);
  const headers = rows[headerIdx].map(stripHash);
  const lower = headers.map((h) => h.toLowerCase());
  const col = (name: string) => lower.indexOf(name);

  const tickIdx = col('tick');
  const minCols = Math.min(headers.length, 6);
  let dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= minCols && r[tickIdx] !== '' && Number.isFinite(Number(r[tickIdx])));
  // Keep only the dominant (sensor) packet type; interleaved GPS/config packets carry
  // no fresh trajectory and would otherwise inject stale samples.
  const ptypeIdx = col('ptype');
  if (ptypeIdx >= 0) {
    const sensor = modalCell(dataRows, ptypeIdx);
    if (sensor != null) dataRows = dataRows.filter((r) => r[ptypeIdx] === sensor);
  }

  const mappings: ColumnMapping[] = [];
  const add = (index: number, role: ColumnMapping['role'], unit: string | null) => {
    if (index >= 0) mappings.push({ index, role, unit });
  };
  add(tickIdx, 'time', 's');
  add(col('height'), 'altitude', 'm');
  add(col('speed'), 'velocity', 'm/s');
  add(col('acceleration'), 'accelAxial', 'm/s²');
  add(col('v_batt'), 'voltage', 'v');

  return buildFlight({
    source: input.name,
    format: 'altusmetrum',
    formatLabel: 'Altus Metrum (AltOS telemetry)',
    headers,
    dataRows,
    mappings,
    notes: [
      'Read from the AltOS radio-telemetry log in AltOS’s native metric units. Telemetry is lossy — downsampled, and often cut off mid-descent when the signal drops — so treat it as a cross-check against the on-board flight log, not a complete record.',
    ],
  });
}

export const altusMetrumParser: Parser = {
  id: 'altusmetrum',
  label: 'Altus Metrum (AltOS)',

  detect(input: ParseInput): number {
    for (const line of input.text.split(/\r?\n/).slice(0, 60)) {
      const toks = line.toLowerCase().split(',').map((s) => s.replace(/^#\s*/, '').trim());
      if (isAltosHeader(toks)) return 0.97;
      if (isAltosTelemetryHeader(toks)) return 0.95;
    }
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text, ',');
    const headerIdx = findHeaderRow(rows, isAltosHeader);
    // The on-board flight-log CSV is the primary format; fall back to the radio-telemetry
    // shape (tick/ptype/…) only when the flight-log header isn't present.
    if (headerIdx < 0) {
      if (findHeaderRow(rows, isAltosTelemetryHeader) >= 0) return parseTelemetry(input, rows);
      throw new Error('Could not find the AltOS header line.');
    }

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
