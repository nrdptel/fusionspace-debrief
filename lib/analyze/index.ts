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
  peakAbsInWindow,
  longestRunNear,
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

function median(values: Float64Array, from: number, to: number): number {
  const arr: number[] = [];
  for (let i = from; i < to; i++) if (Number.isFinite(values[i])) arr.push(values[i]);
  if (arr.length === 0) return NaN;
  arr.sort((a, b) => a - b);
  return arr[arr.length >> 1];
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

// Standard-atmosphere constants (troposphere).
const R_AIR = 287.05; // specific gas constant for dry air, J/(kg·K)
const LAPSE = -0.0065; // temperature lapse rate, K/m
const G_STD = 9.80665; // m/s²
const ISA_SEA_LEVEL_PRESSURE = 101325; // Pa

/** Top of the troposphere (US Standard Atmosphere 1976, first layer boundary at
 *  11 km / 36,089 ft). Above it the constant-lapse model behind any barometric
 *  altitude — the logger's or ours — no longer holds and the reading under-reads,
 *  so a baro apogee this high is flagged as an approximate lower bound. */
const TROPOSPHERE_LIMIT_M = 11000;

/** Launch-pad ambient pressure (Pa) for the density model: the mean of any
 *  pressure channel over the quiet pad window, falling back to standard sea-level
 *  pressure when the logger records no pressure (so density is still defined). */
function padPressure(flight: RawFlight, baseEnd: number, padDataLikely: boolean): number {
  const presCh = getChannel(flight, 'pressure');
  if (presCh && padDataLikely) {
    const p = mean(presCh.values, 0, baseEnd);
    if (Number.isFinite(p) && p > 0) return p;
  }
  return ISA_SEA_LEVEL_PRESSURE;
}

/** Air density (kg/m³) at each AGL altitude from the standard-atmosphere lapse,
 *  anchored to the pad's own temperature and pressure rather than sea level — so
 *  a mile-high launch site reads its real (thinner) air. */
function standardAtmosphereDensity(altAgl: Float64Array, groundTempK: number, groundPressure: number): Float64Array {
  const rho0 = groundPressure / (R_AIR * groundTempK);
  // ρ/ρ0 = (T/T0)^(−g/(R·L) − 1), with T = T0 + L·h (h is AGL, T0 the pad temp).
  const exponent = -G_STD / (R_AIR * LAPSE) - 1;
  const out = new Float64Array(altAgl.length);
  for (let i = 0; i < altAgl.length; i++) {
    const h = altAgl[i];
    if (!Number.isFinite(h)) {
      out[i] = NaN;
      continue;
    }
    const tRatio = (groundTempK + LAPSE * h) / groundTempK;
    out[i] = tRatio > 0 ? rho0 * Math.pow(tRatio, exponent) : NaN;
  }
  return out;
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
  // A short window for the pad pressure reference — long enough to average sensor
  // noise, short enough not to swallow the launch on logs with little pre-roll.
  const baseShort = Math.max(3, Math.min(n, Math.round(0.3 / (dt || 0.1))));
  if (altCh) {
    altitude = altCh.values.slice();
  } else if (presCh) {
    const padPressure = median(presCh.values, 0, baseShort);
    altitude = altitudeFromPressure(presCh.values, padPressure);
    warnings.push('No altitude channel — altitude was derived from barometric pressure.');
  } else {
    throw new Error('This file has no altitude or pressure data to analyze.');
  }

  // Pad baseline from the quiet pre-launch window: the opening run of samples that
  // haven't yet climbed off the pad. This adapts to logs that start anywhere from
  // seconds before launch to right at it, instead of assuming a fixed 2 s of pad.
  const ref = altitude[0];
  const maxBase = Math.min(n, Math.round(3 / (dt || 0.1)));
  let baseEnd = 1;
  while (baseEnd < maxBase && Number.isFinite(altitude[baseEnd]) && Math.abs(altitude[baseEnd] - ref) < 6) {
    baseEnd++;
  }
  baseEnd = Math.max(3, baseEnd);
  const baseline = median(altitude, 0, baseEnd);
  const baseOffset = Number.isFinite(baseline) ? baseline : 0;
  for (let i = 0; i < n; i++) altitude[i] -= baseOffset;

  // If there's no real quiet window, the file probably starts mid-flight, so the
  // baseline (and anything measured against it) can't be fully trusted.
  const baselineNoise = stdev(altitude, 0, baseEnd);
  const minQuiet = Math.max(5, Math.round(0.4 / (dt || 0.1)));
  const padDataLikely = baseEnd >= minQuiet;
  if (!padDataLikely) {
    warnings.push(
      'The log doesn’t appear to start on the pad, so the ground baseline is approximate — altitude AGL and any ground reading may be offset.',
    );
  }

  // Keep the pre-filter altitude (baseline-subtracted, still carrying any
  // ejection spikes/noise) so the explorer can show it against the cleaned line.
  const altitudeRaw = altitude.slice();

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

  // A barometric vertical velocity, always. Device velocities are usually
  // accelerometer-integrated and drift toward zero after deployment, so descent
  // rates and landing are read from this baro velocity (reliable at low speed)
  // even when a device velocity is used for the ascent and max-velocity.
  const baroVel =
    velocitySource === 'baro'
      ? velocity
      : movingAverage(derivative(time, altSmooth), windowFor(dt, 0.1));

  // --- Acceleration ---------------------------------------------------------
  // GPS altitude is coarse, so velocity off it is already rough and acceleration —
  // a derivative of that derivative — is dominated by noise. Rather than present a
  // misleading figure, omit acceleration entirely for a GPS-only log.
  const altitudeSource: 'baro' | 'gps' = flight.meta.altitudeSource === 'gps' ? 'gps' : 'baro';
  let acceleration: Float64Array;
  let accelerationSource: 'device' | 'baro';
  const accCh = getChannel(flight, 'accelAxial') ?? getChannel(flight, 'accelTotal');
  if (altitudeSource === 'gps') {
    acceleration = new Float64Array(n).fill(NaN);
    accelerationSource = 'baro';
    warnings.push(
      'Altitude is from GPS, so velocity derived from it is approximate; acceleration would be a second derivative of coarse GPS data and isn’t meaningful, so it’s omitted.',
    );
  } else if (accCh) {
    acceleration = accCh.values.slice();
    accelerationSource = 'device';
  } else {
    acceleration = movingAverage(derivative(time, velocity), windowFor(dt, 0.1));
    accelerationSource = 'baro';
  }

  // --- Atmosphere (Mach & dynamic pressure) ---------------------------------
  // Speed of sound from the ground temperature (a standard 15 °C day when the
  // logger didn't record one), and air density from a standard-atmosphere lapse
  // anchored to the pad's own conditions — so a high-desert launch isn't read as
  // sea level. These drive the Mach and dynamic-pressure channels in the explorer.
  const tempCh = getChannel(flight, 'temperature');
  const groundTemperature = tempCh && padDataLikely ? mean(tempCh.values, 0, baseEnd) : null;
  const groundTempK = (groundTemperature ?? 15) + 273.15;
  const speedOfSound = Math.sqrt(1.4 * 287.05 * groundTempK);
  const airDensity = standardAtmosphereDensity(altClean, groundTempK, padPressure(flight, baseEnd, padDataLikely));

  const series: FlightSeries = {
    time,
    altitude: altClean,
    altitudeRaw,
    velocity,
    acceleration,
    velocitySource,
    accelerationSource,
    altitudeSource,
    speedOfSound,
    airDensity,
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
    // Only look for the ignition spike near the pad. A logger with per-axis
    // channels (accel_x/y/z) can throw a lateral >2 g blip at ejection near
    // apogee; without this ceiling the search would pin liftoff there — a
    // couple of hundred metres up and a fraction of a second before apogee.
    const padCeiling = Math.max(baselineNoise * 5, apogeeAlt * 0.5);
    for (let i = 0; i < apogeeIdx; i++) {
      if (altClean[i] > padCeiling) break;
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
  let accelClipped = false;
  if (ascentPresent) {
    maxVelIdx = argMax(velocity, liftoffRef, apogeeIdx + 1);
    maxVelocity = maxVelIdx >= 0 ? velocity[maxVelIdx] : NaN;
    const maxAccIdx = argMax(acceleration, liftoffRef, apogeeIdx + 1);
    maxAcceleration = maxAccIdx >= 0 ? acceleration[maxAccIdx] : NaN;
    const maxDecIdx = argMin(acceleration, liftoffRef, apogeeIdx + 1);
    maxDeceleration = maxDecIdx >= 0 ? acceleration[maxDecIdx] : NaN;

    // Saturation: a device accelerometer that hit its full-scale limit reads a
    // flat top at its peak. A real boost rounds over its maximum (mass falls
    // through the burn, so net accel is never held dead flat), so a sustained
    // plateau right at the peak means the sensor railed — the reported max is a
    // floor, not the truth. Only meaningful for a measured (device) trace whose
    // peak is a plausible boost acceleration: a flown rocket pulls more than 1 g,
    // and no full-scale limit rails at a fraction of gravity, so a near-zero
    // "peak" is a quiet or lateral channel (a multi-axis logger's off-axis
    // component), not a railed one — don't cry saturation over it.
    if (accelerationSource === 'device' && Number.isFinite(maxAcceleration) && maxAcceleration > G0) {
      const eps = Math.max(maxAcceleration * 0.003, 0.25); // m/s² — a tight band at the rail
      const minRun = Math.max(4, Math.round(0.05 / (dt || 0.1)));
      accelClipped = longestRunNear(acceleration, liftoffRef, apogeeIdx + 1, maxAcceleration, eps) >= minRun;
    }
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
  // Landing: altitude has come back near the pad and stays there — judged on
  // altitude (stable and low) rather than velocity, which is noisy at rest.
  let landingIdx = n - 1;
  const settleWin = Math.max(3, Math.round(1 / (dt || 0.1)));
  for (let i = apogeeIdx; i < n; i++) {
    if (altClean[i] < 2) {
      let stayed = true;
      const end = Math.min(n, i + settleWin);
      for (let j = i; j < end; j++) {
        if (altClean[j] > 5) {
          stayed = false;
          break;
        }
      }
      if (stayed) {
        landingIdx = i;
        break;
      }
    }
  }
  const landingTime = time[landingIdx];
  const landingFound = landingIdx < n - 1 || altClean[n - 1] < 5;
  if (apogeeIdx >= n - 2) {
    warnings.push('The log appears to end at or before apogee — descent numbers may be missing.');
  }

  // --- Deployments & descent rates -----------------------------------------
  // Descent speed (positive downward) from the baro velocity, lightly smoothed.
  const descent = movingAverage(
    Float64Array.from(baroVel, (v) => -v),
    windowFor(dt, 0.6),
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

  // Main deployment, found from landing backwards: the main chute's terminal is
  // the steady descent just before touchdown, so we walk back from landing while
  // the descent stays near that terminal — the point where it was last clearly
  // faster is the main deploy. This is robust to a non-monotonic drogue descent
  // (a real flight can have a slow patch up high that a "biggest drop" detector
  // mistakes for the main). A single-deploy descent has one steady rate, so the
  // drogue-was-faster check fails and no main is marked.
  const guard = Math.max(2, Math.round(0.5 / (descentDt || 0.1)));
  let mainIdx: number | null = null;
  if (landingIdx > apogeeIdx + 4 * guard) {
    const tail = Math.max(3, Math.round(2 / (descentDt || 0.1)));
    const lo = Math.max(apogeeIdx + 1, landingIdx - tail);
    const mainTerminal = median(descent, lo, Math.max(lo + 1, landingIdx - (guard >> 1)));
    if (Number.isFinite(mainTerminal) && mainTerminal > 1) {
      const tol = Math.max(mainTerminal * 1.6, mainTerminal + 3);
      let i = landingIdx - 1;
      while (i > apogeeIdx && descent[i] <= tol) i--;
      const candidate = i + 1;
      const drogueMed = median(descent, apogeeIdx + 1, candidate);
      if (
        candidate > apogeeIdx + guard &&
        candidate < landingIdx - 1 &&
        Number.isFinite(drogueMed) &&
        drogueMed > mainTerminal * 1.4
      ) {
        mainIdx = candidate;
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
  // Deployment shock: the peak acceleration the airframe felt as a charge fired
  // and the recovery gear snapped taut — the snatch force that breaks shock cords
  // and zippers tubes. Read straight from the accelerometer in a short window at
  // the apogee charge and the main deploy; only meaningful when the logger
  // recorded acceleration (a coarse sample rate undersamples the spike, so treat
  // it as a floor). Events that aren't deployments don't carry it.
  const shockHalf = Math.max(2, Math.round(0.3 / (dt || 0.1)));
  const shockAt = (idx: number | null): number | undefined => {
    if (idx === null || accelerationSource !== 'device') return undefined;
    const peak = peakAbsInWindow(acceleration, idx, shockHalf);
    return Number.isFinite(peak) ? peak : undefined;
  };

  const events: FlightEvent[] = [];
  const push = (type: FlightEvent['type'], idx: number | null, label: string, provenance: FlightEvent['provenance']) => {
    if (idx === null || idx < 0 || idx >= n) return;
    const peakAccel = type === 'apogee' || type === 'main' ? shockAt(idx) : undefined;
    events.push({ type, label, time: time[idx], index: idx, altitude: altClean[idx], provenance, peakAccel });
  };
  if (liftoffFound) push('liftoff', liftoffIdx, 'Liftoff', accelerationSource === 'device' ? 'measured' : 'derived');
  if (ascentPresent) push('burnout', burnoutIdx, 'Burnout', accelerationSource === 'device' ? 'measured' : 'derived');
  push('apogee', apogeeIdx, 'Apogee', 'derived');
  push('main', mainIdx, 'Main deploy', 'derived');
  if (landingFound) push('landing', landingIdx, 'Landing', 'derived');

  // --- Mach & max-Q ---------------------------------------------------------
  // (Speed of sound, ground temperature and air density were computed with the
  // atmosphere above.)
  const mach = Number.isFinite(maxVelocity) && maxVelocity > 0 ? maxVelocity / speedOfSound : null;
  // Peak dynamic pressure (½ρv²) over the flight — the structural load case — and
  // the altitude it happened at (a real design point).
  let maxDynamicPressure: number | null = null;
  let maxQIdx = -1;
  for (let i = 0; i < n; i++) {
    const v = velocity[i];
    const rho = airDensity[i];
    if (!Number.isFinite(v) || !Number.isFinite(rho)) continue;
    const q = 0.5 * rho * v * v;
    if (maxDynamicPressure === null || q > maxDynamicPressure) {
      maxDynamicPressure = q;
      maxQIdx = i;
    }
  }
  const maxDynamicPressureAltitude = maxQIdx >= 0 ? altClean[maxQIdx] : null;
  const maxVelocityAltitude = maxVelIdx >= 0 ? altClean[maxVelIdx] : NaN;

  // Transonic crossing: the first ascent sample at or past Mach 1 — both an
  // engineering point (the transonic region) and a bragging right.
  let transonicTime: number | null = null;
  let transonicAltitude: number | null = null;
  if (mach !== null && mach >= 1 && speedOfSound > 0) {
    const end = ascentPresent ? apogeeIdx + 1 : n;
    for (let i = liftoffRef; i < end; i++) {
      if (Number.isFinite(velocity[i]) && velocity[i] / speedOfSound >= 1) {
        transonicTime = liftoffFound ? time[i] - liftoffTime : time[i];
        transonicAltitude = altClean[i];
        break;
      }
    }
  }

  // --- Battery (when the logger recorded it) -------------------------------
  // Resting voltage at the start and the lowest it sagged to. A pack that droops
  // under the deployment-charge current draw can fail to fire — a frequent cause
  // of a "no recovery" flight — so the drop is worth surfacing. No judgement; just
  // the two numbers.
  let batteryStartV: number | null = null;
  let batteryMinV: number | null = null;
  const voltCh = getChannel(flight, 'voltage');
  if (voltCh) {
    const start = median(voltCh.values, 0, baseEnd);
    let lo = Infinity;
    for (let i = 0; i < voltCh.values.length; i++) {
      const v = voltCh.values[i];
      if (Number.isFinite(v) && v > 0 && v < lo) lo = v;
    }
    if (Number.isFinite(start) && start > 0) batteryStartV = start;
    if (lo !== Infinity) batteryMinV = lo;
  }

  // --- Thrust-to-weight off the pad ----------------------------------------
  // At liftoff the accelerometer's specific force (in g) is the thrust-to-weight
  // ratio — drag is negligible at low speed, so accel/g ≈ T/W. The 5:1 rule of
  // thumb is the rail-departure safety check. Measured trace only, averaged over a
  // short window off the pad (capped at burnout for a very short motor), and
  // withheld if that window was saturated — a railed reading understates the true
  // thrust, so it's better to show nothing than a floor.
  let liftoffTWR: number | null = null;
  if (ascentPresent && liftoffFound && accelerationSource === 'device') {
    const w = Math.max(2, Math.round(0.2 / (dt || 0.1)));
    const hi = Math.min(n, liftoffRef + w, burnoutIdx ?? n);
    const m = hi > liftoffRef + 1 ? mean(acceleration, liftoffRef, hi) : NaN;
    if (Number.isFinite(m) && m > 0 && !(accelClipped && m >= 0.97 * maxAcceleration)) {
      liftoffTWR = m / G0;
    }
  }

  // --- Coast efficiency / drag loss ----------------------------------------
  // After burnout the rocket coasts on what it has; with no drag it would convert
  // its burnout kinetic energy straight to height (v²/2g above burnout). Comparing
  // that vacuum coast to the height actually gained reads off what drag cost — pure
  // energy conservation on the flown numbers, no aerodynamic model. Skipped when
  // the velocity is too soft to trust (an underestimate makes the "actual" exceed
  // the vacuum coast, which is unphysical) or there's no real coast.
  let coastEfficiency: number | null = null;
  let dragLossAltitude: number | null = null;
  if (burnoutIdx !== null) {
    const vBo = velocity[burnoutIdx];
    const vacuumGain = Number.isFinite(vBo) ? (vBo * vBo) / (2 * G0) : NaN;
    const actualGain = apogeeAlt - altClean[burnoutIdx];
    if (vBo > 20 && vacuumGain > 0 && actualGain > 0 && actualGain <= vacuumGain * 1.05) {
      coastEfficiency = Math.min(1, actualGain / vacuumGain);
      dragLossAltitude = Math.max(0, vacuumGain - actualGain);
    }
  }

  // --- Roll / spin (when the logger recorded a roll-rate channel) ----------
  // Peak rate about the long axis (deg/s), and the total revolutions the airframe
  // turned through — the integral of |rate| over time / 360, so a spin in either
  // direction counts. A reading of the flown flight; fin misalignment shows here.
  let peakRollRate: number | null = null;
  let rollRevolutions: number | null = null;
  const rollCh = getChannel(flight, 'rollRate');
  if (rollCh) {
    let peak = 0;
    let degrees = 0;
    for (let i = 0; i < rollCh.values.length; i++) {
      const r = rollCh.values[i];
      if (!Number.isFinite(r)) continue;
      const a = Math.abs(r);
      if (a > peak) peak = a;
      // Trapezoidal integral of |rate| over each step (deg/s · s = deg).
      if (i > 0) {
        const prev = rollCh.values[i - 1];
        const dt = time[i] - time[i - 1];
        if (Number.isFinite(prev) && dt > 0) degrees += ((a + Math.abs(prev)) / 2) * dt;
      }
    }
    if (peak > 0) {
      peakRollRate = peak;
      rollRevolutions = degrees / 360;
    }
  }

  const metrics: FlightMetrics = {
    apogeeAltitude: apogeeAlt,
    timeToApogee: liftoffFound ? apogeeTime - liftoffTime : NaN,
    maxVelocity,
    maxVelocitySource: velocitySource,
    maxVelocityAltitude,
    mach,
    maxDynamicPressure,
    maxDynamicPressureAltitude,
    transonicTime,
    transonicAltitude,
    maxAcceleration,
    avgBoostAcceleration:
      ascentPresent && burnoutIdx !== null
        ? (() => {
            const m = mean(acceleration, liftoffRef, burnoutIdx + 1);
            return Number.isFinite(m) ? m : null;
          })()
        : null,
    maxDeceleration,
    accelerationSource,
    accelClipped,
    liftoffTWR,
    burnTime: burnoutIdx !== null && liftoffFound ? time[burnoutIdx] - liftoffTime : null,
    burnoutAltitude: burnoutIdx !== null ? altClean[burnoutIdx] : null,
    burnoutVelocity: burnoutIdx !== null ? velocity[burnoutIdx] : null,
    coastTime: burnoutIdx !== null ? apogeeTime - time[burnoutIdx] : null,
    coastEfficiency,
    dragLossAltitude,
    drogueDescentRate,
    mainDescentRate,
    descentTime: landingFound ? landingTime - apogeeTime : null,
    flightTime: liftoffFound && landingFound ? landingTime - liftoffTime : null,
    groundTemperature,
    batteryStartV,
    batteryMinV,
    peakRollRate,
    rollRevolutions,
  };

  if (accelClipped) {
    warnings.push(
      `The accelerometer reads a flat top at its peak (about ${(maxAcceleration / G0).toFixed(0)} g) — the signature of a sensor that hit its full-scale limit and saturated, so the true maximum could be higher.`,
    );
  }
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
  if (altitudeSource === 'baro' && Number.isFinite(apogeeAlt) && apogeeAlt > TROPOSPHERE_LIMIT_M) {
    warnings.push(
      'Apogee is above ~36,000 ft (11 km), the top of the troposphere, where the standard-atmosphere model behind a barometric altitude breaks down — a pressure-derived reading increasingly under-reads that high, so treat this apogee as an approximate lower bound rather than an exact figure. A GPS or inertial altitude, if the flight logged one, is more trustworthy up here.',
    );
  }

  return { series, events, metrics, warnings };
}
