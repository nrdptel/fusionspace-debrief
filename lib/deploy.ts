// Main-deploy altitude check: on a dual-deploy flight the altimeter is configured
// to fire the main at a set altitude (a round number like 500 or 1000 ft). Debrief
// detects the main deployment and the AGL altitude it happened at, so it can read
// off how close that landed to the altitude the flier set — a verification that the
// recovery system did what it was told, and a safety check (a main that fires too
// low gives a hard landing; too high drifts further). A reading of the flown flight,
// not a prediction.

/** Within this much of the set altitude, the main counts as firing "on the mark" —
 *  inside baro precision (good to a few metres) and the rounding of a set value. */
export const DEPLOY_SLOP_M = 8; // ~25 ft

/** A configured main-deploy altitude won't sensibly exceed this — a guard against
 *  a fat-fingered entry (metres typed as feet, say). */
export const MAX_REASONABLE_DEPLOY_M = 9000;

export interface DeployCheck {
  /** actual − set, metres. Positive = the main fired *higher* than set (earlier,
   *  so more drift but a softer, longer descent); negative = *lower* than set
   *  (later — less drift, but a harder landing and the riskier miss). */
  offsetM: number;
  when: 'high' | 'low' | 'on';
}

/** Compare the measured main-deploy altitude against the altitude the flier set on
 *  the altimeter. Returns the signed offset and which side it fell on. */
export function deployCheck(actualM: number, setM: number): DeployCheck {
  const offsetM = actualM - setM;
  const when = Math.abs(offsetM) <= DEPLOY_SLOP_M ? 'on' : offsetM > 0 ? 'high' : 'low';
  return { offsetM, when };
}
