// The readings a single flight shows on screen, as data rather than as markup.
//
// This list and the one in lib/report.ts (`headlineRows`) describe the same flight to two
// audiences: the grid a flyer reads on the page, and the document they save. They are
// written separately because they genuinely differ — the grid splits a reading into a big
// number and a quiet sub-line and marks three of them as headline tiles, while a report
// row is one label and one sentence, and the report carries readings the grid has no tile
// for (the time to apogee, the landing energy, the deploy and ejection checks a flyer
// typed their own figures into).
//
// What they must NOT differ on is which readings exist. Six of them once did: avg
// acceleration, thrust-to-weight, coast efficiency, peak roll rate, revolutions and the
// battery low were on the screen and in no saved report, so a flyer who read the
// thrust-to-weight off the page and exported a write-up got a document without it. That
// was possible because the two lists could only be compared by reading both. Keeping this
// one in lib rather than inside the component is what lets a test hold them side by side
// (lib/readings.test.ts) and fail the moment one gains a reading the other doesn't.

import type { FlightMetrics } from './analyze/types';
import { fmtAccel, fmtLength, fmtMach, fmtPressure, fmtSpeed, fmtTemp, fmtTime, fmtVoltage } from './display';
import type { UnitChoice } from './display';

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}

/** Mach (when known), the altitude the peak speed was reached at, and its
 *  provenance — measured off a logged/inertial velocity, or derived from the
 *  barometric altitude (softer at peak). Provenance is shown for the peak the way
 *  the max-acceleration tile shows it, so a headline number never reads as more
 *  direct than it is. */
function maxVelocitySub(m: FlightMetrics, sys: UnitChoice): string | undefined {
  if (!Number.isFinite(m.maxVelocity)) return 'not in this log';
  const parts: string[] = [];
  if (m.mach) parts.push(fmtMach(m.mach));
  if (Number.isFinite(m.maxVelocityAltitude)) parts.push(`at ${fmtLength(m.maxVelocityAltitude, sys)}`);
  parts.push(m.maxVelocitySource === 'device' ? 'measured' : 'derived');
  return parts.join(' · ');
}

export function metricTiles(m: FlightMetrics, sys: UnitChoice): Tile[] {
  const out: Tile[] = [
    {
      label: 'Apogee',
      value: fmtLength(m.apogeeAltitude, sys),
      sub: Number.isFinite(m.timeToApogee) ? `${fmtTime(m.timeToApogee)} to apogee` : undefined,
      primary: true,
    },
    {
      label: 'Max velocity',
      value: fmtSpeed(m.maxVelocity, sys),
      sub: maxVelocitySub(m, sys),
      primary: true,
    },
  ];
  // Acceleration is omitted for a GPS-only flight (it's not meaningful), so only
  // show the tile when there's a real figure.
  if (Number.isFinite(m.maxAcceleration)) {
    out.push({
      label: 'Max acceleration',
      value: fmtAccel(m.maxAcceleration, sys),
      sub:
        m.accelerationSource === 'device'
          ? m.accelClipped
            ? 'measured · may be clipped'
            : 'measured'
          : 'derived',
      primary: true,
    });
  }

  if (m.avgBoostAcceleration != null)
    out.push({ label: 'Avg acceleration', value: fmtAccel(m.avgBoostAcceleration, sys), sub: 'over the boost' });
  if (m.liftoffTWR != null)
    out.push({ label: 'Thrust-to-weight', value: `${m.liftoffTWR.toFixed(1)}:1`, sub: 'off the pad' });
  if (m.burnTime != null) out.push({ label: 'Burn time', value: fmtTime(m.burnTime) });
  if (m.burnoutAltitude != null)
    out.push({ label: 'Burnout altitude', value: fmtLength(m.burnoutAltitude, sys) });
  if (m.burnoutVelocity != null)
    out.push({
      label: 'Burnout velocity',
      value: fmtSpeed(m.burnoutVelocity, sys),
      // Where burnout was taken from the velocity peak rather than a signed accelerometer
      // crossing zero, this reading IS the max velocity — the same number under a second
      // label, which reads as two measurements agreeing unless it says otherwise.
      sub: m.burnoutSource === 'derived' ? 'at the velocity peak — the same instant as max velocity' : undefined,
    });
  if (m.coastTime != null) out.push({ label: 'Coast to apogee', value: fmtTime(m.coastTime) });
  if (m.coastEfficiency != null)
    out.push({
      label: 'Coast efficiency',
      value: `${Math.round(m.coastEfficiency * 100)}%`,
      sub: m.dragLossAltitude != null ? `drag cost ${fmtLength(m.dragLossAltitude, sys)}` : undefined,
    });
  if (m.maxDynamicPressure != null)
    out.push({
      label: 'Max Q',
      value: fmtPressure(m.maxDynamicPressure, sys),
      sub: m.maxDynamicPressureAltitude != null ? `at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : undefined,
    });
  if (m.drogueDescentRate != null)
    out.push({ label: 'Drogue descent', value: fmtSpeed(m.drogueDescentRate, sys) });
  if (m.mainDescentRate != null)
    out.push({
      label: m.drogueDescentRate != null ? 'Main descent' : 'Descent rate',
      value: fmtSpeed(m.mainDescentRate, sys),
    });
  // Where this file held the same flight twice and the copy that starts on the pad stopped
  // before the rocket landed, the clock came from the other copy. Two readings from two
  // recordings, shown as such rather than merged silently into the rest.
  const fromCopy = m.descentSource === 'second-copy' ? 'from this file’s second copy of the flight' : undefined;
  if (m.descentTime != null) out.push({ label: 'Descent time', value: fmtTime(m.descentTime), sub: fromCopy });
  if (m.flightTime != null) out.push({ label: 'Flight time', value: fmtTime(m.flightTime), sub: fromCopy });
  if (m.groundTemperature != null)
    out.push({ label: 'Ground temp', value: fmtTemp(m.groundTemperature, sys) });
  // Battery: the lowest it sagged to, with the resting voltage alongside so a
  // drop (a weak pack — a common cause of a charge that didn't fire) is visible.
  if (m.batteryMinV != null)
    out.push({
      label: 'Battery low',
      value: fmtVoltage(m.batteryMinV),
      sub: m.batteryStartV != null ? `${fmtVoltage(m.batteryStartV)} at rest` : undefined,
    });

  // Roll/spin about the long axis, when the logger recorded a roll-rate channel.
  if (m.peakRollRate != null)
    out.push({
      label: 'Peak roll rate',
      value: `${Math.round(m.peakRollRate)} °/s`,
      sub: `${(m.peakRollRate / 360).toFixed(1)} rev/s`,
    });
  if (m.rollRevolutions != null)
    out.push({
      label: 'Revolutions',
      value: m.rollRevolutions.toFixed(m.rollRevolutions < 10 ? 1 : 0),
      sub: 'total roll',
    });

  // How vertical the powered flight was, when the logger solved for attitude.
  if (m.tiltAtBurnout != null)
    out.push({
      label: 'Tilt at burnout',
      value: `${Math.round(m.tiltAtBurnout)}°`,
      sub: 'off vertical',
    });

  return out;
}
