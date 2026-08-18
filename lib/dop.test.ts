import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './parsers';
import { getChannel } from './flight/types';
import { DOP_NEVER_SUPPLIED, dopSentence, trackDop } from './gpsFix';
import { summaryText } from './report';
import { analyzeFlight } from './analyze';
import type { RawFlight } from './flight/types';

/**
 * The dilution-of-precision columns AltOS has always written and Debrief always dropped.
 *
 * The whole risk in this slice is the sentinel. AltOS writes `2147483647` — INT32_MAX — for a
 * column it never had a value for, so a naive read does not lose a reading, it PUBLISHES a
 * dilution of precision of two billion as the worst quality in the file. Every case below is
 * ultimately about that, or about the line this slice must not cross: it discloses geometry and
 * filters nothing.
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
}

/**
 * Parsed once for the whole file, not once per case.
 *
 * Not a tidiness point: five cases each re-walking 50 recordings took the run past vitest's own
 * `onTaskUpdate` RPC timeout on a four-CPU box, and **an unhandled reporter error exits non-zero
 * while every test still prints as passed** — a red gate that reads like a green one. Parse once.
 */
let cached: Read[] | null = null;
function corpusReads(): Read[] {
  if (cached) return cached;
  cached = readCorpus();
  return cached;
}

function readCorpus(): Read[] {
  const out: Read[] = [];
  for (const p of logFiles(CORPUS)) {
    let res;
    try {
      res = importFlight({ name: p.split('/').pop()!, bytes: new Uint8Array(readFileSync(p)) });
    } catch {
      continue;
    }
    if (!res || res.kind !== 'flight') continue;
    out.push({ file: p.slice(CORPUS.length), flight: res.flight });
  }
  return out;
}

const DOP_KINDS = ['dopHorizontal', 'dopVertical', 'dopPosition'] as const;

describe.skipIf(!hasCorpus)('the sentinel', () => {
  it('never reaches a channel, on any recording in the corpus', () => {
    const reads = corpusReads();
    // 39 is the corpus's analysable-record count — the same number `HANDOFF.md` cites.
    expect(reads.length).toBeGreaterThanOrEqual(39);
    let carrying = 0;
    for (const r of reads) {
      for (const k of DOP_KINDS) {
        const c = getChannel(r.flight, k);
        if (!c) continue;
        carrying++;
        // The failure this whole slice exists to avoid, asserted directly.
        for (let i = 0; i < c.values.length; i++) {
          expect(c.values[i], `${r.file} ${k}[${i}]`).not.toBe(DOP_NEVER_SUPPLIED);
        }
        // …and nothing absurd survived by another route. Bounded loosely here on purpose; the
        // exact worst value is pinned once, below, because it is a number the methods page quotes.
        const real = Array.from(c.values).filter(Number.isFinite);
        expect(real.length, `${r.file} ${k} is all NaN — it should have been dropped`).toBeGreaterThan(0);
        expect(Math.max(...real), `${r.file} ${k}`).toBeLessThan(100);
        expect(Math.min(...real), `${r.file} ${k}`).toBeGreaterThan(0);
      }
    }
    // Guard the guard: a corpus that stopped yielding DOP channels would pass every line above.
    expect(carrying).toBe(16);
  });

  it('is a PER-COLUMN statement, not a per-file one — the case that decides the design', () => {
    const reads = corpusReads();
    // `intrepid2` supplies pdop and marks hdop and vdop never-supplied, on all 346 of its rows.
    // A file-level rule — drop every dilution channel when any column is sentinel, or keep them
    // all when any column is real — gets this recording wrong in one direction or the other.
    const mixed = reads.find((r) => /intrepid2.*telemetrum_data\.csv$/.test(r.file));
    expect(mixed, 'corpus is missing the mixed-sentinel recording').toBeDefined();
    expect(getChannel(mixed!.flight, 'dopHorizontal'), 'hdop is never supplied here').toBeUndefined();
    expect(getChannel(mixed!.flight, 'dopVertical'), 'vdop is never supplied here').toBeUndefined();
    const pdop = getChannel(mixed!.flight, 'dopPosition');
    expect(pdop, 'pdop IS supplied here and must survive').toBeDefined();
    const real = Array.from(pdop!.values).filter(Number.isFinite);
    expect(real.length).toBeGreaterThan(0);
    expect(Math.min(...real)).toBeCloseTo(1.6, 2);
    expect(Math.max(...real)).toBeCloseTo(1.7, 2);

    // And the other end of the same rule: a recording that marks all three loses all three.
    const none = reads.find((r) => /sg1\.1.*TeleMetrum\.csv$/i.test(r.file));
    expect(none, 'corpus is missing the all-sentinel recording').toBeDefined();
    for (const k of DOP_KINDS) expect(getChannel(none!.flight, k), `${k} on the all-sentinel file`).toBeUndefined();
  });
});

/**
 * The two numbers the METHODS PAGE quotes, pinned to the corpus that produced them.
 *
 * **This exists because the first version of this slice quoted three figures that were not true of
 * what Debrief reads.** `/methods` said a dilution of 12.10 is published as written and that a
 * single flight runs 0.80 to 1.90; `lib/gpsFix.ts` said the same 12.10 and, arguing for stating a
 * RANGE, gave 0.80 to 23.10 as the example — a range the very same change had removed, because
 * 23.10 is `endurance`'s no-fix placeholder.
 *
 * 12.10 is a real value and that is what made it survive review: it is `Mega38-1_TeleMega.csv`'s
 * worst position dilution. But `importFlight` returns `kind: 'mapping'` for that file — no named
 * parser claims it, and the column mapper offers no dilution role (D12 slice 4) — so Debrief
 * publishes nothing from it. **A claim about the CORPUS had been written under a sentence about
 * the PRODUCT.** That is this repo's recorded failure mode, an inference published as a
 * measurement, and prose is exactly where it survives a gate.
 *
 * So the page's numbers are asserted rather than described. Both are EXACT: a bound would go
 * quietly green the day the corpus or the parser moved, which is the whole thing being prevented.
 */
describe.skipIf(!hasCorpus)('the numbers the methods page quotes', () => {
  it('are the numbers the corpus actually produces', () => {
    let worst = -Infinity;
    let worstWhere = '';
    let widestHi = -Infinity;
    let widestWhere = '';
    for (const r of corpusReads()) {
      for (const k of DOP_KINDS) {
        const c = getChannel(r.flight, k);
        if (!c) continue;
        for (const v of c.values) {
          if (Number.isFinite(v) && v > worst) {
            worst = v;
            worstWhere = `${r.file} ${k}`;
          }
        }
      }
      // The sentence a flyer reads is HDOP over the positions that were KEPT, so the widest
      // spread it can state is measured through the same function the surfaces call.
      const lat = getChannel(r.flight, 'latitude')?.values;
      const lon = getChannel(r.flight, 'longitude')?.values;
      const d = lat && lon ? trackDop(getChannel(r.flight, 'dopHorizontal')?.values, lat, lon) : null;
      if (d && d.hi > widestHi) {
        widestHi = d.hi;
        widestWhere = r.file;
      }
    }

    // `/methods`: "the worst geometry Debrief reads off any of these files — a position dilution
    // of 6.10 — is published exactly as the receiver wrote it."
    expect(worst, `worst dilution read, in ${worstWhere}`).toBeCloseTo(6.1, 10);

    // `/methods`: "a single flight can run from 0.70 to 3.10." The low end is the floor good
    // geometry reaches; the top of the widest range is the half that can drift.
    expect(widestHi, `widest HDOP stated, in ${widestWhere}`).toBeCloseTo(3.1, 10);
  });
});

describe.skipIf(!hasCorpus)('what the columns are', () => {
  it('agree with each other: PDOP² = HDOP² + VDOP², on every row that states all three', () => {
    // Not a filter and not a correction — a check that the three columns are the quantities their
    // names claim. Reading them one index out of alignment (which is easy: the header line starts
    // with `#` and the data rows have no matching extra field) breaks this on 100% of rows, and
    // that is exactly how a scouting pass for this slice first mis-read the format.
    const reads = corpusReads();
    let rows = 0;
    let agreed = 0;
    let worst = 0;
    for (const r of reads) {
      const h = getChannel(r.flight, 'dopHorizontal')?.values;
      const v = getChannel(r.flight, 'dopVertical')?.values;
      const p = getChannel(r.flight, 'dopPosition')?.values;
      if (!h || !v || !p) continue;
      for (let i = 0; i < h.length; i++) {
        if (!Number.isFinite(h[i]) || !Number.isFinite(v[i]) || !Number.isFinite(p[i])) continue;
        rows++;
        const want = Math.hypot(h[i], v[i]);
        const err = Math.abs(p[i] - want) / want;
        worst = Math.max(worst, err);
        if (err <= 0.15) agreed++;
      }
    }
    expect(rows).toBeGreaterThan(20_000);
    // **Measured: 22,199 rows, and agreement on EVERY one of them** — worst case 7.96%, which is
    // what two-decimal rounding on values near 1 costs. Not "almost all": the exception this check
    // used to have was 112 rows of `23.10, 23.10, 23.10`, and those turned out not to be readings
    // at all (see the no-fix case below). Removing them did not loosen this bound, it closed it.
    expect(agreed).toBe(rows);
    expect(worst).toBeLessThan(0.08);
  });
});

describe.skipIf(!hasCorpus)('a dilution beside a fix that never happened', () => {
  it('is dropped with the position it belonged to, not quoted as the worst geometry of the flight', () => {
    // **`endurance`'s TeleMetrum log writes `23.10` into all three dilution columns on all 112 of
    // its zero-satellite rows** — one repeated value, ten times worse than anything else in the
    // file, sitting beside positions the parser was already throwing away as held-over. Left in,
    // the recovery view would have read "HDOP 0.80 to 23.10" and a flyer would have taken 23.10
    // as this flight's worst geometry. It is not a reading; it is what the receiver had to say
    // when it had nothing.
    //
    // This is NOT a quality filter, and the difference is the whole of `COMPETITION.md` row 47:
    // nothing anywhere looks at how bad a dilution is. The rule applied is the one the parser
    // already applies to latitude, longitude and the GPS altitude on the same rows.
    const r = corpusReads().find((x) => /endurance.*TeleMetrum\.csv$/.test(x.file));
    expect(r, 'corpus is missing the endurance recording').toBeDefined();
    for (const k of DOP_KINDS) {
      const c = getChannel(r!.flight, k);
      expect(c, k).toBeDefined();
      const real = Array.from(c!.values).filter(Number.isFinite);
      expect(real.length, `${k} keeps its real values`).toBe(421);
      expect(Math.max(...real), `${k} no longer carries the no-fix placeholder`).toBeLessThan(10);
    }
    // And the sentence a flyer reads is the real spread, not the placeholder.
    const lat = getChannel(r!.flight, 'latitude')!.values;
    const lon = getChannel(r!.flight, 'longitude')!.values;
    const d = trackDop(getChannel(r!.flight, 'dopHorizontal')!.values, lat, lon)!;
    expect(d.hi).toBeLessThan(10);
    expect(dopSentence(d)).not.toContain('23.10');
  });
});

describe('the sentence', () => {
  it('states a RANGE and no metres, ever', () => {
    const s = dopSentence({ n: 100, lo: 0.7, hi: 1.8, median: 0.9 })!;
    expect(s).toContain('0.70');
    expect(s).toContain('1.80');
    expect(s).toContain('0.90');
    // The one thing it must never do. `COMPETITION.md` row 47: no vendor publishes the function
    // from what these files carry to a distance, so a distance here would be invented.
    expect(s).not.toMatch(/\bmetres? (?:of|from|accura)|±|\bm\b(?!e)/);
    expect(s).toMatch(/not a distance/);
  });

  it('says nothing where the file says nothing', () => {
    const lat = Float64Array.from([1, 2, 3]);
    const lon = Float64Array.from([1, 2, 3]);
    expect(trackDop(undefined, lat, lon)).toBeNull();
    expect(trackDop(Float64Array.from([NaN, NaN, NaN]), lat, lon)).toBeNull();
    expect(dopSentence(null)).toBeNull();
  });

  it('summarises only the fixes that KEPT a position', () => {
    // A dilution beside a position the parser dropped is not on the map, so it must not widen the
    // range a flyer reads off it.
    const lat = Float64Array.from([1, NaN, 3]);
    const lon = Float64Array.from([1, NaN, 3]);
    const d = trackDop(Float64Array.from([1.0, 99, 2.0]), lat, lon)!;
    expect(d.n).toBe(2);
    expect(d.hi).toBe(2.0);
  });
});

describe.skipIf(!hasCorpus)('every surface says the same thing', () => {
  it('the saved report carries the GPS quality the screen shows, on every recording that has it', () => {
    // The defect shape this repo has now found five runs running: a figure one surface qualifies
    // and another publishes bare. `fixQualitySentence` was screen-only until this slice — a flyer
    // who filed the document and walked off the map took the coordinate without the sentence that
    // qualifies it.
    const reads = corpusReads();
    let checked = 0;
    for (const r of reads) {
      const lat = getChannel(r.flight, 'latitude')?.values;
      const lon = getChannel(r.flight, 'longitude')?.values;
      if (!lat || !lon) continue;
      const want = dopSentence(trackDop(getChannel(r.flight, 'dopHorizontal')?.values, lat, lon));
      if (!want) continue;
      checked++;
      let analysis;
      try {
        analysis = analyzeFlight(r.flight);
      } catch {
        continue;
      }
      const txt = summaryText(r.flight, analysis, 'imperial');
      expect(txt, `${r.file} document`).toContain('Satellite geometry behind these positions');
      // The figures travel too, not just the label.
      const lo = want.match(/HDOP ([\d.]+)/)![1];
      expect(txt, `${r.file} figures`).toContain(lo);
    }
    expect(checked).toBe(5);
  });
});
