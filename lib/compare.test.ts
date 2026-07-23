import { describe, it, expect } from 'vitest';
import { resample, buildComparison, crossCheck, COMPARE_PALETTE, MAX_COMPARE, type CompareInput, type CompareFlight } from './compare';
import type { FlightAnalysis, FlightMetrics } from './analyze/types';

describe('crossCheck', () => {
  const flight = (apogee: number, maxV: number): CompareFlight =>
    ({ metrics: { apogeeAltitude: apogee, maxVelocity: maxV } as FlightMetrics }) as CompareFlight;

  it('reports the spread across flights for apogee and max speed', () => {
    const a = crossCheck([flight(2440, 300), flight(2490, 310), flight(2465, 305)]);
    const apo = a.find((x) => x.key === 'apogee')!;
    expect(apo.count).toBe(3);
    expect(apo.min).toBe(2440);
    expect(apo.max).toBe(2490);
    expect(apo.spreadPct).toBeCloseTo((50 / 2465) * 100, 1);
    expect(a.find((x) => x.key === 'maxVelocity')!.spreadPct).toBeGreaterThan(0);
  });

  it('skips a metric that is finite on fewer than two flights', () => {
    const a = crossCheck([flight(2000, NaN), flight(2100, NaN)]);
    expect(a.some((x) => x.key === 'apogee')).toBe(true);
    expect(a.some((x) => x.key === 'maxVelocity')).toBe(false);
  });

  const timedFlight = (apogee: number, tToApogee: number): CompareFlight =>
    ({ metrics: { apogeeAltitude: apogee, timeToApogee: tToApogee } as FlightMetrics }) as CompareFlight;

  it('cross-checks time to apogee as an independent temporal corroboration', () => {
    const a = crossCheck([timedFlight(2440, 14.8), timedFlight(2465, 15.1)]);
    const t = a.find((x) => x.key === 'timeToApogee')!;
    expect(t.count).toBe(2);
    expect(t.spreadPct).toBeCloseTo((0.3 / 14.95) * 100, 1);
    // It carries no measurement source, so it's never a measured/derived mix.
    expect(t.mixedSource).toBe(false);
    // A flight with no detected liftoff (NaN time to apogee) drops out of the check.
    const partial = crossCheck([timedFlight(2440, 14.8), timedFlight(2465, NaN)]);
    expect(partial.some((x) => x.key === 'timeToApogee')).toBe(false);
  });

  const srcFlight = (maxV: number, source: 'device' | 'baro'): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: maxV, maxVelocitySource: source } as FlightMetrics }) as CompareFlight;

  it('flags a max-speed cross-check that mixes a measured and a derived velocity', () => {
    const a = crossCheck([srcFlight(300, 'device'), srcFlight(285, 'baro')]);
    expect(a.find((x) => x.key === 'maxVelocity')!.mixedSource).toBe(true);
    // Apogee shares no measured/derived split, so it is never flagged.
    expect(a.find((x) => x.key === 'apogee')!.mixedSource).toBe(false);
  });

  it('does not flag when every velocity comes from the same source', () => {
    const a = crossCheck([srcFlight(300, 'device'), srcFlight(305, 'device')]);
    expect(a.find((x) => x.key === 'maxVelocity')!.mixedSource).toBe(false);
  });

  const accelFlight = (maxA: number, source: 'device' | 'baro'): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: 300, maxAcceleration: maxA, accelerationSource: source } as FlightMetrics }) as CompareFlight;

  it('cross-checks max acceleration when two recordings both carry it', () => {
    const a = crossCheck([accelFlight(180, 'device'), accelFlight(172, 'device')]);
    const acc = a.find((x) => x.key === 'maxAcceleration')!;
    expect(acc.count).toBe(2);
    expect(acc.min).toBe(172);
    expect(acc.max).toBe(180);
    expect(acc.mixedSource).toBe(false);
  });

  it('flags a mixed measured/derived max-acceleration cross-check, and skips it when a flight lacks accel', () => {
    const mixed = crossCheck([accelFlight(180, 'device'), accelFlight(150, 'baro')]);
    expect(mixed.find((x) => x.key === 'maxAcceleration')!.mixedSource).toBe(true);
    // A baro-only flight (NaN acceleration) leaves fewer than two, so no accel cross-check.
    const partial = crossCheck([accelFlight(180, 'device'), srcFlight(300, 'baro')]);
    expect(partial.some((x) => x.key === 'maxAcceleration')).toBe(false);
  });

  const clippedAccelFlight = (maxA: number, clipped: boolean): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: 300, maxAcceleration: maxA, accelerationSource: 'device', accelClipped: clipped } as FlightMetrics }) as CompareFlight;

  it('flags a max-acceleration cross-check when one recording’s sensor saturated (its peak is a floor)', () => {
    // A saturated 16 g floor beside a real 31 g would otherwise read as a ~64% flight
    // difference; it's a sensor limit, so the spread must be flagged, not blessed.
    const a = crossCheck([clippedAccelFlight(157, true), clippedAccelFlight(304, false)]);
    const acc = a.find((x) => x.key === 'maxAcceleration')!;
    expect(acc.saturated).toBe(true);
    // Both are device-measured, so the measured/derived mix flag stays off — saturation
    // is a distinct reason the spread is misleading.
    expect(acc.mixedSource).toBe(false);
    // With neither sensor clipped, nothing is flagged.
    const clean = crossCheck([clippedAccelFlight(180, false), clippedAccelFlight(172, false)]);
    expect(clean.find((x) => x.key === 'maxAcceleration')!.saturated).toBe(false);
  });
});

const metrics = (apogee: number): FlightMetrics => ({
  apogeeAltitude: apogee,
  timeToApogee: 1,
  maxVelocity: 100,
  maxVelocitySource: 'baro',
  maxVelocityAltitude: 50,
  mach: null,
  maxDynamicPressure: null,
  maxDynamicPressureAltitude: null,
  transonicTime: null,
  transonicAltitude: null,
  maxAcceleration: 100,
  avgBoostAcceleration: 60,
  maxDeceleration: -20,
  accelerationSource: 'baro',
  accelClipped: false,
  liftoffTWR: null,
  burnTime: 1,
  burnoutAltitude: 50,
  burnoutVelocity: 90,
  coastTime: 1,
  coastEfficiency: 0.6,
  dragLossAltitude: 120,
  drogueDescentRate: 30,
  mainDescentRate: 6,
  descentTime: 10,
  flightTime: 12,
  groundTemperature: null,
  batteryStartV: null,
  batteryMinV: null,
  peakRollRate: null,
  rollRevolutions: null,
  tiltAtBurnout: null,
});

// A flight whose liftoff is at `t0` on its own clock; altitude is a small ramp so
// the value at liftoff is a known number we can assert alignment against.
function analysis(t0: number, apogee: number): FlightAnalysis {
  const time = Float64Array.from([t0 - 2, t0 - 1, t0, t0 + 1, t0 + 2]);
  const altitude = Float64Array.from([0, 0, 50, 100, 50]); // 50 m AGL at liftoff
  const velocity = Float64Array.from([0, 0, 80, 40, -10]);
  return {
    series: { time, altitude, altitudeRaw: altitude, velocity, acceleration: new Float64Array(5), axialAccel: new Float64Array(5), velocitySource: 'baro', accelerationSource: 'baro', altitudeSource: 'baro', speedOfSound: 340, airDensity: new Float64Array(5).fill(1.225) },
    events: [{ type: 'liftoff', label: 'Liftoff', time: t0, index: 2, altitude: 50, provenance: 'measured' }],
    metrics: metrics(apogee),
    warnings: [],
  };
}

const input = (id: string, t0: number, apogee: number): CompareInput => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Test',
  analysis: analysis(t0, apogee),
});

describe('resample', () => {
  it('linearly interpolates within the source range', () => {
    const t = Float64Array.from([0, 1, 2]);
    const v = Float64Array.from([0, 10, 20]);
    const grid = Float64Array.from([0, 0.5, 1, 1.5, 2]);
    expect([...resample(t, v, grid)]).toEqual([0, 5, 10, 15, 20]);
  });

  it('returns NaN outside the source range', () => {
    const t = Float64Array.from([0, 1, 2]);
    const v = Float64Array.from([0, 10, 20]);
    const out = resample(t, v, Float64Array.from([-1, 1, 3]));
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[1]).toBe(10);
    expect(Number.isNaN(out[2])).toBe(true);
  });

  it('never extrapolates past a duplicated timestamp', () => {
    // Duplicate at t=1 (zero-width bracket): the value must stay within [10,20],
    // not shoot past it.
    const t = Float64Array.from([0, 1, 1, 2]);
    const v = Float64Array.from([0, 10, 20, 30]);
    const out = resample(t, v, Float64Array.from([1]));
    expect(out[0]).toBeGreaterThanOrEqual(10);
    expect(out[0]).toBeLessThanOrEqual(20);
  });
});

describe('buildComparison', () => {
  it('aligns flights at liftoff regardless of pad time', () => {
    // Two flights with different pad times (liftoff at t=2 and t=5).
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    expect(cmp.time.length).toBe(800);
    expect(cmp.flights).toHaveLength(2);

    // The grid point nearest t=0 should read ~50 m (each flight's altitude at its
    // own liftoff), proving they were aligned despite different pad times.
    let k = 0;
    for (let i = 1; i < cmp.time.length; i++) {
      if (Math.abs(cmp.time[i]) < Math.abs(cmp.time[k])) k = i;
    }
    expect(cmp.flights[0].altitude[k]).toBeCloseTo(50, 0);
    expect(cmp.flights[1].altitude[k]).toBeCloseTo(50, 0);
  });

  it('assigns a distinct palette colour per flight and passes metrics through', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 2, 200)]);
    expect(cmp.flights[0].color).toBe(COMPARE_PALETTE[0]);
    expect(cmp.flights[1].color).toBe(COMPARE_PALETTE[1]);
    expect(cmp.flights[1].metrics.apogeeAltitude).toBe(200);
  });

  it('flags whether each flight had a detected liftoff', () => {
    const withLiftoff = input('a', 2, 100); // analysis() includes a liftoff event
    const noLiftoff = { ...input('b', 2, 200), analysis: { ...analysis(2, 200), events: [] } };
    const cmp = buildComparison([withLiftoff, noLiftoff]);
    expect(cmp.flights[0].liftoffDetected).toBe(true);
    expect(cmp.flights[1].liftoffDetected).toBe(false);
  });

  it('resamples altitude, velocity and acceleration onto the shared grid', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    for (const f of cmp.flights) {
      expect(f.altitude.length).toBe(cmp.time.length);
      expect(f.velocity.length).toBe(cmp.time.length);
      expect(f.acceleration.length).toBe(cmp.time.length);
    }
  });

  it('derives Mach and dynamic-pressure curves on the shared grid', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    // The grid point nearest liftoff (t≈0), where velocity is 80 m/s in the fixture.
    let k = 0;
    for (let i = 1; i < cmp.time.length; i++) {
      if (Math.abs(cmp.time[i]) < Math.abs(cmp.time[k])) k = i;
    }
    const f = cmp.flights[0];
    expect(f.mach.length).toBe(cmp.time.length);
    expect(f.dynamicPressure.length).toBe(cmp.time.length);
    // v≈80 m/s at this grid point (interpolated), so Mach≈0.235 and q≈3920 Pa.
    expect(f.mach[k]).toBeGreaterThan(0.22);
    expect(f.mach[k]).toBeLessThan(0.245);
    expect(f.dynamicPressure[k]).toBeGreaterThan(3700);
    expect(f.dynamicPressure[k]).toBeLessThan(3950);
  });

  it('caps the number of flights at MAX_COMPARE', () => {
    const many = Array.from({ length: MAX_COMPARE + 3 }, (_, i) => input(`f${i}`, 2, 100 + i));
    expect(buildComparison(many).flights).toHaveLength(MAX_COMPARE);
  });
});
