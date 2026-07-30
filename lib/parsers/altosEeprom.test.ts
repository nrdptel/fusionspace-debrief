import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { altosEepromParser, scaleBy2e21 } from './altosEeprom';
import { ParseGuidanceError } from './types';
import { parseTable } from '../csv';
import { getChannel, type RawFlight } from '../flight/types';
import { analyzeFlight } from '../analyze';
import { decodeBytes } from '../encoding';

// The raw download off an Altus Metrum board, read against the CSV AltosUI exports from
// THE SAME FILE. That pairing is what makes this a measurement rather than a plausible
// decode: AltosUI's export is the vendor's own reading of these bytes, so every pressure
// this parser produces has an independent right answer sitting beside it in the corpus.
//
// Three .eeprom / .csv pairs, three different log formats:
//   TeleMetrum v1 (format 1)  — 8-byte records, a 12-bit MP3H6115A ADC reading
//   EasyMega v2   (format 16) — 32-byte records, raw MS5607 conversions
//   TeleMega v6   (format 22) — same, plus a rollover in the middle of the flight
const CORPUS = fileURLToPath(new URL('./__corpus__/', import.meta.url));

interface Pair {
  what: string;
  eeprom: string;
  csv: string;
}

const PAIRS: Pair[] = [
  {
    what: 'TeleMetrum v1 (log format 1)',
    eeprom: 'altusmetrum/altusmetrum__issuiuc-sg1.1-20231001__SG1.1-Booster-October-TeleMetrum.eeprom',
    csv: 'altusmetrum/altusmetrum__issuiuc-sg1.1-20231001__SG1.1-Booster-October-TeleMetrum.csv',
  },
  {
    what: 'EasyMega v2 (log format 16)',
    eeprom: 'altusmetrum/altusmetrum__issuiuc-stargazer1-20230507__SG1-May-EasyMega.eeprom',
    csv: 'altusmetrum/altusmetrum__issuiuc-stargazer1-20230507__easymega_data.csv',
  },
  {
    what: 'TeleMega v6 (log format 22)',
    eeprom: 'altusmetrum/altusmetrum__issuiuc-kairos-20240323__Kairos-Booster-March-Telemega.eeprom',
    csv: 'altusmetrum/altusmetrum__issuiuc-kairos-20240323__Kairos-Booster-March-TeleMega.csv',
  },
];

const have = (p: Pair) => existsSync(CORPUS + p.eeprom) && existsSync(CORPUS + p.csv);
const text = (f: string) => decodeBytes(new Uint8Array(readFileSync(CORPUS + f)));

function readEeprom(p: Pair): RawFlight {
  const r = importFlight({ name: p.eeprom.split('/').pop() as string, bytes: new Uint8Array(readFileSync(CORPUS + p.eeprom)) });
  if (r.kind !== 'flight') throw new Error(`${p.what}: did not auto-detect`);
  expect(r.parser.id).toBe('altos-eeprom');
  return r.flight;
}

/** The AltosUI export of the same flight, as `time (s) -> column`. */
function altosUi(p: Pair, column: string): Map<number, number> {
  const { rows } = parseTable(text(p.csv), ',');
  const head = rows[0].map((c) => c.replace(/^#\s*/, '').trim().toLowerCase());
  const ti = head.indexOf('time');
  const ci = head.indexOf(column);
  const out = new Map<number, number>();
  for (const r of rows.slice(1)) {
    if (r.length <= Math.max(ti, ci)) continue;
    const t = Number(r[ti]);
    if (!Number.isFinite(t) || out.has(round2(t))) continue;
    out.set(round2(t), Number(r[ci]));
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// Not corpus-gated: this is the arithmetic on its own, and it has to hold on every board.
describe('the MS5607 scaling step, past where a double stops counting', () => {
  /** The exact integer answer, in arbitrary precision. */
  const exact = (d1: number, sens: number) => Number((BigInt(d1) * BigInt(sens)) / 2n ** 21n);
  /** What the datasheet's expression compiles to in plain JavaScript numbers. */
  const naive = (d1: number, sens: number) => Math.floor((d1 * sens) / 2 ** 21);

  it('gets a case right that the plain product gets wrong', () => {
    // Found by searching the ranges these two actually take on a flight: a raw pressure
    // conversion of 4-12 million and a temperature-corrected sensitivity of 2.5-4.3 billion.
    // Their product is 1.9e16, past 2^53, so the double cannot tell it from its neighbour.
    const d1 = 4_802_175;
    const sens = 3_920_039_170;
    expect(naive(d1, sens), 'the case exists').not.toBe(exact(d1, sens));
    expect(scaleBy2e21(d1, sens)).toBe(exact(d1, sens));
  });

  it('agrees with exact arithmetic across the whole range a flight covers', () => {
    // Deterministic sweep rather than random, so a failure is reproducible.
    let checked = 0;
    for (let d1 = 4_000_000; d1 <= 12_000_000; d1 += 137_117) {
      for (let sens = 2_500_000_000; sens <= 4_300_000_000; sens += 61_000_003) {
        expect(scaleBy2e21(d1, sens), `d1=${d1} sens=${sens}`).toBe(exact(d1, sens));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });
});

describe.skipIf(!PAIRS.some(have))('Altus Metrum raw .eeprom download', () => {
  for (const p of PAIRS.filter(have)) {
    it(`${p.what}: every pressure matches the AltosUI export of the same file`, () => {
      const flight = readEeprom(p);
      const pressure = getChannel(flight, 'pressure');
      expect(pressure, 'the barometer channel').toBeTruthy();

      const truth = altosUi(p, 'pressure');
      let compared = 0;
      let worst = 0;
      let missing = 0;
      for (let i = 0; i < flight.time.length; i++) {
        const want = truth.get(round2(flight.time[i]));
        if (want === undefined) {
          missing++;
          continue;
        }
        compared++;
        worst = Math.max(worst, Math.abs(want - pressure!.values[i]));
      }
      // Every sample this parser produces is a sample AltosUI wrote a row for. The
      // reverse does not hold — the CSV also has rows for GPS and state records, which
      // carry no new barometer reading.
      expect(missing, `${p.what}: samples AltosUI has no row for`).toBe(0);
      expect(compared).toBeGreaterThan(1000);
      // 0.01 Pa is a hundredth of the least significant digit AltosUI prints. On the two
      // MS5607 boards the arithmetic is integer either side and EVERY sample is identical —
      // asserted as such, because a tolerance there would hide a real drift. The TeleMetrum
      // v1 path is a float conversion on both sides, and lands within 0.0035 Pa.
      const float = p.what.startsWith('TeleMetrum');
      expect(worst, `${p.what}: worst pressure disagreement over ${compared} samples`).toBeLessThan(float ? 0.01 : 1e-12);
    });
  }

  it('reads the flight’s length and its apogee the same as the AltosUI export', () => {
    for (const p of PAIRS.filter(have)) {
      const raw = analyzeFlight(readEeprom(p));
      const csv = importFlight({ name: p.csv.split('/').pop() as string, text: text(p.csv) });
      if (csv.kind !== 'flight') throw new Error(`${p.what}: the CSV did not auto-detect`);
      const exported = analyzeFlight(csv.flight);

      // Two completely different reads of one flight: this parser derives height from the
      // barometer's own pressure, while the CSV path reads the AGL height AltOS had
      // already computed. They are allowed to differ by the atmosphere model, not by more.
      const a = raw.metrics.apogeeAltitude;
      const b = exported.metrics.apogeeAltitude;
      expect(Math.abs(a - b) / b, `${p.what}: apogee ${a.toFixed(1)} m raw vs ${b.toFixed(1)} m exported`).toBeLessThan(0.02);
    }
  });

  it('carries the GPS track off the raw download, at the rate the receiver actually reported', () => {
    const p = PAIRS.filter(have).find((x) => x.what.startsWith('TeleMega'));
    if (!p) return;
    const flight = readEeprom(p);
    const lat = getChannel(flight, 'latitude');
    const lon = getChannel(flight, 'longitude');
    expect(lat && lon, 'a GPS track').toBeTruthy();

    const fixes = [...lat!.values].filter(Number.isFinite).length;
    expect(fixes, 'GPS fixes').toBeGreaterThan(50);
    // …and NOT one per sample. The receiver reports about once a second while the
    // barometer logs a hundred times a second, so a position on every row would be the
    // last fix repeated ninety-nine times — which is what AltosUI's CSV writes, and what
    // this deliberately does not.
    expect(fixes).toBeLessThan(flight.time.length / 10);

    // EVERY fix, against the position AltosUI wrote at that moment — not just the first one.
    // Comparing only the first agreed under any whole-track shift, because the CSV has no
    // position before its own first fix either: it could not have caught a track slipped a
    // second late, which is the mistake this placement can actually make.
    //
    // WITHIN ONE SAMPLE, and that is a real difference rather than slack. A GPS record and a
    // barometer sample can carry the same tick, and AltosUI writes its row from the state it
    // had when it reached that sample — so a fix logged at the same tick as a sample shows up
    // on the NEXT row there, while this puts it on the sample bearing its own stamp. Measured
    // across this flight: 114 fixes land on the same row as AltosUI's and 207 one row later,
    // none anywhere else. Ten milliseconds on a receiver that reports once a second; a slip of
    // a whole second is a hundred rows and fails this.
    const truthLat = altosUi(p, 'latitude');
    const truthLon = altosUi(p, 'longitude');
    let compared = 0;
    for (let i = 0; i < flight.time.length; i++) {
      if (!Number.isFinite(lat!.values[i])) continue;
      const here = round2(flight.time[i]);
      const next = i + 1 < flight.time.length ? round2(flight.time[i + 1]) : here;
      const near = (mine: number, truth: Map<number, number>) =>
        [here, next].some((t) => truth.has(t) && Math.abs((truth.get(t) as number) - mine) < 5e-7);
      expect(near(lat!.values[i], truthLat), `latitude at ${here}s: ${lat!.values[i]} vs AltosUI ${truthLat.get(here)} / ${truthLat.get(next)}`).toBe(true);
      expect(near(lon!.values[i], truthLon), `longitude at ${here}s`).toBe(true);
      compared++;
    }
    expect(compared, 'fixes compared against the AltosUI export').toBe(fixes);
    // The GPS date is a real UTC stamp off the fix, so the logbook knows when it flew.
    expect(flight.flownAt?.zone).toBe('UTC');
    expect(flight.flownAt?.stamp.startsWith('2024-03-23')).toBe(true);
  });

  it('refuses a log format it has never been shown, by number, instead of decoding it anyway', () => {
    const p = PAIRS.filter(have)[0];
    if (!p) return;
    // The same file with one number changed. Misreading a record layout does not fail
    // loudly — it produces a plausible flight out of misaligned bytes — so an unknown
    // format has to be refused rather than attempted.
    const doctored = text(p.eeprom).replace(/"log_format": \d+/, '"log_format": 99');
    expect(doctored).toContain('"log_format": 99');
    expect(() => altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() })).toThrow(ParseGuidanceError);
    expect(() => altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() })).toThrow(/log format 99/);
  });

  it('refuses a 32-byte format whose pressure disagrees with the ground pressure the file states', () => {
    const p = PAIRS.filter(have).find((x) => x.what.startsWith('EasyMega'));
    if (!p) return;
    // The cross-check that lets this parser read a log format the corpus does not contain:
    // decode with the wrong barometer coefficients and the result no longer agrees with a
    // figure the board wrote about itself, so nothing is handed back.
    const doctored = text(p.eeprom).replace(/"sens": (\d+)/, (_m, v) => `"sens": ${Math.round(Number(v) * 1.5)}`);
    expect(doctored).not.toBe(text(p.eeprom));
    expect(() => altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() })).toThrow(/does not believe/);
  });

  it('does the barometer arithmetic exactly, past where a double stops counting', () => {
    // The datasheet's compensation is integer arithmetic, and one product in it - the raw
    // pressure conversion times the temperature-corrected sensitivity - lands near 1.7e16 on
    // EVERY sample of both 32-byte downloads, above the 2^53 where a JavaScript number stops
    // being able to hold consecutive integers. It floored to the right value anyway on all
    // 6,820 of them, which is luck rather than a property. This holds the split-multiply that
    // replaced it against the exact answer, computed with BigInt.
    const p = PAIRS.filter(have).find((x) => x.what.startsWith('TeleMega'));
    if (!p) return;
    const flight = readEeprom(p);
    const pressure = getChannel(flight, 'pressure')!;

    // The same file's coefficients, read straight out of its header, and the same raw
    // conversions - so this is the arithmetic being checked, not the record layout.
    const head = text(p.eeprom);
    const cal = JSON.parse(head.slice(0, head.search(/\n\}\r?\n/) + 2)).ms5607 as Record<string, number>;
    const body = head.slice(head.search(/\n\}\r?\n/) + 2);
    const bytes = Uint8Array.from(body.trim().split(/\s+/).map((h) => parseInt(h, 16)));

    let checked = 0;
    let sample = 0;
    for (let at = 0; at + 32 <= bytes.length && sample < pressure.values.length; at += 32) {
      if (bytes[at] === 0xff) continue;
      if (String.fromCharCode(bytes[at]) !== 'A') continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset + at);
      const d1 = BigInt(view.getInt32(4, true));
      const d2 = BigInt(view.getInt32(8, true));
      const dT = d2 - BigInt(cal.tref) * 256n;
      let temp = 2000n + (dT * BigInt(cal.tempsens)) / 2n ** 23n;
      let off = BigInt(cal.off) * 2n ** 17n + (BigInt(cal.tco) * dT) / 2n ** 6n;
      let sens = BigInt(cal.sens) * 2n ** 16n + (BigInt(cal.tcs) * dT) / 2n ** 7n;
      if (temp < 2000n) {
        const d = temp - 2000n;
        let off2 = (61n * d * d) / 16n;
        let sens2 = 2n * d * d;
        if (temp < -1500n) {
          const e = temp + 1500n;
          off2 += 15n * e * e;
          sens2 += 8n * e * e;
        }
        temp -= (dT * dT) / 2n ** 31n;
        off -= off2;
        sens -= sens2;
      }
      const exact = ((d1 * sens) / 2n ** 21n - off) / 2n ** 15n;
      expect(pressure.values[sample], `sample ${sample}: exact ${exact}`).toBe(Number(exact));
      checked++;
      sample++;
    }
    expect(checked, 'samples checked against exact integer arithmetic').toBeGreaterThan(5000);
  });

  it('opens a download that has been through an editor that rewrote its line endings', () => {
    const p = PAIRS.filter(have)[0];
    if (!p) return;
    const crlf = text(p.eeprom).replace(/\n/g, '\r\n');
    const r = importFlight({ name: 'windows.eeprom', text: crlf, bytes: new TextEncoder().encode(crlf) });
    expect(r.kind, 'a CRLF .eeprom still reads as a flight').toBe('flight');
    if (r.kind !== 'flight') return;
    // …and reads the SAME flight, not a shifted one: the body is hex, so a stray byte at the
    // front of it would move every record.
    const straight = readEeprom(p);
    expect(r.flight.time.length).toBe(straight.time.length);
    expect(getChannel(r.flight, 'pressure')!.values[0]).toBe(getChannel(straight, 'pressure')!.values[0]);
  });

  it('drops the accelerometer, and says so, when it disagrees with the board’s resting reading', () => {
    // The barometer has a cross-check against a figure the file states about itself; this is
    // the same for the other sensor, and on a log format the corpus does not contain it is the
    // ONLY thing standing behind the accelerometer's byte offset. Move the resting reading and
    // the channel has to go — a wrong g figure on a flight whose altitude is right is the
    // hardest kind of wrong number to notice.
    for (const p of PAIRS.filter(have)) {
      const straight = readEeprom(p);
      expect(getChannel(straight, 'accelAxial'), `${p.what}: reads an accelerometer normally`).toBeTruthy();

      // Read the accelerometer two bytes to the left of where it lives — which is what a
      // misread record layout IS, and what the resting reading exists to catch.
      const doctored = shiftAccel(text(p.eeprom));
      expect(doctored, `${p.what}: the file really changed`).not.toBe(text(p.eeprom));
      const moved = altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() });
      expect(getChannel(moved, 'accelAxial'), `${p.what}: the disbelieved channel is withheld`).toBeUndefined();
      expect(moved.notes.join(' '), `${p.what}: and the report says why`).toMatch(/don’t agree with the resting reading/);
      // The barometer is untouched by any of that — this withholds one channel, not the flight.
      expect(getChannel(moved, 'pressure')!.values[0]).toBe(getChannel(straight, 'pressure')!.values[0]);
    }
  });

  it('keeps the raw download out of the column mapper it used to fall into', () => {
    for (const p of PAIRS.filter(have)) {
      const r = importFlight({ name: p.eeprom.split('/').pop() as string, bytes: new Uint8Array(readFileSync(CORPUS + p.eeprom)) });
      expect(r.kind, `${p.what}`).toBe('flight');
    }
  });
});

/** Rewrite a download's hex body so every sensor record's accelerometer field reads a value
 *  it never held — the shape of a misread byte offset. The barometer bytes are untouched. */
function shiftAccel(eeprom: string): string {
  const cut = eeprom.search(/\n\}\r?\n/) + 2;
  const head = eeprom.slice(0, cut);
  const bytes = Uint8Array.from(eeprom.slice(cut).trim().split(/\s+/).map((h) => parseInt(h, 16)));
  // The record size is the file's own log format, not something to infer from its length:
  // an 8-byte log is also a whole number of 32-byte blocks.
  const size = (JSON.parse(head) as { log_format: number }).log_format === 1 ? 8 : 32;
  // Log format 1 keeps the accelerometer at offset 4; the 32-byte family keeps it at 30.
  const at = size === 8 ? 4 : 30;
  for (let o = 0; o + size <= bytes.length; o += size) {
    if (String.fromCharCode(bytes[o]) !== 'A') continue;
    const v = ((bytes[o + at] | (bytes[o + at + 1] << 8)) + 3000) & 0xffff;
    bytes[o + at] = v & 0xff;
    bytes[o + at + 1] = v >> 8;
  }
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) {
    hex.push(Array.from(bytes.slice(i, i + 32)).map((v) => v.toString(16).padStart(2, '0')).join(' '));
  }
  return `${head}\n${hex.join('\n')}\n`;
}
