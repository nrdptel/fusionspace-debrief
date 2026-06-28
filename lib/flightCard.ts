// The flight card: a compact, shareable image of a flight — the headline numbers
// and the altitude curve, branded, for posting to a club chat or forum. This module
// holds the pure part: which measured numbers make the card and how they read. The
// drawing itself (canvas) lives in the component, since it needs the DOM.

import type { FlightMetrics } from './analyze/types';
import type { UnitSystem } from './display';
import { fmtLength, fmtSpeed, fmtAccel, fmtTime, fmtMach } from './display';

export interface CardStat {
  label: string;
  value: string;
  sub?: string;
}

/** The always-available, measured headline numbers for the card — apogee always,
 *  then whichever of max velocity, max acceleration and flight time the log
 *  actually yielded (acceleration is absent on a GPS-only flight, flight time on a
 *  log that ends at apogee). Nothing here needs a user-supplied parameter. */
export function flightCardStats(metrics: FlightMetrics, sys: UnitSystem): CardStat[] {
  const stats: CardStat[] = [{ label: 'Apogee', value: fmtLength(metrics.apogeeAltitude, sys) }];
  if (Number.isFinite(metrics.maxVelocity)) {
    stats.push({
      label: 'Max velocity',
      value: fmtSpeed(metrics.maxVelocity, sys),
      sub: metrics.mach ? fmtMach(metrics.mach) : undefined,
    });
  }
  if (Number.isFinite(metrics.maxAcceleration)) {
    stats.push({ label: 'Max accel', value: fmtAccel(metrics.maxAcceleration) });
  }
  if (metrics.flightTime != null) {
    stats.push({ label: 'Flight time', value: fmtTime(metrics.flightTime) });
  }
  return stats;
}
