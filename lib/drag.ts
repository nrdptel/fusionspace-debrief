// Measured drag coefficient (Cd) from the coast phase. After burnout and before
// apogee the only forces on the airframe are gravity and aerodynamic drag, so the
// coast deceleration is a direct reading of the drag the rocket actually had on
// this flight — back-calculated from the flown data, not modelled or predicted.
// It needs two numbers the log can't carry: the rocket's mass during coast and
// its body diameter (for the reference area). Cd changes with Mach, so the result
// is the median over the faster part of the coast, where drag is large enough to
// read cleanly, and the velocity/Mach window is reported alongside it.

import { G0 } from './units';
import type { FlightSeries, FlightEvent } from './analyze/types';

/** Length-unit scales to metres, for the body-diameter input. */
export const LEN_TO_M: Record<'mm' | 'in', number> = { mm: 0.001, in: 0.0254 };

/** A sane upper bound on body diameter (1 m) to catch a fat-fingered entry. */
export const MAX_REASONABLE_DIAMETER_M = 1;

export function diameterToM(value: number, unit: 'mm' | 'in'): number {
  return value * LEN_TO_M[unit];
}

export interface DragResult {
  /** Representative (median) drag coefficient over the measured coast window. */
  cd: number;
  /** Drag area Cd·A (m²) — diameter-independent, for the engineers. */
  cdA: number;
  /** Velocity window the Cd was read over (m/s). */
  vLow: number;
  vHigh: number;
  /** Mach at the top of that window — context, since Cd rises through transonic. */
  machLow: number | null;
  machHigh: number | null;
  /** How many coast samples contributed. */
  samples: number;
  /** True when velocity/acceleration are baro-derived (softer) rather than measured. */
  approximate: boolean;
}

/** Is a measured Cd even possible for this flight — a barometric/accel flight with
 *  a real coast between burnout and apogee? (GPS altitude is far too coarse for the
 *  acceleration this needs.) */
export function canMeasureDrag(series: FlightSeries, events: FlightEvent[]): boolean {
  if (series.altitudeSource === 'gps') return false;
  const burnout = events.find((e) => e.type === 'burnout');
  const apogee = events.find((e) => e.type === 'apogee');
  return !!burnout && !!apogee && apogee.index - burnout.index >= 4;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Back-calculate the drag coefficient from the coast deceleration. Returns null
 * when there's no clean coast to read (no coast, bad inputs, or too few usable
 * samples). The acceleration's meaning differs by source and the gravity term
 * follows it: a device accelerometer senses *specific force* (drag only, gravity
 * isn't felt in free flight), while a baro-derived acceleration is kinematic and
 * carries gravity — getting this wrong would put Cd out by a g.
 */
export function dragCoefficient(
  series: FlightSeries,
  events: FlightEvent[],
  massKg: number,
  diameterM: number,
): DragResult | null {
  if (!(massKg > 0) || !(diameterM > 0)) return null;
  if (!canMeasureDrag(series, events)) return null;

  const burnout = events.find((e) => e.type === 'burnout')!;
  const apogee = events.find((e) => e.type === 'apogee')!;
  // Drag acts along the airframe axis, so read the SIGNED axial trace (negative
  // while decelerating), not `acceleration` — which is the always-positive resultant
  // on a multi-axis logger and would make every coast sample fail the sign check.
  const { velocity, axialAccel, airDensity, speedOfSound, accelerationSource } = series;
  const area = Math.PI * (diameterM / 2) ** 2;

  // Coast window: one sample past burnout (let the thrust transient settle) up to
  // apogee, where v → 0 makes the drag read blow up.
  const lo = burnout.index + 1;
  const hi = apogee.index;

  // Drag scales with v², so it's only readable while the rocket is moving fast —
  // keep the upper portion of the coast speed and drop the slow tail.
  let vMax = 0;
  for (let i = lo; i < hi; i++) if (Number.isFinite(velocity[i]) && velocity[i] > vMax) vMax = velocity[i];
  if (!(vMax > 0)) return null;
  const vFloor = Math.max(0.4 * vMax, 25); // m/s

  const cds: number[] = [];
  const cdAs: number[] = [];
  let vLow = Infinity;
  let vHigh = -Infinity;
  for (let i = lo; i < hi; i++) {
    const v = velocity[i];
    const a = axialAccel[i];
    const rho = airDensity[i];
    if (!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(rho) || v < vFloor) continue;
    // Drag deceleration per unit mass. Device accel is specific force (just drag,
    // negative while decelerating); baro accel is kinematic (-g - drag/m), so add g.
    const dragPerMass = accelerationSource === 'device' ? -a : -(a + G0);
    if (!(dragPerMass > 0)) continue; // not decelerating from drag here — skip
    // ½ρv²·Cd·A = m·dragPerMass  →  Cd·A = 2·m·dragPerMass / (ρv²)
    const cdA = (2 * massKg * dragPerMass) / (rho * v * v);
    const cd = cdA / area;
    if (!(cd > 0) || cd > 3) continue; // reject noise / off-axis transients
    cds.push(cd);
    cdAs.push(cdA);
    if (v < vLow) vLow = v;
    if (v > vHigh) vHigh = v;
  }
  if (cds.length < 5) return null;

  return {
    cd: median(cds),
    cdA: median(cdAs),
    vLow,
    vHigh,
    machLow: speedOfSound > 0 ? vLow / speedOfSound : null,
    machHigh: speedOfSound > 0 ? vHigh / speedOfSound : null,
    samples: cds.length,
    approximate: series.velocitySource !== 'device' || series.accelerationSource !== 'device',
  };
}
