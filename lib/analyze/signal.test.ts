import { describe, it, expect } from 'vitest';
import { peakAbsInWindow } from './signal';

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
