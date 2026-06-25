// The analysis pipeline. Given a canonical flight, it establishes a ground
// baseline, finds the flight events, and reads off the headline numbers — doing
// its best with whatever channels the logger recorded, and noting where it had
// to estimate or couldn't be sure. See docs/plan.md for the reasoning behind each
// step, and the in-app "Where the numbers come from" section for the user-facing
// version.

import type { RawFlight } from '../flight/types';
import { getChannel } from '../flight/types';
import { G0 } from '../units';
import type { FlightAnalysis, FlightEvent, FlightMetrics, FlightSeries } from './types';
import {
  medianFilter,
  hampelFilter,
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
  return Math.max(3, Math.min(401, w | 1)); // odd, bounded
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

function stdev(values: Float64Array, from: number, to: number): number {
  const m = mean(values, from, to);
  if (!Number.isFinite(m)) return NaN;
  let sum = 0;
  let n = 0;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i])) {
      sum += (values[i] - m) ** 2;
      n++;
    }
  }
  return n ? Math.sqrt(sum / n) : NaN;
}

export function analyzeFlight(flight: RawFlight): FlightAnalysis {
  const warnings: string[] = [];
  const time = flight.time;
  const n = time.length;
  if (n < 4) throw new Error('This file has too few samples to analyze.');
  const dt = medianDt(time);
  const sampleHz = dt > 0 ? 1 / dt : 0;

  // --- Altitude (AGL) -------------------------------------------------------
  // Prefer a logged altitude channel; otherwise derive from pressure. Either way
  // we subtract a pad baseline so altitude reads zero on the rail.
  let altitude: Float64Array;
  const altCh = getChannel(flight, 'altitude');
  const presCh = getChannel(flight, 'pressure');
  const baseN = Math.max(3, Math.min(n, Math.round(2 / (dt || 0.1))));
  if (altCh) {
    altitude = altCh.values.slice();
  } else if (presCh) {
    const padPressure = mean(presCh.values, 0, baseN);
    altitude = altitudeFromPressure(presCh.values, padPressure);
    warnings.push('No altitude channel — altitude was derived from barometric pressure.');
  } else {
    throw new Error('This file has no altitude or pressure data to analyze.');
  }

  // Pad baseline: the median of the opening samples (before anything happens).
  const baseSorted = Array.from(altitude.slice(0, baseN)).filter(Number.isFinite).sort((a, b) => a - b);
  const baseline = baseSorted.length ? baseSorted[baseSorted.length >> 1] : 0;
  for (let i = 0; i < n; i++) altitude[i] -= baseline;

  // If the opening samples aren't quiet, the file probably starts mid-flight, so
  // the baseline (and anything measured against it) can't be trusted.
  const baselineNoise = stdev(altitude, 0, baseN);
  const padDataLikely = Number.isFinite(baselineNoise) && baselineNoise < 8;
  if (!padDataLikely) {
    warnings.push(
      'The log doesn’t appear to start on the pad, so the ground baseline is approximate — altitude AGL and any ground reading may be offset.',
    );
  }

  // Spike-resistant altitude: a Hampel filter removes the multi-sample jumps an
  // ejection charge punches into a baro trace, without rounding the true peak.
  const altClean = hampelFilter(altitude, windowFor(dt, 0.3));
  const altSmooth = movingAverage(medianFilter(altClean, windowFor(dt, 0.1)), windowFor(dt, 0.1));

  // --- Velocity -------------------------------------------------------------
  let velocity: Float64Array;
  let velocitySource: 'device' | 'baro';
  const velCh = getChannel(flight, 'velocity');
  if (velCh) {
    velocity = velCh.values.slice();
    velocitySource = 'device';
  } else {
    velocity = movingAverage(derivative(time, altSmooth), windowFor(dt, 0.1));
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

  // --- Apogee & whether there is an ascent at all ---------------------------
  const apogeeIdx = Math.max(0, argMax(altClean));
  const apogeeTime = time[apogeeIdx];
  const apogeeAlt = altClean[apogeeIdx];

  // A real flight climbs to a clear peak that isn't the first sample. A
  // descent-only or truncated-at-start log has neither, so we report the peak we
  // can see but withhold the ascent numbers rather than inventing them.
  const ascentPresent = apogeeIdx >= 2 && apogeeAlt > Math.max(3, baselineNoise * 3);
  if (!ascentPresent) {
    warnings.push(
      'No clear ascent was found — the log may begin after apogee or be truncated. Ascent numbers (velocity, acceleration, burnout) are not reported.',
    );
  }

  // --- Liftoff --------------------------------------------------------------
  let liftoffIdx = -1;
  if (ascentPresent && accelerationSource === 'device') {
    const thresh = 2 * G0;
    for (let i = 0; i < apogeeIdx; i++) {
      if (acceleration[i] > thresh && acceleration[Math.min(i + 1, n - 1)] > thresh) {
        liftoffIdx = i;
        break;
      }
    }
  }
  if (ascentPresent && liftoffIdx < 0) {
    for (let i = 0; i < apogeeIdx; i++) {
      if (altClean[i] > 3 && velocity[i] > 2) {
        liftoffIdx = i;
        break;
      }
    }
  }
  const liftoffFound = liftoffIdx >= 0;
  if (ascentPresent && !liftoffFound) {
    warnings.push('Liftoff couldn’t be pinpointed; times measured from apogee instead of liftoff.');
  }
  // For event placement we still need a starting index; fall back to 0.
  const liftoffRef = liftoffFound ? liftoffIdx : 0;
  const liftoffTime = time[liftoffRef];

  // --- Max velocity / acceleration (ascent) --------------------------------
  let maxVelocity = NaN;
  let maxAcceleration = NaN;
  let maxDeceleration = NaN;
  let maxVelIdx = -1;
  if (ascentPresent) {
    maxVelIdx = argMax(velocity, liftoffRef, apogeeIdx + 1);
    maxVelocity = maxVelIdx >= 0 ? velocity[maxVelIdx] : NaN;
    const maxAccIdx = argMax(acceleration, liftoffRef, apogeeIdx + 1);
    maxAcceleration = maxAccIdx >= 0 ? acceleration[maxAccIdx] : NaN;
    const maxDecIdx = argMin(acceleration, liftoffRef, apogeeIdx + 1);
    maxDeceleration = maxDecIdx >= 0 ? acceleration[maxDecIdx] : NaN;
  }

  // --- Burnout --------------------------------------------------------------
  // With accel: thrust end — acceleration first falls through zero after the
  // boost peak. Baro-only: velocity peaks at burnout. Either way, reject a
  // "burnout" that lands on apogee (a coast-dominated read with no real boost).
  let burnoutIdx: number | null = null;
  if (ascentPresent && accelerationSource === 'device') {
    const peak = argMax(acceleration, liftoffRef, apogeeIdx + 1);
    for (let i = peak; i < apogeeIdx; i++) {
      if (acceleration[i] <= 0) {
        burnoutIdx = i;
        break;
      }
    }
  }
  if (ascentPresent && burnoutIdx === null && maxVelIdx > liftoffRef) burnoutIdx = maxVelIdx;
  // Guard: burnout must sit clearly before apogee to be meaningful.
  if (burnoutIdx !== null && apogeeIdx - burnoutIdx < 2) burnoutIdx = null;

  // --- Landing --------------------------------------------------------------
  let landingIdx = n - 1;
  for (let i = apogeeIdx; i < n; i++) {
    if (altClean[i] < 3 && Math.abs(velocity[i]) < 1.5) {
      landingIdx = i;
      break;
    }
  }
  const landingTime = time[landingIdx];
  const landingFound = landingIdx < n - 1 || (altClean[n - 1] < 5 && Math.abs(velocity[n - 1]) < 2);
  if (apogeeIdx >= n - 2) {
    warnings.push('The log appears to end at or before apogee — descent numbers may be missing.');
  }

  // --- Deployments & descent rates -----------------------------------------
  // Descent speed (positive downward), lightly smoothed.
  const descent = movingAverage(
    Float64Array.from(velocity, (v) => -v),
    windowFor(dt, 0.3),
  );
  // Main deployment: the sharpest sustained drop from a fast drogue descent to a
  // slow main. Thresholds scale with the drogue rate so a slow-drogue flight is
  // judged on the same relative terms as a fast one.
  // Some loggers drop their sample rate after nose-over; size the descent
  // windows from the descent's own rate, not the (ascent-dominated) global one.
  const ascentDt = apogeeIdx > 4 ? medianDt(time.subarray(0, apogeeIdx + 1)) || dt : dt;
  const descentDt = apogeeIdx < n - 4 ? medianDt(time.subarray(apogeeIdx)) || dt : dt;
  if (ascentDt > 0 && descentDt > 0 && Math.max(descentDt / ascentDt, ascentDt / descentDt) >= 2.5) {
    warnings.push(
      `The sample rate changes around apogee (about ${(1 / ascentDt).toFixed(0)} Hz climbing, ${(1 / descentDt).toFixed(0)} Hz descending), so descent timing is coarser than the climb.`,
    );
  }

  let mainIdx: number | null = null;
  if (landingIdx > apogeeIdx + 4) {
    const guard = Math.max(2, Math.round(0.5 / (descentDt || 0.1)));
    let bestDrop = 0;
    for (let i = apogeeIdx + guard; i < landingIdx - guard; i++) {
      const before = mean(descent, Math.max(apogeeIdx, i - guard), i);
      const after = mean(descent, i, Math.min(landingIdx, i + guard));
      const drop = before - after;
      // A real main snap: a fast-enough drogue descent that more than halves and
      // drops by a real margin. Judged on relative terms so slow- and fast-drogue
      // flights are treated alike; a single-deploy descent never satisfies it
      // (its speed rises toward terminal, it doesn't step down).
      if (
        drop > bestDrop &&
        before > 5 &&
        after > 0 &&
        after < before * 0.6 &&
        drop > Math.max(3, before * 0.3)
      ) {
        bestDrop = drop;
        mainIdx = i;
      }
    }
  }

  let drogueDescentRate: number | null = null;
  let mainDescentRate: number | null = null;
  if (mainIdx !== null) {
    drogueDescentRate = mean(descent, apogeeIdx + 1, mainIdx);
    mainDescentRate = mean(descent, mainIdx + 1, landingIdx);
  } else if (landingIdx > apogeeIdx + 1) {
    mainDescentRate = mean(descent, apogeeIdx + 1, landingIdx);
  }

  // --- Events ---------------------------------------------------------------
  const events: FlightEvent[] = [];
  const push = (type: FlightEvent['type'], idx: number | null, label: string, provenance: FlightEvent['provenance']) => {
    if (idx === null || idx < 0 || idx >= n) return;
    events.push({ type, label, time: time[idx], index: idx, altitude: altClean[idx], provenance });
  };
  if (liftoffFound) push('liftoff', liftoffIdx, 'Liftoff', accelerationSource === 'device' ? 'measured' : 'derived');
  if (ascentPresent) push('burnout', burnoutIdx, 'Burnout', accelerationSource === 'device' ? 'measured' : 'derived');
  push('apogee', apogeeIdx, 'Apogee', 'derived');
  push('main', mainIdx, 'Main deploy', 'derived');
  if (landingFound) push('landing', landingIdx, 'Landing', 'derived');

  // --- Mach & temperature ---------------------------------------------------
  const tempCh = getChannel(flight, 'temperature');
  const groundTemperature = tempCh && padDataLikely ? mean(tempCh.values, 0, baseN) : null;
  const tempK = (groundTemperature ?? 15) + 273.15;
  const speedOfSound = Math.sqrt(1.4 * 287.05 * tempK);
  const mach = Number.isFinite(maxVelocity) && maxVelocity > 0 ? maxVelocity / speedOfSound : null;

  const metrics: FlightMetrics = {
    apogeeAltitude: apogeeAlt,
    timeToApogee: liftoffFound ? apogeeTime - liftoffTime : NaN,
    maxVelocity,
    maxVelocitySource: velocitySource,
    mach,
    maxAcceleration,
    maxDeceleration,
    accelerationSource,
    burnTime: burnoutIdx !== null && liftoffFound ? time[burnoutIdx] - liftoffTime : null,
    burnoutAltitude: burnoutIdx !== null ? altClean[burnoutIdx] : null,
    burnoutVelocity: burnoutIdx !== null ? velocity[burnoutIdx] : null,
    coastTime: burnoutIdx !== null ? apogeeTime - time[burnoutIdx] : null,
    drogueDescentRate,
    mainDescentRate,
    descentTime: landingFound ? landingTime - apogeeTime : null,
    flightTime: liftoffFound && landingFound ? landingTime - liftoffTime : null,
    groundTemperature,
  };

  if (velocitySource === 'baro' && accelerationSource === 'baro') {
    warnings.push(
      'Velocity and acceleration were derived from altitude, so they are smoothed estimates rather than direct measurements.',
    );
  }
  if (sampleHz > 0 && sampleHz < 5 && velocitySource === 'baro') {
    warnings.push(
      `The log samples at about ${sampleHz.toFixed(1)} Hz, which is coarse for a derived velocity — fast events may be softened.`,
    );
  }

  return { series, events, metrics, warnings };
}
