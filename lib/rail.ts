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

/** Common launch-rail lengths, in metres (4/6/8/10/12 ft — standard 1010/1515). */
export const RAIL_LENGTHS_M = [1.219, 1.829, 2.438, 3.048, 3.658];
export const DEFAULT_RAIL_M = 2.438; // 8 ft

/** Below roughly this, a rocket is commonly considered to have left the rail too
 *  slowly to be reliably stable — surfaced as a gentle heads-up, not a rule. */
export const MARGINAL_RAIL_VELOCITY = 15; // m/s (~49 ft/s)

/**
 * Rail-exit velocity (m/s): the flown velocity at the point the rocket had travelled
 * `railLengthM` from the pad, found by integrating velocity from `liftoffIndex` until
 * the cumulative displacement reaches the rail length (trapezoidal, interpolated at the
 * crossing). Returns null if liftoff is unknown, the rail length isn't positive, or the
 * rocket never covered a rail length with a readable velocity.
 */
export function railExitVelocity(
  time: Float64Array,
  velocity: Float64Array,
  railLengthM: number,
  liftoffIndex: number,
): number | null {
  if (!(railLengthM > 0) || !(liftoffIndex >= 0)) return null;
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
      return v0 + (v1 - v0) * f;
    }
    // Only climb accumulates rail travel; ignore a momentary negative wobble so
    // near-pad noise can't push the running distance backwards.
    if (seg > 0) dist += seg;
  }
  return null;
}
