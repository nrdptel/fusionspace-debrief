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
 *
 * **`peak` is the RAW barometric maximum, and it is deliberately the generous choice.** Two
 * known things inflate it, and both make the divergence bound MORE permissive — they can only
 * ever leave a bad sample in, never cut a good one out, which is the safe direction for a bound
 * whose failure mode is deleting a real cross-check:
 *
 *   - The raw trace spikes after the deployment charge. `lib/analyze/index.ts` records the same
 *     effect on `lemiv L3`, where the plain highest sample reads 12,060 ft several seconds after
 *     velocity went negative while the true peak is nearer 11,700 — about 2.5% of slack here.
 *   - This runs in the PARSER, before the analyzer splits a launch-day download into flights, so
 *     on a file holding two flights `peak` is the taller of the two. `jan18` is such a file and
 *     is silent only because both its flights reach nearly the same height.
 *
 * Using a cleaned or per-flight peak would tighten it, and neither is reachable from here
 * without the parser knowing about the analysis — which the architecture forbids. Where it
 * matters is a download whose SECOND flight is much taller than its first; the wrap bound is
 * unaffected either way, being a property of the field rather than of the flight.
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

/** The gyro / accelerometer / attitude stream a Blue Raven writes beside its flight log.
 *
 *  Not a flight and never presented as one: it carries no altitude, so `parse()` still refuses
 *  it exactly as before. This is the same file read as what it actually is — a second stream of
 *  ONE recording, on the same clock as the low-rate half. */
export interface HighRateStream {
  /** The stream's own clock, seconds, on the `Flight_Time_(s)` origin its low-rate sibling
   *  shares. Measured over all four corpus pairs: the two files' first samples sit 0.062–0.108 s
   *  apart, which is the sample phase at a common −2 s pre-launch buffer and not an offset to
   *  estimate. See `lib/highRate.ts` for why that makes this different from stitching. */
  time: Float64Array;
  channels: Channel[];
  /** Samples per second, rounded — 500 Hz on every corpus file, against 50 Hz for the low-rate
   *  half. Carried so a surface can say what rate a trace was recorded at. */
  rateHz: number;
  /** Labels of the channels whose sensor RAILED, so a surface can flag them. The SAFETY
   *  invariant requires a saturated sensor be flagged rather than read as a measurement. */
  saturated: string[];
}

/** Blue Raven high-rate columns, in the order a flyer wants them, with the unit each one is
 *  actually in.
 *
 *  **The units are read off the data, not off the header** — the high-rate columns are bare
 *  (`Gyro_X`, `Accel_X`, `Quat_1`) where the low-rate ones state theirs (`Baro_Altitude_AGL_(feet)`).
 *  Measured over all four corpus high-rate files: the accelerometer's magnitude sitting on the pad
 *  is 0.9935–0.9947, so it reads g and is converted to m/s² like every other channel here; the
 *  quaternion's norm is 0.99998–1.00000, so it is a normalised attitude and unitless. The gyro is
 *  degrees per second rather than radians: its rail sits at 2,291–2,294, which is 6.4 rev/s and an
 *  ordinary coning rate, where radians would be 365 rev/s.
 *
 *  **No axis is claimed to be the long one.** At rest `lemiv` reads `Accel_X −0.99` while `jan10`
 *  reads `Accel_Z −1.00` — the board is mounted differently in different rockets — so none of these
 *  is mapped to `accelAxial` or `rollRate`, both of which are defined by the rocket's long axis.
 *  Guessing it from one file is how a lateral reading gets published as an axial one. */
const HR_COLUMNS: { column: string; label: string; unit: string; scale: number }[] = [
  { column: 'gyro_x', label: 'Gyro X', unit: 'deg/s', scale: 1 },
  { column: 'gyro_y', label: 'Gyro Y', unit: 'deg/s', scale: 1 },
  { column: 'gyro_z', label: 'Gyro Z', unit: 'deg/s', scale: 1 },
  { column: 'accel_x', label: 'Accel X', unit: 'm/s2', scale: 9.80665 },
  { column: 'accel_y', label: 'Accel Y', unit: 'm/s2', scale: 9.80665 },
  { column: 'accel_z', label: 'Accel Z', unit: 'm/s2', scale: 9.80665 },
  { column: 'quat_1', label: 'Quat 1', unit: '', scale: 1 },
  { column: 'quat_2', label: 'Quat 2', unit: '', scale: 1 },
  { column: 'quat_3', label: 'Quat 3', unit: '', scale: 1 },
  { column: 'quat_4', label: 'Quat 4', unit: '', scale: 1 },
];

/**
 * Has this channel's sensor railed?
 *
 * A saturated sensor writes its rail value over and over; a real peak is touched once. Measured
 * over the 24 gyro and accelerometer channels of the four corpus high-rate files, the count of
 * samples sitting EXACTLY at the channel's own maximum separates the two cleanly with nothing in
 * between: every railed gyro axis writes its maximum 13, 26, 44, 63, 261 or 6,729 times, and every
 * unrailed channel — including every accelerometer axis on every file — writes it once or twice.
 *
 * So the test is the repeat count, not a rail VALUE: the four files rail at 2,291.5, 2,293.4,
 * 2,293.5 and 2,294.1, close enough to be obviously one part and far enough apart that a hard-coded
 * constant would be wrong on three of them.
 */
function railed(values: Float64Array): boolean {
  let max = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (Number.isFinite(a) && a > max) max = a;
  }
  if (!(max > 0)) return false;
  let atMax = 0;
  for (const v of values) if (Math.abs(v) === max) atMax++;
  return atMax >= 3;
}

/**
 * The first `Flight_Time_(s)` an app-CSV export states, or null where it states none.
 *
 * `buildFlight` re-bases every flight so its own first sample is t=0 (`lib/flight/build.ts`), so a
 * parsed flight's clock is the file's `Flight_Time` MINUS this. It is exposed because that is
 * exactly the shift a high-rate stream needs to land on its flight's clock — an offset read out of
 * the file rather than solved for, which is what keeps `lib/highRate.ts` out of the estimating
 * business `lib/stitch.ts` has to live in.
 */
export function flightTimeOrigin(text: string): number | null {
  const { rows } = parseTable(text, ',');
  const headerIdx = findAppHeader(rows);
  if (headerIdx < 0) return null;
  const timeIdx = rows[headerIdx].map((c) => c.trim().toLowerCase()).findIndex((h) => h.includes('flight_time'));
  if (timeIdx < 0) return null;
  // The minimum, not the first row: `buildFlight` sorts by time before taking its origin, so a
  // file whose rows are out of order re-bases on its earliest sample and this has to agree.
  let min = Infinity;
  for (const row of rows.slice(headerIdx + 1)) {
    const t = Number(row[timeIdx]);
    if (Number.isFinite(t) && t < min) min = t;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * Read a Blue Raven high-rate export as the stream it is, or return null if this isn't one.
 *
 * Deliberately separate from `parse()`, which still throws `ParseGuidanceError` on exactly the
 * same files — dropping one of these ALONE is still not a flight and still says so in the same
 * words. This is only reachable once a low-rate sibling has been found to hang it on.
 */
export function highRateStream(text: string): HighRateStream | null {
  // The serial `@ LOG_HIR` capture is a high-rate stream too, but its columns are unlabelled
  // positional tokens; reading them would be a guess at the vendor's field order. Refused here
  // rather than half-read, which leaves its `parse()` refusal the whole answer for that shape.
  if (/\bLOG_HIR\b/.test(text.slice(0, 4000))) return null;

  const { rows } = parseTable(text, ',');
  const headerIdx = findAppHeader(rows);
  if (headerIdx < 0) return null;
  const lower = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const timeIdx = lower.findIndex((h) => h.includes('flight_time'));
  if (timeIdx < 0) return null;
  // A high-rate file is one with the orientation columns and NO altitude — the same test
  // `parseAppCsv` refuses on, so the two can never both claim a file.
  const hasAltitude = lower.some((h) => h.includes('altitude') || (h.includes('baro') && h.includes('agl')));
  if (hasAltitude) return null;

  const present = HR_COLUMNS.map((c) => ({ ...c, index: lower.indexOf(c.column) })).filter((c) => c.index >= 0);
  if (present.length === 0) return null;

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));
  const time: number[] = [];
  const keep: number[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const t = Number(dataRows[i][timeIdx]);
    // Strictly ascending, so the binning in `lib/highRate.ts` can walk one cursor.
    if (!Number.isFinite(t) || (time.length > 0 && t <= time[time.length - 1])) continue;
    time.push(t);
    keep.push(i);
  }
  if (time.length < 2) return null;

  const channels: Channel[] = [];
  const saturated: string[] = [];
  for (const c of present) {
    const values = new Float64Array(keep.length);
    let any = false;
    for (let i = 0; i < keep.length; i++) {
      const v = Number(dataRows[keep[i]][c.index]);
      values[i] = Number.isFinite(v) ? v * c.scale : NaN;
      if (Number.isFinite(v)) any = true;
    }
    if (!any) continue;
    channels.push({ kind: 'other', label: c.label, unit: c.unit, values });
    if (railed(values)) saturated.push(c.label);
  }
  if (channels.length === 0) return null;

  const span = time[time.length - 1] - time[0];
  return {
    time: Float64Array.from(time),
    channels,
    rateHz: span > 0 ? Math.round((time.length - 1) / span) : 0,
    saturated,
  };
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
