// Landing kinetic energy: how hard the rocket actually came in. A pure reading of
// the flight — ½·m·v² from the descent rate your logger measured near touchdown —
// combined with one number the log can't know: the descending mass. Nothing is
// predicted or modelled; it's the energy this flight landed with, the figure a
// cert flight card and many club waivers ask for (usually in ft·lbf).

import { G0 } from './units';

/** 1 ft·lbf in joules — the energy unit recovery limits are written in. */
export const JOULES_PER_FTLBF = 1.3558179483;

/** Mass-unit scales to kilograms. The display unit follows the user's system
 *  (grams ↔ metric, ounces ↔ imperial); both are entered as a plain mass. */
export const MASS_TO_KG: Record<'g' | 'oz', number> = {
  g: 0.001,
  oz: 0.028349523125,
};

/** A reasonable upper bound so a fat-fingered entry (kilograms typed as grams,
 *  say) can be caught rather than silently producing a wild energy. ~45 kg. */
export const MAX_REASONABLE_MASS_KG = 45;

export function massToKg(value: number, unit: 'g' | 'oz'): number {
  return value * MASS_TO_KG[unit];
}

/** Kinetic energy (joules) the rocket landed with: ½·m·v², from the descending
 *  mass and the measured landing descent rate. null for a non-positive mass or
 *  a missing/zero descent rate (nothing to measure). */
export function landingEnergyJoules(massKg: number, descentRateMs: number | null): number | null {
  if (!(massKg > 0) || descentRateMs == null || !(descentRateMs > 0)) return null;
  return 0.5 * massKg * descentRateMs * descentRateMs;
}

export function joulesToFtLbf(joules: number): number {
  return joules / JOULES_PER_FTLBF;
}

/** The free-fall drop height (m) that reaches the measured landing speed: from
 *  v² = 2·g·h, h = v²/2g. An exact, mass-free way to make the landing rate
 *  intuitive — "it touched down at the speed of a drop from this height" — for the
 *  is-this-landing-too-hard judgement. null for a missing/non-positive rate. */
export function dropHeightM(descentRateMs: number | null): number | null {
  if (descentRateMs == null || !(descentRateMs > 0)) return null;
  return (descentRateMs * descentRateMs) / (2 * G0);
}
