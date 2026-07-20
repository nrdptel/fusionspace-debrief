import { describe, it, expect } from 'vitest';
import { resolveUnit, convert, G0 } from './units';

describe('resolveUnit — acceleration in milli-g (mG)', () => {
  it('recognises mG (and its spellings) as an acceleration unit', () => {
    for (const label of ['mG', 'mg', 'milli-g', 'millig', 'mgee']) {
      const u = resolveUnit(label);
      expect(u?.quantity).toBe('accel');
    }
  });

  it('converts 1000 mG to one gravity in canonical m/s²', () => {
    const u = resolveUnit('mG')!;
    expect(u.toCanonical(1000)).toBeCloseTo(G0, 6); // 1000 mG == 1 g
    expect(u.toCanonical(-1000)).toBeCloseTo(-G0, 6);
  });

  it('reads a milli-g value at ~1/1000 the size of the same number in g', () => {
    // A logger reporting 6740 mG is 6.74 g — not 6740 g (the pre-fix bug).
    expect(convert(6740, 'mG', 'g')).toBeCloseTo(6.74, 4);
    expect(resolveUnit('mG')!.toCanonical(6740)).toBeCloseTo(6.74 * G0, 3);
  });

  it('keeps g and mG distinct — a bare g is still one gravity', () => {
    expect(resolveUnit('g')!.toCanonical(1)).toBeCloseTo(G0, 6);
    expect(resolveUnit('mG')!.toCanonical(1)).toBeCloseTo(G0 / 1000, 9);
  });
});
