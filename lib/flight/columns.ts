// Given a table of headers and rows, work out what each column is: time,
// altitude, acceleration, pressure, and so on — plus the unit, read from the
// header where the logger writes it (e.g. "Altitude (ft)"). This drives both the
// generic-CSV importer's first guess and several named parsers.

import { resolveUnit } from '../units';
import { isNumeric } from '../csv';

export type ColumnRole =
  | 'time'
  | 'altitude'
  | 'pressure'
  | 'temperature'
  | 'accelAxial'
  | 'accelTotal'
  | 'velocity'
  | 'voltage'
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
  { role: 'accelTotal', test: (h) => /(total.?acc|acc.?total|net.?acc|accel.?mag|gforce|g.?force|accel.?total)/.test(h) },
  { role: 'accelAxial', test: (h) => /\b(accel|acceleration|accelz|accelx|axial|acc[xz]?|az\b)/.test(h) || /\bg\b/.test(h) },
  { role: 'velocity', test: (h) => /\b(velocity|speed|veloc|vel)\b/.test(h) },
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

/**
 * Find the header row in a raw table: the last mostly-non-numeric row that is
 * immediately followed by mostly-numeric rows. Loggers often precede the data
 * with a few preamble lines, so we can't assume row 0.
 */
export function findHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    const numericHere = row.filter(isNumeric).length / row.length;
    const next = rows[i + 1];
    if (!next) continue;
    const numericNext = next.filter(isNumeric).length / next.length;
    if (numericHere < 0.5 && numericNext >= 0.5 && next.length >= row.length - 1) {
      return i;
    }
  }
  // Fallback: first row.
  return 0;
}

export interface AnalyzedTable {
  headerRow: number;
  headers: string[];
  dataRows: string[][];
  columns: ColumnGuess[];
}

/** Turn a raw row list into headers, data rows, and a per-column guess. */
export function analyzeTable(rows: string[][]): AnalyzedTable {
  const headerRow = findHeaderRow(rows);
  const headers = rows[headerRow] ?? [];
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== ''));

  const used = new Set<ColumnRole>();
  const columns: ColumnGuess[] = headers.map((header, index) => {
    const frac = numericFraction(dataRows, index);
    let role = frac >= 0.5 ? roleOf(header) : 'ignore';
    // Each single-valued role (time, altitude, …) is assigned at most once; a
    // second match is left for the user to sort out rather than guessed wrongly.
    if (role !== 'ignore' && role !== 'accelAxial' && used.has(role)) role = 'ignore';
    if (role !== 'ignore') used.add(role);
    return {
      index,
      header,
      role,
      unit: unitFromHeader(header),
      unitFromHeader: unitFromHeader(header) !== null,
      numericFraction: frac,
    };
  });

  return { headerRow, headers, dataRows, columns };
}
