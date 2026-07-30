// MissileWorks RRC3 RAW FLIGHT FILE (.rff) — what mDACS saves when it pulls a flight off
// the altimeter, before anyone asks it to export the tab-separated text file beside it.
//
// The container is a .NET BinaryFormatter stream (MS-NRBF): an `mDACS.AnalysisSupport+
// FlightRecord` whose `FlightData` member is a `List<Int16>`. The list's backing array is
// the altimeter's log exactly as it came off the board — no columns, no header row, which
// is why the generic mapper reads nothing at all from this file.
//
// The log itself is a stream of 16-bit words: barometer samples in tenths of a millibar,
// with two auxiliary words written once a second, after a short preamble.
//
// A barometer sample cannot reach 0x4000 — that is 1,638 mbar, half again the highest
// pressure ever recorded at sea level — and the auxiliary words sit far above it. That is
// the whole tag, and it is a fact about the pressure scale rather than a threshold picked
// to fit one file. What the auxiliary pair MEANS is not decoded: mDACS shows a temperature
// and a battery voltage that track it, but neither is a linear function of it, so the
// calibration lives somewhere this file does not carry and inventing one would put a
// made-up number on a report.
//
// Read against the mDACS text export of the same flight: all 3,541 barometer samples
// match it exactly, and the file holds exactly 3,541 of them. See `missileworksRff.test.ts`.

import { ParseGuidanceError, type Parser, type ParseInput } from './types';
import type { RawFlight } from '../flight/types';

/** The RRC3 logs at a fixed 20 Hz. mDACS's own text export of the corpus flight is
 *  stamped 0.00, 0.05, 0.10 …, which is the same statement from the other direction. */
const HZ = 20;

/**
 * At or above this, a word is NOT a barometer sample — see the note at the top. 0x4000 in
 * tenths of a millibar is 1,638 mbar, half again the highest pressure ever recorded at sea
 * level, so nothing the barometer can log reaches it. Written as a threshold rather than as
 * a bit test on purpose: a word with bit 15 set but bit 14 clear would slip through a bit
 * test and be read back as a 3,277 mbar reading.
 */
const AUX = 0x4000;

/**
 * The lowest pressure, in tenths of a millibar, that a rocket can be sitting at on a pad:
 * 500 mbar is 5,570 m, higher than any launch site on earth. Used to find where the
 * readings start — the log opens with a few words that are not readings (the first
 * once-a-second pair, and one more Debrief cannot account for), and this is what tells
 * them apart from the first real one without hardcoding how many there are.
 */
const PAD_FLOOR = 5000;

/** How far in the readings are allowed to start. Beyond this the file is a shape Debrief
 *  has not been shown, and it refuses rather than skipping words until something fits. */
const MAX_PREAMBLE = 8;

/** MS-NRBF record type 0x0F, ArraySinglePrimitive, and the primitive code for Int16. */
const ARRAY_SINGLE_PRIMITIVE = 0x0f;
const PRIMITIVE_INT16 = 7;
/** MS-NRBF record type 0x09, MemberReference — how the List points at its backing array. */
const MEMBER_REFERENCE = 0x09;

/** The class mDACS serialises. Present as plain ASCII in the stream's type table. */
const CLASS_NAME = 'mDACS.AnalysisSupport+FlightRecord';

/** Is this a .NET BinaryFormatter stream holding an mDACS flight record? Read off the
 *  BYTES: the text view of this file is mojibake, and the name would only survive it by
 *  luck. */
export function looksLikeRff(bytes: Uint8Array): boolean {
  // SerializedStreamHeader: record type 0, then rootId, headerId, major=1, minor=0.
  if (bytes.length < 64 || bytes[0] !== 0x00) return false;
  if (readI32(bytes, 9) !== 1 || readI32(bytes, 13) !== 0) return false;
  return indexOfAscii(bytes, CLASS_NAME, Math.min(bytes.length, 4096)) >= 0;
}

function readI32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) | 0;
}

function indexOfAscii(bytes: Uint8Array, needle: string, limit: number): number {
  const first = needle.charCodeAt(0);
  for (let i = 0; i + needle.length <= limit; i++) {
    if (bytes[i] !== first) continue;
    let k = 1;
    while (k < needle.length && bytes[i + k] === needle.charCodeAt(k)) k++;
    if (k === needle.length) return i;
  }
  return -1;
}

/** The backing array of the serialised `List<Int16>`, and how many of its slots are used. */
interface Log {
  at: number;
  /** Slots allocated — the list's capacity, which is a power of two above the count. */
  capacity: number;
  /** Slots actually filled: the list's `_size`. The rest are the array's spare room, and
   *  reading them would append a run of zero-pressure samples to the flight. */
  size: number;
}

/**
 * Find the Int16 array in the NRBF stream.
 *
 * Scanned for rather than walked to, deliberately: a full BinaryFormatter reader is a
 * large amount of code for one member of one class, and every record type it would have
 * to know is a chance to mis-step on a file nobody has seen. The array record announces
 * itself — type byte, object id, length, primitive code — and the `List<Int16>` that owns
 * it wrote a MemberReference to that exact id immediately before, followed by its `_size`.
 * Requiring all of that to line up is a much narrower claim than "parse the whole stream".
 */
function findLog(b: Uint8Array): Log | null {
  let best: Log | null = null;
  for (let i = 13; i + 9 <= b.length; i++) {
    if (b[i] !== ARRAY_SINGLE_PRIMITIVE || b[i + 9] !== PRIMITIVE_INT16) continue;
    const id = readI32(b, i + 1);
    const capacity = readI32(b, i + 5);
    if (id <= 0 || capacity <= 0 || capacity > 1 << 24) continue;
    const at = i + 10;
    if (at + capacity * 2 > b.length) continue;
    // …and the owning List's `_items` reference, `_size`, `_version`, immediately before.
    const ref = i - 13;
    if (ref < 0 || b[ref] !== MEMBER_REFERENCE || readI32(b, ref + 1) !== id) continue;
    const size = readI32(b, ref + 5);
    if (size <= 0 || size > capacity) continue;
    if (!best || size > best.size) best = { at, capacity, size };
  }
  return best;
}

export const missileworksRffParser: Parser = {
  id: 'missileworks-rff',
  label: 'MissileWorks RRC3 (raw .rff download)',

  detect(input: ParseInput): number {
    return looksLikeRff(input.bytes) ? 0.98 : 0;
  },

  parse(input: ParseInput): RawFlight {
    const b = input.bytes;
    const log = findLog(b);
    if (!log) {
      throw new ParseGuidanceError(
        'This is an mDACS raw flight file (.rff), but Debrief couldn’t find the flight log inside it — the file may be truncated. Open it in mDACS and export the flight data as text, and drop that instead.',
      );
    }

    const words = new Uint16Array(log.size);
    for (let i = 0; i < log.size; i++) words[i] = b[log.at + i * 2] | (b[log.at + i * 2 + 1] << 8);

    // Where the readings start. The log opens with the first once-a-second pair and one
    // more word Debrief cannot account for — so rather than hardcode "three", it looks for
    // the first word that could be a reading taken on a pad. A rocket waiting to fly is
    // never above 5,570 m, so nothing before that is one.
    let start = -1;
    for (let i = 0; i < Math.min(MAX_PREAMBLE, words.length); i++) {
      if (words[i] < AUX && words[i] >= PAD_FLOOR) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      throw new ParseGuidanceError(
        'Debrief recognises this as an mDACS raw flight file (.rff) but the log inside it doesn’t open on the pad, so it won’t guess where the readings start. Open it in mDACS and export the flight data as text, and drop that instead.',
      );
    }

    const pressure: number[] = [];
    let auxWords = 0;
    for (let i = start; i < words.length; i++) {
      const w = words[i];
      // An erased or unwritten word ends the log; a pressure of zero is not a reading.
      if (w === 0) break;
      if (w >= AUX) {
        auxWords++;
        continue;
      }
      pressure.push(w * 10); // tenths of a millibar → Pa (1 mbar = 100 Pa)
    }

    if (pressure.length < 2 * HZ) {
      throw new ParseGuidanceError(
        'This mDACS raw flight file (.rff) holds less than two seconds of readings — there is no flight in it to read.',
      );
    }
    // The cross-check that says both halves of the read are right at once. The altimeter
    // writes one auxiliary PAIR per second and 20 readings per second, so the two counts
    // have to agree about how long the flight was. They disagree if the tag split the
    // stream wrongly, and they disagree if the 20 Hz clock is not this file's clock —
    // which is the assumption a raw log with no timestamps in it cannot otherwise test.
    const bySeconds = pressure.length / HZ;
    const byMarkers = auxWords / 2;
    if (Math.abs(byMarkers - bySeconds) > 0.1 * bySeconds + 2) {
      throw new ParseGuidanceError(
        `Debrief read this mDACS raw flight file (.rff) but does not believe the result: its once-a-second markers say ${byMarkers.toFixed(0)} seconds of flight while its readings say ${bySeconds.toFixed(0)}, so the log is not written the way Debrief has been shown. Open it in mDACS and export the flight data as text, and drop that instead.`,
      );
    }

    const time = new Float64Array(pressure.length);
    for (let i = 0; i < pressure.length; i++) time[i] = i / HZ;

    return {
      source: input.name,
      format: 'missileworks-rff',
      formatLabel: 'MissileWorks RRC3 (raw .rff download)',
      time,
      channels: [{ kind: 'pressure', label: 'Pressure', unit: 'Pa', values: Float64Array.from(pressure) }],
      meta: { 'readings in the file': pressure.length },
      notes: [
        'Read straight from the raw flight file mDACS saves off the altimeter, with no text export in between. The RRC3 logs barometric pressure at a fixed 20 Hz and nothing else, so the clock is that rate and the altitude below is derived from the pressure readings themselves.',
        'The RRC3 also logs a temperature and a battery voltage once a second. They are in this file, but the numbers needed to turn them into a temperature and a voltage are not — so they are left out rather than shown as a guess. The text export from mDACS carries both.',
      ],
    };
  },
};
