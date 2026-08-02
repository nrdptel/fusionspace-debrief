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
import { getChannel, type RawFlight, type Channel, type ChannelKind } from '../flight/types';
import { parseTable } from '../csv';
import { G0 } from '../units';
import { buildFlight, type ColumnMapping } from '../flight/build';
import { flownAtFromColumns } from '../flight/flownAt';

const ATM_PA = 101325;
const HR_HINT =
  'This is the Blue Raven high-rate file (gyro, acceleration and attitude only). Drop the low-rate file instead for altitude and the flight profile.';

/** What the board's roll angle IS, in the board maker's own terms, carried beside the channel.
 *
 *  The vendor's September 2025 manual states the method and its limit: the roll angle is an
 *  integration over time of the measured roll rate about the long axis, and it does not account
 *  for how motion in the other axes affects the airframe's orientation. So the error grows with
 *  the flight rather than staying put, and it grows fastest exactly where the other axes are
 *  busiest — under thrust and through deployment.
 *
 *  Said as a direction and a mechanism rather than as "approximate", which `MAINTAINING.md`
 *  names as the caveat that tells a flyer nothing. A size is deliberately NOT quoted: nothing in
 *  the corpus independently measures roll orientation, so any percentage here would be invented.
 *  If a second instrument's roll ever lands in the corpus, that is the number to put here. */
const ROLL_ANGLE_NOTE =
  'Roll angle is the board’s own, not Debrief’s: the Blue Raven integrates its measured roll rate over time and does not correct for motion in the other two axes, so the angle drifts further from true the longer the flight goes on. Read it as how far it has rolled, not as an exact heading.';

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
  // The onboard roll angle. All four low-rate files in the corpus carry
  // "Roll_Angle_(deg)" beside the tilt and Debrief parsed straight past it, so an
  // orientation the board had already solved reached no surface at all.
  //
  // It is the board's own measurement, read and presented as such — never Debrief's
  // estimate. The vendor states how it is obtained and what that costs, and the caveat
  // travels with the channel below rather than being left for a flyer to know: it is a
  // plain time-integration of the measured roll rate about the long axis and takes no
  // account of motion in the other two, so it accumulates error through a flight.
  //
  // "Future_Angle_(deg)" sits between them in every one of those files and is deliberately
  // NOT read. It is the board's PROJECTION of where its tilt is heading, which it uses for
  // its own tilt lockout — not a recording of anything that happened. Debrief reports what
  // was flown; surfacing another instrument's forward estimate as a reading is the one
  // thing the measurement-not-simulation invariant rules out, and it stays `ignore`.
  const rollAngleIdx = where((h) => h.includes('roll') && h.includes('angle'));

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
  if (rollAngleIdx >= 0) mappings.push({ index: rollAngleIdx, role: 'rollAngle', unit: null });

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
    // The roll-angle caveat is the board's own, stated in its manual, and it is emitted only
    // when the channel is actually present — a standing sentence about a channel this file
    // does not carry is noise on every other Blue Raven export.
    notes: rollAngleIdx >= 0 ? [note, ROLL_ANGLE_NOTE] : [note],
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
  /** Parallel to `channels`: true where the channel is part of an attitude solution and must be
   *  reduced as one coherent sample, false where it is a rate whose peak is worth preserving.
   *  See `HR_COLUMNS`; the distinction is load-bearing, not a formatting choice. */
  coherent: boolean[];
  /** Samples per second, rounded — 500 Hz on every corpus file, against 50 Hz for the low-rate
   *  half. Carried so a surface can say what rate a trace was recorded at. */
  rateHz: number;
  /** Labels of the channels whose sensor RAILED, so a surface can flag them. The SAFETY
   *  invariant requires a saturated sensor be flagged rather than read as a measurement. */
  saturated: string[];
  /** Which of the board's three sensor axes is the airframe's LONG axis — or `null` where the
   *  record cannot establish it. See `longAxisFromRest`. */
  longAxis: LongAxis | null;
}

/** The airframe's long axis, as measured off the board's own accelerometer while the rocket
 *  stood on the rail. `offDeg` and `restG` are carried so a surface can state how the answer
 *  was reached rather than assert it. */
export interface LongAxis {
  /** 0, 1 or 2 — the index into the board's X/Y/Z sensor axes. */
  index: number;
  /** `X`, `Y` or `Z`. */
  letter: string;
  /** Angle between the long axis and the direction gravity was pulling, degrees. Zero is a
   *  rocket standing exactly upright with the board square to the airframe. */
  offDeg: number;
  /** Magnitude of the specific force over the at-rest window, in g. Near 1 by definition —
   *  carried because a value that is NOT near 1 is how this determination refuses. */
  restG: number;
  /** Seconds of at-rest recording the answer was averaged over. */
  restSeconds: number;
}

/** Fraction of the at-rest vector the winning axis must carry: 0.966 is 15° off. Every corpus
 *  record sits at 0.12°–1.72°, so this is a wide refusal rather than a tuned threshold. */
const LONG_AXIS_MAX_OFF_DEG = 15;
/** Specific force at rest, in g, and how far from 1 it may sit before the window is not a
 *  rocket standing still. Measured 0.9935–0.9947 across the corpus. */
const REST_G_TOLERANCE = 0.1;
/** Total specific force that means it is no longer standing on the rail. A rocket's motor puts
 *  it far past this; nothing at rest approaches it. */
const MOVED_G = 2;
/** Shortest at-rest window the average may be taken over. The corpus offers 1.34–1.90 s. */
const MIN_REST_SECONDS = 0.2;

/**
 * Which way is up the rocket, measured rather than assumed.
 *
 * The vendor's manual says the board works out which of its axes is the rocket axis "by
 * measuring the direction of the initial motion while the rocket is on the rail". The direction
 * of INITIAL MOTION is not the thing to measure here, and that was established rather than
 * guessed: reduced to "which axis carries the largest excursion", it separates the winner from
 * the runner-up by only 1.1×–2.4× across the four corpus records and picks the WRONG axis on two
 * of them, because at 500 Hz the lateral axes see shock and vibration that rival the boost.
 *
 * GRAVITY does the job instead, and it does it on a record that has not moved yet. A rocket on a
 * rail stands within a degree or two of vertical, so the accelerometer's 1 g of specific force
 * lies along the airframe. Measured over all four corpus high-rate files, the long axis sits
 * **0.26°–1.72°** off the at-rest vector and outweighs the runner-up by **33.2×–216.4×** — well
 * inside the 15° this refuses at.
 *
 * The window is the LAST stretch at rest before the first excursion past 2 g, not the first and
 * not the longest: a rocket is often horizontal while it is being prepared, for longer than it
 * then stands on the rail, and gravity lying across the airframe would name a lateral axis as
 * the long one. `jan10` shows why the rule matters even without that — something disturbs it
 * early, and the run nearest its launch is 0.29 s where the first is 1.34 s. The near one is
 * both the right window and the cleaner reading (0.9987 g against 0.9947).
 *
 * Returns `null` — the number withheld, per the measurement invariant — where the record never
 * moved, holds no at-rest window before it did, was not sitting in 1 g, or has no axis clearly
 * along the airframe.
 */
export function longAxisFromRest(
  triad: [Float64Array, Float64Array, Float64Array],
  time: Float64Array,
): LongAxis | null {
  const n = Math.min(time.length, ...triad.map((v) => v.length));
  const totalG = (i: number) => Math.hypot(triad[0][i], triad[1][i], triad[2][i]) / G0;

  let moved = -1;
  for (let i = 0; i < n; i++) {
    const t = totalG(i);
    if (Number.isFinite(t) && t > MOVED_G) {
      moved = i;
      break;
    }
  }
  if (moved < 0) return null;

  // The LAST at-rest run before it moved that is long enough to average over — the wait on the
  // rail. Last rather than longest, and that is the whole safety of this: a rocket is usually
  // horizontal while it is prepared, often for far longer than it then stands on the rail, and
  // gravity lying across the airframe would name a LATERAL axis as the long one. Taking the
  // longest window would prefer exactly that stretch. The length floor is what stops a brief
  // steady blip just before ignition being read instead.
  let bestFrom = -1;
  let bestTo = -1;
  let runFrom = -1;
  for (let i = 0; i <= moved; i++) {
    const atRest = i < moved && Math.abs(totalG(i) - 1) <= REST_G_TOLERANCE;
    if (atRest && runFrom < 0) runFrom = i;
    if (!atRest && runFrom >= 0) {
      if (time[i - 1] - time[runFrom] >= MIN_REST_SECONDS) [bestFrom, bestTo] = [runFrom, i];
      runFrom = -1;
    }
  }
  if (bestFrom < 0) return null;
  const restSeconds = time[bestTo - 1] - time[bestFrom];

  const len = bestTo - bestFrom;
  const mean = triad.map((v) => {
    let sum = 0;
    for (let i = bestFrom; i < bestTo; i++) sum += v[i];
    return sum / len / G0;
  });
  const restG = Math.hypot(mean[0], mean[1], mean[2]);
  if (!(Math.abs(restG - 1) <= REST_G_TOLERANCE)) return null;

  const abs = mean.map(Math.abs);
  const index = abs.indexOf(Math.max(...abs));
  const offDeg = (Math.acos(Math.min(1, abs[index] / restG)) * 180) / Math.PI;
  if (!(offDeg <= LONG_AXIS_MAX_OFF_DEG)) return null;

  return { index, letter: 'XYZ'[index], offDeg, restG, restSeconds };
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
 *  Guessing it from one file is how a lateral reading gets published as an axial one.
 *
 *  **`reduce` is the difference between a rate and an attitude, and getting it wrong publishes a
 *  number the board never produced.** A gyro or accelerometer trace has a PEAK worth keeping, so
 *  it is reduced by extremum (`lib/highRate.ts`). A quaternion has none — its norm is 1 by
 *  construction — and its four components only mean anything TOGETHER, as one rotation at one
 *  instant. Reducing them independently was measured to give a merged norm averaging 1.0132 on
 *  `jan10` and 1.0089 on `lemiv`: a 4-tuple assembled from four different instants, which is not a
 *  rotation and not an attitude the board ever solved, presented as "the board's own attitude
 *  solution". They take one coherent sample per window instead. */
const HR_COLUMNS: {
  column: string;
  label: string;
  unit: string;
  scale: number;
  reduce: 'extremum' | 'sample';
  kind: ChannelKind;
  /** Which sensor axis this column reads, for the ones that have one — so a measured long axis
   *  can say which of the three is along the airframe. `undefined` on the quaternion, whose
   *  components are not per-axis. */
  axis?: number;
}[] = [
  { column: 'gyro_x', label: 'Gyro X', unit: 'deg/s', scale: 1, reduce: 'extremum', kind: 'angularRate', axis: 0 },
  { column: 'gyro_y', label: 'Gyro Y', unit: 'deg/s', scale: 1, reduce: 'extremum', kind: 'angularRate', axis: 1 },
  { column: 'gyro_z', label: 'Gyro Z', unit: 'deg/s', scale: 1, reduce: 'extremum', kind: 'angularRate', axis: 2 },
  { column: 'accel_x', label: 'Accel X', unit: 'm/s2', scale: G0, reduce: 'extremum', kind: 'accelAxis', axis: 0 },
  { column: 'accel_y', label: 'Accel Y', unit: 'm/s2', scale: G0, reduce: 'extremum', kind: 'accelAxis', axis: 1 },
  { column: 'accel_z', label: 'Accel Z', unit: 'm/s2', scale: G0, reduce: 'extremum', kind: 'accelAxis', axis: 2 },
  { column: 'quat_1', label: 'Quat 1', unit: '', scale: 1, reduce: 'sample', kind: 'attitudeQuaternion' },
  { column: 'quat_2', label: 'Quat 2', unit: '', scale: 1, reduce: 'sample', kind: 'attitudeQuaternion' },
  { column: 'quat_3', label: 'Quat 3', unit: '', scale: 1, reduce: 'sample', kind: 'attitudeQuaternion' },
  { column: 'quat_4', label: 'Quat 4', unit: '', scale: 1, reduce: 'sample', kind: 'attitudeQuaternion' },
];

/** What a channel is called once the airframe's long axis is known. A gyro about the long axis
 *  IS the roll rate and an accelerometer along it IS the axial one — that is what those words
 *  mean — so the label says so. The `kind` deliberately does not follow (see `ChannelKind`):
 *  naming a trace is not the same as letting the analysis read a number off it. */
function airframeLabel(base: string, kind: ChannelKind, axis: number | undefined, long: LongAxis | null): string {
  if (long == null || axis == null) return base;
  const along = axis === long.index;
  if (kind === 'angularRate') return `${base} — ${along ? 'roll rate' : 'lateral rate'}`;
  if (kind === 'accelAxis') return `${base} — ${along ? 'along the airframe' : 'across the airframe'}`;
  return base;
}

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
 *
 * **Only ever asked of a channel that can rail.** Applied to a quaternion it fires on every corpus
 * file — `Quat_1` sits at exactly 1.00000 for thousands of pad samples because the norm is 1 by
 * construction — and the flight then carried "the sensor behind Quat 1 RAILED … the true rate went
 * at least that high" about a component that has no rate and no sensor. A fabricated saturation
 * warning is a safety-invariant breach in the same way a missing one is.
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
  /** Parallel to `channels`: which sensor axis each reads, where it reads one. */
  const axisOf: (number | undefined)[] = [];
  const saturated: string[] = [];
  /** Per channel, whether it must be reduced as one coherent sample rather than by extremum. */
  const coherent: boolean[] = [];
  for (const c of present) {
    const values = new Float64Array(keep.length);
    let any = false;
    for (let i = 0; i < keep.length; i++) {
      const v = Number(dataRows[keep[i]][c.index]);
      values[i] = Number.isFinite(v) ? v * c.scale : NaN;
      if (Number.isFinite(v)) any = true;
    }
    if (!any) continue;
    channels.push({ kind: c.kind, label: c.label, unit: c.unit, values });
    axisOf.push(c.axis);
    coherent.push(c.reduce === 'sample');
    if (c.reduce === 'extremum' && railed(values)) saturated.push(c.label);
  }
  if (channels.length === 0) return null;

  const clock = Float64Array.from(time);
  // Only ever the full triad: two axes cannot say which of three is the long one, and a partial
  // read would name whichever of the two happened to be nearer vertical.
  const accel = [0, 1, 2].map((a) => channels.find((c, i) => c.kind === 'accelAxis' && axisOf[i] === a));
  const longAxis = accel.every(Boolean)
    ? longAxisFromRest(accel.map((c) => c!.values) as [Float64Array, Float64Array, Float64Array], clock)
    : null;
  // The label is the only thing the measured axis changes. `saturated` keeps the bare column
  // names it was collected under, so the rail warning names the same channel either way.
  for (let i = 0; i < channels.length; i++) {
    channels[i] = { ...channels[i], label: airframeLabel(channels[i].label, channels[i].kind, axisOf[i], longAxis) };
  }

  const span = time[time.length - 1] - time[0];
  return {
    time: clock,
    channels,
    coherent,
    rateHz: span > 0 ? Math.round((time.length - 1) / span) : 0,
    saturated,
    longAxis,
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
