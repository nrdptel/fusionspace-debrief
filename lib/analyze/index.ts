// The analysis pipeline. Given a canonical flight, it establishes a ground
// baseline, finds the flight events, and reads off the headline numbers — doing
// its best with whatever channels the logger recorded, and noting where it had
// to estimate. See docs/plan.md for the reasoning behind each step, and the
// in-app "Where the numbers come from" section for the user-facing version.

import type { RawFlight } from '../flight/types';
import { getChannel } from '../flight/types';
import { G0 } from '../units';
import type { FlightAnalysis, FlightEvent, FlightMetrics, FlightSeries } from './types';
import {
  medianFilter,
  movingAverage,
  derivative,
  medianDt,
  argMax,
  argMin,
} from './signal';

/** Window (in samples) covering roughly `seconds`, clamped to something sane. */
function windowFor(dt: number, seconds: number): number {
  if (dt <= 0) return 3;
  const w = Math.round(seconds / dt);
  return Math.max(3, Math.min(201, w | 1)); // odd, bounded
}

/** Barometric altitude (AGL) from pressure, given the launch-pad pressure. */
function altitudeFromPressure(pressure: Float64Array, padPressure: number): Float64Array {
  const out = new Float64Array(pressure.length);
  for (let i = 0; i < pressure.length; i++) {
    const p = pressure[i];
    out[i] = Number.isFinite(p) && p > 0 ? 44330 * (1 - Math.pow(p / padPressure, 1 / 5.255)) : NaN;
  }
  return out;
}

function mean(values: Float64Array, from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i])) {
      sum += values[i];
      n++;
    }
  }
  return n ? sum / n : NaN;
}

export function analyzeFlight(flight: RawFlight): FlightAnalysis {
  const warnings: string[] = [];
  const time = flight.time;
  const n = time.length;
  const dt = medianDt(time);

  // --- Altitude (AGL) -------------------------------------------------------
  // Prefer a logged altitude channel; otherwise derive from pressure. Either way
  // we subtract a pad baseline so altitude reads zero on the rail.
  let altitude: Float64Array;
  const altCh = getChannel(flight, 'altitude');
  const presCh = getChannel(flight, 'pressure');
  if (altCh) {
    altitude = altCh.values.slice();
  } else if (presCh) {
    const padPressure = mean(presCh.values, 0, Math.min(presCh.values.length, Math.max(3, Math.round(1 / (dt || 0.1)))));
    altitude = altitudeFromPressure(presCh.values, padPressure);
    warnings.push('No altitude channel — altitude was derived from barometric pressure.');
  } else {
    throw new Error('This file has no altitude or pressure data to analyse.');
  }

  // Pad baseline: the median of the opening samples (before anything happens).
  const baseN = Math.max(3, Math.min(n, Math.round(2 / (dt || 0.1))));
  const baseSorted = Array.from(altitude.slice(0, baseN)).filter(Number.isFinite).sort((a, b) => a - b);
  const baseline = baseSorted.length ? baseSorted[baseSorted.length >> 1] : 0;
  for (let i = 0; i < n; i++) altitude[i] -= baseline;

  // Spike-resistant altitude: a short median filter removes the single-sample
  // jumps an ejection charge punches into a baro trace, without rounding the peak.
  const altClean = medianFilter(altitude, windowFor(dt, 0.15));
  const altSmooth = movingAverage(altClean, windowFor(dt, 0.1));

  // --- Velocity -------------------------------------------------------------
  // Use the device's own velocity if it logged one (accelerometer-integrated is
  // best through the high-speed boost); otherwise differentiate clean altitude.
  let velocity: Float64Array;
  let velocitySource: 'device' | 'baro';
  const velCh = getChannel(flight, 'velocity');
  if (velCh) {
    velocity = velCh.values.slice();
    velocitySource = 'device';
  } else {
    velocity = derivative(time, altSmooth);
    velocity = movingAverage(velocity, windowFor(dt, 0.1));
    velocitySource = 'baro';
  }

  // --- Acceleration ---------------------------------------------------------
  let acceleration: Float64Array;
  let accelerationSource: 'device' | 'baro';
  const accCh = getChannel(flight, 'accelAxial') ?? getChannel(flight, 'accelTotal');
  if (accCh) {
    acceleration = accCh.values.slice();
    accelerationSource = 'device';
  } else {
    acceleration = movingAverage(derivative(time, velocity), windowFor(dt, 0.1));
    accelerationSource = 'baro';
  }

  const series: FlightSeries = {
    time,
    altitude: altClean,
    velocity,
    acceleration,
    velocitySource,
    accelerationSource,
  };

  // --- Apogee ---------------------------------------------------------------
  // The max of the spike-cleaned altitude — robust to an ejection pop reading as
  // a false peak just past true apogee.
  const apogeeIdx = Math.max(0, argMax(altClean));
  const apogeeTime = time[apogeeIdx];
  const apogeeAlt = altClean[apogeeIdx];

  // --- Liftoff --------------------------------------------------------------
  // With an accelerometer, the first sustained kick above ~2 g; otherwise the
  // first real, sustained climb away from the pad.
  let liftoffIdx = 0;
  if (accelerationSource === 'device') {
    const thresh = 2 * G0;
    for (let i = 0; i < apogeeIdx; i++) {
      if (acceleration[i] > thresh && acceleration[Math.min(i + 1, n - 1)] > thresh) {
        liftoffIdx = i;
        break;
      }
    }
  }
  if (liftoffIdx === 0) {
    for (let i = 0; i < apogeeIdx; i++) {
      if (altClean[i] > 2 && velocity[i] > 2) {
        liftoffIdx = i;
        break;
      }
    }
  }
  const liftoffTime = time[liftoffIdx];

  // --- Max velocity / acceleration (ascent) --------------------------------
  const maxVelIdx = Math.max(liftoffIdx, argMax(velocity, liftoffIdx, apogeeIdx + 1));
  const maxVelocity = velocity[maxVelIdx] ?? 0;
  const maxAccIdx = Math.max(liftoffIdx, argMax(acceleration, liftoffIdx, apogeeIdx + 1));
  const maxAcceleration = acceleration[maxAccIdx] ?? 0;
  const maxDecIdx = argMin(acceleration, liftoffIdx, apogeeIdx + 1);
  const maxDeceleration = maxDecIdx >= 0 ? acceleration[maxDecIdx] : 0;

  // --- Burnout --------------------------------------------------------------
  // With accel: the thrust end — first time acceleration falls through zero after
  // the boost peak. Baro-only: velocity peaks at burnout, so use that.
  let burnoutIdx: number | null = null;
  if (accelerationSource === 'device') {
    const peak = argMax(acceleration, liftoffIdx, apogeeIdx + 1);
    for (let i = peak; i < apogeeIdx; i++) {
      if (acceleration[i] <= 0) {
        burnoutIdx = i;
        break;
      }
    }
  }
  if (burnoutIdx === null && maxVelIdx > liftoffIdx) burnoutIdx = maxVelIdx;

  // --- Descent: deployments & landing --------------------------------------
  // Landing: the flight has come back to near the pad and stopped moving.
  let landingIdx = n - 1;
  for (let i = apogeeIdx; i < n; i++) {
    if (altClean[i] < 3 && Math.abs(velocity[i]) < 1.5) {
      landingIdx = i;
      break;
    }
  }
  const landingTime = time[landingIdx];

  // Descent speed (positive downward) over the descent, lightly smoothed.
  const descent = movingAverage(
    velocity.map((v) => -v) as unknown as Float64Array,
    windowFor(dt, 0.3),
  );
  // Main deployment: the sharpest sustained drop in descent speed after apogee —
  // a fast drogue descent transitioning to a slow main.
  let mainIdx: number | null = null;
  {
    const guard = Math.round((medianDt(time) > 0 ? 0.5 / medianDt(time) : 5)); // ignore the first 0.5 s past apogee
    let bestDrop = 0;
    for (let i = apogeeIdx + guard; i < landingIdx - guard; i++) {
      const before = mean(descent, Math.max(apogeeIdx, i - guard), i);
      const after = mean(descent, i, Math.min(landingIdx, i + guard));
      const drop = before - after;
      if (drop > bestDrop && before > 8 && after > 0 && after < before * 0.7) {
        bestDrop = drop;
        mainIdx = i;
      }
    }
    if (bestDrop < 3) mainIdx = null; // no convincing transition: single deploy
  }

  const events: FlightEvent[] = [];
  const push = (type: FlightEvent['type'], idx: number, label: string, provenance: FlightEvent['provenance']) => {
    if (idx < 0 || idx >= n) return;
    events.push({ type, label, time: time[idx], index: idx, altitude: altClean[idx], provenance });
  };
  push('liftoff', liftoffIdx, 'Liftoff', accelerationSource === 'device' ? 'measured' : 'derived');
  if (burnoutIdx !== null) {
    push('burnout', burnoutIdx, 'Burnout', accelerationSource === 'device' ? 'measured' : 'derived');
  }
  push('apogee', apogeeIdx, 'Apogee', 'derived');
  if (mainIdx !== null) push('main', mainIdx, 'Main deploy', 'derived');
  push('landing', landingIdx, 'Landing', 'derived');

  // --- Descent rates --------------------------------------------------------
  let drogueDescentRate: number | null = null;
  let mainDescentRate: number | null = null;
  if (mainIdx !== null) {
    drogueDescentRate = mean(descent, apogeeIdx + 1, mainIdx);
    mainDescentRate = mean(descent, mainIdx + 1, landingIdx);
  } else if (landingIdx > apogeeIdx + 1) {
    mainDescentRate = mean(descent, apogeeIdx + 1, landingIdx);
  }

  // --- Mach -----------------------------------------------------------------
  const tempCh = getChannel(flight, 'temperature');
  const groundTemperature = tempCh ? mean(tempCh.values, 0, baseN) : null;
  const tempK = (groundTemperature ?? 15) + 273.15;
  const speedOfSound = Math.sqrt(1.4 * 287.05 * tempK);
  const mach = maxVelocity > 0 ? maxVelocity / speedOfSound : null;

  const metrics: FlightMetrics = {
    apogeeAltitude: apogeeAlt,
    timeToApogee: apogeeTime - liftoffTime,
    maxVelocity,
    maxVelocitySource: velocitySource,
    mach,
    maxAcceleration,
    maxDeceleration,
    accelerationSource,
    burnTime: burnoutIdx !== null ? time[burnoutIdx] - liftoffTime : null,
    burnoutAltitude: burnoutIdx !== null ? altClean[burnoutIdx] : null,
    burnoutVelocity: burnoutIdx !== null ? velocity[burnoutIdx] : null,
    coastTime: burnoutIdx !== null ? apogeeTime - time[burnoutIdx] : null,
    drogueDescentRate,
    mainDescentRate,
    descentTime: landingTime - apogeeTime,
    flightTime: landingTime - liftoffTime,
    groundTemperature,
  };

  if (apogeeIdx >= n - 2) {
    warnings.push('The log appears to end at or before apogee — descent numbers may be missing.');
  }
  if (velocitySource === 'baro' && accelerationSource === 'baro') {
    warnings.push('Velocity and acceleration were derived from altitude, so they are smoothed estimates rather than direct measurements.');
  }

  return { series, events, metrics, warnings };
}
