import { describe, it, expect } from 'vitest';
import { delayCheck, APOGEE_SLOP_S } from './ejection';

describe('delayCheck', () => {
  it('a delay longer than the coast fires after apogee', () => {
    const r = delayCheck(7, 5);
    expect(r.offsetS).toBeCloseTo(2);
    expect(r.when).toBe('after');
  });

  it('a delay shorter than the coast fires before apogee', () => {
    const r = delayCheck(4, 6);
    expect(r.offsetS).toBeCloseTo(-2);
    expect(r.when).toBe('before');
  });

  it('a delay within the slop of the coast reads as at apogee', () => {
    expect(delayCheck(6, 6).when).toBe('at');
    expect(delayCheck(6 + APOGEE_SLOP_S, 6).when).toBe('at');
    expect(delayCheck(6 - APOGEE_SLOP_S, 6).when).toBe('at');
  });

  it('just past the slop tips to before/after', () => {
    expect(delayCheck(6 + APOGEE_SLOP_S + 0.01, 6).when).toBe('after');
    expect(delayCheck(6 - APOGEE_SLOP_S - 0.01, 6).when).toBe('before');
  });
});
