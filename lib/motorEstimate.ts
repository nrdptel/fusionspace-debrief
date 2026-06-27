// A rough motor estimate from the measured boost. Given the rocket's liftoff
// mass, the burn turns into a total impulse (and so an NAR/TRA letter class),
// an average and peak thrust, and a thrust-to-weight ratio — the bridge from
// "what did my rocket do" to "what motor would do it" (see the Motor Finder).
//
// The physics, deliberately simple and stated plainly to the user:
//   Over a vertical boost, m·Δv = J − m·g·t_burn − ∫drag dt, so
//   J ≈ m·(Δv + g·t_burn) once drag is ignored. Ignoring drag (and the mass the
//   motor sheds as it burns) makes J a FLOOR — the real motor may be a touch
//   bigger, even a class up. Good enough to point you at the right shelf.

import { G0 } from './units';
import type { FlightMetrics } from './analyze/types';

// Mass units the estimator accepts → kilograms. Kept local rather than in the
// global unit registry, where "g" already means g-force (acceleration), not grams.
export const MASS_UNITS = ['g', 'oz', 'lb', 'kg'] as const;
export type MassUnit = (typeof MASS_UNITS)[number];
const MASS_TO_KG: Record<MassUnit, number> = { g: 0.001, oz: 0.0283495, lb: 0.453592, kg: 1 };

/** Convert a mass in one of the supported units to kilograms. */
export function massToKg(value: number, unit: MassUnit): number {
  return value * MASS_TO_KG[unit];
}

// NAR/TRA impulse classes by total-impulse upper bound (N·s). Each class spans
// from the previous bound up to its own; the ratio between bounds is 2×.
const CLASS_BOUNDS: { letter: string; max: number }[] = [
  { letter: '1/8A', max: 0.3125 },
  { letter: '1/4A', max: 0.625 },
  { letter: '1/2A', max: 1.25 },
  { letter: 'A', max: 2.5 },
  { letter: 'B', max: 5 },
  { letter: 'C', max: 10 },
  { letter: 'D', max: 20 },
  { letter: 'E', max: 40 },
  { letter: 'F', max: 80 },
  { letter: 'G', max: 160 },
  { letter: 'H', max: 320 },
  { letter: 'I', max: 640 },
  { letter: 'J', max: 1280 },
  { letter: 'K', max: 2560 },
  { letter: 'L', max: 5120 },
  { letter: 'M', max: 10240 },
  { letter: 'N', max: 20480 },
  { letter: 'O', max: 40960 },
];

/** The NAR/TRA letter class for a total impulse in N·s (null for ≤0). Anything
 *  past O is reported as "O+". */
export function classifyImpulse(ns: number): string | null {
  if (!Number.isFinite(ns) || ns <= 0) return null;
  for (const c of CLASS_BOUNDS) if (ns <= c.max) return c.letter;
  return 'O+';
}

export interface MotorEstimate {
  /** Liftoff mass used, kg (echoed back for the caption). */
  massKg: number;
  /** Estimated total impulse, N·s (a floor — drag ignored). */
  totalImpulse: number;
  /** NAR/TRA letter class for that impulse. */
  motorClass: string;
  /** Average thrust over the burn, N. */
  avgThrust: number;
  /** Peak thrust, N (from peak boost acceleration); null without an accel peak. */
  peakThrust: number | null;
  /** Average thrust ÷ liftoff weight — a proxy for liftoff thrust-to-weight. */
  thrustToWeight: number;
}

/** Estimate the motor from a flight's boost metrics and a liftoff mass (kg).
 *  Returns null when there's no usable boost (no burn time or burnout speed) or
 *  the mass isn't a positive number. */
export function estimateMotor(metrics: FlightMetrics, massKg: number): MotorEstimate | null {
  const burnTime = metrics.burnTime;
  // Δv over the boost: speed at burnout (the rocket left the pad at rest).
  const deltaV = metrics.burnoutVelocity;
  if (!Number.isFinite(massKg) || massKg <= 0) return null;
  if (burnTime == null || burnTime <= 0) return null;
  if (deltaV == null || !Number.isFinite(deltaV) || deltaV <= 0) return null;

  const totalImpulse = massKg * (deltaV + G0 * burnTime);
  const avgThrust = totalImpulse / burnTime;
  const peakThrust = Number.isFinite(metrics.maxAcceleration)
    ? massKg * (metrics.maxAcceleration + G0)
    : null;
  const thrustToWeight = avgThrust / (massKg * G0);

  return {
    massKg,
    totalImpulse,
    motorClass: classifyImpulse(totalImpulse) ?? '—',
    avgThrust,
    peakThrust,
    thrustToWeight,
  };
}
