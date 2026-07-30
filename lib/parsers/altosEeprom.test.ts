import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { altosEepromParser, ms5607, scaleBy2e21, type Ms5607 } from './altosEeprom';
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

/**
 * The one pair a test needs, or a failure that says which is missing.
 *
 * `if (!p) return` is what this replaces, and it printed as a PASS: the two heaviest asserts
 * in this file — the exact arithmetic against BigInt and the whole GPS track — would have
 * reported green on a machine whose corpus had a file missing or renamed. The suite is
 * skipped WHOLESALE when there is no corpus at all (`describe.skipIf`), which is the honest
 * answer to "you have not fetched the fixtures"; a corpus that is present but incomplete is a
 * different thing and has to be loud.
 */
function pair(startsWith: string): Pair {
  const p = PAIRS.find((x) => x.what.startsWith(startsWith));
  if (!p) throw new Error(`no ${startsWith} pair is declared in PAIRS`);
  if (!have(p)) throw new Error(`the corpus is present but ${startsWith} is not: ${p.eeprom}`);
  return p;
}
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

// Not corpus-gated: the arithmetic on its own, and it has to hold on every board.
describe('the MS5607 cold-weather correction, which no corpus flight reaches', () => {
  // A real board's coefficients — the EasyMega's, so the numbers are in the range this
  // arithmetic actually sees rather than a range invented for a test.
  const cal: Ms5607 = { off: 38754, sens: 44450, tco: 24691, tcs: 27141, tref: 32107, tempsens: 27482 };
  const D1 = 5_956_020;
  /** A second raw conversion roughly at `c` °C. Only rough on purpose: below 20 °C the
   *  compensation itself pulls the temperature down, so asking for a temperature and getting
   *  it back exactly would mean the correction was not running. What the tests below use is
   *  the temperature this ACHIEVES, read back out. */
  const d2Near = (c: number) => Math.round(cal.tref * 256 + ((c * 100 - 2000) * 2 ** 23) / cal.tempsens);

  /** The exact raw conversion at which the compensated temperature first drops below 20 °C. */
  function boundary(): number {
    let warm = d2Near(30);
    let cold = d2Near(0);
    while (warm - cold > 1) {
      const mid = Math.floor((warm + cold) / 2);
      if (ms5607(cal, D1, mid).c >= 20) warm = mid;
      else cold = mid;
    }
    return warm;
  }

  it('reaches the cold branch at all, which the corpus never does', () => {
    expect(ms5607(cal, D1, d2Near(30)).c, 'the warm end').toBeGreaterThan(20);
    expect(ms5607(cal, D1, d2Near(-40)).c, 'the cold end').toBeLessThan(-15);
  });

  it('crosses into the branch exactly where it says it does', () => {
    const edge = boundary();
    expect(ms5607(cal, D1, edge).c, 'the boundary really is 20 °C').toBeGreaterThanOrEqual(20);
    expect(ms5607(cal, D1, edge - 1).c, 'and one raw count colder is past it').toBeLessThan(20);
  });

  /**
   * A second transcription of the conversion, written from the reference implementation rather
   * than from the shipped code — every division an ARITHMETIC SHIFT, which floors, and not a
   * truncation toward zero. The two agree for a board warmer than its calibration reference,
   * which is every reading in the corpus, and disagree by one count below it; the first draft
   * of this reference used truncation and the disagreement is how that was caught.
   *
   * BE CLEAR ABOUT WHAT IT IS WORTH. Both readings are mine, so a misreading of the page passes
   * here twice. What it catches is a slip in the shipped one — a wrong power of two, a dropped
   * sign, a boundary off by one. An earlier attempt at this test checked only that the
   * correction is continuous at the boundary, and caught NONE of those: every term vanishes at
   * the boundary whatever its coefficient, so all three mutations sailed through. Measured, not
   * assumed.
   */
  const reference = (c: Ms5607, d1: number, d2: number) => {
    const shift = (v: number, n: number) => Math.floor(v / 2 ** n);
    const dT = d2 - c.tref * 256;
    let temp = 2000 + shift(dT * c.tempsens, 23);
    let off = c.ms5611 ? c.off * 2 ** 16 + shift(c.tco * dT, 7) : c.off * 2 ** 17 + shift(c.tco * dT, 6);
    let sens = c.ms5611 ? c.sens * 2 ** 15 + shift(c.tcs * dT, 8) : c.sens * 2 ** 16 + shift(c.tcs * dT, 7);
    if (temp < 2000) {
      const t2 = shift(dT * dT, 31);
      const low = temp - 2000;
      let offLow = shift(61 * low * low, 4);
      let sensLow = 2 * low * low;
      if (temp < -1500) {
        const veryLow = temp + 1500;
        offLow += 15 * veryLow * veryLow;
        sensLow += 8 * veryLow * veryLow;
      }
      temp -= t2;
      off -= offLow;
      sens -= sensLow;
    }
    return { pa: shift(shift(d1 * sens, 21) - off, 15), c: temp / 100 };
  };

  it('matches that transcription across both boundaries, on an MS5607 and on an MS5611', () => {
    // The 5611 half is here for the same reason as the cold half: AltOS switches two scalings
    // on a flag in the same calibration block, no corpus board sets it, and a 5611 decoded as a
    // 5607 reads about twice the pressure it should.
    for (const part of [cal, { ...cal, ms5611: true }]) {
      let checked = 0;
      for (let c = 40; c >= -45; c -= 0.5) {
        const d2 = d2Near(c);
        const want = reference(part, D1, d2);
        const got = ms5607(part, D1, d2);
        expect(got.pa, `${part.ms5611 ? 'MS5611' : 'MS5607'} pressure at raw ${d2} (${got.c.toFixed(1)} °C)`).toBe(want.pa);
        expect(got.c, `temperature at raw ${d2}`).toBe(want.c);
        checked++;
      }
      expect(checked, 'readings swept across both boundaries').toBeGreaterThan(150);
    }
  });

  it('reads an MS5611 board differently from an MS5607 one, as AltOS does', () => {
    // Not a distinction without a difference: the same raw conversions off the two parts are
    // a whole atmosphere apart, so ignoring the flag is a wrong number and not a rounding.
    const asIs = ms5607(cal, D1, d2Near(25)).pa;
    const as5611 = ms5607({ ...cal, ms5611: true }, D1, d2Near(25)).pa;
    expect(Math.abs(asIs - as5611), `${asIs} Pa as a 5607 vs ${as5611} Pa as a 5611`).toBeGreaterThan(40_000);
  });

  it('grows monotonically the colder it gets, and is a real correction rather than rounding', () => {
    const readings = [20, 10, 0, -15, -30, -40].map((c) => ms5607(cal, D1, d2Near(c)));
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i].c, `step ${i} is not colder than the one before`).toBeLessThan(readings[i - 1].c);
      expect(readings[i].pa, `pressure at step ${i} is not below the one before`).toBeLessThan(readings[i - 1].pa);
    }
    expect(Math.abs(readings[readings.length - 1].pa - readings[0].pa), 'the whole sweep moves the reading').toBeGreaterThan(100);
  });
});

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

  for (const p of PAIRS.filter(have)) {
    it(`${p.what}: the acceleration and temperature match the AltosUI export too`, () => {
      // The pressure was checked sample for sample from the start and these two were not, so
      // a temperature off by a factor of ten or an acceleration biased by a g would have
      // shipped green — the corpus only holds peak acceleration, to 6%, and nothing at all
      // for temperature. Both come off completely different bytes from the pressure: the
      // accelerometer from its own field and the board's two-point calibration, the
      // temperature from the OTHER half of the MS5607 conversion pair.
      const flight = readEeprom(p);
      for (const [kind, column, digits] of [
        ['accelAxial', 'acceleration', 2],
        ['temperature', 'temperature', 1],
      ] as const) {
        const ch = getChannel(flight, kind);
        // The TeleMetrum v1 log carries no temperature; everything else must be there.
        if (!ch) {
          expect(kind === 'temperature' && p.what.startsWith('TeleMetrum'), `${p.what}: ${kind} is missing`).toBe(true);
          continue;
        }
        const truth = altosUi(p, column);
        let worst = 0;
        let compared = 0;
        for (let i = 0; i < flight.time.length; i++) {
          const want = truth.get(round2(flight.time[i]));
          if (want === undefined) continue;
          worst = Math.max(worst, Math.abs(want - ch.values[i]));
          compared++;
        }
        expect(compared, `${p.what}: ${kind} samples with an AltosUI row`).toBe(flight.time.length);
        // AltosUI prints acceleration to two decimals and temperature to one, so half of the
        // last digit it printed is the whole allowance — this is agreement, not a tolerance.
        expect(worst, `${p.what}: worst ${kind} disagreement over ${compared} samples`).toBeLessThanOrEqual(0.5 * 10 ** -digits + 1e-9);
      }
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
    const p = pair('TeleMega');
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
    const p = pair('TeleMetrum');
    // The same file with one number changed. Misreading a record layout does not fail
    // loudly — it produces a plausible flight out of misaligned bytes — so an unknown
    // format has to be refused rather than attempted.
    const doctored = text(p.eeprom).replace(/"log_format": \d+/, '"log_format": 99');
    expect(doctored).toContain('"log_format": 99');
    expect(() => altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() })).toThrow(ParseGuidanceError);
    expect(() => altosEepromParser.parse({ name: 'x.eeprom', text: doctored, bytes: new Uint8Array() })).toThrow(/log format 99/);
  });

  it('refuses a 32-byte format whose pressure disagrees with the ground pressure the file states', () => {
    const p = pair('EasyMega');
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
    const p = pair('TeleMega');
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
    const p = pair('TeleMetrum');
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

  it('names the board’s own flight states, in the order it flew them', () => {
    // These words are printed verbatim into a note the flyer reads, and they are an index into
    // a list — so the whole list can be shifted by one and every other assert here still passes,
    // while the report says a rocket went "coast → main → landed" through its drogue. Pinned
    // against the two downloads that carry state records, on what the flight actually did.
    const expected: Record<string, string> = {
      'TeleMega v6': 'boost → fast → coast → drogue → main → landed',
      'EasyMega v2': 'boost → coast → drogue → main → landed',
    };
    for (const p of PAIRS.filter(have)) {
      const want = expected[p.what];
      if (!want) continue;
      const note = readEeprom(p).notes.find((n) => n.includes('flight states'));
      expect(note, `${p.what}: the states note`).toBeTruthy();
      expect(note, `${p.what}`).toContain(want);
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
