// Ejection-delay check: for a single-deploy, motor-ejection flight, the ideal
// motor delay is the coast time — burnout → apogee — the interval the rocket
// spends decelerating to a stop. A charge timed to that fires the recovery
// system right at apogee, where the airframe is slowest and the deployment is
// gentlest. This is a pure reading of the flight you flew (the coast time), not
// a prediction: it answers "was my delay right, and by how much" after the fact.

/** Printed motor delays top out around 14 s (a long C6-14); allow some margin
 *  for adjustable/drilled delays and fat-fingered entries past that. */
export const MAX_REASONABLE_DELAY_S = 30;

/** Within this many seconds of the coast time, a delay counts as "at apogee" —
 *  inside the slop of charge timing and a baro apogee, calling it perfect. */
export const APOGEE_SLOP_S = 0.5;

export interface DelayCheck {
  /** printedDelay − coastTime, seconds. Positive = the charge fires *after*
   *  apogee (a long delay — the rocket has tipped over and is falling, so the
   *  recovery gear deploys nose-down into the airstream). Negative = *before*
   *  apogee (a short delay — still climbing fast, the riskiest case). */
  offsetS: number;
  when: 'after' | 'before' | 'at';
}

/** Compare a printed motor delay against the flight's coast time (the ideal
 *  delay). Returns the signed offset and which side of apogee it falls on. */
export function delayCheck(printedDelayS: number, coastTimeS: number): DelayCheck {
  const offsetS = printedDelayS - coastTimeS;
  const when = Math.abs(offsetS) <= APOGEE_SLOP_S ? 'at' : offsetS > 0 ? 'after' : 'before';
  return { offsetS, when };
}
