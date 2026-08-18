import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';
import { peakRestsOnAGap } from './gpsFix';
import { analysisJson, summaryText } from './report';
import { APOGEE_TAG_FLOOR } from './readings';
import type { FlightAnalysis, FlightMetrics } from './analyze/types';
import type { RawFlight } from './flight/types';

/**
 * A GPS apogee that rests on a hole in the record, and the check that refused the first version
 * of it.
 *
 * The claim under test is narrow: the highest fix in a recording is the highest fix the receiver
 * HAPPENED to solve, so when it went quiet across the top, that figure is a lower bound rather
 * than a second opinion — and the cross-check panel calling it *"differ"* without saying so invites
 * a flyer to conclude the barometer is wrong.
 *
 * **The first version of this measured the same thing over SAMPLES and was thrown away, so the
 * first case here is the one that would have caught it.** Counted in rows, the gap fired on
 * `SG1.1-Booster`'s `.eeprom` (17.9 s) and not on the `.csv` of the same download — one flight,
 * two answers — because an AltOS eeprom writes a GPS record only when the receiver solved one
 * while AltosUI's CSV repeats the held position on every row. Nothing in the suite noticed,
 * because nothing held the two exports of one download side by side. `both exports of one
 * download agree` does, and it fails against a sample-counted metric by construction.
 */

const CORPUS = fileURLToPath(new URL('./parsers/__corpus__/', import.meta.url));
const hasCorpus = (() => {
  try {
    return statSync(CORPUS).isDirectory();
  } catch {
    return false;
  }
})();

function logFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = `${d}/${e}`;
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(csv|txt|tsv|dat|pf2|eeprom|rff|log)$/i.test(e) && s.size < 60_000_000) out.push(p);
    }
  };
  walk(dir.replace(/\/$/, ''));
  return out.sort();
}

interface Read {
  file: string;
  flight: RawFlight;
  analysis: FlightAnalysis;
  m: FlightMetrics;
  floor: boolean;
}

/** Every corpus recording that states a GPS apogee at all — the only ones this rule can speak about. */
function gpsReads(): Read[] {
  const out: Read[] = [];
  for (const p of logFiles(CORPUS)) {
    let res;
    try {
      res = importFlight({ name: p.split('/').pop()!, bytes: new Uint8Array(readFileSync(p)) });
    } catch {
      continue;
    }
    if (!res || res.kind !== 'flight') continue;
    let analysis: FlightAnalysis;
    try {
      analysis = analyzeFlight(res.flight);
    } catch {
      continue;
    }
    const m = analysis.metrics;
    if (m.gpsApogeeAltitude == null) continue;
    out.push({
      file: p.slice(CORPUS.length),
      flight: res.flight,
      analysis,
      m,
      floor: peakRestsOnAGap(m.gpsApogeeGap, m.gpsSolutionInterval),
    });
  }
  return out;
}

/** The two downloads the corpus holds in both of a logger's export formats. */
const PAIRS: [string, string][] = [
  [
    'altusmetrum/altusmetrum__issuiuc-sg1.1-20231001__SG1.1-Booster-October-TeleMetrum.csv',
    'altusmetrum/altusmetrum__issuiuc-sg1.1-20231001__SG1.1-Booster-October-TeleMetrum.eeprom',
  ],
  [
    'altusmetrum/altusmetrum__issuiuc-kairos-20240323__Kairos-Booster-March-TeleMega.csv',
    'altusmetrum/altusmetrum__issuiuc-kairos-20240323__Kairos-Booster-March-Telemega.eeprom',
  ],
];

describe('the rule itself', () => {
  it('needs both a hole and a hole that is out of character', () => {
    // The corpus case: 18 s of silence on a receiver that was managing one solution a second.
    expect(peakRestsOnAGap(18, 1)).toBe(true);

    // **The ratio clause is load-bearing, and this is the file that proves it.** `endurance`
    // carries the second-largest absolute gap in the corpus — 7.01 s — which an absolute-only
    // rule would fire on. Its receiver runs at 5 s, so that gap is one ordinary interval and no
    // hole at all; its GPS apogee reads ABOVE the barometric one, so it plainly did not miss
    // the peak.
    expect(peakRestsOnAGap(7.01, 5)).toBe(false);

    // **And the absolute clause is load-bearing the other way.** Three missed solutions on a
    // 20 Hz receiver is 0.15 s — a ratio of 3, and nothing at all in a rocket's terms, because
    // an airframe sits within a metre of its apogee for far longer than that.
    expect(peakRestsOnAGap(0.15, 0.05)).toBe(false);

    // Exactly at both thresholds is a hole: the boundary belongs to the qualified side, because
    // the cost of saying "at least" about a fix that was fine is a weaker claim, and the cost of
    // the other mistake is a wrong one.
    expect(peakRestsOnAGap(2, 0.5)).toBe(true);
    expect(peakRestsOnAGap(1.99, 0.5)).toBe(false);
    expect(peakRestsOnAGap(3, 1.001)).toBe(false);
  });

  it('says nothing where the record says nothing', () => {
    // A file with no gap, no cadence, or a cadence of zero cannot support the claim, and the
    // absence of a quality statement is not a statement of poor quality — the same judgement
    // `gradeFromSatellites` makes about a missing satellite column.
    expect(peakRestsOnAGap(null, 1)).toBe(false);
    expect(peakRestsOnAGap(18, null)).toBe(false);
    expect(peakRestsOnAGap(18, 0)).toBe(false);
    expect(peakRestsOnAGap(NaN, 1)).toBe(false);
    expect(peakRestsOnAGap(18, NaN)).toBe(false);
  });
});

describe.skipIf(!hasCorpus)('measured over the corpus', () => {
  it('both exports of one download agree — the check that refused the first version', () => {
    const reads = gpsReads();
    let pairsChecked = 0;
    for (const [a, b] of PAIRS) {
      const ra = reads.find((r) => r.file === a);
      const rb = reads.find((r) => r.file === b);
      expect(ra, `corpus is missing ${a}`).toBeDefined();
      expect(rb, `corpus is missing ${b}`).toBeDefined();
      pairsChecked++;

      // The cadence is the receiver's own and cannot depend on how the download was written out.
      expect(ra!.m.gpsSolutionInterval).toBeCloseTo(rb!.m.gpsSolutionInterval!, 2);

      // The gap is the same silence seen through two encodings. Not asserted bit-identical: the
      // two files timestamp a solution to their own resolution, which moves the Kairos pair by
      // 10 ms. A tenth of a second is far tighter than anything the rule turns on and far looser
      // than the 17.9-vs-nothing the sample-counted version produced.
      expect(Math.abs(ra!.m.gpsApogeeGap! - rb!.m.gpsApogeeGap!)).toBeLessThan(0.1);

      // And the verdict — the thing every surface actually publishes — is identical.
      expect(ra!.floor, `${a} vs ${b}`).toBe(rb!.floor);
    }
    expect(pairsChecked).toBe(2);
  });

  it('fires on the one corpus flight whose receiver went quiet across the top, and no other', () => {
    const reads = gpsReads();
    // Guard the guard: a corpus that stopped yielding GPS reads would make every assertion
    // below vacuously true.
    expect(reads.length).toBeGreaterThanOrEqual(7);

    const fired = reads.filter((r) => r.floor).map((r) => r.file);
    expect(fired).toEqual(PAIRS[0].slice());

    // Both SG1.1 exports, with the numbers, so a change to either the metric or the threshold
    // has to come here and say what it did.
    for (const f of PAIRS[0]) {
      const r = reads.find((x) => x.file === f)!;
      expect(r.m.gpsSolutionInterval).toBeCloseTo(1, 2);
      expect(r.m.gpsApogeeGap).toBeCloseTo(18, 1);
      // The reason it matters: the figure this qualifies is 10% under the barometric read of the
      // same flight, and the panel called that "differ" with no explanation of the direction.
      expect(r.m.gpsApogeeAltitude! / r.m.apogeeAltitude).toBeLessThan(0.93);
    }

    // Every other GPS recording in the corpus keeps a cadence right through its peak.
    for (const r of reads.filter((x) => !x.floor)) {
      expect(r.m.gpsApogeeGap, r.file).not.toBeNull();
      expect(r.m.gpsApogeeGap! / r.m.gpsSolutionInterval!, r.file).toBeLessThan(2);
    }
  });
});

describe('every surface that publishes the figure', () => {
  it('reads the rule from one place, rather than carrying its own copy of the thresholds', () => {
    // The screen has no unit test — this repo covers components through Playwright, and no shipped
    // sample reaches this panel at all (filed in `BACKLOG.md`). So the thing worth pinning here is
    // the one a future edit would break silently: a surface that stops asking `peakRestsOnAGap`
    // and starts comparing its own numbers. Same shape as `lib/gpsFix.test.ts` asserting that every
    // parser routes through the shared fix rule rather than testing the rule alone.
    const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    for (const rel of ['../components/GpsApogee.tsx', './report.ts']) {
      const text = src(rel);
      expect(text, rel).toMatch(/peakRestsOnAGap/);
      // …and does not restate the thresholds it encodes.
      expect(text.includes('gpsSolutionInterval * 3'), rel).toBe(false);
    }
  });
});

describe.skipIf(!hasCorpus)('every surface that publishes the figure', () => {
  /**
   * The transferable half. Four runs of this repo have now had to fix the same defect — a figure
   * Debrief qualifies in one place and publishes bare in another — so the check is not "the panel
   * says it" but "no surface disagrees with any other", asserted over every file that has the
   * figure at all rather than over the one that happens to fire.
   */
  it('agrees with every other, on every corpus recording that states a GPS apogee', () => {
    const reads = gpsReads();
    expect(reads.length).toBeGreaterThanOrEqual(7);
    let qualified = 0;
    for (const r of reads) {
      const json = JSON.parse(analysisJson(r.flight, r.analysis, 'imperial', 1_700_000_000_000));
      const txt = summaryText(r.flight, r.analysis, 'imperial');
      const gpsRow = txt.split('\n').find((l) => /Apogee/.test(l) && /agree|differ|not the same peak/.test(l));
      expect(gpsRow, `${r.file} publishes a GPS cross-check row`).toBeDefined();

      expect(json.metrics.gpsApogeeIsFloor, r.file).toBe(r.floor);
      expect(gpsRow!.includes(APOGEE_TAG_FLOOR), `${r.file} document tag`).toBe(r.floor);
      expect(/lower bound/.test(gpsRow!), `${r.file} document reason`).toBe(r.floor);

      // A bound whose basis is missing is a number a reader cannot argue with, so both figures
      // travel with it — and are absent where there is nothing to qualify.
      if (r.floor) {
        qualified++;
        expect(json.metrics.gpsApogeeGapS, r.file).toBeCloseTo(18, 1);
        expect(json.metrics.gpsSolutionIntervalS, r.file).toBeCloseTo(1, 2);
        expect(gpsRow).toMatch(/18\.0 s without a solution across the peak/);
        expect(gpsRow).toMatch(/against 1\.0 s on the rest of the flight/);
      }
    }
    // The loop above is only worth running if something in it took the qualified branch.
    expect(qualified).toBe(2);
  });
});
