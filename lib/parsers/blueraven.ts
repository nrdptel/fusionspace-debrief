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

import { ParseGuidanceError, type Parser, type ParseInput } from './types';
import { getChannel, type RawFlight, type Channel } from '../flight/types';
import { parseTable } from '../csv';
import { buildFlight, type ColumnMapping } from '../flight/build';
import { flownAtFromColumns } from '../flight/flownAt';

const ATM_PA = 101325;
const HR_HINT =
  'This is the Blue Raven high-rate file (gyro, acceleration and attitude only). Drop the low-rate file instead for altitude and the flight profile.';

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
  // A Blue Raven stamps every sample with its own calendar date and wall clock
  // (Year,Month,Day,Time) — the device's clock, with no zone stated, so it's carried as
  // the logger's own rather than pretended to be UTC.
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(dataRows.find((r) => (r[where((h) => h === 'time')] ?? '').includes(':'))?.[where((h) => h === 'time')] ?? '');
  const flownAt = flownAtFromColumns(
    dataRows,
    { year: where((h) => h === 'year'), month: where((h) => h === 'month'), day: where((h) => h === 'day') },
    'logger',
  );
  const flownAtWithClock =
    flownAt && clock
      ? { ...flownAt, stamp: `${flownAt.stamp}T${clock[1].padStart(2, '0')}:${clock[2]}${clock[3] ? `:${clock[3]}` : ''}` }
      : flownAt;
  // Prefer the barometric AGL altitude; the inertial altitude drifts, and in both
  // directions — see the measured per-flight spread beside the mapping below.
  const aglIdx = where((h) => h.includes('baro') && h.includes('agl'));
  const baroAltIdx = where((h) => h.includes('baro') && h.includes('alt'));
  const inertAltIdx = where((h) => h.includes('inertial') && h.includes('alt'));
  const altIdx =
    aglIdx >= 0 ? aglIdx : baroAltIdx >= 0 ? baroAltIdx : inertAltIdx >= 0 ? inertAltIdx : where((h) => h.includes('altitude'));
  const velIdx = where((h) => h.includes('velocity_up') || (h.includes('velocity') && h.includes('up')));
  const battIdx = where((h) => h.includes('batt'));
  const tempIdx = where((h) => h.includes('temperature'));
  // The onboard tilt (angle off vertical) — "Tilt_Angle_(deg)", not the boolean
  // "Tilt Exceeded 90deg" flag — so a flyer can see how vertical the flight was.
  const tiltIdx = where((h) => h.includes('tilt') && h.includes('angle'));

  if (altIdx < 0) throw new ParseGuidanceError(HR_HINT);
  if (timeIdx < 0) throw new Error('No flight-time column was found in this Blue Raven file.');

  const mappings: ColumnMapping[] = [{ index: timeIdx, role: 'time', unit: 's' }];
  mappings.push({ index: altIdx, role: 'altitude', unit: 'ft' });
  // The device's own inertial altitude, when the barometric one is the analysis source.
  // It is a second, independent recording of the same quantity in the same file: it drifts
  // over the flight, which is why the analysis stays on the baro — but through the transonic
  // push, where the shock over the static port drives the sensed pressure up and the baro
  // trace reads the rocket *descending*, one corpus flight to 307 ft below its pad, the
  // inertial solution is the one still climbing. Carried so it can be plotted against the
  // baro line and read there, rather than discarded.
  //
  // Measured at apogee across the corpus: +9.1% (jan10), +9.2% (lemiv L3), −2.2% (jan18),
  // and meraki is past its field's ceiling long before its own peak. An earlier note here
  // said "~11% high by apogee" as though that were the shape of it; it is one flight's
  // figure, the drift runs both ways, and past a point it stops being a drift at all — see
  // `truncateInertial`.
  if (inertAltIdx >= 0 && inertAltIdx !== altIdx) {
    mappings.push({ index: inertAltIdx, role: 'altitudeInertial', unit: 'ft' });
  }
  if (velIdx >= 0) mappings.push({ index: velIdx, role: 'velocity', unit: 'ft/s' });
  if (battIdx >= 0) mappings.push({ index: battIdx, role: 'voltage', unit: 'V' });
  if (tempIdx >= 0) mappings.push({ index: tempIdx, role: 'temperature', unit: 'F' });
  if (tiltIdx >= 0) mappings.push({ index: tiltIdx, role: 'tilt', unit: null });

  const inertial = altIdx === inertAltIdx && aglIdx < 0 && baroAltIdx < 0;
  const note = inertial
    ? 'Blue Raven app export: altitude and velocity here are the onboard inertial estimates, read as feet. The inertial solution can drift after deployment.'
    : 'Blue Raven app export (low-rate): altitude is from the barometric channel; values are read as feet.';

  const flight = buildFlight({
    source: input.name,
    format: 'blueraven',
    formatLabel: 'Featherweight Blue Raven',
    headers,
    dataRows,
    mappings,
    meta: { device: 'Featherweight Blue Raven' },
    flownAt: flownAtWithClock ?? undefined,
    notes: [note],
  });
  const cut = truncateInertial(flight);
  if (cut) flight.notes.push(cut);
  return flight;
}

/**
 * Stop the inertial altitude where it stops being an altitude.
 *
 * The channel is a second, independent recording of the same height, and over the first
 * seconds it is the trustworthy one — which is exactly why the analysis leans on it through
 * the transonic push, where the shock over the static port drives the baro trace the wrong
 * way. But it is an INTEGRATION, written into a field that cannot hold a large flight, and
 * past a point it is no longer a recording of anything. Carried whole, it was plotted in the
 * channel explorer and written into the data CSV as the device's own altitude — a cross-check
 * that lies, on a surface whose whole job is cross-checking.
 *
 * Measured over the corpus Blue Ravens, on the copy Debrief analyses:
 *
 *   jan10        -2,781 ..  11,265 ft   baro peak   6,296—10,266 ft   drifts, stays credible
 *   lemiv L3    -32,767 ..  32,755 ft   one 65,522 ft single-sample step
 *   meraki       -32,768 ..  32,765 ft   the same step, against a 247,754 ft baro peak
 *   jan18      -151,147 ..   6,157 ft   never wraps; integrates away while the baro reads 823 ft
 *
 * Two failures, so two bounds, and the channel ends at whichever comes first:
 *
 *   - A single-sample step of about 2^16 ft is a counter wrapping, not a rocket moving.
 *     meraki's field simply cannot hold a 247,754 ft flight, and says so repeatedly.
 *   - Two recordings of one flight's height that differ by more than the WHOLE FLIGHT are
 *     not a second opinion; one of them has stopped reading. Scale-free, and it never fires
 *     on jan10, which is the honest drift the note beside this channel describes.
 *
 * Neither threshold is tuned: one is the field's own span, the other is the flight's own
 * height. What survives is all of the ascent on every file but meraki — whose channel is over
 * its field's ceiling before apogee, which is the true answer for that flight rather than a
 * convenient one.
 */
function truncateInertial(flight: RawFlight): string | null {
  // **This may only ever touch a SECOND opinion, never the flight's own altitude.** When a file
  // carries no barometric column the mapping above falls through to the inertial one, and the
  // `inertAltIdx !== altIdx` guard there means no separate `altitudeInertial` channel is built —
  // so this returns null and the analysis keeps every sample. Withholding the channel a flight
  // is read from would delete the flight, which is a far worse failure than the one being fixed.
  const inert = getChannel(flight, 'altitudeInertial');
  const baro = getChannel(flight, 'altitude');
  if (!inert || !baro || inert.values.length !== baro.values.length) return null;
  const v = inert.values;
  const n = v.length;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const b = baro.values[i];
    if (Number.isFinite(b) && b > peak) peak = b;
  }
  if (!(peak > 0)) return null;
  // 2^16 feet in metres, with room to spare — the field's own span, not a fitted number.
  const WRAP = 65536 * 0.3048 * 0.9;
  let cut = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(v[i])) continue;
    if (i > 0 && Number.isFinite(v[i - 1]) && Math.abs(v[i] - v[i - 1]) > WRAP) {
      cut = i;
      break;
    }
    if (Number.isFinite(baro.values[i]) && Math.abs(v[i] - baro.values[i]) > peak) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return null;
  const lastGood = cut > 0 ? v[cut - 1] : NaN;
  for (let i = cut; i < n; i++) v[i] = NaN;
  const ft = (m: number) => (Number.isFinite(m) ? Math.round(m * 3.280839895).toLocaleString('en-US') : '—');
  return (
    `The device's inertial altitude stops being readable ${flight.time[cut].toFixed(1)} s into this ` +
    `record — it reads ${ft(lastGood)} ft where the barometer reads ${ft(baro.values[cut])} ft. It is ` +
    `an integrated solution written into a field that wraps, so it is carried up to that point and ` +
    `withheld after it rather than plotted as a height the rocket never had.`
  );
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
    if (isSerialHigh && !isSerialLow) throw new ParseGuidanceError(HR_HINT);
    if (isSerialLow) return parseSerialLow(input);

    const { rows } = parseTable(input.text, ',');
    const headerIdx = findAppHeader(rows);
    if (headerIdx < 0) throw new Error('This doesn’t look like a Blue Raven export.');
    return parseAppCsv(input, rows, headerIdx);
  },
};
