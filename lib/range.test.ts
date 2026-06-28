import { describe, it, expect } from 'vitest';
import { finiteMinMax } from './range';

describe('finiteMinMax', () => {
  it('returns the min and max of a plain series', () => {
    expect(finiteMinMax([3, 1, 4, 1, 5, 9, 2])).toEqual([1, 9]);
    expect(finiteMinMax(Float64Array.from([-2.5, 0, 7.1]))).toEqual([-2.5, 7.1]);
  });

  it('ignores NaN gaps anywhere in the series', () => {
    // Leading + trailing NaN (a shorter flight padded onto a shared grid).
    expect(finiteMinMax([NaN, NaN, 10, 20, 5, NaN])).toEqual([5, 20]);
    // A non-monotonic series (a channel plotted on the x-axis) ranges by value,
    // not by its endpoints — which is the whole point.
    expect(finiteMinMax([0, 500, 8000, 500, 0])).toEqual([0, 8000]);
  });

  it('returns null when there is nothing finite to range', () => {
    expect(finiteMinMax([])).toBeNull();
    expect(finiteMinMax([NaN, NaN])).toBeNull();
    expect(finiteMinMax([null, undefined, Infinity, -Infinity])).toBeNull();
  });

  it('handles a single finite value (flat range)', () => {
    expect(finiteMinMax([NaN, 42, NaN])).toEqual([42, 42]);
  });
});
