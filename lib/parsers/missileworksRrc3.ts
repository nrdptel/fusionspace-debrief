// MissileWorks RRC3 — the mDACS ("MissileWorks Data Acquisition & Command System")
// flight export. A single header row followed by ~20 Hz rows of
//   Time, Altitude, Pressure, Velocity, Temperature, Events, Voltages
// where Pressure is barometric in hPa/mbar and Events is a text marker column.
// The export ships in two locale flavours with identical columns: a US one
// (tab-delimited, decimal point, altitude/velocity in feet, temperature °F) and a
// European one (semicolon-delimited, decimal comma, metric). Crucially the header
// names no unit, so — exactly like a metric-configured Eggtimer — the altitude
// column alone is ambiguous between feet and metres, a 3.28× difference.
//
// We resolve it from physics rather than guessing: the file always carries a
// barometric Pressure column, so we derive the apogee altitude from the pressure
// drop (the standard ISA hypsometric relation) and read the Altitude column in
// whichever unit matches it. Pressure is a true unit anchor — it's hPa either way
// — so this reads both flavours correctly without a locale flag.

import type { Parser, ParseInput } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable, parseNumber } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

// The mDACS column set, lower-cased. "Events" + "Voltages" (plural) alongside a
// barometric Pressure column are the distinctive signature that tells an RRC3
// export apart from the many other time/altitude/velocity logs.
const REQUIRED = ['time', 'altitude', 'pressure', 'velocity', 'events', 'voltages'];

function isRrc3Header(cells: string[]): boolean {
  const toks = cells.map((c) => c.trim().toLowerCase());
  return REQUIRED.every((r) => toks.includes(r));
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].length >= REQUIRED.length && isRrc3Header(rows[i])) return i;
  }
  return -1;
}

/** Column max over the data rows, ignoring non-numeric cells. */
function columnMax(dataRows: string[][], index: number): number {
  let max = -Infinity;
  for (const r of dataRows) {
    const v = parseNumber(r[index] ?? '');
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/**
 * Decide whether the altitude/velocity columns are imperial (feet) or metric,
 * by comparing the peak Altitude reading against the apogee altitude the
 * barometric Pressure column implies. Returns 'ft' when the file is imperial,
 * 'm' when metric, or null when the pressure channel can't settle it (no usable
 * swing) — the caller then falls back to the MissileWorks default of feet.
 *
 * Barometric apogee (AGL, metres) from the pressure drop uses the same standard
 * relation h = 44330·(1 − (p/p₀)^(1/5.255)) the analyzer uses to turn a pressure
 * channel into altitude, with p₀ the pad (maximum) pressure and p the minimum.
 */
function altitudeIsFeet(dataRows: string[][], altIdx: number, presIdx: number): boolean | null {
  let pGround = -Infinity;
  let pApogee = Infinity;
  for (const r of dataRows) {
    const p = parseNumber(r[presIdx] ?? '');
    if (!Number.isFinite(p) || p <= 0) continue;
    if (p > pGround) pGround = p;
    if (p < pApogee) pApogee = p;
  }
  if (!Number.isFinite(pGround) || !Number.isFinite(pApogee) || pApogee >= pGround) return null;

  const baroApogeeM = 44330 * (1 - Math.pow(pApogee / pGround, 1 / 5.255));
  const altMax = columnMax(dataRows, altIdx);
  if (!Number.isFinite(baroApogeeM) || baroApogeeM <= 0 || !Number.isFinite(altMax) || altMax <= 0) return null;

  const asFeet = Math.abs(altMax * 0.3048 - baroApogeeM);
  const asMetres = Math.abs(altMax - baroApogeeM);
  return asFeet <= asMetres;
}

export const missileworksRrc3Parser: Parser = {
  id: 'missileworks-rrc3',
  label: 'MissileWorks RRC3',

  detect(input: ParseInput): number {
    const { rows } = parseTable(input.text);
    return findHeaderRow(rows) >= 0 ? 0.95 : 0;
  },

  parse(input: ParseInput): RawFlight {
    const { rows } = parseTable(input.text);
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) throw new Error('Could not find the MissileWorks RRC3 header row.');

    const headers = rows[headerIdx].map((c) => c.trim());
    const lower = headers.map((h) => h.toLowerCase());
    const col = (name: string) => lower.indexOf(name);
    // A data row starts with a numeric time; the Events column is often just "-".
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r.length >= REQUIRED.length && Number.isFinite(parseNumber(r[col('time')] ?? '')));

    const altIdx = col('altitude');
    const presIdx = col('pressure');
    const feetGuess = altIdx >= 0 && presIdx >= 0 ? altitudeIsFeet(dataRows, altIdx, presIdx) : null;
    // No usable pressure swing → the MissileWorks default of feet, said plainly.
    const feet = feetGuess ?? true;
    const lengthU = feet ? 'ft' : 'm';
    const speedU = feet ? 'ft/s' : 'm/s';
    const tempU = feet ? 'F' : 'C';

    const mappings: ColumnMapping[] = [];
    const add = (index: number, role: ColumnMapping['role'], unit: string | null) => {
      if (index >= 0) mappings.push({ index, role, unit });
    };
    add(col('time'), 'time', 's');
    add(altIdx, 'altitude', lengthU);
    add(presIdx, 'pressure', 'hpa');
    add(col('velocity'), 'velocity', speedU);
    add(col('temperature'), 'temperature', tempU);
    add(col('voltages'), 'voltage', 'V');

    const unitNote =
      feetGuess == null
        ? 'The RRC3 export names no units; read as feet (MissileWorks’ default). A metric-configured device can’t be told apart here — if yours logged metric, altitude and speed read about 3.3× too high.'
        : `The RRC3 export names no units; altitude and speed are read as ${feet ? 'feet' : 'metres'}, matched to the barometric pressure the file also recorded.`;

    return buildFlight({
      source: input.name,
      format: 'missileworks-rrc3',
      formatLabel: 'MissileWorks RRC3',
      headers,
      dataRows,
      mappings,
      notes: [unitNote, 'Altitude is barometric; velocity is the RRC3’s own computed value.'],
    });
  },
};
