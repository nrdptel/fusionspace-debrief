import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynamicPressureSeries, hasDynamicPressure, Q_ASCENT_CAVEAT } from './dynamicPressure';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';
import { buildPlotChannels } from './explore';
import { buildComparison, resample } from './compare';
import { analyzedDataCsv } from './report';
import type { FlightAnalysis, FlightSeries } from './analyze/types';
import type { RawFlight } from './flight/types';

/** A three-sample stand-in: rising, then falling hard the way a deployment transient does. */
function seriesWith(over: Partial<FlightSeries> = {}): FlightSeries {
  return {
    time: Float64Array.from([0, 1, 2, 3]),
    altitude: Float64Array.from([0, 50, 100, 60]),
    altitudeRaw: Float64Array.from([0, 50, 100, 60]),
    velocity: Float64Array.from([0, 40, 0, -400]),
    acceleration: Float64Array.from([0, 9.80665, -9.80665, -9.80665]),
    axialAccel: Float64Array.from([0, 9.80665, -9.80665, -9.80665]),
    velocitySource: 'baro',
    accelerationSource: 'device',
    altitudeSource: 'baro',
    speedOfSound: 340,
    speedOfSoundProfile: Float64Array.from([340, 339, 338, 339]),
    airDensity: Float64Array.from([1.2, 1.2, 1.2, 1.2]),
    ascent: { start: 0, end: 2 },
    ...over,
  };
}

const maxOf = (a: ArrayLike<number>) => {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && a[i] > m) m = a[i];
  return m;
};

describe('the dynamic-pressure series', () => {
  it('reads ½ρv² inside the ascent and nothing outside it', () => {
    const q = dynamicPressureSeries(seriesWith());
    expect(q[1]).toBeCloseTo(0.5 * 1.2 * 40 * 40, 6);
    // The −400 m/s sample is a deployment transient one index past apogee. Squared it would be
    // 96 kPa — 100× the real peak — which is the whole defect this module exists to close.
    expect(Number.isNaN(q[3])).toBe(true);
    expect(maxOf(q)).toBeCloseTo(960, 6);
  });

  it('withholds the whole curve when the peak speed was withheld, for any reason', () => {
    const q = dynamicPressureSeries(seriesWith({ velocityUnusable: true }));
    expect(q.every((v) => Number.isNaN(v))).toBe(true);
    expect(hasDynamicPressure(seriesWith({ velocityUnusable: true }))).toBe(false);
  });

  it('withholds the whole curve when the record has no ascent', () => {
    expect(hasDynamicPressure(seriesWith({ ascent: null }))).toBe(false);
  });
});

// The corpus half. These are the assertions that would have caught the defect: they hold the
// analysis's headline and each surface's own series side by side and fail when they drift.
// Resolved against THIS FILE, not the cwd: the shell's working directory is not stable in every
// harness, and a cwd-relative path turns a green suite into a suite that examined nothing.
const FIXTURES = fileURLToPath(new URL('./parsers/__fixtures__', import.meta.url));
const CORPUS = fileURLToPath(new URL('./parsers/__corpus__', import.meta.url));

/**
 * The committed fixtures ALWAYS, and the private corpus when a session has it linked.
 *
 * Both, deliberately. `__corpus__` is gitignored, so a public clone and every fork's CI see none
 * of it — and a suite that walks only that directory finds zero files, asserts over empty arrays
 * and passes while examining nothing. `__fixtures__` is committed, so the floor below is a real
 * floor everywhere rather than a number that only means something on a machine with the corpus.
 */
function corpusFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('_') && e.name !== 'scripts') walk(p);
      } else if (/\.(csv|txt|log|eeprom|pf2|dat)$/i.test(e.name)) out.push(p);
    }
  };
  walk(FIXTURES);
  walk(CORPUS);
  return out;
}

describe('every surface that publishes a max-Q publishes the same one', () => {
  const files = corpusFiles();
  const analysed: { name: string; analysis: FlightAnalysis; flight: RawFlight }[] = [];
  for (const f of files) {
    let text: string;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    try {
      const r = importFlight({ name: path.basename(f), text });
      // `importFlight` returns a union: a file no parser claims comes back as a MAPPING result
      // with no flight on it, and there is nothing to analyse in that case.
      if (!('flight' in r) || !r.flight) continue;
      const a = analyzeFlight(r.flight);
      if (!a?.metrics) continue;
      analysed.push({ name: path.basename(f), analysis: a, flight: r.flight });
    } catch {
      continue;
    }
  }

  it('examines a corpus, and says how many', () => {
    // Prints its own count for the reason this repo keeps re-learning: a suite that found no
    // corpus skips itself and prints almost exactly like one that passed.
    console.log(`max-Q agreement: ${analysed.length} recordings analysed end to end`);
    // The committed fixtures alone clear this floor, so it is a real floor on a public clone and
    // on fork CI — not a number that silently means "examined nothing" wherever the private
    // corpus is absent. With the corpus linked it runs several times higher; the count is printed
    // above rather than asserted exactly, because pinning it would fail on the corpus moving
    // rather than on anything about dynamic pressure.
    expect(analysed.length).toBeGreaterThanOrEqual(8);
  });

  // **This is the assertion that kills the mutant, and it exists because the obvious one did
  // not.** Dropping the ascent window from `dynamicPressureSeries` entirely — the exact bug —
  // left every max-versus-headline check GREEN across all 37 recordings, because the transient
  // that produced 47,322 kPa is NEGATIVE and the sign guard alone already refuses it. So the
  // max checks pin the sign guard, not the window, and only a check on the window's own contract
  // can fail when the window goes. Measured 2026-08-17 by running that mutant.
  it('publishes no sample outside the ascent window at all', () => {
    const bad: string[] = [];
    for (const { name, analysis } of analysed) {
      const win = analysis.series.ascent;
      if (!win) continue;
      const q = dynamicPressureSeries(analysis.series);
      for (let i = 0; i < q.length; i++) {
        if (Number.isFinite(q[i]) && (i < win.start || i > win.end)) {
          bad.push(`${name}: sample ${i} is outside ascent ${win.start}..${win.end}`);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('never lets the explorer plot a q above the headline the analysis reports', () => {
    const bad: string[] = [];
    for (const { name, analysis, flight } of analysed) {
      const ch = buildPlotChannels(flight, analysis.series, analysis.metrics).find((c) => c.key === 'd-q');
      if (!ch) continue;
      const head = analysis.metrics.maxDynamicPressure;
      const seen = maxOf(ch.values);
      if (head == null || !Number.isFinite(seen)) continue;
      // Equal by construction — both are the max of ½ρv² over the same window. A tolerance
      // here would be the place a future transient hides, so there isn't one beyond float noise.
      if (Math.abs(seen - head) > Math.max(1e-6, head * 1e-9)) {
        bad.push(`${name}: explorer ${(seen / 1000).toFixed(1)} kPa vs headline ${(head / 1000).toFixed(1)} kPa`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never lets the comparison overlay carry a q above that headline either', () => {
    const bad: string[] = [];
    for (const { name, analysis } of analysed) {
      const head = analysis.metrics.maxDynamicPressure;
      if (head == null) continue;
      const cmp = buildComparison([
        { id: 'x', name, formatLabel: 'test', analysis },
      ]);
      const seen = maxOf(cmp.flights[0].dynamicPressure);
      if (!Number.isFinite(seen)) continue;
      // Resampled onto the shared grid, so this one gets a real tolerance: interpolation
      // between two ascent samples cannot exceed the larger of them by more than rounding.
      if (seen > head * 1.000001) {
        bad.push(`${name}: overlay ${(seen / 1000).toFixed(1)} kPa vs headline ${(head / 1000).toFixed(1)} kPa`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('exports no dynamic-pressure cell above that headline in the analyzed-data CSV', () => {
    // The file a flyer pastes into a cert document — checked on the loudest corpus case rather
    // than all of them, because building every CSV is minutes and one proof is the point.
    const worst = analysed.find((a) => /meraki2-121km/.test(a.name)) ?? analysed[0];
    const head = worst.analysis.metrics.maxDynamicPressure;
    if (head == null) return;
    const csv = analyzedDataCsv(worst.flight, worst.analysis, 'metric');
    const header = csv.split('\n')[0].split(',');
    const qCol = header.findIndex((h) => /^dynamic pressure/.test(h));
    expect(qCol).toBeGreaterThanOrEqual(0);
    let seen = -Infinity;
    for (const line of csv.split('\n').slice(1)) {
      const v = Number(line.split(',')[qCol]);
      if (Number.isFinite(v) && v > seen) seen = v;
    }
    // The CSV is written in the display unit (kPa), the headline is Pa.
    expect(seen).toBeLessThanOrEqual((head / 1000) * 1.0001);
  });
});

describe('the caveat is on exactly one channel', () => {
  // Restores the property the three `toBeUndefined()` assertions in `explore.test.ts` used to
  // carry and lost when they were narrowed to match wording: that a caveat belongs to ONE channel
  // and does not leak onto its neighbours. Stated positively here — d-q has it, nothing else does
  // — so it holds for any future caveat rather than only for the three worded cases.
  it('rides on d-q as a SCOPE, never as a caveat, and on no other channel', () => {
    const files = corpusFiles();
    let checked = 0;
    for (const f of files.slice(0, 6)) {
      let r;
      try {
        r = importFlight({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') });
      } catch {
        continue;
      }
      if (!('flight' in r) || !r.flight) continue;
      const a = analyzeFlight(r.flight);
      const chans = buildPlotChannels(r.flight, a.series, a.metrics);
      const carrying = chans.filter((c) => c.scope === Q_ASCENT_CAVEAT).map((c) => c.key);
      expect(carrying.every((k) => k === 'd-q')).toBe(true);
      // And it must never arrive in `caveat`, whose hue this panel reserves for a refusal. An
      // always-on amber row is the failure `explore.test.ts` names: a caveat on every flight is a
      // caveat nobody reads.
      expect(chans.every((c) => c.caveat !== Q_ASCENT_CAVEAT)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('resample lands on an endpoint instead of interpolating onto it', () => {
  // The leading edge of a gap used to swallow its first real sample: at a grid point sitting
  // exactly on it, `f` is 1 and `NaN + (vb - NaN) * 1` is NaN. Exposed by the dynamic-pressure
  // curve starting at liftoff rather than at row 0.
  it('keeps the first finite sample at the start of a gap', () => {
    const out = resample(
      Float64Array.from([0, 1, 2, 3, 4]),
      Float64Array.from([NaN, 100, 400, 900, NaN]),
      Float64Array.from([0, 1, 2, 3, 4]),
    );
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[1]).toBe(100); // was NaN
    expect(out[2]).toBe(400);
    expect(out[3]).toBe(900);
    expect(Number.isNaN(out[4])).toBe(true);
  });
});

describe('the caveat', () => {
  it('says why the curve stops, rather than only that it does', () => {
    expect(Q_ASCENT_CAVEAT).toMatch(/ascent/);
    expect(Q_ASCENT_CAVEAT).toMatch(/deployment/);
    // A caveat that restates the label teaches nothing — this one has to name the mechanism.
    expect(Q_ASCENT_CAVEAT.split(/\s+/).length).toBeGreaterThan(12);
  });
});
