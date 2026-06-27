import { describe, it, expect } from 'vitest';
import { classifyImpulse, estimateMotor, massToKg } from './motorEstimate';
import { G0 } from './units';
import type { FlightMetrics } from './analyze/types';

const base: FlightMetrics = {
  apogeeAltitude: 0,
  timeToApogee: NaN,
  maxVelocity: 0,
  maxVelocitySource: 'baro',
  mach: null,
  maxDynamicPressure: null,
  maxAcceleration: 0,
  maxDeceleration: 0,
  accelerationSource: 'baro',
  burnTime: null,
  burnoutAltitude: null,
  burnoutVelocity: null,
  coastTime: null,
  drogueDescentRate: null,
  mainDescentRate: null,
  descentTime: null,
  flightTime: null,
  groundTemperature: null,
};

describe('massToKg', () => {
  it('converts the supported mass units to kilograms', () => {
    expect(massToKg(500, 'g')).toBeCloseTo(0.5, 6);
    expect(massToKg(1, 'kg')).toBe(1);
    expect(massToKg(16, 'oz')).toBeCloseTo(0.453592, 4); // 16 oz ≈ 1 lb
    expect(massToKg(2, 'lb')).toBeCloseTo(0.907184, 5);
  });
});

describe('classifyImpulse', () => {
  it('maps impulse to the right NAR/TRA letter at and below each bound', () => {
    expect(classifyImpulse(2)).toBe('A'); // 1.25–2.5
    expect(classifyImpulse(2.5)).toBe('A'); // inclusive upper bound
    expect(classifyImpulse(2.6)).toBe('B'); // just over A
    expect(classifyImpulse(150)).toBe('G');
    expect(classifyImpulse(300)).toBe('H');
    expect(classifyImpulse(700)).toBe('J');
  });

  it('returns null for non-positive impulse and O+ past O', () => {
    expect(classifyImpulse(0)).toBeNull();
    expect(classifyImpulse(-5)).toBeNull();
    expect(classifyImpulse(50_000)).toBe('O+');
  });
});

describe('estimateMotor', () => {
  it('estimates impulse, class and thrust from the boost', () => {
    // 1 kg, burnout at 100 m/s after a 1.5 s burn, peak 80 m/s² net.
    const m: FlightMetrics = { ...base, burnTime: 1.5, burnoutVelocity: 100, maxAcceleration: 80 };
    const est = estimateMotor(m, 1)!;
    const expectedJ = 1 * (100 + G0 * 1.5); // ≈ 114.7 N·s
    expect(est.totalImpulse).toBeCloseTo(expectedJ, 3);
    expect(est.motorClass).toBe('G'); // 80–160 N·s
    expect(est.avgThrust).toBeCloseTo(expectedJ / 1.5, 3);
    expect(est.peakThrust).toBeCloseTo(1 * (80 + G0), 3);
    expect(est.thrustToWeight).toBeCloseTo(expectedJ / 1.5 / G0, 3);
  });

  it('scales impulse with mass (a heavier rocket needed a bigger motor)', () => {
    const m: FlightMetrics = { ...base, burnTime: 1.5, burnoutVelocity: 100, maxAcceleration: 80 };
    const light = estimateMotor(m, 1)!;
    const heavy = estimateMotor(m, 4)!;
    expect(heavy.totalImpulse).toBeCloseTo(light.totalImpulse * 4, 3);
    expect(heavy.motorClass).toBe('I'); // 4× ~114.7 ≈ 459 N·s → I (320–640)
  });

  it('returns null without a usable boost or a positive mass', () => {
    expect(estimateMotor(base, 1)).toBeNull(); // no burn time / burnout speed
    const m: FlightMetrics = { ...base, burnTime: 1.5, burnoutVelocity: 100 };
    expect(estimateMotor(m, 0)).toBeNull();
    expect(estimateMotor(m, NaN)).toBeNull();
  });

  it('still works without an acceleration peak (peak thrust just null)', () => {
    const m: FlightMetrics = { ...base, burnTime: 1, burnoutVelocity: 50, maxAcceleration: NaN };
    const est = estimateMotor(m, 0.5)!;
    expect(est.peakThrust).toBeNull();
    expect(est.totalImpulse).toBeGreaterThan(0);
  });
});
