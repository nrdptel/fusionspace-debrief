// The analysis pipeline. Given a canonical flight, it establishes a ground
// baseline, finds the flight events, and reads off the headline numbers — doing
// its best with whatever channels the logger recorded, and noting where it had
// to estimate or couldn't be sure. See docs/plan.md for the reasoning behind each
// step, and the in-app "Where the numbers come from" section for the user-facing
// version.

import type { RawFlight, Channel } from '../flight/types';
import { getChannel } from '../flight/types';
import { G0 } from '../units';
import type { FlightAnalysis, FlightEvent, FlightMetrics, FlightSeries } from './types';
import {
  medianFilter,
  hampelFilter,
  movingAverage,
  derivative,
  medianDt,
  finiteDifferenceMatch,
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

/** The axial-acceleration channel to analyze. A single-axis logger has one, and
 *  that's it. A multi-axis logger (accel_x/y/z body axes) maps them all to
 *  accelAxial, and which one is "axial" depends on how the airframe sat in the
 *  bay — so pick the axis that saw the largest acceleration excursion, which the
 *  thrust axis dominates during boost. Without this the first column wins, and a
 *  quiet lateral axis can stand in for the real one (a ~0 g "max acceleration"). */
function pickAxialChannel(flight: RawFlight): Channel | undefined {
  const axial = flight.channels.filter((c) => c.kind === 'accelAxial');
  if (axial.length <= 1) return axial[0];
  let best = axial[0];
  let bestPeak = -Infinity;
  for (const ch of axial) {
    let peak = 0;
    for (const v of ch.values) if (Number.isFinite(v) && Math.abs(v) > peak) peak = Math.abs(v);
    if (peak > bestPeak) {
      bestPeak = peak;
      best = ch;
    }
  }
  return best;
}

/** For a multi-axis body logger, the honest peak-acceleration figure is the
 *  resultant magnitude |a| = √(Σ aₖ²) of the recorded axes — which is what the
 *  device's own "max acceleration" reports, and which a single body axis under-
 *  reads (a rocket that pulls 31 g total reads ~15 g on the axis nearest thrust
 *  when it isn't perfectly aligned). Returns the per-sample resultant when the
 *  logger gave two or more axial channels, else null (one channel already IS the
 *  axial acceleration, so nothing changes for a single-axis logger). */
function axialResultant(flight: RawFlight): Float64Array | null {
  const axial = flight.channels.filter((c) => c.kind === 'accelAxial');
  if (axial.length < 2) return null;
  const n = flight.time.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sq = 0;
    let any = false;
    for (const c of axial) {
      const v = c.values[i];
      if (Number.isFinite(v)) {
        sq += v * v;
        any = true;
      }
    }
    out[i] = any ? Math.sqrt(sq) : NaN;
  }
  return out;
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

/** A hard ceiling on a plausible flight velocity (m/s). The fastest amateur rockets
 *  — record space shots — reach ~Mach 6 (~2 km/s); this sits at roughly twice that, so
 *  a peak above it is not a rocket at all but a mis-scaled or misidentified velocity
 *  column, or corrupt data. Debrief withholds such a reading rather than report an
 *  impossible headline. */
const IMPLAUSIBLE_VELOCITY = 4000;

/** How far a velocity trace may dip below zero on the way up — as a fraction of its own
 *  ascent peak — before the trace is read as noise rather than speed. Physics puts the
 *  true figure at zero: a climbing, accelerating rocket has no negative vertical
 *  velocity. Across the corpus every flight whose ascent trace is a real velocity reads
 *  exactly 0.00 here; the only exceptions are one flight's two barometric recordings of
 *  a tumbling booster (0.33 and 0.45) and two already-documented anomalies (0.80, 1.62).
 *  A fifth of the peak sits a wide margin above the honest readings and well below every
 *  noise-dominated one, and it tolerates the small dip a real trace can show right at a
 *  liftoff detected a sample early. */
const ASCENT_NOISE_FRACTION = 0.2;

/** The range of ambient air temperatures (°C) a rocket is actually launched into on
 *  Earth's surface — from a bitter high-altitude winter pad to the hottest desert
 *  playa, with generous margin. A pad reading outside this isn't a credible ambient
 *  temperature but a mis-scaled column (e.g. a "bmp_temp(x100)" field read as whole
 *  degrees), a misdetected channel, or raw sensor counts. Rather than let it drive a
 *  3×-wrong speed of sound — and air density, and every Mach number off them — Debrief
 *  discards it and falls back to the standard day, exactly as a flight with no
 *  temperature channel does. */
const MIN_AMBIENT_C = -90;
const MAX_AMBIENT_C = 65;

/** The Mach at and above which a barometric speed stops being a reading of the speed at
 *  all. Approaching Mach 1 the airflow over the static port goes locally supersonic and a
 *  shock sits on it, so the sensed pressure — and the speed and Mach derived from it —
 *  is distorted right where the reading matters most, and the error runs BOTH ways. Two
 *  corpus flights, each with an accelerometer- or inertial-equipped partner recording the
 *  same flight, bracket it: one baro trace read Mach 1.19 where its partner measured 0.93,
 *  and another read Mach 2.64 where its partner measured 1.22. So there is no band above
 *  which a baro peak becomes trustworthy again — every baro peak from here up is flagged
 *  (not withheld: it is still the flyer's own record) and never counted as proof the
 *  rocket went supersonic. Below it there's no shock to distort the reading. */
const TRANSONIC_BARO_LOW = 0.9;

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

/** Speed of sound (m/s) at each AGL altitude: a = √(γ·R·T), with the air temperature
 *  falling on the same standard-atmosphere lapse the density uses, anchored to the pad —
 *  so Mach is read against the colder, slower air the rocket was actually in, not the
 *  ground value (a peak at a few thousand feet reads ~1–2 % higher Mach; the gap grows
 *  with height). The temperature stops falling at the tropopause (≈11 km), where the
 *  standard atmosphere goes isothermal, so a very high flight doesn't over-cool. */
function speedOfSoundProfile(altAgl: Float64Array, groundTempK: number): Float64Array {
  const out = new Float64Array(altAgl.length);
  for (let i = 0; i < altAgl.length; i++) {
    const h = altAgl[i];
    if (!Number.isFinite(h)) {
      out[i] = NaN;
      continue;
    }
    const t = groundTempK + LAPSE * Math.min(h, TROPOSPHERE_LIMIT_M);
    out[i] = t > 0 ? Math.sqrt(1.4 * R_AIR * t) : NaN;
  }
  return out;
}

/**
 * Where a second flight begins in a record that holds more than one, or null for the
 * normal single-flight file. The test is a thing a rocket cannot do: come back to the
 * ground and then climb again. So look for the ground return that follows the first real
 * climb, and a later climb back to a substantial height — both measured as fractions of
 * the record's own peak, so it works the same on a 600 ft sport flight and a 27,000 ft
 * one, and sits far above any noise near the pad.
 *
 * A Blue Raven backup file in the corpus holds one flight recorded twice: it climbs to
 * 10,230 ft by 18 s, drops to 0, then climbs to 10,266 ft again. Read as one flight its
 * apogee lands in the second copy while liftoff sits in the first, so time-to-apogee came
 * out 39.6 s where the GPS recording the same flight puts apogee 19.3 s after liftoff.
 */
function nextFlightStart(altitude: Float64Array): number | null {
  const n = altitude.length;
  let peak = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(altitude[i]) && altitude[i] > peak) peak = altitude[i];
  if (!(peak > 0)) return null;
  const high = peak * 0.5; // "really flew" — half the record's own best
  const ground = Math.max(3, peak * 0.05); // back on the deck
  let flew = false; // has the record climbed high yet?
  let landed = -1; // …and come back down
  for (let i = 0; i < n; i++) {
    const h = altitude[i];
    if (!Number.isFinite(h)) continue;
    if (landed < 0) {
      // A dip to the ground before anything climbed (a GPS losing lock through the
      // boost reads zero) is not a landing, so `flew` has to come first.
      if (h >= high) flew = true;
      else if (flew && h <= ground) landed = i;
    } else if (h >= high) {
      // Up again after coming down: another flight is in this file. Too short a first
      // segment to analyze is better read whole than truncated to nothing.
      return landed >= 4 ? landed : null;
    }
  }
  return null;
}

/** The flight up to `end` (exclusive): the time base and every channel, sliced together
 *  so the model stays consistent. */
function sliceFlight(flight: RawFlight, end: number): RawFlight {
  return {
    ...flight,
    time: flight.time.slice(0, end),
    channels: flight.channels.map((c) => ({ ...c, values: c.values.slice(0, end) })),
  };
}

function formatSeconds(s: number): string {
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

export function analyzeFlight(flight: RawFlight, depth = 0): FlightAnalysis {
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

  // One file can hold more than one flight — a logger downloaded twice, or a day's
  // flights in one dump. Read as a single flight the record is nonsense: the global peak
  // belongs to a later flight while liftoff belongs to the first, so time-to-apogee
  // spans both. Analyze the first flight and say so.
  const secondFlightAt = nextFlightStart(altitude);
  if (secondFlightAt != null && depth === 0) {
    const first = analyzeFlight(sliceFlight(flight, secondFlightAt), 1);
    return {
      ...first,
      warnings: [
        `This file holds more than one flight — the record returns to the ground and climbs again. Debrief analyzed the first (the opening ${formatSeconds(time[secondFlightAt] - time[0])} of the file) and ignored the rest; read the others by splitting the file, or export them separately from your altimeter's software.`,
        ...first.warnings,
      ],
    };
  }

  // Keep the pre-filter altitude (baseline-subtracted, still carrying any
  // ejection spikes/noise) so the explorer can show it against the cleaned line.
  const altitudeRaw = altitude.slice();

  // Spike-resistant altitude: a Hampel filter removes the multi-sample jumps an
  // ejection charge punches into a baro trace, without rounding the true peak.
  const altClean = hampelFilter(altitude, windowFor(dt, 0.3));
  const altSmooth = movingAverage(medianFilter(altClean, windowFor(dt, 0.1)), windowFor(dt, 0.1));

  // The apogee sample (peak altitude) — needed early to identify the ascent for the
  // axial-sign check below; recomputed canonically once the series is built.
  const apogeeIdxForSign = Math.max(0, argMax(altClean));

  // --- Velocity -------------------------------------------------------------
  let velocity: Float64Array;
  let velocitySource: 'device' | 'baro';
  const velCh = getChannel(flight, 'velocity');
  // A "velocity" column that IS this file's own altitude column differenced sample
  // to sample is not a second, independent reading — it's the logger's naive
  // derivative, and it carries the whole quantization noise of a coarse baro. Its
  // peak is that noise, not a speed: an Eggtimer Proton export of a Mach 1.3 flight
  // states 4880 ft/s (Mach 4.4) one sample after 4020 ft/s, off an altitude trace
  // stepping 200 ft per 0.05 s. So re-derive it exactly as a baro-only flight is
  // handled — smoothed for the real sample rate — which also earns the flight every
  // derived-velocity caveat downstream.
  const deviceVelocityIsAltDiff =
    !!velCh && finiteDifferenceMatch(time, velCh.values, altitudeRaw) >= 0.8;
  if (velCh && !deviceVelocityIsAltDiff) {
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
  // `acceleration` is the magnitude read that drives the peak, the chart, clip
  // detection, deployment shock, thrust-to-weight and the boost average. For a
  // multi-axis logger that's the resultant of the axes (the true |a| the airframe
  // felt); for a single-axis or baro-derived flight it's the one signed trace.
  // `signedAccel` stays a signed axial trace for the two readings that need a
  // sign — the most-negative deceleration and the burnout zero-crossing.
  let acceleration: Float64Array;
  let signedAccel: Float64Array;
  let accelerationSource: 'device' | 'baro';
  let accelerationResultant = false;
  const accCh = pickAxialChannel(flight) ?? getChannel(flight, 'accelTotal');
  const resultant = axialResultant(flight);
  if (altitudeSource === 'gps') {
    acceleration = new Float64Array(n).fill(NaN);
    signedAccel = acceleration;
    accelerationSource = 'baro';
    warnings.push(
      'Altitude is from GPS, so velocity derived from it is approximate; acceleration would be a second derivative of coarse GPS data and isn’t meaningful, so it’s omitted.',
    );
  } else if (accCh) {
    signedAccel = accCh.values.slice();
    // Normalize the axial sign convention. A single-axis accelerometer can be mounted
    // pointing aft, so it logs boost as a large NEGATIVE specific force (e.g. a common
    // hobby "Acc (g)" export reads −26 g through the burn). Every downstream reading —
    // the liftoff ignition spike, max acceleration, the burnout sign-change, the coast
    // deceleration — assumes boost is positive, so if the ascent's dominant excursion is
    // negative, flip the trace. The largest |a| before apogee is the boost (deployment
    // shocks come at/after apogee), so its sign identifies the convention.
    let ext = 0;
    for (let i = 0; i <= apogeeIdxForSign && i < signedAccel.length; i++) {
      const v = signedAccel[i];
      if (Number.isFinite(v) && Math.abs(v) > Math.abs(ext)) ext = v;
    }
    if (ext < 0) for (let i = 0; i < signedAccel.length; i++) signedAccel[i] = -signedAccel[i];
    if (resultant) {
      acceleration = resultant; // ≥2 body axes → report the resultant magnitude
      accelerationResultant = true;
    } else {
      acceleration = signedAccel;
    }
    accelerationSource = 'device';
  } else {
    acceleration = movingAverage(derivative(time, velocity), windowFor(dt, 0.1));
    signedAccel = acceleration;
    accelerationSource = 'baro';
  }

  // --- Atmosphere (Mach & dynamic pressure) ---------------------------------
  // Speed of sound from the ground temperature (a standard 15 °C day when the
  // logger didn't record one), and air density from a standard-atmosphere lapse
  // anchored to the pad's own conditions — so a high-desert launch isn't read as
  // sea level. These drive the Mach and dynamic-pressure channels in the explorer.
  const tempCh = getChannel(flight, 'temperature');
  const rawGroundTemperature = tempCh && padDataLikely ? mean(tempCh.values, 0, baseEnd) : null;
  // Only trust a physically credible ambient reading; otherwise treat it as no
  // temperature at all so Mach, air density and the reported ground temperature
  // all fall back to the standard day rather than propagate a garbage value.
  const groundTemperature =
    rawGroundTemperature != null && rawGroundTemperature >= MIN_AMBIENT_C && rawGroundTemperature <= MAX_AMBIENT_C
      ? rawGroundTemperature
      : null;
  const groundTempK = (groundTemperature ?? 15) + 273.15;
  const speedOfSound = Math.sqrt(1.4 * 287.05 * groundTempK); // ground value (near-pad reads, e.g. rail exit)
  const sosProfile = speedOfSoundProfile(altClean, groundTempK); // altitude-varying, for Mach
  const airDensity = standardAtmosphereDensity(altClean, groundTempK, padPressure(flight, baseEnd, padDataLikely));

  const series: FlightSeries = {
    time,
    altitude: altClean,
    altitudeRaw,
    velocity,
    acceleration,
    axialAccel: signedAccel,
    velocitySource,
    accelerationSource,
    accelerationResultant,
    altitudeSource,
    speedOfSound,
    speedOfSoundProfile: sosProfile,
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

  // A large gap in the sampled ascent makes a baro-DERIVED velocity peak
  // undeterminable: the true top speed may fall in the unrecorded stretch, and the
  // smoothed derivative across the gap spikes to a nonsense speed (a gappy GPS log
  // reading Mach 5 over a 3 km apogee). Where that happens, the ascent-velocity peaks
  // are withheld below rather than fabricated. A device-logged velocity isn't
  // differentiated, so it's immune; a gap in the descent leaves the ascent intact.
  let ascentGapBreaksPeak = false;
  if (velocitySource === 'baro') {
    for (let i = Math.max(1, liftoffRef); i <= apogeeIdx && i < n; i++) {
      const g = time[i] - time[i - 1];
      if (Number.isFinite(g) && g > 1.5 && dt > 0 && g > 5 * dt) {
        ascentGapBreaksPeak = true;
        break;
      }
    }
  }

  // --- Max velocity / acceleration (ascent) --------------------------------
  let maxVelocity = NaN;
  let maxAcceleration = NaN;
  let maxDeceleration = NaN;
  let maxVelIdx = -1;
  let accelClipped = false;
  if (ascentPresent && !ascentGapBreaksPeak) {
    maxVelIdx = argMax(velocity, liftoffRef, apogeeIdx + 1);
    maxVelocity = maxVelIdx >= 0 ? velocity[maxVelIdx] : NaN;
    const maxAccIdx = argMax(acceleration, liftoffRef, apogeeIdx + 1);
    maxAcceleration = maxAccIdx >= 0 ? acceleration[maxAccIdx] : NaN;
    // Deceleration is signed — read the most-negative axial value, not the
    // (always-positive) resultant magnitude. A deceleration is a NEGATIVE reading;
    // a boost-only capture (the log ends under thrust, before any coast) has no
    // negative value in the window, so argMin returns the smallest positive boost
    // reading — report no deceleration rather than a positive "deceleration".
    const maxDecIdx = argMin(signedAccel, liftoffRef, apogeeIdx + 1);
    maxDeceleration = maxDecIdx >= 0 && signedAccel[maxDecIdx] < 0 ? signedAccel[maxDecIdx] : NaN;

    // A baro-derived acceleration is the second derivative of a coarse, quantised
    // altitude, so its PEAK is dominated by differentiation noise — a single 1 m/1 ft
    // altitude step at 20 Hz throws hundreds of m/s² into one sample. The result is not
    // an honest peak (real corpus baro flights spike to hundreds, even tens of thousands,
    // of g), so the max/min acceleration is withheld when there's no accelerometer. The
    // acceleration curve itself is still shown as a derived estimate; only the headline
    // peak — which a barometer genuinely can't resolve — is not reported.
    if (accelerationSource === 'baro') {
      maxAcceleration = NaN;
      maxDeceleration = NaN;
    }

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

  // A velocity beyond any rocket — a mis-scaled or misidentified velocity column (a
  // generic export whose "velocity" is a raw sensor count), or corrupt data — must never
  // become a headline. A peak past the hard physical ceiling is withheld, along with every
  // figure derived from it (Mach, max-Q, the transonic crossing, burnout velocity, coast
  // efficiency), rather than reported as an impossible number; the warning below says why.
  // The flag is read where each of those is computed below.
  // A velocity trace that dips well below zero on the way UP is not a velocity at all.
  // Between liftoff and its own peak the rocket is climbing and speeding up, so the
  // vertical velocity there is positive by definition; a strongly negative reading is
  // noise, and the positive peak beside it is made of the same noise. This is what a
  // barometer sees on a booster tumbling after separation: two StratoLoggers recording
  // one such flight agree on apogee to the foot (1,526 ft each) while their velocity
  // traces swing to −492 and −246 ft/s on the way up and peak at 1,500 and 540 — so the
  // honest reading is that neither recording resolves the speed, not that one of them
  // does. Withheld like any other unusable velocity rather than picked between.
  let velocityNoiseDominated = false;
  if (liftoffFound && maxVelIdx >= 0 && Number.isFinite(maxVelocity) && maxVelocity > 0) {
    let worst = 0;
    for (let i = liftoffRef; i <= maxVelIdx; i++) {
      if (Number.isFinite(velocity[i]) && velocity[i] < worst) worst = velocity[i];
    }
    velocityNoiseDominated = -worst / maxVelocity > ASCENT_NOISE_FRACTION;
  }

  let velocityImplausible = false;
  if (Number.isFinite(maxVelocity) && (maxVelocity > IMPLAUSIBLE_VELOCITY || velocityNoiseDominated)) {
    velocityImplausible = true;
    maxVelocity = NaN;
    maxVelIdx = -1;
  }
  // Let the explorer and the comparison overlay see the same judgement, so they can
  // withhold the Mach and dynamic-pressure curves derived from an impossible velocity.
  series.velocityImplausible = velocityImplausible;

  // --- Burnout --------------------------------------------------------------
  // With accel: thrust end — acceleration first falls through zero after the
  // boost peak. Baro-only: velocity peaks at burnout. Either way, reject a
  // "burnout" that lands on apogee (a coast-dominated read with no real boost).
  let burnoutIdx: number | null = null;
  if (ascentPresent && accelerationSource === 'device' && !accelerationResultant) {
    // Burnout is a sign change on the axial trace (thrust → drag), so read the
    // signed axis: the resultant magnitude never falls through zero. Only usable
    // for a genuine signed axial channel — a multi-axis logger's noisy body axis
    // can stay positive past burnout and cross zero only at ejection, so those
    // fall through to the velocity-peak proxy below.
    const peak = argMax(signedAccel, liftoffRef, apogeeIdx + 1);
    for (let i = peak; i < apogeeIdx; i++) {
      if (signedAccel[i] <= 0) {
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

  // A descent rate needs a descent to read it from. A log that stops at (or just past)
  // apogee leaves a handful of samples wobbling around the peak, and averaging those is
  // noise — it can even come out negative, a "descent" that goes up. So require the record
  // to have actually come down a real fraction of the height it reached, and never report
  // a rate that isn't downward.
  const cameDown = altClean[apogeeIdx] - altClean[landingIdx] > Math.max(3, apogeeAlt * 0.1);
  const downward = (v: number) => (Number.isFinite(v) && v > 0 ? v : null);
  let drogueDescentRate: number | null = null;
  let mainDescentRate: number | null = null;
  if (mainIdx !== null && cameDown) {
    drogueDescentRate = downward(mean(descent, apogeeIdx + 1, mainIdx));
    mainDescentRate = downward(mean(descent, mainIdx + 1, landingIdx));
  } else if (landingIdx > apogeeIdx + 1 && cameDown) {
    mainDescentRate = downward(mean(descent, apogeeIdx + 1, landingIdx));
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
  // Burnout is 'measured' only when it came from a genuine signed-axial thrust
  // cut-off; a multi-axis logger's is taken from the velocity peak, so it's derived.
  if (ascentPresent)
    push('burnout', burnoutIdx, 'Burnout', accelerationSource === 'device' && !accelerationResultant ? 'measured' : 'derived');
  push('apogee', apogeeIdx, 'Apogee', 'derived');
  push('main', mainIdx, 'Main deploy', 'derived');
  if (landingFound) push('landing', landingIdx, 'Landing', 'derived');

  // --- Mach & max-Q ---------------------------------------------------------
  // (Speed of sound, ground temperature and air density were computed with the
  // atmosphere above.)
  // Mach at the altitude the peak speed was reached (colder, slower air than the pad),
  // falling back to the ground value only if that index is somehow unreadable.
  const maxVelSoS = maxVelIdx >= 0 && Number.isFinite(sosProfile[maxVelIdx]) ? sosProfile[maxVelIdx] : speedOfSound;
  const mach = Number.isFinite(maxVelocity) && maxVelocity > 0 ? maxVelocity / maxVelSoS : null;
  // Peak dynamic pressure (½ρv²) over the flight — the structural load case — and
  // the altitude it happened at (a real design point).
  let maxDynamicPressure: number | null = null;
  let maxQIdx = -1;
  // Skip when an ascent gap has already made the velocity untrustworthy, or the peak
  // was physically impossible — q = ½ρv² would inherit the same spurious speed.
  if (!ascentGapBreaksPeak && !velocityImplausible) {
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
  }
  const maxDynamicPressureAltitude = maxQIdx >= 0 ? altClean[maxQIdx] : null;
  const maxVelocityAltitude = maxVelIdx >= 0 ? altClean[maxVelIdx] : NaN;

  // Transonic crossing: the first ascent sample at or past Mach 1 — both an
  // engineering point (the transonic region) and a bragging right.
  let transonicTime: number | null = null;
  let transonicAltitude: number | null = null;
  if (mach !== null && mach >= 1) {
    const end = ascentPresent ? apogeeIdx + 1 : n;
    for (let i = liftoffRef; i < end; i++) {
      // Against the local speed of sound at each height — so the crossing is placed
      // where the rocket truly reached Mach 1, not where it would at ground temperature.
      const sos = sosProfile[i];
      if (Number.isFinite(velocity[i]) && Number.isFinite(sos) && sos > 0 && velocity[i] / sos >= 1) {
        transonicTime = liftoffFound ? time[i] - liftoffTime : time[i];
        transonicAltitude = altClean[i];
        break;
      }
    }
  }
  // A Mach-1 crossing read off a barometric speed is never a confirmed supersonic
  // flight, however far past Mach 1 the number lands — the shock over the pressure port
  // distorts the reading in both directions (a corpus baro flight read Mach 1.19 where
  // its accelerometer measured 0.93; another read Mach 2.64 where its inertial partner
  // measured 1.22). Flagged so the headline and exports soften "went supersonic" instead
  // of asserting it. Only an accelerometer, an inertial solution or GPS settles it — and
  // GPS does: a speed off GPS is coarse (its own warning says so) but nothing distorts it
  // through Mach 1, so a GPS flight's crossing stands.
  const transonicUnconfirmed = transonicTime !== null && velocitySource === 'baro' && altitudeSource === 'baro';

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
  if (burnoutIdx !== null && !velocityImplausible) {
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

  // Angle off vertical at burnout, read straight from a logger's attitude channel —
  // how vertical the powered flight was. Taken at burnout (not the peak, which just
  // catches the natural tip-over near apogee) so a low number means a straight boost.
  let tiltAtBurnout: number | null = null;
  const tiltCh = getChannel(flight, 'tilt');
  if (tiltCh && burnoutIdx !== null && burnoutIdx >= 0 && burnoutIdx < tiltCh.values.length) {
    const v = tiltCh.values[burnoutIdx];
    if (Number.isFinite(v)) tiltAtBurnout = Math.abs(v);
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
    transonicUnconfirmed,
    maxAcceleration,
    // Measured trace only — a baro-derived acceleration is too noisy even in the mean
    // to be honest (a real corpus baro flight averages higher over the boost than the
    // same flight's device peak), so it's withheld like the peak and the liftoff TWR.
    avgBoostAcceleration:
      ascentPresent && burnoutIdx !== null && accelerationSource === 'device'
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
    // Reads the velocity trace directly, so it inherits an impossible velocity even
    // when burnout was pinned off the accelerometer — withheld with the rest.
    burnoutVelocity: burnoutIdx !== null && !velocityImplausible ? velocity[burnoutIdx] : null,
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
    tiltAtBurnout,
  };

  if (accelClipped) {
    warnings.push(
      `The accelerometer reads a flat top at its peak (about ${(maxAcceleration / G0).toFixed(0)} g) — the signature of a sensor that hit its full-scale limit and saturated, so the true maximum could be higher.`,
    );
  }
  // Provenance of the derived kinematics. A GPS flight is already covered by its own
  // warning (velocity approximate, acceleration omitted), so don't double up here —
  // and flag a baro-derived ACCELERATION even when the logger measured velocity (a
  // Blue Raven low-rate, say): a second derivative of altitude is softer still, and
  // it would otherwise read as measured.
  if (altitudeSource !== 'gps') {
    const velBaro = velocitySource === 'baro';
    const accBaro = accelerationSource === 'baro';
    // The file did carry a velocity column — say plainly that it was set aside and
    // why, rather than implying the logger never recorded one.
    if (deviceVelocityIsAltDiff) {
      warnings.push(
        'The logger wrote a velocity column, but it is only its own altitude differenced sample to sample — a derived estimate carrying the barometer’s quantization noise, whose raw peak (a step of a couple hundred feet between two samples) reads far past the real speed. Debrief re-derives the velocity from that same altitude, smoothed for the log’s sample rate, so it is an estimate rather than a measurement.' +
          (accBaro
            ? ' Acceleration comes off the same altitude, so peak acceleration isn’t reported — a barometer can’t resolve it.'
            : ''),
      );
    } else if (velBaro && accBaro) {
      warnings.push('Velocity and acceleration were derived from altitude, so they are smoothed estimates rather than direct measurements; peak acceleration isn’t reported, as a barometer can’t resolve it.');
    } else if (accBaro) {
      warnings.push('Acceleration was derived from altitude (no accelerometer channel was recorded), so the curve is a smoothed estimate and peak acceleration isn’t reported — a barometer can’t resolve it.');
    } else if (velBaro) {
      warnings.push('Velocity was derived from altitude, so it is a smoothed estimate rather than a direct measurement.');
    }
    // A barometric speed can't be trusted from the transonic region up — the shock over
    // the static port distorts the reading, and a coarse baro trace differentiated at
    // those speeds carries its quantization as speed. So a baro peak at or past Mach ~0.9
    // is neither proof of a supersonic flight nor a floor under the real speed.
    if (velBaro && mach !== null && mach >= TRANSONIC_BARO_LOW) {
      warnings.push(
        `The peak speed (about Mach ${mach.toFixed(2)}) is at or past the transonic region, where a barometric speed is unreliable — the shock wave over the pressure port distorts the sensed pressure, and the error runs both ways: corpus flights recorded on two devices show a baro trace reading Mach 1.19 against a measured 0.93, and Mach 2.64 against a measured 1.22. So this figure can neither confirm the rocket went supersonic nor bound how fast it actually went. An accelerometer, an inertial solution or GPS would settle it.`,
      );
    }
  }
  if (sampleHz > 0 && sampleHz < 5 && velocitySource === 'baro') {
    warnings.push(
      `The log samples at about ${sampleHz.toFixed(1)} Hz, which is coarse for a derived velocity — fast events may be softened.`,
    );
  }
  // Gaps in the time base — a telemetry dropout or a paused logger — leave stretches
  // with no samples. Anything read across a gap (a rate, a peak) is interpolated over
  // it, and on a gappy GPS log that can throw the derived velocity right off, so say
  // so. Only a genuine gap: much larger than the log's own cadence and over a second.
  let maxGap = 0;
  for (let i = 1; i < n; i++) {
    const g = time[i] - time[i - 1];
    if (Number.isFinite(g) && g > maxGap) maxGap = g;
  }
  if (maxGap > 1.5 && dt > 0 && maxGap > 5 * dt) {
    warnings.push(
      `The time base has gaps — up to ${maxGap.toFixed(1)} s with no samples recorded (a dropout or a paused logger). Any reading that spans a gap is interpolated across it, so treat those with care.`,
    );
  }
  if (ascentGapBreaksPeak) {
    warnings.push(
      'A gap in the sampled ascent leaves the peak velocity undeterminable — the top speed may fall in the unrecorded stretch, and a derivative taken across the gap spikes to a spurious figure — so max velocity, Mach, max-Q and any transonic crossing are withheld rather than guessed across it.',
    );
  }
  if (velocityNoiseDominated) {
    warnings.push(
      'The velocity on the way up swings well below zero — but a climbing, accelerating rocket has no negative vertical velocity, so this trace is carrying more noise than speed and its peak is that noise, not a reading. It is what a barometer records on an airframe that is tumbling or venting (a spent booster after separation, say), where the pressure at the port stops tracking altitude. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off it; apogee, timings and the descent still read normally.',
    );
  } else if (velocityImplausible) {
    warnings.push(
      'The velocity channel reads implausibly fast — a peak beyond any rocket, so its column or unit is almost certainly misidentified (a raw sensor count read as a speed), or the data is corrupt. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported as impossible numbers; if this is a generic CSV, check the velocity column and its unit in the mapping.',
    );
  }
  if (altitudeSource === 'baro' && Number.isFinite(apogeeAlt) && apogeeAlt > TROPOSPHERE_LIMIT_M) {
    warnings.push(
      'Apogee is above ~36,000 ft (11 km), the top of the troposphere, where the standard-atmosphere model behind a barometric altitude breaks down — a pressure-derived reading increasingly under-reads that high, so treat this apogee as an approximate lower bound rather than an exact figure. A GPS or inertial altitude, if the flight logged one, is more trustworthy up here.',
    );
  }

  return { series, events, metrics, warnings };
}
