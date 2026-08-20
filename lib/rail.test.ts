import { describe, it, expect } from 'vitest';
import {
  canMeasureRailExit,
  railExitVelocity,
  railExitBound,
  railExitReading,
  RAIL_LENGTHS_M,
  DEFAULT_RAIL_M,
  MARGINAL_RAIL_VELOCITY,
} from './rail';

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

  it('refuses a speed trace the analysis withheld, not just a barometric one', () => {
    // Both questions, not one. The panel asked only where the trace came FROM, so a logged
    // velocity the analysis had already refused still produced a rail-exit speed, its Mach,
    // and the "left the rail slowly" caution — off the same trace whose peak the headline
    // withheld. Every corpus refusal so far is barometric, so nothing in the suite would
    // have caught the missing half.
    expect(canMeasureRailExit({ velocitySource: 'device', velocityUnusable: false }, 0)).toBe(true);
    expect(canMeasureRailExit({ velocitySource: 'device', velocityUnusable: true }, 0)).toBe(false);
    expect(canMeasureRailExit({ velocitySource: 'baro', velocityUnusable: false }, 0)).toBe(false);
    // An unknown liftoff is still refused, with or without the new clause.
    expect(canMeasureRailExit({ velocitySource: 'device', velocityUnusable: false }, null)).toBe(false);
    expect(canMeasureRailExit({ velocitySource: 'device', velocityUnusable: false }, -1)).toBe(false);
    // `velocityUnusable` is optional on the series; absent must read as usable.
    expect(canMeasureRailExit({ velocitySource: 'device' }, 0)).toBe(true);
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

/**
 * **The guards, and every case here is one a pre-push review produced by trying to break them.**
 * Two of the three would have refused a CORRECT reading, which is the failure mode that matters on
 * a withholding guard: a refusal is invisible, so a guard that fires wrongly is a reading a flyer
 * silently never sees.
 */
describe('railExitReading — a reading of the rail, or a reason', () => {
  /** A flight at a constant `g` multiple from rest on a uniform clock. */
  const uniform = (gs: number, n = 400, dt = 0.02) => {
    const a = gs * 9.80665;
    const time = f64(Array.from({ length: n }, (_, i) => i * dt));
    const velocity = f64(Array.from({ length: n }, (_, i) => a * i * dt));
    return { time, velocity, a };
  };

  it('does not take gravity off a trace that never carried it', () => {
    // A derived acceleration is `d(v)/dt` — already net. Subtracting `g` from it tightened the
    // ceiling by 9.81 m/s² and refused this flight at 15.46 m/s against 13.82, which is a
    // physically perfect uniform 5 g record sitting exactly on MARGINAL_RAIL_VELOCITY.
    const { time, velocity, a } = uniform(5);
    const acceleration = f64(Array.from({ length: time.length }, () => a));
    const series = {
      time,
      velocity,
      acceleration,
      velocitySource: 'device' as const,
      velocityUnusable: false,
      accelerationSource: 'baro' as const,
    };
    const got = railExitReading(series, DEFAULT_RAIL_M, 0);
    expect(got.refused).toBeNull();
    expect(got.velocity).toBeCloseTo(Math.sqrt(2 * a * DEFAULT_RAIL_M), 1);
    // …and the same numbers off an ACCELEROMETER do lose the 1 g it reads at rest.
    expect(railExitBound(acceleration, DEFAULT_RAIL_M, 'baro', false)).toBeCloseTo(
      Math.sqrt(2 * a * DEFAULT_RAIL_M),
      9,
    );
    expect(railExitBound(acceleration, DEFAULT_RAIL_M, 'device', false)).toBeCloseTo(
      Math.sqrt(2 * (a - 9.80665) * DEFAULT_RAIL_M),
      9,
    );
  });

  it('builds no ceiling at all from a saturated accelerometer', () => {
    // A flat-topped trace reports a FLOOR. A ceiling built on one refuses the fastest real boosts:
    // the railed TeleMetrum this repo names reads 17.9 g, whose 8 ft ceiling would be 28.4 m/s.
    const acceleration = f64([17.9 * 9.80665, 17.9 * 9.80665, 17.9 * 9.80665]);
    expect(railExitBound(acceleration, DEFAULT_RAIL_M, 'device', false)).toBeCloseTo(28.4, 1);
    expect(railExitBound(acceleration, DEFAULT_RAIL_M, 'device', true)).toBeNull();
  });

  it('asks whether anything was sampled inside the traverse, not how long the first step was', () => {
    // One negative wobble off the pad, then the whole rail inside a single step. Nothing has
    // accumulated when the crossing happens, so this is the unsampled case — and testing the FIRST
    // segment's length instead let it through, because that segment is -0.06 m.
    const time = f64([0, 0.3, 0.6, 0.9]);
    const wobbled = f64([0.2, -0.6, 40, 60]);
    const series = {
      time,
      velocity: wobbled,
      acceleration: undefined as unknown as Float64Array,
      velocitySource: 'device' as const,
      velocityUnusable: false,
      accelerationSource: 'device' as const,
    };
    expect(railExitReading(series, DEFAULT_RAIL_M, 0).refused).toBe('unsampled');
    // **Flip the sign of that one sample and it is KEPT, and the difference is real rather than an
    // artefact.** With `+0.6` the first step covers 0.12 m, so a sample genuinely does fall inside
    // the traverse and the crossing is interpolated between two samples that bracket it. With
    // `−0.6` nothing at all had accumulated and the crossing is the first thing that happens. The
    // rule is "at least one sample inside", which is the only form of this question that can be
    // asked without inventing a threshold; **how MUCH resolution is enough is a judgement this
    // deliberately does not make**, and 0.12 m of a 2.438 m rail is the honest edge of it.
    const sampled = railExitReading({ ...series, velocity: f64([0.2, 0.6, 40, 60]) }, DEFAULT_RAIL_M, 0);
    expect(sampled.refused).toBeNull();
    expect(sampled.velocity).toBeCloseTo(15.59, 1);
    // And a record that DOES sample the traverse keeps its reading.
    const { time: t2, velocity: v2 } = uniform(5);
    expect(
      railExitReading({ ...series, time: t2, velocity: v2 }, DEFAULT_RAIL_M, 0).refused,
    ).toBeNull();
  });

  it('names the format reasons apart from the record reasons', () => {
    const { time, velocity } = uniform(5);
    const base = {
      time,
      velocity,
      acceleration: undefined as unknown as Float64Array,
      velocitySource: 'device' as const,
      velocityUnusable: false,
      accelerationSource: 'device' as const,
    };
    expect(railExitReading({ ...base, velocitySource: 'baro' }, DEFAULT_RAIL_M, 0).refused).toBe('notLogged');
    expect(railExitReading({ ...base, velocityUnusable: true }, DEFAULT_RAIL_M, 0).refused).toBe('traceRefused');
    expect(railExitReading(base, DEFAULT_RAIL_M, null).refused).toBe('noLiftoff');
    // A rail length of zero or less is not a reading of anything — the guard `railExitVelocity`
    // has always had, which the first cut of `railExitReading` dropped.
    expect(railExitReading(base, 0, 0).refused).toBe('tooShort');
    expect(railExitReading(base, -2, 0).refused).toBe('tooShort');
    // A record that stops before the rail.
    expect(railExitReading({ ...base, time: f64([0, 0.01]), velocity: f64([0, 0.1]) }, DEFAULT_RAIL_M, 0).refused).toBe(
      'tooShort',
    );
  });
});
