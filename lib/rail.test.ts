import { describe, it, expect } from 'vitest';
import { railExitVelocity, RAIL_LENGTHS_M, DEFAULT_RAIL_M, MARGINAL_RAIL_VELOCITY } from './rail';

const f64 = (xs: number[]) => Float64Array.from(xs);
// A uniform 0.1 s clock of the given length.
const clock = (n: number) => f64(Array.from({ length: n }, (_, i) => i * 0.1));

describe('railExitVelocity (displacement integral from liftoff)', () => {
  it('reads the velocity where cumulative travel first reaches the rail length', () => {
    // Constant 10 m/s: covers 1 m per 0.1 s step, so a 2 m rail is cleared at the 2nd step,
    // still at 10 m/s.
    const vel = f64([10, 10, 10, 10, 10]);
    expect(railExitVelocity(clock(5), vel, 2, 0)).toBeCloseTo(10, 9);
  });

  it('interpolates the velocity at the exact rail-length crossing on a ramp', () => {
    // v = 0,10,20,30 over 0.1 s steps → displacement 0, 0.5, 2.0, 4.5 m.
    // A 2 m rail is reached exactly at the 20 m/s sample.
    const vel = f64([0, 10, 20, 30]);
    expect(railExitVelocity(clock(4), vel, 2, 0)).toBeCloseTo(20, 9);
    // A 1 m rail falls partway into the 10→20 segment: need 0.5 of the 1.5 m step → f=1/3.
    expect(railExitVelocity(clock(4), vel, 1, 0)).toBeCloseTo(10 + (20 - 10) / 3, 6);
  });

  it('integrates only from liftoff, ignoring pre-liftoff velocity noise', () => {
    // Two bogus 8 m/s samples on the pad before liftoff at index 2 must not count as travel.
    const vel = f64([8, 8, 0, 10, 20, 30]);
    // From liftoff: displacement 0, 0.5, 2.0 … so a 2 m rail clears at 20 m/s.
    expect(railExitVelocity(clock(6), vel, 2, 2)).toBeCloseTo(20, 9);
  });

  it('does not let a momentary negative wobble push the running distance backwards', () => {
    // A noise dip mid-climb shouldn't subtract from the covered distance.
    const vel = f64([0, 20, -30, 20, 40]);
    const v = railExitVelocity(clock(5), vel, 2, 0);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0); // a real climb velocity, not the noise dip
  });

  it('returns null when the rocket never covers a rail length', () => {
    const vel = f64([0, 2, 3, 2, 1]); // tiny hop; total travel well under 3 m
    expect(railExitVelocity(clock(5), vel, 3, 0)).toBeNull();
  });

  it('returns null for a non-positive rail length or an unknown liftoff', () => {
    const vel = f64([0, 30, 60]);
    expect(railExitVelocity(clock(3), vel, 0, 0)).toBeNull();
    expect(railExitVelocity(clock(3), vel, -2, 0)).toBeNull();
    expect(railExitVelocity(clock(3), vel, 2, -1)).toBeNull(); // liftoff not found
  });

  it('skips non-finite samples across a gap without derailing the integral', () => {
    const vel = f64([0, 10, NaN, 20, 30]);
    const t = f64([0, 0.1, 0.2, 0.3, 0.4]);
    // The NaN step is skipped; the finite steps still accumulate to the rail length.
    const v = railExitVelocity(t, vel, 2, 0);
    expect(v).not.toBeNull();
    expect(Number.isFinite(v!)).toBe(true);
  });

  it('exposes sane constants', () => {
    expect(RAIL_LENGTHS_M).toContain(DEFAULT_RAIL_M);
    expect(DEFAULT_RAIL_M).toBeCloseTo(2.438, 3); // 8 ft
    expect(MARGINAL_RAIL_VELOCITY).toBeGreaterThan(0);
    for (let i = 1; i < RAIL_LENGTHS_M.length; i++) {
      expect(RAIL_LENGTHS_M[i]).toBeGreaterThan(RAIL_LENGTHS_M[i - 1]);
    }
  });
});
