// Given a table of headers and rows, work out what each column is: time,
// altitude, acceleration, pressure, and so on — plus the unit, read from the
// header where the logger writes it (e.g. "Altitude (ft)"). This drives both the
// generic-CSV importer's first guess and several named parsers.

import { resolveUnit } from '../units';
import { isNumeric, parseNumber } from '../csv';
import { extractReportedSummary } from './reported';
import type { ReportedValue } from './types';

export type ColumnRole =
  | 'time'
  | 'altitude'
  | 'pressure'
  | 'temperature'
  | 'accelAxial'
  | 'accelTotal'
  | 'velocity'
  | 'rollRate'
  | 'voltage'
  | 'latitude'
  | 'longitude'
  | 'ignore';

export interface ColumnGuess {
  index: number;
  header: string;
  role: ColumnRole;
  unit: string | null;
  unitFromHeader: boolean;
  numericFraction: number;
}

// Keyword tests, in priority order. The first role whose test matches a header
// wins, so more specific roles come first (total-accel before generic accel).
const ROLE_TESTS: { role: ColumnRole; test: (h: string) => boolean }[] = [
  { role: 'time', test: (h) => /\b(time|seconds?|millis|timestamp|elapsed|flttime|flighttime)\b/.test(h) || /^t$/.test(h) },
  { role: 'accelTotal', test: (h) => /(total.?acc|acc.?total|net.?acc|accel.?mag|gforce|g.?force)/.test(h) || (/acc/.test(h) && /\b(total|net|resultant|magnitude)\b/.test(h)) },
  // Deliberately does NOT match a bare "g" — that steals GPS/geoid columns; rely
  // on an explicit accel word, with the unit (g) read separately from the header.
  { role: 'accelAxial', test: (h) => /\b(accel|acceleration|accelz|accelx|axial|acc[xz])\b/.test(h) },
  { role: 'velocity', test: (h) => /\b(velocity|speed|veloc|vel)\b/.test(h) },
  // Roll/spin rate about the long axis. A bare "gyro" is left alone — that's three
  // axes and which one is roll is logger-specific — so it keys off "roll"/"spin".
  { role: 'rollRate', test: (h) => /\b(roll|spin)\b/.test(h) || /rollrate/.test(h) },
  // GPS — guarded against acceleration headers so "lat. x accel." isn't mistaken
  // for latitude.
  { role: 'latitude', test: (h) => /\b(latitude|lat)\b/.test(h) && !/acc/.test(h) },
  { role: 'longitude', test: (h) => /\b(longitude|long|lng|lon)\b/.test(h) && !/acc/.test(h) },
  { role: 'altitude', test: (h) => /\b(altitude|alt|height|agl|baroalt|apogee|elevation)\b/.test(h) },
  { role: 'pressure', test: (h) => /\b(pressure|press|baro|barometric|hpa|mbar|kpa)\b/.test(h) },
  { role: 'temperature', test: (h) => /\b(temp|temperature|degc|degf)\b/.test(h) },
  { role: 'voltage', test: (h) => /\b(voltage|volt|vbat|vbatt|batt|battery|vcc)\b/.test(h) },
];

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Pull a unit out of a header like "Altitude (ft)", "accel_g", or "Temp [C]". */
export function unitFromHeader(header: string): string | null {
  // Bracketed: (ft), [m/s], {C}
  const bracket = header.match(/[([{]\s*([^)\]}]+?)\s*[)\]}]/);
  if (bracket && resolveUnit(bracket[1])) return resolveUnit(bracket[1])!.unit;

  // Trailing token after a separator: accel_g, altitude-ft, "speed mph"
  const tokens = header.split(/[\s_./-]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 2); i--) {
    const r = resolveUnit(tokens[i]);
    if (r) return r.unit;
  }
  return null;
}

function roleOf(header: string): ColumnRole {
  const h = normalize(header);
  for (const { role, test } of ROLE_TESTS) {
    if (test(h)) return role;
  }
  return 'ignore';
}

/** The finite numeric values in one column, in row order. */
function numericSeries(rows: string[][], index: number): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const cell = row[index];
    if (cell !== undefined && cell !== '') {
      const v = parseNumber(cell);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** A time base: numeric, essentially non-decreasing (a little GPS/clock jitter is
 *  allowed), and rising overall from its start — the unmistakable shape of a clock. */
function looksLikeTime(s: number[]): boolean {
  if (s.length < 8) return false;
  let back = 0;
  for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1] - 1e-9) back++;
  return s[s.length - 1] > s[0] && back <= s.length * 0.02;
}

/** An altitude trace: a single interior peak the data rises to and then falls from
 *  (boost/coast to apogee, then descent) — how altitude alone moves over a flight,
 *  which tells it apart from a monotonic clock and a near-constant temp/voltage. */
function looksLikeAltitude(s: number[]): boolean {
  if (s.length < 16) return false;
  // A real altitude swing is tens to thousands of feet/metres; this floor keeps a
  // small-range channel (lat/lon degrees, temperature, voltage) from ever winning,
  // even when its wander happens to peak in the middle.
  if (Math.max(...s) - Math.min(...s) < 50) return false;
  let peak = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[peak]) peak = i;
  if (peak <= s.length * 0.02 || peak >= s.length * 0.98) return false; // peak must be interior
  let up = 0;
  for (let i = 1; i <= peak; i++) if (s[i] >= s[i - 1]) up++;
  let down = 0;
  for (let i = peak + 1; i < s.length; i++) if (s[i] <= s[i - 1]) down++;
  return up / peak >= 0.6 && down / (s.length - 1 - peak) >= 0.6;
}

/** For a headerless table (columns are only "Column N"), guess the two roles that
 *  are unambiguous from the data's shape alone — a time base and altitude — so a
 *  flight is at least usable without the flyer labelling every column by hand. The
 *  rest are left for them to set; nothing here overrides a name-based guess. */
function inferHeaderlessRoles(dataRows: string[][], columns: ColumnGuess[]): void {
  const series = columns.map((c) => (c.numericFraction >= 0.8 ? numericSeries(dataRows, c.index) : null));

  let timeIdx = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i] && looksLikeTime(series[i]!)) {
      timeIdx = i;
      break;
    }
  }
  if (timeIdx >= 0) columns[timeIdx].role = 'time';

  // Altitude is the widest-swinging channel with a clean apogee shape; picking by
  // range keeps a near-flat temperature or voltage column from ever winning.
  let bestIdx = -1;
  let bestRange = 0;
  for (let i = 0; i < series.length; i++) {
    if (i === timeIdx || !series[i] || !looksLikeAltitude(series[i]!)) continue;
    const s = series[i]!;
    const range = Math.max(...s) - Math.min(...s);
    if (range > bestRange) {
      bestRange = range;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) columns[bestIdx].role = 'altitude';
}

/** What fraction of a column's data cells parse as finite numbers. */
function numericFraction(rows: string[][], index: number): number {
  if (rows.length === 0) return 0;
  let n = 0;
  let total = 0;
  for (const row of rows) {
    const cell = row[index];
    if (cell === undefined || cell === '') continue;
    total++;
    if (isNumeric(cell)) n++;
  }
  return total === 0 ? 0 : n / total;
}

/** First row that looks like data (mostly numeric, at least two columns). */
function findFirstDataRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    if (row.filter(isNumeric).length / row.length >= 0.5) return i;
  }
  return rows.length > 1 ? 1 : 0;
}

/**
 * Find the header row in a raw table: the row just before the data. Loggers
 * often precede the data with preamble lines, so we can't assume row 0.
 */
export function findHeaderRow(rows: string[][]): number {
  return Math.max(0, findFirstDataRow(rows) - 1);
}

export interface AnalyzedTable {
  headerRow: number;
  headers: string[];
  dataRows: string[][];
  columns: ColumnGuess[];
  /** Headline figures read from a summary block ahead of the data, if the file
   *  carried one (e.g. an AltimeterCloud export) — for a device-vs-Debrief check. */
  reported?: ReportedValue[];
}

/** Does a row read as a row of unit labels (s, ft, g, …) rather than names? */
function looksLikeUnitsRow(row: string[]): boolean {
  if (row.length < 2) return false;
  const resolved = row.filter((c) => c && resolveUnit(c)).length;
  return resolved / row.length >= 0.6;
}

/** Turn a raw row list into headers, data rows, and a per-column guess. */
export function analyzeTable(rows: string[][]): AnalyzedTable {
  const firstData = findFirstDataRow(rows);

  // Headerless file (data from the very first row): synthesise column names so
  // the mapper is still usable, and treat every row as data.
  if (firstData === 0) {
    const width = Math.max(...rows.slice(0, 200).map((r) => r.length), 0);
    const headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    const dataRows = rows.filter((r) => r.some((c) => c !== ''));
    const columns: ColumnGuess[] = headers.map((header, index) => ({
      index,
      header,
      role: 'ignore',
      unit: null,
      unitFromHeader: false,
      numericFraction: numericFraction(dataRows, index),
    }));
    // No names to read, so guess the essential roles from the data's shape.
    inferHeaderlessRoles(dataRows, columns);
    return { headerRow: -1, headers, dataRows, columns };
  }

  let namesRow = Math.max(0, firstData - 1);
  let unitsRow = -1;
  // Some loggers split the header across two lines: names, then a row of units
  // (e.g. "Time,Alt,Accel" / "s,ft,g"). Accept that only when there's a real
  // names row above whose width matches the data — otherwise a terse header of
  // short names (T,M,S) could be mistaken for units.
  const dataWidth = rows[firstData]?.length ?? 0;
  if (
    firstData - 2 >= 0 &&
    looksLikeUnitsRow(rows[firstData - 1]) &&
    Math.abs((rows[firstData - 2]?.length ?? 0) - dataWidth) <= 1
  ) {
    unitsRow = firstData - 1;
    namesRow = firstData - 2;
  }

  const headers = rows[namesRow] ?? [];
  const units = unitsRow >= 0 ? rows[unitsRow] : null;
  const dataRows = rows.slice(firstData).filter((r) => r.some((c) => c !== ''));

  const used = new Set<ColumnRole>();
  const columns: ColumnGuess[] = headers.map((header, index) => {
    const frac = numericFraction(dataRows, index);
    let role = frac >= 0.5 ? roleOf(header) : 'ignore';
    // Each single-valued role (time, altitude, …) is assigned at most once; a
    // second match is left for the user to sort out rather than guessed wrongly.
    if (role !== 'ignore' && role !== 'accelAxial' && used.has(role)) role = 'ignore';
    if (role !== 'ignore') used.add(role);
    // Unit: prefer one embedded in the name, else a separate units row.
    const headerUnit = unitFromHeader(header);
    const rowUnit = units && units[index] ? resolveUnit(units[index])?.unit ?? null : null;
    const unit = headerUnit ?? rowUnit;
    return {
      index,
      header,
      role,
      unit,
      unitFromHeader: unit !== null,
      numericFraction: frac,
    };
  });

  // Anything above the header is a metadata/summary block; read the device's own
  // headline figures from it (a no-op unless the file carries a known summary).
  const reported = extractReportedSummary(rows.slice(0, namesRow));

  return { headerRow: namesRow, headers, dataRows, columns, ...(reported.length ? { reported } : {}) };
}
