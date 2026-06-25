// Build a canonical RawFlight from an analyzed table plus a column mapping. This
// is shared by the generic-CSV importer (mapping comes from the UI) and by named
// parsers (mapping is fixed and known).

import type { RawFlight, Channel, ChannelKind } from './types';
import type { ColumnRole } from './columns';
import { resolveUnit, CANONICAL } from '../units';

export interface ColumnMapping {
  index: number;
  role: ColumnRole;
  /** Source unit label; if null the values are assumed already canonical. */
  unit: string | null;
}

const ROLE_TO_KIND: Record<Exclude<ColumnRole, 'time' | 'ignore'>, ChannelKind> = {
  altitude: 'altitude',
  pressure: 'pressure',
  temperature: 'temperature',
  accelAxial: 'accelAxial',
  accelTotal: 'accelTotal',
  velocity: 'velocity',
  voltage: 'voltage',
};

// Voltage is intentionally absent: it's stored as-is in volts, not converted.
const KIND_QUANTITY: Partial<Record<ChannelKind, keyof typeof CANONICAL>> = {
  altitude: 'length',
  pressure: 'pressure',
  temperature: 'temperature',
  accelAxial: 'accel',
  accelTotal: 'accel',
  velocity: 'speed',
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
}

function num(cell: string | undefined): number {
  if (cell === undefined || cell === '') return NaN;
  const v = Number(cell);
  return Number.isFinite(v) ? v : NaN;
}

export function buildFlight(opts: BuildOptions): RawFlight {
  const notes = [...(opts.notes ?? [])];
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
    (m) => m.role !== 'time' && m.role !== 'ignore',
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
    const kind = ROLE_TO_KIND[m.role as Exclude<ColumnRole, 'time' | 'ignore'>];
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
      unit: kind === 'voltage' ? 'V' : expected ? CANONICAL[expected] : '',
      values,
    };
  });

  return {
    source: opts.source,
    format: opts.format,
    formatLabel: opts.formatLabel,
    time,
    channels,
    meta: opts.meta ?? {},
    notes,
  };
}
