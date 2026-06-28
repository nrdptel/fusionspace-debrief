// Rail-exit (rail-departure) velocity: how fast the rocket was actually moving
// when it cleared the launch rail — the airspeed it had for aerodynamic stability
// at the most critical moment of the flight. Pure measurement: we read the flown
// velocity at the height where the rocket passed your rail's length above the pad.
// Nothing is predicted or modelled.

/** Common launch-rail lengths, in metres (4/6/8/10/12 ft — standard 1010/1515). */
export const RAIL_LENGTHS_M = [1.219, 1.829, 2.438, 3.048, 3.658];
export const DEFAULT_RAIL_M = 2.438; // 8 ft

/** Below roughly this, a rocket is commonly considered to have left the rail too
 *  slowly to be reliably stable — surfaced as a gentle heads-up, not a rule. */
export const MARGINAL_RAIL_VELOCITY = 15; // m/s (~49 ft/s)

/** The velocity (m/s) at the first point the rocket climbed past `railLengthM`
 *  above the pad, linearly interpolated, or null if it never got that high or the
 *  velocity there isn't readable. Altitude is AGL (≈0 on the pad). */
export function railExitVelocity(altitude: Float64Array, velocity: Float64Array, railLengthM: number): number | null {
  if (!(railLengthM > 0)) return null;
  const n = Math.min(altitude.length, velocity.length);
  for (let i = 1; i < n; i++) {
    const a0 = altitude[i - 1];
    const a1 = altitude[i];
    if (!Number.isFinite(a0) || !Number.isFinite(a1)) continue;
    // First upward crossing of the rail height.
    if (a0 < railLengthM && a1 >= railLengthM) {
      const v0 = velocity[i - 1];
      const v1 = velocity[i];
      if (!Number.isFinite(v0) || !Number.isFinite(v1)) return null;
      const f = a1 > a0 ? (railLengthM - a0) / (a1 - a0) : 0;
      return v0 + (v1 - v0) * f;
    }
  }
  return null;
}
