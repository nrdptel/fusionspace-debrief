// Altus Metrum RAW DOWNLOAD (.eeprom) — the file AltosUI writes when it pulls a flight
// off the board, before anyone asks it to export a CSV.
//
// It is a JSON header (the board's whole configuration, including the MS5607's factory
// calibration coefficients) followed by the flight log exactly as it sat in flash, dumped
// as lines of hex bytes. The generic column mapper reads zero columns from it, because
// there are no columns: the log is a stream of fixed-size typed records.
//
// Clean-room from the AltOS log record layout and the MS5607 datasheet's own compensation
// arithmetic, checked sample-for-sample against the CSV AltosUI exports from the same file,
// across all three raw downloads in the corpus. On the two MS5607 boards every one of the
// 6,820 pressures is IDENTICAL to that export — the arithmetic is integer either side. On
// the TeleMetrum v1 board it is a float conversion on both sides and none of the 2,206
// samples is bit-identical; the worst disagreement is 0.0035 Pa, a thousandth of the least
// significant digit AltosUI prints. See `altosEeprom.test.ts`.
//
// What it does NOT do is guess. A log format this has never been shown is refused by number
// rather than decoded on the assumption that it looks like its neighbours. And a 32-byte
// format is read only if the pressure it decodes agrees with the ground pressure the file
// states about itself — see `groundPressureAgrees`, and note what that does NOT cover: log
// format 1's flight record carries no ground pressure to check against, and nothing
// cross-checks the ACCELEROMETER on any format. Both rest on the corpus alone.

import { ParseGuidanceError, type Parser, type ParseInput } from './types';
import type { Channel, RawFlight } from '../flight/types';
import { flownAtFromParts, type FlownAt } from '../flight/flownAt';
import { fixAllows, gradeFromSatellites, gradeValue } from '../gpsFix';

/** Ticks per second on the AltOS clock. Every record is stamped in these. */
const HZ = 100;

/** Record type bytes, as AltOS writes them. */
const FLIGHT = 'F'.charCodeAt(0);
const SENSOR = 'A'.charCodeAt(0);
const STATE = 'S'.charCodeAt(0);
const GPS_TIME = 'G'.charCodeAt(0);
const GPS_LAT = 'N'.charCodeAt(0);
const GPS_LON = 'W'.charCodeAt(0);
const GPS_ALT = 'H'.charCodeAt(0);

/** Erased flash. A download is a whole flash page, so it ends in these. */
const ERASED = 0xff;

/**
 * The one 8-byte log format: TeleMetrum v1, which logs a raw 12-bit ADC reading off an
 * MP3H6115A rather than an MS5607, and so converts with its own arithmetic.
 */
const FORMAT_FULL = 1;

/**
 * The 32-byte TeleMega/EasyMega family: a 32-bit MS5607 pressure and temperature pair, an
 * IMU, and a high-g accelerometer whose counts-per-g the board's own header states.
 *
 * Be precise about what is known here. **16 (EasyMega v2) and 22 (TeleMega v6) are measured**
 * — the corpus holds a download in each, with AltosUI's export of the same bytes beside it.
 * The other four are read on an ASSUMPTION: that this generation of the firmware writes one
 * record layout, which is what AltOS's own log-format numbering implies and what nothing here
 * has checked. That assumption is not taken on trust — `groundPressureAgrees` re-derives the
 * pressure and holds it against a figure the file states about itself before any sample is
 * returned, so a board that lays its records out differently is refused rather than read.
 *
 * What that check does NOT cover is the accelerometer: it is read from a fixed offset with no
 * second source to test it against. A future format that moved it would give a wrong g figure
 * on a flight whose altitude was right. Narrow this set, or find a fixture, before trusting
 * peak acceleration off a format that is not 16 or 22.
 */
const FORMAT_MEGA = new Set([10, 15, 16, 19, 21, 22]);

/** MS5607 factory calibration, as the .eeprom header states it. */
export interface Ms5607 {
  off: number;
  sens: number;
  tco: number;
  tcs: number;
  tref: number;
  tempsens: number;
  /** TRUE where the board carries an MS5611 rather than an MS5607. The two parts share a
   *  calibration block and a formula and differ in the scaling of two terms — the 5611's
   *  offset and sensitivity are one binary place smaller. AltOS writes the flag into the same
   *  block and switches on it, so this does too. Neither corpus board sets it, which is
   *  exactly why it has to be read from the file rather than assumed: a 5611 decoded as a
   *  5607 gives a pressure roughly twice what it should be, and nothing here would see it. */
  ms5611?: boolean;
}

interface EepromHeader {
  log_format?: number;
  product?: string;
  serial?: number;
  flight?: number;
  version?: string;
  callsign?: string;
  ms5607?: Partial<Ms5607>;
  accel_cal_plus_cooked?: number;
  accel_cal_minus_cooked?: number;
}

/** One decoded record: its type byte, its unwrapped tick, and where its payload starts. */
interface LogRecord {
  type: number;
  tick: number;
  at: number;
}

/** Split the file into its JSON header and the hex body beneath it. */
function split(text: string): { header: EepromHeader; body: string } | null {
  if (text[0] !== '{') return null;
  // The header is pretty-printed with the closing brace alone in column one, which is the
  // only place that can appear: every nested object inside it is indented. Matched with the
  // line ending either way, so a download that has been through a Windows editor still opens.
  const end = text.search(/\n\}\r?\n/);
  if (end < 0) return null;
  try {
    return { header: JSON.parse(text.slice(0, end + 2)) as EepromHeader, body: text.slice(end + 2) };
  } catch {
    return null;
  }
}

/** The hex body as bytes. Anything that isn't a pair of hex digits ends the read. */
function hexBytes(body: string): Uint8Array {
  const out = new Uint8Array((body.length >> 1) + 1);
  let n = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    const hi = hexDigit(c);
    const lo = hexDigit(body.charCodeAt(i + 1));
    if (hi < 0 || lo < 0) break;
    out[n++] = (hi << 4) | lo;
    i++;
  }
  return out.subarray(0, n);
}

function hexDigit(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}

/**
 * Ticks are a 16-bit counter, so they roll over every 655.36 s — and a real flight is
 * longer than that. Unwrapping cannot just watch for a drop, because records DO come back
 * a tick or two out of order right at the boundary (a temperature record stamped 65531
 * lands after a sensor record stamped 4). Each tick is instead placed on the turn of the
 * counter NEAREST the one before it, so a small step backwards stays a small step
 * backwards and only a real rollover moves the count. Measured: without this, one corpus
 * flight gained a spurious 655.36 s and reported a 975-second flight.
 */
function unwrap(tick: number, prev: number | null): number {
  if (prev === null) return tick;
  const step = (((tick - (prev % 65536)) % 65536) + 98304) % 65536 - 32768;
  return prev + step;
}

/** Every record in the body, in order, with rollover-corrected ticks. */
function records(bytes: Uint8Array, size: number): LogRecord[] {
  const out: LogRecord[] = [];
  let prev: number | null = null;
  for (let at = 0; at + size <= bytes.length; at += size) {
    // Erased flash reads as all-ones. It is the tail of every download, and it carries no
    // tick — letting it into the unwrap would drag the clock to 65535.
    if (bytes[at] === ERASED) continue;
    const tick = unwrap(bytes[at + 2] | (bytes[at + 3] << 8), prev);
    prev = tick;
    out.push({ type: bytes[at], tick, at });
  }
  return out;
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const i16 = (b: Uint8Array, at: number) => (u16(b, at) << 16) >> 16;
const i32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) | 0;

/**
 * MS5607 pressure and temperature from the two raw conversions, using the coefficients the
 * board's own header carries. Straight out of the datasheet, including the second-order
 * temperature compensation below 20 °C — which matters, because a rocket above 10 km is well
 * below it. Pressure comes out in Pa, temperature in °C.
 *
 * **The cold branch is not exercised by any corpus flight, and neither is the MS5611 one.**
 * Both 32-byte downloads stay above 20 °C for their whole record and both carry an MS5607, so
 * the sample-for-sample check against AltosUI enters neither. `altosEeprom.test.ts` drives both
 * and holds them against a second transcription of the same datasheet block — which catches a
 * slip in this one and NOT a misreading of the page, since both readings are mine. Get a
 * fixture from a high flight, or from a board with a 5611, and replace that with a real
 * comparison. Until then `groundPressureAgrees` is the backstop: a board decoded with the
 * wrong scaling disagrees with its own stated ground pressure and is refused, not read.
 */
export function ms5607(cal: Ms5607, d1: number, d2: number): { pa: number; c: number } {
  const dT = d2 - cal.tref * 256;
  let temp = 2000 + Math.floor((dT * cal.tempsens) / 2 ** 23);
  // Every division here FLOORS rather than truncating toward zero. The two agree for a board
  // warmer than its calibration reference, which is every reading in the corpus, and disagree
  // by one count below it — so this is settled by the reference implementation rather than by
  // the fixtures: AltOS does all of it with arithmetic shifts on a signed long.
  const half = cal.ms5611 === true;
  let off = half ? cal.off * 2 ** 16 + Math.floor((cal.tco * dT) / 2 ** 7) : cal.off * 2 ** 17 + Math.floor((cal.tco * dT) / 2 ** 6);
  let sens = half ? cal.sens * 2 ** 15 + Math.floor((cal.tcs * dT) / 2 ** 8) : cal.sens * 2 ** 16 + Math.floor((cal.tcs * dT) / 2 ** 7);
  if (temp < 2000) {
    const d = temp - 2000;
    let off2 = Math.floor((61 * d * d) / 16);
    let sens2 = 2 * d * d;
    if (temp < -1500) {
      const e = temp + 1500;
      off2 += 15 * e * e;
      sens2 += 8 * e * e;
    }
    temp -= Math.floor((dT * dT) / 2 ** 31);
    off -= off2;
    sens -= sens2;
  }
  return { pa: Math.floor((scaleBy2e21(d1, sens) - off) / 2 ** 15), c: temp / 100 };
}

/**
 * `⌊d1 · sens / 2²¹⌋`, without ever forming `d1 · sens`.
 *
 * The datasheet's arithmetic is integer arithmetic, and this one product does not fit in a
 * JavaScript number: on every sample of both 32-byte corpus downloads it lands near 1.7 ×
 * 10¹⁶, above the 2⁵³ where doubles stop being able to count. The result happened to floor
 * to the same integer as the exact value on all 6,820 of them — which is luck, not a
 * property, and the kind of luck that runs out on someone else's board.
 *
 * Splitting `sens` at the divisor keeps both halves exact: `d1·q` is a whole number of
 * 2²¹s, and `d1·r` cannot exceed 2⁴⁵. `⌊d1·sens/2²¹⌋ = d1·q + ⌊d1·r/2²¹⌋` because the first
 * term is an integer.
 */
export function scaleBy2e21(d1: number, sens: number): number {
  const q = Math.floor(sens / 2 ** 21);
  const r = sens - q * 2 ** 21;
  return d1 * q + Math.floor((d1 * r) / 2 ** 21);
}

/**
 * TeleMetrum v1 pressure: a 12-bit ADC reading of an MP3H6115A, whose transfer function
 * the datasheet gives as Vout = Vs·(0.009·P − 0.095). Inverted, with the reading scaled to
 * its full-scale count. Both sides of that comparison are float conversions, so none of the
 * 2,206 corpus samples is bit-identical to AltosUI's; the worst disagreement is 0.0035 Pa.
 */
function mp3h6115a(count: number): number {
  return ((count / 16 / 2047 + 0.095) / 0.009) * 1000;
}

/**
 * The accelerometer reading as ACCELERATION NET OF GRAVITY, which is what AltOS itself
 * reports and what the CSV export writes — it reads 0 sitting on the pad. The channel is
 * flagged `gravityRemoved` so the analyzer adds that g back, exactly as the CSV parser
 * beside this one does.
 *
 * Counts per g comes from the board's own two-point calibration: the reading with the
 * sensing axis pointed up and pointed down are a full 2 g apart.
 */
function countsPerMss(header: EepromHeader): number | null {
  const plus = header.accel_cal_plus_cooked;
  const minus = header.accel_cal_minus_cooked;
  if (typeof plus !== 'number' || typeof minus !== 'number') return null;
  const perG = (minus - plus) / 2;
  if (!Number.isFinite(perG) || Math.abs(perG) < 1) return null;
  return perG / 9.80665;
}

/** State numbers AltOS logs, for the note that says what the board thought was happening. */
const STATE_NAMES = ['startup', 'idle', 'pad', 'boost', 'fast', 'coast', 'drogue', 'main', 'landed'];

export const altosEepromParser: Parser = {
  id: 'altos-eeprom',
  label: 'Altus Metrum (raw .eeprom download)',

  detect(input: ParseInput): number {
    // The header is JSON and names itself; the extension alone is not enough, and not
    // needed. `manufacturer` is checked so a stray JSON file with a `log_format` key
    // can't claim to be one.
    const head = input.text.slice(0, 4096);
    if (head[0] !== '{') return 0;
    if (!head.includes('"log_format"')) return 0;
    if (!head.includes('altusmetrum.org') && !head.includes('"product"')) return 0;
    return 0.98;
  },

  parse(input: ParseInput): RawFlight {
    const parts = split(input.text);
    if (!parts) throw new Error('Not an AltOS raw download.');
    const { header, body } = parts;
    const format = header.log_format;
    const product = typeof header.product === 'string' ? header.product : 'an Altus Metrum board';

    const size = format === FORMAT_FULL ? 8 : FORMAT_MEGA.has(format ?? -1) ? 32 : 0;
    if (size === 0) {
      // Named rather than guessed at. A wrong record size does not fail loudly — it
      // produces a plausible-looking flight out of misaligned bytes, which is the one
      // outcome worth more than an unread file.
      throw new ParseGuidanceError(
        `This is a raw AltOS download from ${product}, but it is written in log format ${format ?? 'unknown'}, which Debrief hasn’t been shown yet. Export this flight to CSV from AltosUI and drop that — and please report the log format number, so this file can be read directly next time.`,
      );
    }

    const bytes = hexBytes(body);
    const recs = records(bytes, size);
    const mega = size === 32;
    const cal = megaCalibration(header);
    if (mega && !cal) {
      throw new ParseGuidanceError(
        `This raw AltOS download from ${product} is missing the barometer calibration its own header should carry, so its pressure readings cannot be converted. Export this flight to CSV from AltosUI instead.`,
      );
    }

    const time: number[] = [];
    const pressure: number[] = [];
    const accel: number[] = [];
    const temperature: number[] = [];
    let groundPressure: number | null = null;
    let groundAccel: number | null = null;
    let zeroTick: number | null = null;
    const events: { tick: number; state: number }[] = [];
    const fixes: Fix[] = [];

    for (const r of recs) {
      if (r.type === FLIGHT) {
        // The board's own boost detection. AltosUI puts t=0 here, so the pad sits at a
        // small negative time — and so does this, or the two disagree about when apogee
        // happened on the same flight.
        if (zeroTick === null) zeroTick = r.tick;
        if (mega) {
          groundPressure = i32(bytes, r.at + 8);
          groundAccel = i16(bytes, r.at + 6);
        } else {
          groundAccel = i16(bytes, r.at + 4);
        }
      } else if (r.type === SENSOR) {
        time.push(r.tick);
        if (mega) {
          const { pa, c } = ms5607(cal as Ms5607, i32(bytes, r.at + 4), i32(bytes, r.at + 8));
          pressure.push(pa);
          temperature.push(c);
          accel.push(i16(bytes, r.at + 30));
        } else {
          accel.push(i16(bytes, r.at + 4));
          pressure.push(mp3h6115a(i16(bytes, r.at + 6)));
        }
      } else if (r.type === STATE) {
        events.push({ tick: r.tick, state: u16(bytes, r.at + 4) });
      } else if (mega && r.type === GPS_TIME) {
        fixes.push(megaFix(bytes, r.at, r.tick));
      } else if (!mega && (r.type === GPS_TIME || r.type === GPS_LAT || r.type === GPS_LON || r.type === GPS_ALT)) {
        fullFix(fixes, bytes, r);
      }
    }

    if (time.length < 2) {
      throw new ParseGuidanceError(
        `This raw AltOS download from ${product} holds no flight — the log in it is empty. Downloading a different flight number from the board should get you the one you flew.`,
      );
    }
    if (mega && !groundPressureAgrees(groundPressure, pressure)) {
      throw new ParseGuidanceError(
        `Debrief read this raw AltOS download from ${product} (log format ${format}) but does not believe the result: the pressure it decoded disagrees with the ground pressure the file states for itself, which means this firmware writes its records differently. Export this flight to CSV from AltosUI and drop that — and please report the log format number.`,
      );
    }

    const t0 = zeroTick ?? time[0];
    const perMss = countsPerMss(header);
    const notes: string[] = [
      'Read straight from the raw download off the board — the same records AltosUI reads, with no CSV export in between. Altitude is derived from the barometer’s own pressure readings rather than from a height the board had already computed.',
    ];
    const channels: Channel[] = [
      chan('pressure', 'Pressure', 'Pa', pressure),
    ];
    if (perMss !== null && groundAccel !== null && sitsStill(accel, groundAccel, perMss)) {
      // Net of gravity, exactly as AltOS reports it — see `countsPerMss`.
      const g: Channel = chan('accelAxial', 'Acceleration', 'm/s²', accel.map((v) => (groundAccel - v) / perMss));
      g.gravityRemoved = true;
      channels.push(g);
    } else if (perMss !== null && groundAccel !== null) {
      // Read, and not believed. See `sitsStill`.
      notes.push(
        'The accelerometer readings in this download don’t agree with the resting reading the board wrote for itself before the flight, so they are left out rather than shown. Everything below is the barometer’s.',
      );
    }
    if (temperature.length) channels.push(chan('temperature', 'Temperature', '°C', temperature));

    const flight: RawFlight = {
      source: input.name,
      format: 'altos-eeprom',
      formatLabel: 'Altus Metrum (raw .eeprom download)',
      time: Float64Array.from(time, (tick) => (tick - t0) / HZ),
      channels,
      meta: metaOf(header, format as number),
      notes,
    };

    const flown = attachGps(flight, fixes, time);
    if (flown) flight.flownAt = flown;

    const flew = events.filter((e) => e.state >= 3 && e.state <= 8);
    if (flew.length) {
      flight.notes.push(
        `The board’s own flight states are in this download: ${flew.map((e) => STATE_NAMES[e.state] ?? `state ${e.state}`).join(' → ')}. Debrief’s events below are read from the flight itself, independently.`,
      );
    }
    return flight;
  },
};

function chan(kind: Channel['kind'], label: string, unit: string, values: number[]): Channel {
  return { kind, label, unit, values: Float64Array.from(values) };
}

function megaCalibration(header: EepromHeader): Ms5607 | null {
  const c = header.ms5607;
  if (!c) return null;
  const keys = ['off', 'sens', 'tco', 'tcs', 'tref', 'tempsens'] as const;
  for (const k of keys) {
    const v = c[k];
    // AltOS writes 2147483647 for "this board doesn't have one", which would sail through
    // a plain finite check and produce pressures in the billions.
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 0x7fffffff) return null;
  }
  // …and the part number, which is a boolean beside the six coefficients rather than one of
  // them. Absent or anything but `true` means an MS5607, which is what every corpus board is.
  return { ...(c as Ms5607), ms5611: c.ms5611 === true };
}

/**
 * Does the accelerometer read what the board says it read while sitting on the pad?
 *
 * The barometer has `groundPressureAgrees` behind it; this is the same idea for the other
 * sensor, and it is the only thing standing behind the accelerometer's byte offset on a log
 * format the corpus does not contain. The board writes its own resting reading into the flight
 * record, the log opens on the same rocket on the same pad, and the two have to agree. Read
 * the wrong two bytes and they will not.
 *
 * The OPENING samples, and only a few of them, deliberately. A download does not begin at
 * rest and run to ignition: AltOS keeps a ring buffer and marks the flight record once its
 * boost detection has fired, which is a fraction of a second AFTER the motor lit — so a mean
 * over the first fifth of a second is already partly under thrust (on one corpus file it is
 * a whole g away from rest, and an earlier version of this check threw that flight's
 * accelerometer away for it). The median of the first five is still the rocket standing on
 * the pad.
 *
 * Half a g is far wider than the noise — the three corpus downloads sit within 0.022, 0.050
 * and 0.051 g of their own stated resting reading — and far narrower than a misread field,
 * which lands hundreds of g out or pins at the rail.
 */
function sitsStill(accel: number[], ground: number, perMss: number): boolean {
  const n = Math.min(5, accel.length);
  if (n === 0) return false;
  const opening = accel.slice(0, n).sort((a, b) => a - b);
  const median = opening[opening.length >> 1];
  return Math.abs((ground - median) / perMss) <= 0.5 * 9.80665;
}

/**
 * Does the pressure this decode produced agree with the ground pressure the FILE states,
 * in Pa, in its own flight record? The two come from completely different places — one
 * from the raw conversions and the MS5607 coefficients, the other written by the board's
 * firmware before the flight — so agreement is real evidence the record layout was read
 * the way this firmware wrote it. 2% is far tighter than any misread field could land
 * inside by chance, and far looser than the weather: on the corpus the two agree to 4 Pa.
 */
function groundPressureAgrees(stated: number | null, decoded: number[]): boolean {
  if (stated === null || !Number.isFinite(stated) || stated < 1000 || stated > 120_000) return false;
  const n = Math.min(20, decoded.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += decoded[i];
  return Math.abs(sum / n - stated) / stated <= 0.02;
}

/** One GPS fix, with the tick it was stamped with. */
interface Fix {
  tick: number;
  lat: number;
  lon: number;
  altitude: number | null;
  satellites: number | null;
  date: { year: number; month: number; day: number; hour: number; minute: number; second: number } | null;
}

/** The single 32-byte GPS record the TeleMega family writes: position, height, UTC and
 *  the satellite count, all in one. `flags`' low nibble is how many were in the fix. */
function megaFix(b: Uint8Array, at: number, tick: number): Fix {
  const flags = b[at + 17];
  const low = u16(b, at + 12);
  const high = i16(b, at + 30);
  return {
    tick,
    lat: i32(b, at + 4) / 1e7,
    lon: i32(b, at + 8) / 1e7,
    altitude: (high << 16) | low,
    satellites: flags & 0x0f,
    date: { year: 2000 + b[at + 18], month: b[at + 19], day: b[at + 20], hour: b[at + 14], minute: b[at + 15], second: b[at + 16] },
  };
}

/** TeleMetrum v1 splits one fix across four 8-byte records sharing a tick: the UTC time
 *  and satellite count, then latitude, longitude and height. They are gathered by tick. */
function fullFix(fixes: Fix[], b: Uint8Array, r: LogRecord): void {
  let fix = fixes.length && fixes[fixes.length - 1].tick === r.tick ? fixes[fixes.length - 1] : null;
  if (!fix) {
    fix = { tick: r.tick, lat: NaN, lon: NaN, altitude: null, satellites: null, date: null };
    fixes.push(fix);
  }
  if (r.type === GPS_TIME) fix.satellites = b[r.at + 7] & 0x0f;
  else if (r.type === GPS_LAT) fix.lat = i32(b, r.at + 4) / 1e7;
  else if (r.type === GPS_LON) fix.lon = i32(b, r.at + 4) / 1e7;
  else if (r.type === GPS_ALT) fix.altitude = i16(b, r.at + 4);
}

/**
 * Put the GPS fixes onto the flight's own time base.
 *
 * A fix lands on the sample it was stamped with and NOWHERE ELSE: the receiver reports
 * about once a second while the barometer is logging a hundred times a second, so the
 * other ninety-nine samples have no position and say so (NaN) rather than repeating the
 * last one. AltosUI's CSV export does repeat it, which is why the same flight read from
 * the CSV shows a position on every row — a held value, not a reading.
 */
function attachGps(flight: RawFlight, fixes: Fix[], ticks: number[]): FlownAt | null {
  const usable = fixes.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && !(f.lat === 0 && f.lon === 0) && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180 && fixAllows(gradeFromSatellites(f.satellites)).position);
  if (!usable.length) return null;

  const n = ticks.length;
  const lat = new Float64Array(n).fill(NaN);
  const lon = new Float64Array(n).fill(NaN);
  const alt = new Float64Array(n).fill(NaN);
  const sats = new Float64Array(n).fill(NaN);
  // Derived from the satellite count, exactly as the CSV path does — same board, same rule, so
  // the two exports of one download cannot disagree about how good a fix was.
  const grade = new Float64Array(n).fill(NaN);
  let cursor = 0;
  for (const f of usable) {
    while (cursor + 1 < n && ticks[cursor] < f.tick) cursor++;
    lat[cursor] = f.lat;
    lon[cursor] = f.lon;
    sats[cursor] = f.satellites ?? NaN;
    if (f.satellites !== null) grade[cursor] = gradeValue(gradeFromSatellites(f.satellites));
    // Three satellites give latitude and longitude on an ASSUMED height; the fourth is
    // what makes the fix 3D. A height beside a 3-satellite fix is the receiver's guess, so it
    // is dropped while the position beside it is kept. The threshold is `lib/gpsFix.ts`'s
    // rather than this file's, so that a rule written down in four parsers stays one rule.
    if (f.altitude !== null && fixAllows(gradeFromSatellites(f.satellites)).altitude) alt[cursor] = f.altitude;
  }
  flight.channels.push(
    { kind: 'latitude', label: 'Latitude', unit: '°', values: lat },
    { kind: 'longitude', label: 'Longitude', unit: '°', values: lon },
    { kind: 'altitudeGps', label: 'Altitude (GPS)', unit: 'm', values: alt },
    { kind: 'satellites', label: 'Satellites', unit: '', values: sats },
    { kind: 'gpsFixGrade', label: 'Fix (from satellite count)', unit: '', values: grade },
  );
  flight.notes.push(
    `A GPS track was found; the recovery view shows where it drifted and landed. The receiver reported ${usable.length} ${usable.length === 1 ? 'fix' : 'fixes'} over the flight — every other sample is left blank rather than repeating the last position.`,
  );

  const dated = usable.find((f) => f.date && f.date.year > 2000);
  return dated?.date ? flownAtFromParts(dated.date, 'UTC') : null;
}

function metaOf(header: EepromHeader, format: number): Record<string, string | number> {
  const meta: Record<string, string | number> = { 'log format': format };
  if (typeof header.product === 'string') meta.product = header.product;
  if (typeof header.serial === 'number') meta.serial = header.serial;
  if (typeof header.version === 'string') meta.firmware = header.version;
  if (typeof header.callsign === 'string' && header.callsign) meta.callsign = header.callsign;
  return meta;
}
