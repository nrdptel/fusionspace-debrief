import { describe, it, expect } from 'vitest';
import { railExitVelocity, RAIL_LENGTHS_M, DEFAULT_RAIL_M, MARGINAL_RAIL_VELOCITY } from './rail';

const f64 = (xs: number[]) => Float64Array.from(xs);

describe('railExitVelocity', () => {
  it('reads the flown velocity exactly at the rail height when a sample lands on it', () => {
    // Rail at 2 m; a sample sits right at 2 m with v = 30 m/s.
    const alt = f64([0, 1, 2, 4, 8]);
    const vel = f64([0, 20, 30, 45, 60]);
    expect(railExitVelocity(alt, vel, 2)).toBe(30);
  });

  it('linearly interpolates the velocity between the straddling samples', () => {
    // Rail at 3 m falls halfway between the 2 m and 4 m samples → halfway in v.
    const alt = f64([0, 2, 4]);
    const vel = f64([0, 20, 40]);
    expect(railExitVelocity(alt, vel, 3)).toBeCloseTo(30, 9);
  });

  it('uses the first upward crossing, ignoring later descents back through it', () => {
    const alt = f64([0, 5, 1, 5]); // climbs past, drops back, climbs again
    const vel = f64([0, 18, -10, 22]);
    // First crossing of 2.5 m is on the 0→5 m segment (fraction 0.5) → v = 9.
    expect(railExitVelocity(alt, vel, 2.5)).toBeCloseTo(9, 9);
  });

  it('returns null when the rocket never reaches the rail height', () => {
    const alt = f64([0, 0.5, 1, 1.5, 2]); // tops out at 2 m
    const vel = f64([0, 5, 8, 9, 10]);
    expect(railExitVelocity(alt, vel, 3)).toBeNull();
  });

  it('returns null for a non-positive rail length', () => {
    const alt = f64([0, 5]);
    const vel = f64([0, 30]);
    expect(railExitVelocity(alt, vel, 0)).toBeNull();
    expect(railExitVelocity(alt, vel, -2)).toBeNull();
  });

  it('skips non-finite altitude samples and gives up on a non-finite velocity at the crossing', () => {
    const gappy = f64([0, NaN, 1, 5]);
    const vel = f64([0, 12, 18, 25]);
    // First finite straddle of 2 m is the 1→5 m segment (fraction 0.25) → v = 19.75.
    expect(railExitVelocity(gappy, vel, 2)).toBeCloseTo(19.75, 9);

    const badV = f64([0, 30, NaN]); // velocity missing exactly at the crossing
    expect(railExitVelocity(f64([0, 1, 4]), badV, 2)).toBeNull();
  });

  it('exposes sane constants', () => {
    expect(RAIL_LENGTHS_M).toContain(DEFAULT_RAIL_M);
    expect(DEFAULT_RAIL_M).toBeCloseTo(2.438, 3); // 8 ft
    expect(MARGINAL_RAIL_VELOCITY).toBeGreaterThan(0);
    // Lengths are sorted shortest → longest.
    for (let i = 1; i < RAIL_LENGTHS_M.length; i++) {
      expect(RAIL_LENGTHS_M[i]).toBeGreaterThan(RAIL_LENGTHS_M[i - 1]);
    }
  });
});
