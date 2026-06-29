import { describe, it, expect } from 'vitest';
import { peakAbsInWindow, longestRunNear, medianFilter } from './signal';

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

describe('peakAbsInWindow', () => {
  const f = (xs: number[]) => Float64Array.from(xs);

  it('finds the largest magnitude within ±half of the centre', () => {
    // A spike of -18 at index 5; window ±2 around index 5 should catch it.
    const v = f([1, 1, 1, 1, 2, -18, 3, 1, 1, 1]);
    expect(peakAbsInWindow(v, 5, 2)).toBe(18);
    // A window that doesn't reach the spike sees only the local values.
    expect(peakAbsInWindow(v, 1, 1)).toBe(1);
  });

  it('clamps the window to the array bounds', () => {
    const v = f([5, 2, 1, 1, 9]);
    expect(peakAbsInWindow(v, 0, 3)).toBe(5); // left edge
    expect(peakAbsInWindow(v, 4, 3)).toBe(9); // right edge
  });

  it('skips NaN and returns NaN when the window has nothing finite', () => {
    expect(peakAbsInWindow(f([NaN, 4, NaN]), 1, 1)).toBe(4);
    expect(peakAbsInWindow(f([NaN, NaN, NaN]), 1, 1)).toBeNaN();
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
