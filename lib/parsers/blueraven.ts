// Featherweight Blue Raven. Two export shapes are handled:
//
//  1. Serial capture via the Featherweight Interface Program — the low-rate
//     "@ LOG_LOW" stream is labelled tokens (Bo: [temp] [pressure atm ×50000] …),
//     ~50 Hz; the high-rate "@ LOG_HIR" stream is gyro/accel only.
//
//  2. Phone-app export — normal headered CSVs. The low-rate file has columns like
//     Flight_Time_(s), Velocity_Up, Inertial_Altitude, Tilt_Angle_(deg), … (plus a
//     barometric channel); the high-rate file has Gyro_*, Accel_*, Quat_* and no
//     altitude.
//
// For the low-rate data we take altitude from the barometric channel when present
// (robust); the inertial altitude/velocity are a fallback, since the manual notes
// the inertial solution drifts after deployment. The high-rate file has no
// altitude, so we point the user at the low-rate one.

import type { Parser, ParseInput } from './types';
import type { RawFlight, Channel } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';

const ATM_PA = 101325;
const HR_HINT =
  'This is the Blue Raven high-rate file (gyro, acceleration and attitude only). Upload the low-rate file for altitude and the flight profile.';

function tokenValueAfter(tokens: string[], label: string, offset: number): number {
  const i = tokens.indexOf(label);
  if (i < 0) return NaN;
  const v = Number(tokens[i + offset]);
  return Number.isFinite(v) ? v : NaN;
}

/** Locate the phone-app CSV header row (has a Flight_Time column + a Blue Raven marker). */
function findAppHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const low = rows[i].map((c) => c.trim().toLowerCase());
    const hasTime = low.some((c) => c.includes('flight_time'));
    const marker = low.some(
      (c) =>
        c.includes('inertial_altitude') ||
        c.includes('velocity_up') ||
        c.startsWith('quat_') ||
        c === 'accel_x' ||
        c === 'gyro_x',
    );
    if (hasTime && marker) return i;
  }
  return -1;
}

function parseSerialLow(input: ParseInput): RawFlight {
  const pressurePa: number[] = [];
  const voltageV: number[] = [];
  for (const line of input.text.split(/\r?\n/)) {
    if (!line.includes('Bo:')) continue;
    const tokens = line.trim().split(/\s+/);
    const rawPressure = tokenValueAfter(tokens, 'Bo:', 2); // Bo: [temp] [pressure atm ×50000]
    if (!Number.isFinite(rawPressure) || rawPressure <= 0) continue;
    pressurePa.push((rawPressure / 50000) * ATM_PA);
    const battMv = tokenValueAfter(tokens, 'V:', 1);
    voltageV.push(Number.isFinite(battMv) ? battMv / 1000 : NaN);
  }
  if (pressurePa.length < 4) throw new Error('No Blue Raven low-rate samples with barometric pressure were found.');

  // The low-rate log is a fixed 50 Hz, so time comes from the sample index (the
  // on-board sync code rolls over every 250 ms and can't be used directly).
  const n = pressurePa.length;
  const time = new Float64Array(n);
  for (let i = 0; i < n; i++) time[i] = i / 50;
  const channels: Channel[] = [
    { kind: 'pressure', label: 'Baro pressure', unit: 'Pa', values: Float64Array.from(pressurePa) },
  ];
  if (voltageV.some(Number.isFinite)) {
    channels.push({ kind: 'voltage', label: 'Battery', unit: 'V', values: Float64Array.from(voltageV) });
  }
  return {
    source: input.name,
    format: 'blueraven',
    formatLabel: 'Featherweight Blue Raven',
    time,
    channels,
    meta: { device: 'Featherweight Blue Raven', sampleRate: '50 Hz (low-rate)' },
    notes: ['Blue Raven low-rate capture: altitude is derived from the barometric sensor.'],
  };
}

function parseAppCsv(input: ParseInput, rows: string[][], headerIdx: number): RawFlight {
  const headers = rows[headerIdx].map((c) => c.trim());
  const lower = headers.map((h) => h.toLowerCase());
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));

  const where = (pred: (h: string) => boolean) => lower.findIndex(pred);
  const timeIdx = where((h) => h.includes('flight_time'));
  const baroAltIdx = where((h) => h.includes('baro') && h.includes('alt'));
  const inertAltIdx = where((h) => h.includes('inertial') && h.includes('alt'));
  const altIdx = baroAltIdx >= 0 ? baroAltIdx : inertAltIdx >= 0 ? inertAltIdx : where((h) => h.includes('altitude'));
  const velIdx = where((h) => h.includes('velocity_up') || (h.includes('velocity') && h.includes('up')));
  const battIdx = where((h) => h.includes('batt'));

  if (altIdx < 0) throw new Error(HR_HINT);
  if (timeIdx < 0) throw new Error('No flight-time column was found in this Blue Raven file.');

  const mappings: ColumnMapping[] = [{ index: timeIdx, role: 'time', unit: 's' }];
  mappings.push({ index: altIdx, role: 'altitude', unit: 'ft' });
  if (velIdx >= 0) mappings.push({ index: velIdx, role: 'velocity', unit: 'ft/s' });
  if (battIdx >= 0) mappings.push({ index: battIdx, role: 'voltage', unit: 'V' });

  const inertial = altIdx === inertAltIdx && baroAltIdx < 0;
  const note = inertial
    ? 'Blue Raven app export: altitude and velocity here are the onboard inertial estimates, read as feet. The inertial solution can drift after deployment.'
    : 'Blue Raven app export (low-rate): altitude is from the barometric channel; values are read as feet.';

  return buildFlight({
    source: input.name,
    format: 'blueraven',
    formatLabel: 'Featherweight Blue Raven',
    headers,
    dataRows,
    mappings,
    meta: { device: 'Featherweight Blue Raven' },
    notes: [note],
  });
}

export const blueRavenParser: Parser = {
  id: 'blueraven',
  label: 'Featherweight Blue Raven',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 4000);
    if (/\bLOG_LOW\b/.test(head) || /\bLOG_HIR\b/.test(head)) return 0.96;
    const rows = input.text
      .split(/\r?\n/, 8)
      .map((l) => l.split(','));
    return findAppHeader(rows) >= 0 ? 0.9 : 0;
  },

  parse(input: ParseInput): RawFlight {
    const head = input.text.slice(0, 4000);
    const isSerialLow = /\bLOG_LOW\b/.test(head) || input.text.includes('Bo:');
    const isSerialHigh = /\bLOG_HIR\b/.test(head);
    if (isSerialHigh && !isSerialLow) throw new Error(HR_HINT);
    if (isSerialLow) return parseSerialLow(input);

    const { rows } = parseTable(input.text, ',');
    const headerIdx = findAppHeader(rows);
    if (headerIdx < 0) throw new Error('This doesn’t look like a Blue Raven export.');
    return parseAppCsv(input, rows, headerIdx);
  },
};
