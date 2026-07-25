// Do two recordings agree about the SAME event, or merely about a number?
//
// A cross-check is a check of one instant: two sensors that saw one apogee. Comparing only
// the heights lets a coincidence pass for corroboration, and the corpus has exactly that
// case — a GPS whose altitude solution lags the flight so badly that it sits at pad level
// through the whole climb and peaks 34 s later, under drogue, at a height that happens to
// land within 3% of the barometric apogee. Read as "GPS 2,434 ft, barometer 2,502 ft,
// agree 2.7%" that is worse than no cross-check: it is a wrong number with a green badge.
//
// So agreement is judged on both axes, and the time is the one that can refute it: apogee
// is a single instant, and two recordings that put it seconds apart did not see the same
// one, whatever their heights say.

export type PeakAgreement = 'agree' | 'differ' | 'different-peak';

/** How far apart two recordings may put one instant and still be reading it. A second or
 *  two of sampling, plus a little slack proportional to the flight — a 1 Hz receiver on a
 *  40-second climb has coarser resolution than one on a 10-second climb. */
export function peakTimeTolerance(timeToApogeeS: number): number {
  return Math.max(2, timeToApogeeS * 0.15);
}

/**
 * Judge a pair of apogee readings. `differ` means both saw the peak but disagree about how
 * high; `different-peak` means they can't both be reading the same instant, so the height
 * agreement — however close — is not corroboration.
 */
export function peakAgreement(
  a: { value: number; time: number | null },
  b: { value: number; time: number | null },
): PeakAgreement {
  if (a.time != null && b.time != null && Number.isFinite(a.time) && Number.isFinite(b.time)) {
    if (Math.abs(a.time - b.time) > peakTimeTolerance(b.time)) return 'different-peak';
  }
  if (!(b.value > 0)) return 'differ';
  return Math.abs((a.value - b.value) / b.value) < 0.05 ? 'agree' : 'differ';
}
