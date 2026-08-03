import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findRepeatedSpans, repeatedSampleCount, repeatedSpanNote, mergeRepeatedSpans } from './highRateRepeats';
import { highRateStream, flightTimeOrigin } from './parsers/blueraven';
import { importFlight } from './parsers';
import { readHighRateOnto } from './highRate';
import { analyzeFlight } from './analyze';
import type { ReadExtent } from './analyze/types';

const CORPUS = path.join(__dirname, 'parsers', '__corpus__', 'blueraven');
const has = existsSync(CORPUS);
const read = (f: string) => readFileSync(path.join(CORPUS, f), 'utf8');

/** The union counts, re-derived independently of this code by a throwaway pass over the raw CSV
 *  (payload = the `Sync` column onward). These are the numbers `ROADMAP.md` records. */
const PAIRS = [
  {
    short: 'jan10',
    hr: 'blueraven__trf-f1machbuster-jan10__BLRVN87-bckup HR_01-10-2026_14_55_30.csv',
    lr: 'blueraven__trf-f1machbuster-jan10__BLRVN87-bckup LR_01-10-2026_14_55_30.csv',
    repeatedRows: 27261,
  },
  {
    short: 'jan18',
    hr: 'blueraven__trf-f1machbuster-jan18__BlRv_159F1cm HR_01-18-2026_10_48_41.csv',
    lr: 'blueraven__trf-f1machbuster-jan18__BlRv_159F1cm LR_01-18-2026_10_48_41.csv',
    repeatedRows: 44793,
  },
  {
    short: 'lemiv',
    hr: 'blueraven__trf-lemiv-l3__BlRv_SN1537_HR_04-12-2025_12_45_49.csv',
    lr: 'blueraven__trf-lemiv-l3__BlRv_SN1537_LR_04-12-2025_12_45_49.csv',
    repeatedRows: 0,
  },
  {
    short: 'meraki',
    hr: 'blueraven__reddit-meraki2-121km__BlueRaven-HighRate.csv',
    lr: 'blueraven__reddit-meraki2-121km__BlueRaven-LR.csv',
    repeatedRows: 0,
  },
];

const extent = (o: Partial<ReadExtent> = {}): ReadExtent => ({
  from: 0,
  to: 100,
  startTime: 0,
  endTime: 1000,
  fileEndTime: 1000,
  source: 'file',
  ...o,
});

/** One channel of varying values, as the detector takes them. */
const chan = (vals: number[]) => [Float64Array.from(vals)];
const clock = (n: number) => Float64Array.from({ length: n }, (_, i) => i * 0.002);

describe('a replayed block is not a recording', () => {
  it('finds a verbatim repeat and reports the copy, not the source', () => {
    const unit = Array.from({ length: 120 }, (_, i) => Math.sin(i));
    const vals = [...unit, ...unit];
    const spans = findRepeatedSpans(chan(vals), clock(vals.length));
    expect(spans).toHaveLength(1);
    // The COPY is the second half — a source stretch is the recording and is not flagged.
    expect(spans[0].samples).toBe(unit.length);
    expect(spans[0].fromS).toBeCloseTo(unit.length * 0.002, 6);
  });

  it('does not call a board that sat still a replay', () => {
    // 4,000 identical samples: every lag "repeats" and nothing was written twice.
    const vals = Array.from({ length: 4000 }, () => 1);
    expect(findRepeatedSpans(chan(vals), clock(4000))).toEqual([]);
  });

  it('treats a repeat as one stretch however many times it recurs', () => {
    // Three copies of one 60-sample stretch. 120 samples repeat something earlier, not 180.
    // (This covers the RANGE-building, not the overlap union — with candidate lags taken from
    // consecutive gaps only, lag 120 never becomes a candidate here. The union's real coverage is
    // the corpus cases below, where jan10's four blocks collapse to two spans; `BACKLOG.md`
    // records that a corpus-free checkout therefore does not exercise it.)
    const unit = Array.from({ length: 60 }, (_, i) => i + 1);
    const vals = [...unit, ...unit, ...unit];
    expect(repeatedSampleCount(findRepeatedSpans(chan(vals), clock(vals.length)))).toBe(120);
  });

  it('unions overlapping spans rather than adding two counts for one stretch', () => {
    const merged = mergeRepeatedSpans(
      [{ fromS: 10, toS: 30, samples: 10000 }],
      [{ fromS: 20, toS: 25, samples: 2500 }],
    );
    expect(merged).toHaveLength(1);
    expect(repeatedSampleCount(merged)).toBe(10000);
    expect(merged[0]).toMatchObject({ fromS: 10, toS: 30 });
  });

  it('a hash collision cannot invent a repeat', () => {
    // Distinct values throughout: whatever the hash does, nothing may be reported.
    const vals = Array.from({ length: 3000 }, (_, i) => i * 1.0000001);
    expect(findRepeatedSpans(chan(vals), clock(3000))).toEqual([]);
  });

  it('says nothing about a repeat outside the stretch being read', () => {
    // The extent Debrief actually draws for jan10 is 0–20.22 s; its big block sits at ≈40 s.
    expect(repeatedSpanNote([{ fromS: 40, toS: 80, samples: 20160 }], extent({ endTime: 20.22 }))).toBeNull();
    // A span that merely touches the edge draws nothing either.
    expect(repeatedSpanNote([{ fromS: 20.22, toS: 40, samples: 900 }], extent({ endTime: 20.22 }))).toBeNull();
  });

  it('states the span and the read as separate facts, never a derived count', () => {
    const note = repeatedSpanNote([{ fromS: 14.1, toS: 28.3, samples: 7101 }], extent({ endTime: 20.22 }))!;
    // The span's OWN range and OWN count — the pairing "14.1–20.2 s … 7,101 of them" over-claimed
    // by 2.3x, because 6.1 s at 500 Hz is about 3,065 samples, not 7,101.
    expect(note).toContain('14.1 s to 28.3 s');
    expect(note).toContain('7,101');
    expect(note, 'the range must not be clipped to the extent').not.toContain('14.1 s to 20.2 s');
    // …and the read's end said on its own account.
    expect(note).toMatch(/ends at 20\.2 s, so only the part before that is drawn/);
  });

  it('claims nothing about how much of the file reaches the chart', () => {
    const note = repeatedSpanNote([{ fromS: 1, toS: 9, samples: 20160 }], extent())!;
    // The trace is an envelope — one sample per flight instant — so "every sample is still
    // drawn" was false by ~64x on jan10 and must not come back.
    expect(note).not.toMatch(/every sample/i);
    expect(note).not.toMatch(/nothing has been removed/i);
    // Nor may it promise something the low-rate half was never checked for.
    expect(note).not.toMatch(/low-rate half/i);
  });

  it('localises the count, so a de-DE browser does not read 20,160 as twenty point one six', () => {
    expect(repeatedSpanNote([{ fromS: 1, toS: 9, samples: 20160 }], extent())).toContain('20,160');
  });

  it('mentions the repeats it is NOT drawing, rather than pretending they are not there', () => {
    const note = repeatedSpanNote(
      [
        { fromS: 14.1, toS: 19, samples: 7101 },
        { fromS: 40, toS: 80, samples: 20160 },
      ],
      extent({ endTime: 20.22 }),
    );
    expect(note).toMatch(/One further repeated stretch lies outside the record read here/);
  });
});

// Split one file per case: run together they took ~3.1 s against vitest's 5 s default and the
// pre-push review measured them over it on a colder machine. A test that fails on timing is a
// test that will one day fail for no reason and be believed.
describe.skipIf(!has)('the corpus high-rate files, through the real read path', () => {
  for (const p of PAIRS) {
    it(`${p.short} — ${p.repeatedRows.toLocaleString('en-US')} repeated samples`, () => {
      const stream = highRateStream(read(p.hr));
      expect(stream, `${p.short}: the high-rate half must parse as a stream`).toBeTruthy();
      const spans = findRepeatedSpans(
        stream!.channels.map((c) => c.values),
        stream!.time,
      );
      expect(repeatedSampleCount(spans)).toBe(p.repeatedRows);
    });
  }

  it('jan10 states the repeat that is drawn and stays silent about the one that is not', () => {
    const p = PAIRS[0];
    const lr = importFlight({ name: p.lr, text: read(p.lr) });
    expect(lr.kind).toBe('flight');
    if (lr.kind !== 'flight') return;
    const flight = readHighRateOnto(lr.flight, highRateStream(read(p.hr))!, flightTimeOrigin(read(p.lr)) ?? 0);
    expect(flight.repeatedSpans, 'jan10 carries its repeats on the flight').toBeTruthy();

    const analysis = analyzeFlight(flight);
    // Debrief already truncates jan10 — its LOW-rate half is doubled too — so what a flyer is
    // shown is the opening ~20 s and the note must be about that stretch alone.
    expect(analysis.extent.endTime).toBeLessThan(30);

    const note = repeatedSpanNote(flight.repeatedSpans, analysis.extent)!;
    expect(note, 'the repeat inside the drawn stretch is stated').toBeTruthy();
    // The 20,160-sample block sits at ≈40 s, outside the extent. It is counted as NOT drawn
    // rather than named — the exact inversion that made a previous version wrong enough to revert.
    expect(note).toMatch(/One further repeated stretch lies outside/);
    expect(note).not.toContain('20,160');
    // And the drawn one is stated with its own range and its own count.
    expect(note).toContain('7,101');
    expect(note).toMatch(/ends at 20\.2 s/);
  });

  for (const p of PAIRS.filter((x) => x.repeatedRows === 0)) {
    it(`${p.short} is silent — a clean download says nothing`, () => {
      const lr = importFlight({ name: p.lr, text: read(p.lr) });
      if (lr.kind !== 'flight') throw new Error(`${p.short}: low-rate half did not parse`);
      const flight = readHighRateOnto(lr.flight, highRateStream(read(p.hr))!, flightTimeOrigin(read(p.lr)) ?? 0);
      expect(flight.repeatedSpans, `${p.short}: no spans`).toBeUndefined();
      expect(repeatedSpanNote(flight.repeatedSpans, analyzeFlight(flight).extent)).toBeNull();
    });
  }
});
