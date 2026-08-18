// Build a canonical RawFlight from an analyzed table plus a column mapping. This
// is shared by the generic-CSV importer (mapping comes from the UI) and by named
// parsers (mapping is fixed and known).

import type { RawFlight, Channel, ChannelKind, ReportedValue } from './types';
import { isDateRole, type ColumnRole, type DateRole } from './columns';
import { flownAtFromMapping, type DateColumns, type FlownAt } from './flownAt';
import { resolveUnit, CANONICAL } from '../units';
import { applySatelliteFixQuality, dropNeverSupplied } from '../gpsFix';
import { parseNumber } from '../csv';

export interface ColumnMapping {
  index: number;
  role: ColumnRole;
  /** Source unit label; if null the values are assumed already canonical. */
  unit: string | null;
  /** For an acceleration column the logger writes net of gravity (see `Channel`). */
  gravityRemoved?: boolean;
}

const ROLE_TO_KIND: Record<Exclude<ColumnRole, 'time' | 'ignore' | DateRole>, ChannelKind> = {
  altitude: 'altitude',
  altitudeInertial: 'altitudeInertial',
  pressure: 'pressure',
  temperature: 'temperature',
  accelAxial: 'accelAxial',
  accelTotal: 'accelTotal',
  velocity: 'velocity',
  rollRate: 'rollRate',
  rollAngle: 'rollAngle',
  tilt: 'tilt',
  voltage: 'voltage',
  latitude: 'latitude',
  longitude: 'longitude',
  altitudeGps: 'altitudeGps',
  satellites: 'satellites',
  dopHorizontal: 'dopHorizontal',
  dopVertical: 'dopVertical',
  dopPosition: 'dopPosition',
};

/** Kinds whose canonical unit is DEGREES, and which therefore never go through the unit
 *  converter — an angle reads the same in either system.
 *
 *  Written as a set rather than as another arm of the ternary below because the failure mode
 *  is silent and wide: a kind that appears in neither this set nor `KIND_QUANTITY` gets the
 *  EMPTY STRING for its unit, and `display('')` passes it through, so the channel renders as
 *  a bare number on the chip, the axis caption, the window-stats table, the sample-table
 *  header and the CSV header at once. Five surfaces stating a number with no unit is exactly
 *  what `DESIGN.md` §6 forbids ("a value never appears without its unit"), and nothing fails
 *  when it happens. */
const DEGREE_KINDS = new Set<ChannelKind>(['latitude', 'longitude', 'tilt', 'rollAngle']);

// Voltage is intentionally absent: it's stored as-is in volts, not converted.
const KIND_QUANTITY: Partial<Record<ChannelKind, keyof typeof CANONICAL>> = {
  altitude: 'length',
  altitudeInertial: 'length',
  altitudeGps: 'length',
  pressure: 'pressure',
  temperature: 'temperature',
  accelAxial: 'accel',
  accelTotal: 'accel',
  velocity: 'speed',
  rollRate: 'rotation',
};

export interface BuildOptions {
  source: string;
  format: string;
  formatLabel: string;
  headers: string[];
  dataRows: string[][];
  mappings: ColumnMapping[];
  meta?: Record<string, string | number>;
  notes?: string[];
  /** The file's own statement that it is a flight Debrief made up, when it carries one. It becomes
   *  the FIRST note on the flight, which is what puts it in front of every reader: `lib/report.ts`
   *  carries `flight.notes` into the .txt, .md, .html and .json, and `toCanonical` writes them
   *  verbatim into a saved record. See `lib/synthetic.ts`. */
  synthetic?: string;
  reported?: ReportedValue[];
  /** When the flight flew, where the source file states it. */
  flownAt?: FlownAt;
}

function num(cell: string | undefined): number {
  return cell === undefined ? NaN : parseNumber(cell);
}

export function buildFlight(opts: BuildOptions): RawFlight {
  // FIRST, ahead of anything a parser wants to say about carried-forward rows. A reader who stops
  // after one line has to have read this one.
  const notes = [...(opts.synthetic ? [opts.synthetic] : []), ...(opts.notes ?? [])];
  const timeMap = opts.mappings.find((m) => m.role === 'time');
  if (!timeMap) {
    throw new Error('No time column was selected.');
  }
  const timeUnit = resolveUnit(timeMap.unit ?? 's');
  const timeScale = timeUnit ? timeUnit.toCanonical(1) - timeUnit.toCanonical(0) : 1;
  const timeOffset0 = timeUnit ? timeUnit.toCanonical(0) : 0;

  // Read every selected column into parallel arrays, keeping only rows with a
  // finite time. Then sort by time so non-monotonic exports still analyse.
  const channelMaps = opts.mappings.filter(
    (m) => m.role !== 'time' && m.role !== 'ignore' && !isDateRole(m.role),
  );

  const rawTime: number[] = [];
  const rawCols: number[][] = channelMaps.map(() => []);

  for (const row of opts.dataRows) {
    const tCell = num(row[timeMap.index]);
    if (Number.isNaN(tCell)) continue;
    rawTime.push(tCell * timeScale + timeOffset0);
    for (let c = 0; c < channelMaps.length; c++) {
      rawCols[c].push(num(row[channelMaps[c].index]));
    }
  }

  if (rawTime.length === 0) {
    throw new Error('No usable rows: the time column had no numeric values.');
  }

  // Sort by time, then drop duplicate timestamps (a logger that writes two rows
  // per tick would otherwise create zero-dt points that derail differentiation
  // and the landing detector). Keep the first row at each timestamp.
  const sorted = rawTime.map((_, i) => i).sort((a, b) => rawTime[a] - rawTime[b]);
  const order: number[] = [];
  let lastT = NaN;
  for (const idx of sorted) {
    if (order.length === 0 || rawTime[idx] !== lastT) {
      order.push(idx);
      lastT = rawTime[idx];
    }
  }
  if (order.length < sorted.length) {
    notes.push(`Dropped ${sorted.length - order.length} row(s) with duplicate timestamps.`);
  }
  const t0 = rawTime[order[0]];
  const time = new Float64Array(order.length);
  for (let i = 0; i < order.length; i++) time[i] = rawTime[order[i]] - t0;

  const channels: Channel[] = channelMaps.map((m, c) => {
    const kind = ROLE_TO_KIND[m.role as Exclude<ColumnRole, 'time' | 'ignore' | DateRole>];
    const src = rawCols[c];
    const values = new Float64Array(order.length);
    const expected = KIND_QUANTITY[kind];
    // Voltage is never converted; everything else converts from its source unit.
    const u = m.unit && expected ? resolveUnit(m.unit) : null;
    if (m.unit && expected && (!u || u.quantity !== expected)) {
      notes.push(`Column "${opts.headers[m.index]}" had an unrecognized unit; values kept as-is.`);
    }
    for (let i = 0; i < order.length; i++) {
      const v = src[order[i]];
      values[i] = u ? u.toCanonical(v) : v;
    }
    return {
      kind,
      label: opts.headers[m.index] ?? kind,
      // Voltage stays in volts and the angle kinds in degrees; none of these go through the
      // unit converter (none has a `KIND_QUANTITY`, so each is kept as-is).
      unit: kind === 'voltage' ? 'V' : DEGREE_KINDS.has(kind) ? '°' : expected ? CANONICAL[expected] : '',
      values,
      ...(m.gravityRemoved ? { gravityRemoved: true } : {}),
    };
  });

  // A named parser hands its own `flownAt` in, because it knows whose clock the file
  // states. A mapping has to be read: the flyer told Debrief which columns hold the date,
  // so build the stamp from them. Rows are used unsorted and untrimmed here on purpose —
  // the calendar day is a property of the file, not of the window the analysis keeps.
  const flownAt = opts.flownAt ?? flownAtFromMapping(opts.dataRows, dateColumnsOf(opts.mappings)) ?? undefined;

  // **The GPS fix rules, applied HERE so that every route a file arrives by gets the same answer.**
  // They used to sit inside the Altus Metrum parser, so a flyer whose own spreadsheet carried a
  // satellite count got a position with no grading and no held-over-fix blanking, while the
  // identical data through a named parser got both — one file, two answers, decided by which route
  // it came in on. `MAINTAINING.md`'s architecture invariant is that every importer AND the
  // column-mapper is a thin producer of ONE model; a rule that lives in one importer is a rule the
  // mapper does not have.
  //
  // Order matters and is the parser's own: blank the held-over values FIRST, then drop a dilution
  // column that turns out to hold nothing real — otherwise a column whose only values sat on
  // no-fix rows survives as a channel of NaN. Both are no-ops on a file that gives them nothing to
  // judge, so nothing changes for the eight formats that carry no satellite count.
  const built: RawFlight = {
    source: opts.source,
    format: opts.format,
    formatLabel: opts.formatLabel,
    time,
    channels,
    meta: opts.meta ?? {},
    notes,
    ...(opts.reported?.length ? { reported: opts.reported } : {}),
    ...(flownAt ? { flownAt } : {}),
  };
  applySatelliteFixQuality(built);
  dropNeverSupplied(built);
  return built;
}

/** The date columns a mapping nominates, first of each — the mapper warns about a role
 *  mapped twice and uses the first, and this is where that promise is kept for dates. */
function dateColumnsOf(mappings: ColumnMapping[]): DateColumns {
  const cols: DateColumns = {};
  for (const m of mappings) {
    if (isDateRole(m.role) && cols[m.role] === undefined) cols[m.role] = m.index;
  }
  return cols;
}
