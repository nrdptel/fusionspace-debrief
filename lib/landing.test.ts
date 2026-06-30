import { describe, it, expect } from 'vitest';
import { landingEnergyJoules, joulesToFtLbf, massToKg, JOULES_PER_FTLBF, dropHeightM } from './landing';

describe('landingEnergyJoules', () => {
  it('computes ½·m·v² from the descending mass and landing descent rate', () => {
    // 1.5 kg coming in at 6 m/s → 0.5 · 1.5 · 36 = 27 J.
    expect(landingEnergyJoules(1.5, 6)).toBeCloseTo(27, 9);
  });

  it('returns null when there is nothing to measure', () => {
    expect(landingEnergyJoules(0, 6)).toBeNull(); // no mass
    expect(landingEnergyJoules(-1, 6)).toBeNull(); // bad mass
    expect(landingEnergyJoules(1.5, null)).toBeNull(); // no descent rate (log ended at apogee)
    expect(landingEnergyJoules(1.5, 0)).toBeNull(); // not descending
    expect(landingEnergyJoules(1.5, -4)).toBeNull(); // sign guard
  });
});

describe('dropHeightM', () => {
  it('gives the free-fall height that reaches the landing speed (h = v²/2g)', () => {
    // 9.80665 m/s lands exactly as a 1 g free fall from h = v²/2g = 4.9 m.
    expect(dropHeightM(9.80665)).toBeCloseTo(4.903325, 5);
    // A gentle 5 m/s → ~1.27 m; a hard 20 m/s → ~20.4 m.
    expect(dropHeightM(5)).toBeCloseTo(1.2742, 3);
    expect(dropHeightM(20)).toBeCloseTo(20.394, 2);
  });

  it('returns null without a usable descent rate', () => {
    expect(dropHeightM(null)).toBeNull();
    expect(dropHeightM(0)).toBeNull();
    expect(dropHeightM(-3)).toBeNull();
  });
});

describe('mass and energy conversions', () => {
  it('converts grams and ounces to kilograms', () => {
    expect(massToKg(1500, 'g')).toBeCloseTo(1.5, 9);
    expect(massToKg(16, 'oz')).toBeCloseTo(0.45359, 4); // a pound
  });

  it('converts joules to ft·lbf, the unit recovery limits use', () => {
    expect(joulesToFtLbf(JOULES_PER_FTLBF)).toBeCloseTo(1, 9);
    expect(joulesToFtLbf(100)).toBeCloseTo(73.756, 3);
  });

  it('a worked cert-style example: 24 oz at 18 ft/s', () => {
    const massKg = massToKg(24, 'oz'); // 0.680 kg
    const vMs = 18 * 0.3048; // 5.49 m/s
    const j = landingEnergyJoules(massKg, vMs)!;
    // ≈ 10.2 J ≈ 7.6 ft·lbf — a soft landing, comfortably under common limits.
    expect(joulesToFtLbf(j)).toBeCloseTo(7.55, 1);
  });
});
