import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { missileworksRffParser } from './missileworksRff';
import { ParseGuidanceError } from './types';
import { getChannel } from '../flight/types';
import { analyzeFlight } from '../analyze';
import { decodeBytes } from '../encoding';
import { convert } from '../units';

// The raw flight file mDACS saves off an RRC3, read against the tab-separated text export
// of the SAME flight sitting beside it in the corpus. That export is MissileWorks' own
// reading of these bytes, so every pressure this parser produces has an independent right
// answer to be checked against — the same discipline as the AltOS raw downloads.
const CORPUS = fileURLToPath(new URL('./__corpus__/', import.meta.url));
const RFF = 'missileworks-rrc3/missileworks-rrc3__xprs2015__XPRS_Scratch_2015.rff';
const TXT = 'missileworks-rrc3/missileworks-rrc3__xprs2015__XPRS_2015_Flight_Data.txt';

const bytes = () => new Uint8Array(readFileSync(CORPUS + RFF));

/** The Time column of the mDACS text export, in seconds, in file order. */
function mdacsTimes(): number[] {
  const text = decodeBytes(new Uint8Array(readFileSync(CORPUS + TXT)));
  const out: number[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const cells = line.split('\t');
    if (cells.length < 3) continue;
    const t = Number(cells[0]);
    // Same rows the pressure reader keeps, so the two line up index for index.
    if (Number.isFinite(t) && Number.isFinite(Number(cells[2]))) out.push(t);
  }
  return out;
}

/** The Pressure column of the mDACS text export, in mbar, in file order. */
function mdacsPressures(): number[] {
  const text = decodeBytes(new Uint8Array(readFileSync(CORPUS + TXT)));
  const out: number[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const cells = line.split('\t');
    if (cells.length < 3) continue;
    const v = Number(cells[2]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

describe.skipIf(!existsSync(CORPUS + RFF))('MissileWorks RRC3 raw .rff download', () => {
  it('reads every barometer sample the mDACS text export has, and exactly those', () => {
    const r = importFlight({ name: 'XPRS_Scratch_2015.rff', bytes: bytes() });
    expect(r.kind).toBe('flight');
    if (r.kind !== 'flight') return;
    expect(r.parser.id).toBe('missileworks-rff');

    const pressure = getChannel(r.flight, 'pressure');
    expect(pressure).toBeTruthy();
    const truth = mdacsPressures();
    expect(truth.length).toBeGreaterThan(3000);
    // Not "most of them" and not "the ones that line up": the file holds exactly as many
    // readings as mDACS printed rows for. A tag misread would either swallow a reading or
    // let an auxiliary word through as one, and either shows up here as a count.
    expect(pressure!.values.length, 'readings in the .rff vs rows in the mDACS export').toBe(truth.length);
    let worst = 0;
    for (let i = 0; i < truth.length; i++) {
      worst = Math.max(worst, Math.abs(pressure!.values[i] / 100 - truth[i]));
    }
    // The RRC3 logs tenths of a millibar, which is exactly what mDACS prints.
    expect(worst, 'worst pressure disagreement, mbar').toBe(0);
  });

  it('is the same flight as the text export, read from the same barometer readings', () => {
    const raw = analyzeFlight(unwrap(importFlight({ name: 'XPRS_Scratch_2015.rff', bytes: bytes() })));
    const txtBytes = new Uint8Array(readFileSync(CORPUS + TXT));
    const exported = unwrap(importFlight({ name: 'XPRS_2015_Flight_Data.txt', text: decodeBytes(txtBytes), bytes: txtBytes }));
    // Not "close to": the raw file and the text export carry the SAME barometer readings,
    // so Debrief's read of the export's pressure column has to be the identical flight,
    // not merely a similar one. Any drift here is a decoding bug, and a tolerance would
    // hide it.
    const onlyPressure = { ...exported, channels: exported.channels.filter((c) => c.kind === 'pressure') };
    const same = analyzeFlight(onlyPressure);
    expect(convert(raw.metrics.apogeeAltitude, 'm', 'ft')).toBeCloseTo(convert(same.metrics.apogeeAltitude, 'm', 'ft'), 6);

    // Against the mDACS ALTITUDE column — a second, weaker cross-check, because that
    // column is mDACS's own conversion of these same readings and the two atmosphere
    // models disagree by a couple of percent on a 13,000 ft flight.
    const mine = convert(raw.metrics.apogeeAltitude, 'm', 'ft');
    const theirs = convert(analyzeFlight(exported).metrics.apogeeAltitude, 'm', 'ft');
    expect(mine, `${mine.toFixed(0)} ft from the pressure vs ${theirs.toFixed(0)} ft from mDACS’s altitude column`).toBeGreaterThan(theirs * 0.96);
    expect(mine, `${mine.toFixed(0)} ft from the pressure vs ${theirs.toFixed(0)} ft from mDACS’s altitude column`).toBeLessThan(theirs * 1.04);
  });

  it('puts the flight on the RRC3’s own 20 Hz clock — the one mDACS stamps', () => {
    const flight = unwrap(importFlight({ name: 'XPRS_Scratch_2015.rff', bytes: bytes() }));
    expect(flight.time[0]).toBe(0);
    // Read out of the export's own Time column, not recomputed from the row count with the
    // same constant the parser uses — that version of this test agreed with itself and could
    // not have caught a wrong sample rate.
    const stamps = mdacsTimes();
    expect(stamps.length, 'rows in the mDACS export').toBe(flight.time.length);
    expect(stamps[1], 'mDACS’s own second stamp').toBeCloseTo(0.05, 10);
    // mDACS's own stamps step by exactly 0.05 s across 3,539 of the 3,540 intervals, and by
    // 0.06 s once — a single rounding hiccup in its printing, 177 seconds into the flight.
    // Said as a count rather than as a tolerance, because that is the actual shape of the
    // disagreement and a loose band would hide a real drift behind it.
    let steps = 0;
    for (let i = 1; i < stamps.length; i++) if (Math.abs(stamps[i] - stamps[i - 1] - 0.05) > 1e-9) steps++;
    expect(steps, 'intervals in the mDACS export that are not 0.05 s').toBe(1);
    let worst = 0;
    for (let i = 0; i < stamps.length; i++) worst = Math.max(worst, Math.abs(stamps[i] - flight.time[i]));
    // Floating point: the difference is 0.01 s plus 2e-14 of representation. Compared with a
    // hair of slack rather than written as 0.0100001, which would read as a measurement.
    expect(worst, 'worst clock disagreement with the mDACS export, seconds').toBeLessThan(0.0101);
  });

  it('refuses rather than guessing when the log does not open on the pad', () => {
    // Push the first words below any pad reading. Misreading where the readings begin
    // shifts the whole flight and still looks plausible, so this has to be a refusal
    // rather than a best effort.
    const doctored = bytes();
    const log = findArray(doctored);
    for (let i = 0; i < 8; i++) {
      doctored[log + i * 2] = 0x10;
      doctored[log + i * 2 + 1] = 0x00;
    }
    expect(() => missileworksRffParser.parse({ name: 'x.rff', text: '', bytes: doctored })).toThrow(ParseGuidanceError);
    expect(() => missileworksRffParser.parse({ name: 'x.rff', text: '', bytes: doctored })).toThrow(/open on the pad/);
  });

  it('refuses when the once-a-second markers and the readings disagree about the clock', () => {
    // Strip the markers out of the back half of the log. Those two counts are the only
    // thing a raw file with no timestamps in it offers to check the 20 Hz clock against,
    // and this is what happens when they stop agreeing.
    const doctored = bytes();
    const log = findArray(doctored);
    for (let i = 1800; i < 3899; i++) {
      const at = log + i * 2 + 1;
      if (doctored[at] & 0x40) doctored[at] &= ~0x40;
    }
    expect(() => missileworksRffParser.parse({ name: 'x.rff', text: '', bytes: doctored })).toThrow(/does not believe/);
  });

  it('does not read a word with the sign bit set back as a 3,277 mbar reading', () => {
    // The words come out of a signed List<Int16>, so anything at or above 0x8000 is negative
    // there. A tag written as a test on bit 14 lets 0x8000-0xBFFF through as a "reading" of
    // 3,277-4,915 mbar - three times sea level, and a value that would drag the pad baseline
    // and every height off it. The tag is a threshold for exactly this reason.
    const doctored = bytes();
    const log = findArray(doctored);
    // Turn one mid-flight reading into 0x8123: sign bit set, bit 14 clear.
    doctored[log + 600 * 2] = 0x23;
    doctored[log + 600 * 2 + 1] = 0x81;
    const r = importFlight({ name: 'x.rff', bytes: doctored });
    expect(r.kind).toBe('flight');
    if (r.kind !== 'flight') return;
    const pressure = getChannel(r.flight, 'pressure')!;
    // It is skipped like any other non-reading, so nothing above sea level appears at all.
    const highest = Math.max(...pressure.values);
    expect(highest / 100, 'highest reading, mbar').toBeLessThan(1200);
  });

  it('does not claim a file that merely happens to be binary', () => {
    expect(missileworksRffParser.detect({ name: 'x.rff', text: '', bytes: new Uint8Array(200) })).toBe(0);
    expect(missileworksRffParser.detect({ name: 'x.csv', text: 'time,alt\n0,0\n', bytes: new TextEncoder().encode('time,alt\n0,0\n') })).toBe(0);
  });
});

/** Byte offset of the Int16 array's first element, found the same way the parser does. */
function findArray(b: Uint8Array): number {
  for (let i = 13; i + 9 <= b.length; i++) {
    if (b[i] !== 0x0f || b[i + 9] !== 7) continue;
    const capacity = b[i + 5] | (b[i + 6] << 8) | (b[i + 7] << 16) | (b[i + 8] << 24);
    if (capacity > 0 && i + 10 + capacity * 2 <= b.length) return i + 10;
  }
  throw new Error('no array found');
}

function unwrap(r: ReturnType<typeof importFlight>) {
  if (r.kind !== 'flight') throw new Error('did not auto-detect');
  return r.flight;
}
