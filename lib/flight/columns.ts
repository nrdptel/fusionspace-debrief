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
  | 'tilt'
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
  // Includes the bare "acc" abbreviation (a very common single-accel-column header,
  // e.g. "Acc (g)"). A GPS accuracy column is written "hAcc"/"vAcc" — one token, no
  // boundary before "acc" — so \bacc\b leaves it alone.
  { role: 'accelAxial', test: (h) => /\b(accel|acceleration|accelz|accelx|axial|acc[xz]|acc)\b/.test(h) },
  { role: 'velocity', test: (h) => /\b(velocity|speed|veloc|vel)\b/.test(h) },
  // Roll/spin rate about the long axis. A bare "gyro" is left alone — that's three
  // axes and which one is roll is logger-specific — so it keys off "roll"/"spin".
  { role: 'rollRate', test: (h) => /\b(roll|spin)\b/.test(h) || /rollrate/.test(h) },
  // Tilt / angle-off-vertical, when the logger computes an attitude. Keys off
  // "tilt" so it never steals a roll-angle (handled above) or a bare "angle".
  { role: 'tilt', test: (h) => /\btilt\b/.test(h) },
  // GPS — guarded against acceleration headers so "lat. x accel." isn't mistaken
  // for latitude.
  { role: 'latitude', test: (h) => /\b(latitude|lat)\b/.test(h) && !/acc/.test(h) },
  { role: 'longitude', test: (h) => /\b(longitude|long|lng|lon)\b/.test(h) && !/acc/.test(h) },
  // Plain altitude words, plus the compact "AltiM"/"AltiF"/"AltFt" forms (an
  // altitude with its unit fused onto the name) that several SRAD/Arduino flight
  // computers write — "altif"/"altim" have no word boundary after "alt", so the
  // \balt\b test alone misses them and the column looks like nothing.
  { role: 'altitude', test: (h) => /\b(altitude|alt|height|agl|baroalt|apogee|elevation)\b/.test(h) || /^alti?(tude)?(m|f|ft|msl|agl|feet|met(er|re)s?)?\b/.test(h) },
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

/** A compact altitude header can fuse its unit onto the name — "AltM"/"AltiM" for
 *  metres, "AltF"/"AltiF"/"AltFt" for feet — a convention several SRAD/Arduino flight
 *  computers use, where the bracket/underscore forms `unitFromHeader` looks for aren't
 *  present. Read that trailing letter as the unit; without it a metres column would be
 *  taken for the (feet) default and read ~3.3× off. Only meaningful on an altitude column. */
function altitudeUnitFromHeader(normalized: string): string | null {
  if (/^alti?(tude)?\s*(m|met(er|re)s?)$/.test(normalized)) return 'm';
  if (/^alti?(tude)?\s*(f|ft|feet)$/.test(normalized)) return 'ft';
  return null;
}

/** A unit a logger appends to the values themselves rather than the header — a column
 *  of "58.7F", "9.1V" or "1013hPa" cells. Read it only when the header gave none: sample
 *  the data, and take a unit a clear majority of cells agree on and `resolveUnit` knows.
 *  A cell whose trailing text carries a digit (a date/time/version) is never a unit. */
function unitFromCells(dataRows: string[][], index: number): string | null {
  const counts = new Map<string, number>();
  let sampled = 0;
  for (const row of dataRows) {
    const cell = row[index];
    if (!cell) continue;
    const m = cell.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*([^\d\s].*)$/);
    if (!m || /\d/.test(m[1])) continue;
    sampled++;
    const resolved = resolveUnit(m[1].trim());
    if (resolved) counts.set(resolved.unit, (counts.get(resolved.unit) ?? 0) + 1);
    if (sampled >= 50) break;
  }
  if (sampled === 0) return null;
  for (const [unit, c] of counts) if (c / sampled >= 0.6) return unit;
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

/** A headerless file names no unit, but a column can still carry one in-cell ("100.5F",
 *  "9.1V"). Read those: promote a whole column of Fahrenheit/Celsius cells to temperature
 *  — the one role a bare column reveals unambiguously — and pin an in-cell unit on any
 *  already-identified column. That signal then drives the unit-system inference, so a US
 *  logger's unlabelled feet altitude isn't left to fall to the metres default and read
 *  ~3.3x high (a headerless StratoLogger TSV: time, altitude in feet, a °F temperature). */
function inferHeaderlessUnits(dataRows: string[][], columns: ColumnGuess[]): void {
  for (const c of columns) {
    if (c.numericFraction < 0.5) continue;
    const cellUnit = unitFromCells(dataRows, c.index);
    if (!cellUnit) continue;
    if ((cellUnit === 'f' || cellUnit === 'c') && c.role === 'ignore') {
      c.role = 'temperature';
      c.unit = cellUnit;
      c.unitFromHeader = true;
    } else if (c.role !== 'ignore' && c.unit === null) {
      c.unit = cellUnit;
      c.unitFromHeader = true;
    }
  }
  fillUnitSystem(columns);
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
    // No names to read, so guess the essential roles from the data's shape, then read
    // any unit the values carry in-cell to settle feet-vs-metres and °F-vs-°C.
    inferHeaderlessRoles(dataRows, columns);
    inferHeaderlessUnits(dataRows, columns);
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
    // Unit: prefer one embedded in the name, else a separate units row, else one the
    // values carry in-cell ("58.7F"), else — for a compact altitude header — the
    // metre/feet letter fused onto the name.
    const headerUnit = unitFromHeader(header);
    const rowUnit = units && units[index] ? resolveUnit(units[index])?.unit ?? null : null;
    const unit =
      headerUnit ??
      rowUnit ??
      (role !== 'ignore' ? unitFromCells(dataRows, index) : null) ??
      (role === 'altitude' ? altitudeUnitFromHeader(normalize(header)) : null);
    return {
      index,
      header,
      role,
      unit,
      unitFromHeader: unit !== null,
      numericFraction: frac,
    };
  });

  fillUnitSystem(columns);

  // Anything above the header is a metadata/summary block; read the device's own
  // headline figures from it (a no-op unless the file carries a known summary).
  const reported = extractReportedSummary(rows.slice(0, namesRow));

  return { headerRow: namesRow, headers, dataRows, columns, ...(reported.length ? { reported } : {}) };
}

/** A logger uses one unit system across a file — it won't record altitude in feet and
 *  velocity in metres per second. So once any column reveals the system (a labelled or
 *  in-cell foot/metre altitude, a Fahrenheit/Celsius temperature, an imperial/metric
 *  speed), fill it in for an unlabelled altitude or velocity. Without this each falls to
 *  a fixed per-role default, and those disagree — altitude defaults to feet, velocity to
 *  m/s — so one of them is always wrong for a given file. Left untouched when the file
 *  is genuinely mixed or gives no unit at all. */
function fillUnitSystem(columns: ColumnGuess[]): void {
  const imperial = columns.some(
    (c) =>
      (c.role === 'altitude' && c.unit === 'ft') ||
      (c.role === 'temperature' && c.unit === 'f') ||
      (c.role === 'velocity' && (c.unit === 'ft/s' || c.unit === 'mph')),
  );
  const metric = columns.some(
    (c) =>
      (c.role === 'altitude' && c.unit === 'm') ||
      (c.role === 'temperature' && c.unit === 'c') ||
      (c.role === 'velocity' && (c.unit === 'm/s' || c.unit === 'km/h')),
  );
  if (imperial === metric) return; // no signal, or a genuinely mixed file — leave defaults
  const altU = imperial ? 'ft' : 'm';
  const velU = imperial ? 'ft/s' : 'm/s';
  for (const c of columns) {
    if (c.unit !== null) continue;
    if (c.role === 'altitude') c.unit = altU;
    else if (c.role === 'velocity') c.unit = velU;
  }
}
