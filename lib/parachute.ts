// Parachute drag coefficient, measured from the descent. Under a steady (main)
// canopy the rocket is at terminal velocity — drag exactly balances weight — so
// ½·ρ·v²·Cd·A = m·g, and the Cd of the recovery system falls straight out of the
// flown descent rate. A reading of how the chute actually performed, not a
// prediction: it needs the descending mass (shared with landing energy) and the
// canopy diameter; everything else comes from the recording. Compare it against
// the rule-of-thumb ~0.75 for a flat sheet, ~1.5 for a domed chute.

import { G0 } from './units';

/** Canopy-diameter unit scales to metres (chutes are sized in inches or cm). */
export const CHUTE_LEN_TO_M: Record<'cm' | 'in', number> = { cm: 0.01, in: 0.0254 };

/** A 6 m canopy is already enormous — catch a fat-fingered entry above it. */
export const MAX_REASONABLE_CHUTE_M = 6;

export function chuteDiameterToM(value: number, unit: 'cm' | 'in'): number {
  return value * CHUTE_LEN_TO_M[unit];
}

/**
 * Effective drag coefficient of the deployed recovery system from the terminal
 * main descent: Cd = 2·m·g / (ρ·v²·A), with A the canopy area (π·(d/2)²). Returns
 * null on a non-positive input or a physically implausible result (so a bad mass
 * or chute size doesn't surface a wild number).
 */
export function parachuteCd(
  massKg: number,
  chuteDiameterM: number,
  descentRateMs: number | null,
  airDensity: number,
): number | null {
  if (!(massKg > 0) || !(chuteDiameterM > 0) || descentRateMs == null || !(descentRateMs > 0) || !(airDensity > 0)) {
    return null;
  }
  const area = Math.PI * (chuteDiameterM / 2) ** 2;
  const cd = (2 * massKg * G0) / (airDensity * descentRateMs * descentRateMs * area);
  return cd > 0 && cd < 10 ? cd : null;
}
