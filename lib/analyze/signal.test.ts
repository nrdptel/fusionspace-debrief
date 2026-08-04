import { describe, it, expect } from 'vitest';
import { peakAbsInTimeBracket, longestRunNear, medianFilter, finiteDifferenceMatch } from './signal';

// medianFilter runs a quickselect under the hood (it dominates the analysis on a
// big log, and only ever needs the median, not a full sort). Pin it to a simple
// sort-based reference over a lot of random data — odd and even windows, NaN gaps,
// duplicates and edge clipping — so the fast path can't silently diverge.
describe('medianFilter (quickselect) matches a sort-based reference', () => {
  const ref = (values: Float64Array, window: number): Float64Array => {
    const n = values.length;
    const out = new Float64Array(n);
    const half = Math.floor(window / 2);
    for (let i = 0; i < n; i++) {
      const buf: number[] = [];
      for (let j = i - half; j <= i + half; j++) {
        if (j < 0 || j >= n) continue;
        if (Number.isFinite(values[j])) buf.push(values[j]);
      }
      if (buf.length === 0) {
        out[i] = values[i];
        continue;
      }
      buf.sort((a, b) => a - b);
      const m = buf.length >> 1;
      out[i] = buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
    }
    return out;
  };

  it('is identical to the reference across random data and window sizes', () => {
    for (let trial = 0; trial < 200; trial++) {
      const n = 5 + ((trial * 7) % 120);
      const v = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        // Coarse rounding forces ties/duplicates (the case quickselect is fussiest on).
        v[i] = i % 9 === 0 ? NaN : Math.round(Math.sin(i * 1.3 + trial) * 30) / 5;
      }
      for (const w of [3, 4, 7, 8, 21, 50]) {
        const got = medianFilter(v, w);
        const want = ref(v, w);
        for (let i = 0; i < n; i++) expect(got[i]).toBe(want[i]);
      }
    }
  });
});

describe('peakAbsInTimeBracket', () => {
  const f = (xs: number[]) => Float64Array.from(xs);
  const even = f([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);

  it('finds the largest magnitude inside the bracket', () => {
    // A spike of -18 at index 5 (t = 0.5 s).
    const v = f([1, 1, 1, 1, 2, -18, 3, 1, 1, 1]);
    expect(peakAbsInTimeBracket(even, v, 5, 0.2, 0.2)).toBe(18);
    // A bracket that doesn't reach the spike sees only the local values.
    expect(peakAbsInTimeBracket(even, v, 1, 0.1, 0.1)).toBe(1);
  });

  it('reaches back further than forward when asked to, and the asymmetry is real', () => {
    // The shape a deployment actually has: the charge fires BEFORE the index the deployment is
    // detected at, so a symmetric bracket reads the quiet stretch beside it and calls that the
    // shock. This is stargazer1's apogee in miniature — 63 g at −0.7 s, 0.1 g either side.
    const t = f([0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2]);
    const v = f([0.1, 0.1, 0.1, 63, 0.1, 0.1, 0.1]);
    const centre = 6; // t = 1.2 s, the detected event
    expect(peakAbsInTimeBracket(t, v, centre, 0.3, 0.3)).toBeCloseTo(0.1, 10); // symmetric: misses it
    expect(peakAbsInTimeBracket(t, v, centre, 1.0, 1.0)).toBe(63); // the apogee bracket: finds it
  });

  it('clamps the bracket to the array bounds', () => {
    const t = f([0, 0.1, 0.2, 0.3, 0.4]);
    const v = f([5, 2, 1, 1, 9]);
    expect(peakAbsInTimeBracket(t, v, 0, 0.3, 0.3)).toBe(5); // left edge
    expect(peakAbsInTimeBracket(t, v, 4, 0.3, 0.3)).toBe(9); // right edge
  });

  it('skips NaN and returns NaN when the bracket has nothing finite', () => {
    const t = f([0, 0.1, 0.2]);
    expect(peakAbsInTimeBracket(t, f([NaN, 4, NaN]), 1, 0.1, 0.1)).toBe(4);
    expect(peakAbsInTimeBracket(t, f([NaN, NaN, NaN]), 1, 0.1, 0.1)).toBeNaN();
  });

  // The defect this replaced a sample-count window to fix, in miniature. The record is dense
  // through the boost and sparse afterwards, exactly as a real logger writes one, and the event
  // sits in the sparse half — so a ±3-SAMPLE bracket there spans 9.7 s and reaches a stretch of
  // flight seconds away, while ±0.3 s of clock stays put.
  it('a slow stretch of a mixed-cadence record does not reach into a fast one', () => {
    const t = f([0, 0.1, 0.2, 0.3, 2, 4, 6, 8, 10]);
    const v = f([1, 1, 40, 1, 1, 7, 1, 1, 1]);
    // Centre index 8 (t = 10 s). ±3 samples reaches index 5 — t = 4 s, six seconds away — and
    // returns its 7; ±0.3 s of clock returns the 1 that is actually there.
    expect(peakAbsInTimeBracket(t, v, 8, 0.3, 0.3)).toBe(1);
    let sampleBracket = 0;
    for (let i = 5; i <= 8; i++) sampleBracket = Math.max(sampleBracket, Math.abs(v[i]));
    expect(sampleBracket).toBe(7);
    expect(t[8] - t[5]).toBe(6); // the span that ±3 samples really covered
  });

  it('reads every in-bracket sample even when the clock steps backwards', () => {
    // One out-of-order timestamp is not hypothetical: altosEeprom.ts bypasses buildFlight's
    // sort and its own comment says records come back a tick or two out of order at a boundary.
    // A walk outward from the centre stops at the first out-of-bracket sample and would hide
    // the 99 behind the 0.6; a scan does not.
    const t = f([0.9, 0.6, 0.8, 1.0]);
    expect(peakAbsInTimeBracket(t, f([99, 1, 1, 1]), 3, 0.3, 0.3)).toBe(99);
  });
});

describe('longestRunNear', () => {
  const f = (xs: number[]) => Float64Array.from(xs);

  it('measures the longest plateau within eps of the target (a flat top)', () => {
    // A railed sensor: five samples pinned at 16, a rounded peak elsewhere.
    const v = f([2, 8, 14, 16, 16, 16, 16, 16, 15, 9, 3]);
    expect(longestRunNear(v, 0, v.length, 16, 0.05)).toBe(5);
  });

  it('returns a short run for a rounded peak (no saturation)', () => {
    const v = f([10, 14, 16, 14, 10]); // single-sample peak at 16
    expect(longestRunNear(v, 0, v.length, 16, 0.05)).toBe(1);
  });

  it('respects the window bounds and the tolerance', () => {
    const v = f([16, 16, 16, 1, 16, 16]);
    expect(longestRunNear(v, 3, v.length, 16, 0.05)).toBe(2); // only the right pair
    expect(longestRunNear(v, 0, v.length, 16, 0.05)).toBe(3); // the left triple
    // A tight tolerance rejects near-but-not-equal samples.
    expect(longestRunNear(f([16, 15.5, 16]), 0, 3, 16, 0.1)).toBe(1);
  });

  it('breaks the run on NaN gaps', () => {
    expect(longestRunNear(f([16, 16, NaN, 16, 16, 16]), 0, 6, 16, 0.05)).toBe(3);
  });
});

describe('finiteDifferenceMatch', () => {
  // A 20 Hz baro flight whose altitude is quantized to whole metres, as a real
  // altimeter reports it.
  function flight(): { t: Float64Array; alt: Float64Array; vel: Float64Array } {
    const t: number[] = [];
    const alt: number[] = [];
    const vel: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const s = i * 0.05;
      t.push(s);
      alt.push(Math.round(0.5 * 90 * s * s));
      // An independently measured velocity carries its own few-percent error, which
      // is uncorrelated with the baro trace's quantization — so it never reproduces
      // that trace's difference sample for sample.
      vel.push(90 * s * (1 + 0.03 * Math.sin(i)));
    }
    return { t: Float64Array.from(t), alt: Float64Array.from(alt), vel: Float64Array.from(vel) };
  }

  it('spots a column that is the altitude differenced sample to sample', () => {
    const { t, alt } = flight();
    const diff = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) diff[i] = (alt[i] - alt[i - 1]) / (t[i] - t[i - 1]);
    expect(finiteDifferenceMatch(t, diff, alt)).toBeGreaterThan(0.99);
    // Forward and centred conventions count too — the logger picks one.
    const fwd = new Float64Array(alt.length);
    for (let i = 0; i < alt.length - 1; i++) fwd[i] = (alt[i + 1] - alt[i]) / (t[i + 1] - t[i]);
    expect(finiteDifferenceMatch(t, fwd, alt)).toBeGreaterThan(0.99);
  });

  it('leaves an independently measured velocity alone', () => {
    // The true velocity of the same profile: on a quantized altitude trace it is a
    // distinguishable second reading, not that trace's difference.
    const { t, alt, vel } = flight();
    expect(finiteDifferenceMatch(t, vel, alt)).toBeLessThan(0.5);
  });

  it('needs enough judged samples to say anything', () => {
    const t = Float64Array.from([0, 0.1, 0.2, 0.3]);
    const alt = Float64Array.from([0, 1, 2, 3]);
    const vel = Float64Array.from([0, 10, 10, 10]);
    expect(finiteDifferenceMatch(t, vel, alt)).toBe(0);
  });
});
