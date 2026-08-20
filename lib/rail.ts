// Rail-exit (rail-departure) velocity: how fast the rocket was actually moving
// when it cleared the launch rail — the airspeed it had for aerodynamic stability
// at the most critical moment of the flight. Pure measurement: we read the flown
// velocity at the point the rocket had travelled your rail's length off the pad.
// Nothing is predicted or modelled.
//
// Rail clearance happens in the first metre or two — right where a barometric
// altitude is coarsest and noisiest (quantised to whole feet/metres, and shoved
// around by the launch pressure disturbance), so reading the velocity at the first
// altitude crossing there lands on a spurious sample and can report a wildly wrong
// figure. Instead we integrate the flown velocity from liftoff: the distance the
// rocket has covered is ∫v·dt, and the rail is cleared when that first reaches the
// rail length. That reads the velocity channel — reliable on a device/inertial log
// — rather than the coarse near-pad altitude. A barometric-only velocity is itself
// too soft to trust this low and this early, so the caller withholds it there.

import type { FlightSeries } from './analyze/types';

/** Standard gravity, m/s² — the 1 g a resting accelerometer already reads, subtracted to get
 *  the NET acceleration available to move the rocket up the rail. */
const G0 = 9.80665;

/** Common launch-rail lengths, in metres (4/6/8/10/12 ft — standard 1010/1515). */
export const RAIL_LENGTHS_M = [1.219, 1.829, 2.438, 3.048, 3.658];
export const DEFAULT_RAIL_M = 2.438; // 8 ft

/** Below roughly this, a rocket is commonly considered to have left the rail too
 *  slowly to be reliably stable — surfaced as a gentle heads-up, not a rule. */
export const MARGINAL_RAIL_VELOCITY = 15; // m/s (~49 ft/s)

/**
 * Whether a rail-exit velocity may be read from this flight at all — the two conditions
 * that decide it, in one place the surface cannot forget half of.
 *
 * `velocitySource` says where the trace came from; `velocityUnusable` says whether the
 * analysis will stand behind it. Reading only the first published a rail-exit speed, its
 * Mach and the low-airflow caution off a trace whose peak the headline had already
 * refused. They are separate questions and both have to be asked, which is the argument
 * for asking them here rather than in a component: every other velocity-reading surface
 * in the app consults `velocityUnusable`, and the one that hand-rolled its own test is
 * the one that got it wrong.
 *
 * **`railExitReading` is its only production caller since 2026-08-20**, and that is the point: the
 * surface used to ask this and then integrate regardless, which is the split that let a
 * measurable-looking flight publish an unmeasurable number. These two questions are about the
 * FORMAT; the ones in `railExitReading` are about the RECORD; and one call now asks all of them.
 */
export function canMeasureRailExit(
  series: Pick<FlightSeries, 'velocitySource' | 'velocityUnusable'>,
  liftoffIndex: number | null,
): boolean {
  if (series.velocitySource !== 'device') return false;
  if (series.velocityUnusable) return false;
  return liftoffIndex != null && liftoffIndex >= 0;
}

/**
 * Why a rail-exit reading is withheld. **Every one of these is a statement about the RECORD**, not
 * a judgement about the flight — which is the distinction that decides what the surface says.
 */
export type RailExitRefusal =
  /** The velocity trace is not a device one; a barometric velocity is far too soft this low. */
  | 'notLogged'
  /** The analysis will not stand behind the velocity trace at all. */
  | 'traceRefused'
  /** Liftoff could not be pinpointed, so there is nothing to integrate from. */
  | 'noLiftoff'
  /** The record never covers a rail length of travel with a readable velocity. */
  | 'tooShort'
  /** The rail is cleared inside the FIRST sample after liftoff, so no sample lies inside the
   *  traverse and the "reading" is just the velocity at the anchor. */
  | 'unsampled'
  /** The reading exceeds what this flight's own measured acceleration could produce over the rail
   *  from rest — so the record does not contain the rocket leaving a rail. */
  | 'aboveOwnAcceleration';

export interface RailExitReading {
  /** The reading, or null when the record cannot support one. */
  velocity: number | null;
  /** Why it is null. Null when there is a reading. */
  refused: RailExitRefusal | null;
  /** The ceiling this flight's own acceleration puts on a rail exit, m/s — for the message, and
   *  null where no acceleration trace could produce one. */
  bound: number | null;
}

/**
 * The fastest this flight could POSSIBLY be going after one rail length, from rest.
 *
 * `v = √(2·a·d)` with `a` the greatest NET acceleration anywhere in the record — the peak read
 * minus the 1 g a resting accelerometer already carries. Three things make this a bound rather
 * than an estimate, and all three point the same way:
 *
 * - it takes the peak over the WHOLE record, which is almost always well after the rail;
 * - on a multi-axis logger `acceleration` is the resultant magnitude, which is ≥ the axial part;
 * - noise on a derived trace inflates a maximum and never deflates it.
 *
 * So the bound is generous by construction, in every direction at once. **A reading that exceeds
 * it is wrong by an argument that survives all three.**
 *
 * **What it is NOT is a cross-instrument check, and the first draft of this comment said it was.**
 * Where `accelerationSource` is `'baro'` the trace is `d(v)/dt` of the very velocity being
 * integrated, so the two are not independent. What the comparison tests there is *self-consistency*
 * — and that is the sharper reading of it, not a weaker one: with `a = dv/dt` exactly, `v² = 2∫a ds`
 * holds identically **if and only if the record starts at rest**, so exceeding the ceiling proves
 * `v(0) ≠ 0`, which is precisely the defect. On a device trace it is a genuine second instrument as
 * well. Either way the conclusion is the same and it is about the RECORD.
 *
 * Returns null with no usable acceleration trace **or a saturated one**, in which case nothing is
 * claimed: a flat-topped accelerometer reports a floor, and a ceiling built on a floor refuses the
 * fastest real boosts. Four Mercury corpus flights read a flat 32.0 g full scale, and the railed
 * TeleMetrum this repo already names reads 17.9 g — whose 8 ft ceiling would be 28.4 m/s, refusing
 * any genuine boost above about 25 g.
 */
export function railExitBound(
  acceleration: Float64Array | undefined,
  railLengthM: number,
  /** What the trace IS, which decides whether gravity has to come off it — see below. */
  source: 'device' | 'baro',
  /** Whether the accelerometer flat-topped at its full scale. A railed peak is a FLOOR, so a
   *  ceiling built on it is a floor too, and it would refuse the fastest real boosts. */
  clipped: boolean,
): number | null {
  if (!acceleration || !(railLengthM > 0) || clipped) return null;
  let peak = 0;
  for (let i = 0; i < acceleration.length; i++) {
    const a = acceleration[i];
    if (Number.isFinite(a) && a > peak) peak = a;
  }
  // **Gravity comes off a SPECIFIC-FORCE trace and only that one.** A device accelerometer reads
  // ~9.81 m/s² sitting on the pad, so the acceleration available to move the rocket is the reading
  // minus 1 g. A derived trace is `d(v)/dt` (`lib/analyze/index.ts` builds it that way when there
  // is no accelerometer), which is already the net acceleration — subtracting again takes gravity
  // off twice and tightens the ceiling by 9.81 m/s². Measured on a uniform 5 g flight, the doubled
  // subtraction refuses a physically perfect record at 15.46 m/s against a ceiling of 13.82 — right
  // on `MARGINAL_RAIL_VELOCITY`, which is the population this guard exists to protect. Found by the
  // pre-push review; the first draft subtracted unconditionally.
  const net = source === 'device' ? peak - G0 : peak;
  return net > 0 ? Math.sqrt(2 * net * railLengthM) : null;
}

/**
 * The rail-exit reading, and the reason when there is none — the one call a surface makes.
 *
 * **This exists because a rail-exit velocity is only a MEASUREMENT where the record contains the
 * rocket accelerating from rest through one rail length.** `railExitVelocity` below integrates
 * whatever it is given from wherever it is told to start, and on a fragment it dutifully returns a
 * number. Measured over the corpus on 2026-08-20, **6 of the 21 flights that published a rail-exit
 * speed had no such traverse in the record**, and five of those published a speed their own
 * acceleration could not have produced:
 *
 * | flight | published | its own bound | ratio |
 * |---|---|---|---|
 * | `intrepid2` | 57.90 m/s | 38.19 | 1.52 |
 * | `kairos` (sustainer) | 32.64 | 20.16 | 1.62 |
 * | `sg1.2` (sustainer) | 28.90 | 22.58 | 1.28 |
 * | `f1machbuster-jan18` | 71.08 | 54.97 | 1.29 |
 * | `f1machbuster-jan10` | 61.28 | 52.55 | 1.17 |
 *
 * `intrepid2`'s log is 346 rows every one of which is in state `boost`, opening at 30.69 m/s;
 * `intrepid1` (the sixth) covers the whole 2.438 m inside ONE 0.300 s sample and returns the
 * anchor velocity unchanged; the two sustainers were carried up by a booster and never sat on a
 * rail at all. Each fed the hero readout on `components/RailExit.tsx`, its Mach sub-value, and the
 * `MARGINAL_RAIL_VELOCITY` low-airflow caution — a launch-safety reading.
 *
 * **Two guards, and neither carries a tuned threshold**, which is deliberate: a constant picked
 * off the corpus is a constant that fits the corpus.
 *
 * **What was measured and REFUSED, so it is not re-derived.** Two other tells looked good and are
 * wrong:
 *
 * - **Re-anchoring the integral at the pad** — the obvious reading of the symptom. It swaps a
 *   visibly impossible number for a plausible fabricated one: on `kairos` and `sg1.2` it
 *   trapezoids straight across a 0.630 s and 0.570 s sampling hole that spans the entire rail
 *   phase, giving 7.28 and 8.17 m/s. A wrong number that looks right is worse than one that looks
 *   wrong.
 * - **Refusing when the anchor's ALTITUDE is already past the rail.** It reads well and it fires
 *   on sound flights: `sg1.1-Booster`'s anchor altitude is 3.45 m while its velocity there is
 *   1.12 m/s — the rocket is on the pad and the barometer is noisy. Near-pad altitude is the exact
 *   trace this module's header says is unusable, so a guard built on it contradicts the module.
 */
export function railExitReading(
  series: Pick<
    FlightSeries,
    'time' | 'velocity' | 'acceleration' | 'velocitySource' | 'velocityUnusable' | 'accelerationSource'
  >,
  railLengthM: number,
  liftoffIndex: number | null,
  /** `metrics.accelClipped` — a saturated accelerometer reports a floor, so no ceiling is built
   *  from one. Defaults to false so a caller that has no metrics still gets the other guard. */
  accelClipped = false,
): RailExitReading {
  const bound = railExitBound(series.acceleration, railLengthM, series.accelerationSource, accelClipped);
  // The two format-level questions stay in `canMeasureRailExit`, which is where they were already
  // stated once — asking them again here is how the surface came to ask one of them and then
  // integrate anyway.
  if (!canMeasureRailExit(series, liftoffIndex)) {
    if (series.velocitySource !== 'device') return { velocity: null, refused: 'notLogged', bound };
    if (series.velocityUnusable) return { velocity: null, refused: 'traceRefused', bound };
    return { velocity: null, refused: 'noLiftoff', bound };
  }
  if (!(railLengthM > 0)) return { velocity: null, refused: 'tooShort', bound };

  const walk = integrateToRail(series.time, series.velocity, railLengthM, liftoffIndex as number);
  if (walk.velocity == null) return { velocity: null, refused: 'tooShort', bound };
  // **No sample lies inside the traverse**, so the interpolation spans the whole measurement and
  // what comes back is the anchor velocity rather than a reading at the rail. A fact about the
  // record's resolution, with no threshold in it.
  //
  // The test is that NOTHING had accumulated when the crossing happened — not that the first step
  // was itself longer than the rail, which is what the first draft asked. The loop discards
  // non-positive steps, so a single negative wobble off the pad left `firstSegment` small and
  // negative while the traverse was still crossed in one step: `[0.2, −0.6, 40, 60]` on a 0.3 s
  // clock published 16.15 m/s, and flipping the sign of one sample refused it. Found by the
  // pre-push review.
  if (!walk.sampledBeforeCrossing) return { velocity: null, refused: 'unsampled', bound };
  if (bound != null && walk.velocity > bound) return { velocity: null, refused: 'aboveOwnAcceleration', bound };
  return { velocity: walk.velocity, refused: null, bound };
}

interface RailWalk {
  velocity: number | null;
  /** Whether ANY rail travel had accumulated when the crossing happened — i.e. whether at least
   *  one sample fell inside the traverse. False means the rail went by in a single step from the
   *  anchor and the returned velocity is that step's interpolation across the whole of it. */
  sampledBeforeCrossing: boolean;
}

/** The integral itself, plus whether anything was sampled inside the traverse. One loop, so the
 *  reading and the resolution behind it cannot disagree. */
function integrateToRail(
  time: Float64Array,
  velocity: Float64Array,
  railLengthM: number,
  liftoffIndex: number,
): RailWalk {
  const n = Math.min(time.length, velocity.length);
  let dist = 0;
  for (let i = Math.max(1, liftoffIndex + 1); i < n; i++) {
    const dt = time[i] - time[i - 1];
    const v0 = velocity[i - 1];
    const v1 = velocity[i];
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(v0) || !Number.isFinite(v1)) continue;
    const seg = ((v0 + v1) / 2) * dt; // displacement over this step
    if (dist + seg >= railLengthM) {
      const need = railLengthM - dist;
      const f = seg > 0 ? Math.min(1, Math.max(0, need / seg)) : 0;
      return { velocity: v0 + (v1 - v0) * f, sampledBeforeCrossing: dist > 0 };
    }
    // Only climb accumulates rail travel; ignore a momentary negative wobble so
    // near-pad noise can't push the running distance backwards.
    if (seg > 0) dist += seg;
  }
  return { velocity: null, sampledBeforeCrossing: dist > 0 };
}

/**
 * Rail-exit velocity (m/s): the flown velocity at the point the rocket had travelled
 * `railLengthM` from the pad, found by integrating velocity from `liftoffIndex` until
 * the cumulative displacement reaches the rail length (trapezoidal, interpolated at the
 * crossing). Returns null if liftoff is unknown, the rail length isn't positive, or the
 * rocket never covered a rail length with a readable velocity.
 *
 * **This is the ARITHMETIC, not the reading.** It integrates whatever it is given from wherever
 * it is told to start, and on a record that does not contain the rail traverse it returns a
 * number anyway. `railExitReading` above is what a surface calls; this stays exported because the
 * arithmetic is worth testing on its own, and because the guards are only meaningful next to the
 * unguarded value they refuse.
 */
export function railExitVelocity(
  time: Float64Array,
  velocity: Float64Array,
  railLengthM: number,
  liftoffIndex: number,
): number | null {
  if (!(railLengthM > 0) || !(liftoffIndex >= 0)) return null;
  return integrateToRail(time, velocity, railLengthM, liftoffIndex).velocity;
}
