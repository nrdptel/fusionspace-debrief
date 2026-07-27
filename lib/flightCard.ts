// The flight card: a compact, shareable image of a flight — the headline numbers
// and the altitude curve, branded, for posting to a club chat or forum. This module
// holds the pure part: which measured numbers make the card and how they read. The
// drawing itself (canvas) lives in the component, since it needs the DOM.

import type { FlightMetrics } from './analyze/types';
import { fmtAccel, fmtLength, fmtMach, fmtSpeed, fmtTime } from './display';
import type { UnitChoice } from './display';

export interface CardStat {
  label: string;
  value: string;
  sub?: string;
}

/** The headline numbers for the card — apogee always, then whichever of max velocity, max
 *  acceleration and flight time the log actually yielded (acceleration is absent on a
 *  GPS-only flight, flight time on a log that ends at apogee). Nothing here needs a
 *  user-supplied parameter.
 *
 *  Each carries its provenance, in the grid's words. This is the one surface that LEAVES
 *  the flyer's device — it exists to be posted to a club chat or a forum — so it is the
 *  worst place to print a number more confidently than the log supports. It used to do
 *  exactly that: a bare Mach figure with nothing beside it. Nine corpus flights put a
 *  SUPERSONIC claim on a card that way, every one of them differentiated out of an altitude
 *  rather than measured, and the loudest read Mach 2.64 on a flight whose own device summary,
 *  a second altimeter, a GPS and an L3 cert PDF all say Mach 1.3. The grid tile beside it
 *  said "derived" the whole time. The altitude the peak occurred at is dropped — the grid
 *  has room for it, a card does not, and the provenance is the part that changes the claim. */
export function flightCardStats(metrics: FlightMetrics, sys: UnitChoice): CardStat[] {
  const stats: CardStat[] = [{ label: 'Apogee', value: fmtLength(metrics.apogeeAltitude, sys) }];
  if (Number.isFinite(metrics.maxVelocity)) {
    const src = metrics.maxVelocitySource === 'device' ? 'measured' : 'derived';
    stats.push({
      label: 'Max velocity',
      value: fmtSpeed(metrics.maxVelocity, sys),
      sub: metrics.mach ? `${fmtMach(metrics.mach)} · ${src}` : src,
    });
  }
  if (Number.isFinite(metrics.maxAcceleration)) {
    stats.push({
      label: 'Max accel',
      value: fmtAccel(metrics.maxAcceleration, sys),
      sub:
        metrics.accelerationSource === 'device'
          ? metrics.accelClipped
            ? 'measured · may be clipped'
            : 'measured'
          : 'derived',
    });
  }
  if (metrics.flightTime != null) {
    stats.push({ label: 'Flight time', value: fmtTime(metrics.flightTime) });
  }
  return stats;
}
