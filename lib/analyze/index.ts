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

/** How long the vertical velocity must stay negative before the record is read as
 *  descending rather than wobbling, scaled to the file's own sample rate. A real descent
 *  runs for tens of seconds — from 12,000 ft under a drogue, minutes — so an honest onset
 *  clears three seconds easily, while a transient dip in a noisy trace does not. Measured:
 *  at half a second, a 121 km flight whose barometric trace is pressure noise above 50 km
 *  (swinging 163,000–206,000 ft with no trend while its inertial velocity falls smoothly
 *  through zero) had an apogee pulled 28 s early by one brief excursion. */
const DESCENT_ONSET_S = 3;

/** How far past the ceiling its own accelerometer allows a barometric speed must read
 *  before the barometer is judged wrong rather than merely soft. The ceiling —
 *  ∫(a − g)dt from liftoff, taking the measured specific force as if it pointed straight
 *  up and cost nothing to drag — is deliberately generous, so any excess at all is
 *  already a contradiction. The margin covers the one thing that can make a discrete
 *  integral read low: a thrust spike between samples. Measured across the corpus's
 *  dual-recorded flights, where a device velocity settles the truth, the barometric trace
 *  still runs up to 38% above this ceiling on flights whose numbers are demonstrably
 *  right; half again over the ceiling sits clear of that, and the flights it catches read
 *  150%, 220%, 380% and 400% of it. */
const ACCEL_CEILING_MARGIN = 1.5;

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
 * Pad baseline from the quiet pre-launch window: the opening run of samples that haven't
 * yet climbed off the pad. This adapts to logs that start anywhere from seconds before
 * launch to right at it, instead of assuming a fixed 2 s of pad.
 */
function padBaseline(altitude: Float64Array, dt: number): { baseEnd: number; offset: number } {
  const n = altitude.length;
  const ref = altitude[0];
  const maxBase = Math.min(n, Math.round(3 / (dt || 0.1)));
  let baseEnd = 1;
  while (baseEnd < maxBase && Number.isFinite(altitude[baseEnd]) && Math.abs(altitude[baseEnd] - ref) < 6) {
    baseEnd++;
  }
  baseEnd = Math.max(3, baseEnd);
  const baseline = median(altitude, 0, baseEnd);
  return { baseEnd, offset: Number.isFinite(baseline) ? baseline : 0 };
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
      // Up again after coming down: another flight is in this file. Cut at the LOW POINT
      // between the two — the first sample of the trough — rather than where the record
      // crossed the ground band. The band is a fraction of the file's own highest flight,
      // so on a lower one it sits well up the descent, and cutting there would end the
      // first flight before it landed and start the next one already in the air, with its
      // pad baseline taken from a rocket still coming down (20 m out on a synthetic pair,
      // enough to hide a third flight entirely). The trough gives the first flight its
      // touchdown and the next one the quiet stretch its baseline is measured from.
      let low = Infinity;
      for (let k = landed; k < i; k++) if (Number.isFinite(altitude[k]) && altitude[k] < low) low = altitude[k];
      let cut = landed;
      for (let k = landed; k < i; k++) {
        if (Number.isFinite(altitude[k]) && altitude[k] <= low + 1) {
          cut = k;
          break;
        }
      }
      // Too short a first segment to analyze is better read whole than truncated to nothing.
      return cut >= 4 ? cut : null;
    }
  }
  return null;
}

/**
 * Do the segments of a split record hold the SAME flight written twice, rather than two
 * different flights? A logger downloaded twice, or one that restarts its log mid-flight,
 * produces a file that trips the multi-flight detector while containing exactly one flight.
 *
 * The test is the apogee, and the thing that makes it work is measuring both peaks against
 * **one datum** — the file's own pad baseline. It is one altitude column, so the second copy
 * neither needs nor may take a baseline of its own: doing that is what made the earlier
 * attempt at this read 10,723 ft where the device said 10,266. On the file's datum the same
 * segment reads 10,267.
 *
 * Measured over every multi-segment corpus file:
 *
 *   Blue Raven jan10   10,245 ft / 10,267 ft   0.21% apart   one flight, written twice
 *   Blue Raven jan18    6,296 ft /  6,296 ft   0.00% apart   one flight, written twice
 *   Eggtimer anomaly    4,661 ft /  8,969 ft  92.43% apart   a flight and a documented
 *                                                            baro artefact — not one flight
 *
 * The bound is 1%: five times the widest genuine agreement and ninety times inside the pair
 * that must be refused. A file with no quiet pad window has no datum to share and is refused
 * outright — which is the Eggtimer's first disqualification, before the peaks are even
 * compared.
 *
 * Refusing is the safe direction: it falls back to reading the first segment and saying the
 * file holds more than one flight, which is what shipped before this and is never a wrong
 * number — only a less useful sentence.
 */
const RECORDED_TWICE_AGREEMENT = 0.01;

function recordedTwice(altitude: Float64Array, cut: number, padDataLikely: boolean): boolean {
  if (!padDataLikely) return false;
  const peakOf = (from: number, to: number): number => {
    let p = -Infinity;
    for (let i = from; i < to; i++) if (Number.isFinite(altitude[i]) && altitude[i] > p) p = altitude[i];
    return p;
  };
  const first = peakOf(0, cut);
  const rest = peakOf(cut, altitude.length);
  if (!(first > 0) || !(rest > 0)) return false;
  return Math.abs(rest - first) / first <= RECORDED_TWICE_AGREEMENT;
}

/** What the second copy of a doubled recording can supply, and the sentence that says so. */
interface SplicedDescent {
  metrics: Pick<FlightMetrics, 'descentTime' | 'flightTime' | 'descentSource'>;
  warning: string;
}

/**
 * Read the descent from the second copy of a flight this file holds twice.
 *
 * Called only where `recordedTwice` already established that the two copies are one flight —
 * and only where the first copy WITHHELD its descent, so nothing this returns can displace a
 * reading. The ascent, the apogee and every design point stay with the copy that starts on
 * the pad; what comes back is the clock and the rates that hang off a touchdown.
 *
 * The second copy is analysed against the FILE's datum rather than its own. That is the whole
 * difference between this and the attempt that was reverted: measured against the trough it
 * starts in, the corpus Blue Raven's second copy reads 10,723 ft; measured against the file's
 * pad it reads 10,267 ft, one foot from the device's own stated 10,266.
 *
 * Flight time is composed rather than taken: the ascent was timed on the first copy and the
 * descent on the second, so it is time-to-apogee plus descent time. Reading the second copy's
 * own liftoff-to-landing would time a different copy's climb.
 *
 * The CLOCK comes across; the descent RATES do not. A descent time needs two instants both
 * copies agree on — apogee and touchdown — while a rate needs the deployment structure
 * between them, and where the second copy resolves no main deployment the whole descent is
 * averaged into one figure published under the label a flyer sizes a parachute against. This
 * same flight says how wrong that would be: the Featherweight GPS that recorded it separately
 * reads a 50.7 m/s drogue leg and a 6.2 m/s main, where the Blue Raven's second copy averages
 * them to 48.2 m/s. So the rates stay withheld, and the warning says the clock is what moved.
 *
 * Barometric-only records are left alone. Altitude derived from pressure takes its reference
 * from the pad PRESSURE, which a datum in metres cannot correct, and a half-corrected
 * reference is worse than none.
 */
function descentFromSecondCopy(
  flight: RawFlight,
  first: FlightAnalysis,
  cut: number,
  datum: number,
  hasAltitudeChannel: boolean,
): SplicedDescent | null {
  if (!hasAltitudeChannel) return null;
  // Only where the first copy has no descent to speak of. `descentTime` is null exactly when
  // no landing was marked, which is what `descentIsInTheRecord` decides.
  if (first.metrics.descentTime != null) return null;
  if (!Number.isFinite(first.metrics.timeToApogee)) return null;

  let second: FlightAnalysis;
  try {
    second = analyzeFlight(sliceFlight(flight, cut, flight.time.length), 1, datum);
  } catch {
    return null; // too few samples, no channels — the first copy stands on its own
  }
  const m = second.metrics;
  if (m.descentTime == null || !(m.descentTime > 0)) return null;
  // The two copies must still agree on the flight they are describing. `recordedTwice`
  // compared the raw peaks; this compares what the ANALYSIS made of them — the spike-cleaned
  // trace, which is the number a flyer actually sees. The two can only part company on a
  // single-sample spike that cleaning removes, and no corpus file or synthetic separates
  // them, so this branch is defensive and untested rather than covered.
  const apo = first.metrics.apogeeAltitude;
  if (!(apo > 0) || !Number.isFinite(m.apogeeAltitude)) return null;
  if (Math.abs(m.apogeeAltitude - apo) / apo > RECORDED_TWICE_AGREEMENT) return null;

  return {
    metrics: {
      descentTime: m.descentTime,
      flightTime: first.metrics.timeToApogee + m.descentTime,
      descentSource: 'second-copy',
    },
    warning:
      `The first copy stops before the rocket lands, so the descent CLOCK is read from the second copy of the same flight in this file — ` +
      `measured against the file's own pad baseline it reaches apogee within ${((Math.abs(m.apogeeAltitude - apo) / apo) * 100).toFixed(1)}% of the first copy's ` +
      `${Math.round(apo)} m. Descent time and flight time come from that second copy; the climb, the apogee and every reading above them come from the first.`,
  };
}

/** The flight from `start` to `end` (exclusive): the time base and every channel, sliced
 *  together so the model stays consistent. */
function sliceFlight(flight: RawFlight, start: number, end: number): RawFlight {
  return {
    ...flight,
    time: flight.time.slice(start, end),
    channels: flight.channels.map((c) => ({ ...c, values: c.values.slice(start, end) })),
  };
}

/**
 * Did the record actually contain a descent, or does it stop somewhere above the ground?
 *
 * The vacuum fall again, in time rather than in speed: a body released at height h cannot
 * reach the ground in less than √(2h/g), so a record that ends sooner than that after its
 * own peak did not hold a descent — whatever the trace does at the cut. A necessary
 * condition, not a sufficient one, which is what a guard that must never refuse a real
 * flight wants.
 *
 * A logger that writes the same flight into a file twice makes this concrete: one corpus
 * Blue Raven cuts its first copy at apogee, and the "landing" the detector then finds is
 * the record restarting, 0.08 s after the peak of a 10,245 ft flight. A flight time of
 * 18.3 s and a descent of 0.08 s were both being reported off that.
 */
function descentIsInTheRecord(altitude: Float64Array, time: Float64Array, apogeeIdx: number, landingIdx: number): boolean {
  const peak = altitude[apogeeIdx];
  if (!(peak > 0) || landingIdx <= apogeeIdx) return false;
  return time[landingIdx] - time[apogeeIdx] >= Math.sqrt((2 * peak) / G0);
}

/** null for a non-finite value, for the metrics that are nullable rather than NaN. */
function nullIfNaN(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

function formatSeconds(s: number): string {
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

/**
 * @param depth  recursion guard for the multi-segment branch below.
 * @param datum  a ground reference to use INSTEAD of this record's own pad window, in the
 *   altitude channel's raw units. Only the multi-segment branch passes it, and only to read
 *   the second copy of a doubled recording: that copy starts in the trough between the two
 *   and has no pad of its own, so measuring it against itself is what made an earlier
 *   attempt read 10,723 ft where the device said 10,266. It is one altitude column, so the
 *   file's datum is the second copy's datum too.
 */
export function analyzeFlight(flight: RawFlight, depth = 0, datum?: number): FlightAnalysis {
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

  // Pad baseline from the quiet pre-launch window (see `padBaseline`) — unless a caller
  // handed us the file's own datum, which only the doubled-recording branch does.
  const { baseEnd, offset: ownOffset } = padBaseline(altitude, dt);
  const baseOffset = datum ?? ownOffset;
  for (let i = 0; i < n; i++) altitude[i] -= baseOffset;

  // If there's no real quiet window, the file probably starts mid-flight, so the
  // baseline (and anything measured against it) can't be fully trusted.
  const baselineNoise = stdev(altitude, 0, baseEnd);
  const minQuiet = Math.max(5, Math.round(0.4 / (dt || 0.1)));
  // A supplied datum came from a real pad window by construction — the caller checked.
  const padDataLikely = datum != null || baseEnd >= minQuiet;
  if (!padDataLikely) {
    warnings.push(
      'The log doesn’t appear to start on the pad, so the ground baseline is approximate — altitude AGL and any ground reading may be offset.',
    );
  }

  // One file can hold more than one flight — a logger downloaded twice, or a day's
  // flights in one dump. Read as a single flight the record is nonsense: the global peak
  // belongs to a later flight while liftoff belongs to the first, so time-to-apogee
  // spans both. So one segment is read, and the file says which.
  //
  // The first flight is the one read, and it stays that way even when a later segment looks
  // more complete. That was tried and measured: on a corpus Blue Raven that holds the same
  // flight twice, the first copy stops at apogee and the second runs to the ground — but the
  // second has no pad window to take a ground baseline from, and reading it moved the apogee
  // from 10,245 ft to 10,723 against the device's own stated 10,266 and a GPS's 10,409.
  // Trading a right apogee for a right descent is not a trade worth making. What the first
  // copy genuinely lacks is said instead, below.
  const secondFlightAt = nextFlightStart(altitude);
  if (secondFlightAt != null && depth === 0) {
    const first = analyzeFlight(sliceFlight(flight, 0, secondFlightAt), 1);
    const opening = formatSeconds(time[secondFlightAt] - time[0]);
    // Two different files trip this detector, and telling them apart changes what the flyer
    // should do about it. Both corpus Blue Ravens hold ONE flight written twice; telling
    // their owner to "read the others by splitting the file" would hand them the same flight
    // again, and telling them the file holds more than one flight is simply false.
    const twice = recordedTwice(altitude, secondFlightAt, padDataLikely);
    // Per-recording assembly, within one file. The first copy is the one that starts on the
    // pad, so the climb is read from it and the apogee never moves. But a logger that
    // restarts mid-flight can cut that copy before the rocket lands — the corpus Blue Raven
    // stops 3.3 s after apogee — and the descent is then sitting in the second copy, which
    // runs to the ground. Take it from there, on the file's datum.
    //
    // This can only fill in readings the first copy WITHHOLDS. It never moves one it
    // reports: apogee, the climb and every ascent reading come from the first copy either
    // way, and the second copy is consulted only where `descentIsInTheRecord` already
    // refused to read a landing.
    const spliced = twice ? descentFromSecondCopy(flight, first, secondFlightAt, baseOffset, !!altCh) : null;
    const base = spliced ? { ...first, metrics: { ...first.metrics, ...spliced.metrics } } : first;
    return {
      ...base,
      warnings: [
        twice
          ? `This file holds the same flight written twice — the record returns to the ground and climbs again to the same height (within ${(RECORDED_TWICE_AGREEMENT * 100).toFixed(0)}%, measured against this file's own pad baseline). Debrief read the first copy (the opening ${opening} of the file), which is the one that starts on the pad. There is no second flight to read.`
          : `This file holds more than one flight — the record returns to the ground and climbs again. Debrief analyzed the first (the opening ${opening} of the file) and ignored the rest; read the others by splitting the file, or export them separately from your altimeter's software.`,
        ...(spliced ? [spliced.warning] : []),
        // The first copy's own "record stops short" note is replaced by the splice: it says
        // no flight time or descent rate is read, which is no longer true of this flight.
        ...(spliced
          ? first.warnings.filter(
              (w) => !/holds the climb but not the descent|never reaches the ground/.test(w),
            )
          : first.warnings),
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
  // And a velocity column is only a MEASUREMENT if the device had something to measure a
  // speed with. A baro-only altimeter has one sensor — a pressure sensor — so whatever
  // filtering it puts on top, its "velocity" is worked out from its own altitude and
  // deserves every derived-velocity caveat: the transonic warning, no measured claim, no
  // credit as a second opinion. The evidence has to be in the file: an accelerometer
  // channel, a GPS fix (a Doppler speed is a real measurement), or the device's own
  // inertial altitude, which can only come from an inertial sensor even when the export
  // doesn't carry the accelerometer itself (a Blue Raven's low-rate file). Nine corpus
  // flights read as "measured" without any of the three, and some of those figures are
  // impossible: an Eggtimer states 4,483 ft/s on a 4,661 ft apogee, another 2,671 ft/s on
  // 958 ft. The column's own numbers are kept — they are what the device reported, and
  // Debrief doesn't claim to improve them — but the label now says what they are.
  const hasSpeedSensor =
    !!getChannel(flight, 'accelAxial') ||
    !!getChannel(flight, 'accelTotal') ||
    !!getChannel(flight, 'latitude') ||
    !!getChannel(flight, 'altitudeInertial');
  if (velCh && !deviceVelocityIsAltDiff) {
    velocity = velCh.values.slice();
    velocitySource = hasSpeedSensor ? 'device' : 'baro';
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
  // A reading that arrives after the rocket has been coming down for seconds is not an
  // apogee, however high it is. A deployment charge vents the airframe, and on a fast
  // logger that transient is a burst of wide swings rather than the one- or two-sample
  // spike the median filter is built for: one corpus Blue Raven log swings ±250 ft for most
  // of a second at 50 Hz, and the plain highest-sample reads 12,060 ft a full 3.7 s after
  // the flight's own velocity went negative. Its three sibling recordings and the same
  // file's inertial altitude all put apogee at the velocity crossing.
  //
  // So the peak is looked for up to the moment a sustained descent begins — the rocket
  // cannot be descending before it has peaked — with two gates that keep this from ever
  // firing on a sound flight:
  //  - the scan starts where the climb is unambiguous (half the height eventually reached),
  //    so a velocity wobbling either side of zero on the pad is never read as a descent;
  //  - a trace whose ascent velocity swings well negative is carrying noise rather than
  //    speed (the same measure the velocity guard below uses), and its sign says nothing, so
  //    the peak is left where the altitude puts it.
  const peakIdx = Math.max(0, argMax(altClean));
  const apogeeIdx = clampToDescent(peakIdx);
  const apogeeTime = time[apogeeIdx];
  const apogeeAlt = altClean[apogeeIdx];

  function clampToDescent(peak: number): number {
    if (peak < 2) return peak;
    // Above the troposphere a barometric reading has stopped being a height at all — the
    // constant-lapse model behind it breaks down and the trace goes to noise — so there is
    // no "spurious peak in an otherwise sound trace" to correct. That flight's apogee is
    // already reported as an approximate lower bound (see the warning below); leave it. One
    // corpus 121 km shot swings between 163,000 and 206,000 ft with no trend up there.
    if (altitudeSource === 'baro' && altClean[peak] > TROPOSPHERE_LIMIT_M) return peak;

    // Start where the climb is unambiguous — half the height eventually reached — so a
    // velocity wobbling either side of zero on the pad is never read as a descent.
    const half = altClean[peak] * 0.5;
    let from = 0;
    while (from < peak && !(altClean[from] >= half)) from++;
    if (from >= peak) return peak;

    // The first sustained descent: DESCENT_ONSET_S of continuously negative velocity.
    const run = Math.max(2, windowFor(dt, DESCENT_ONSET_S));
    let neg = 0;
    let onset = -1;
    for (let i = from; i < n; i++) {
      if (Number.isFinite(velocity[i]) && velocity[i] < 0) {
        if (++neg >= run) {
          onset = i - neg + 1;
          break;
        }
      } else {
        neg = 0;
      }
    }
    // Only a contradiction is corrected: a peak at or before the descent stands as it is.
    if (onset < 1 || peak <= onset) return peak;

    // Is the sign of this velocity worth trusting? Judged over the climb only — the stretch
    // between half height and the descent, before whatever artefact moved the peak. A trace
    // that swings well negative while still climbing is carrying noise rather than speed
    // (the measure the velocity guard below uses), so its sign settles nothing.
    let worst = 0;
    let best = 0;
    for (let i = from; i < onset; i++) {
      if (!Number.isFinite(velocity[i])) continue;
      if (velocity[i] < worst) worst = velocity[i];
      if (velocity[i] > best) best = velocity[i];
    }
    if (!(best > 0) || -worst / best > ASCENT_NOISE_FRACTION) return peak;

    return Math.max(0, argMax(altClean, 0, onset + 1));
  }

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

  // An ascent altitude read-off is only a reading if the record doesn't contradict it. A
  // climbing rocket cannot be lower than a height it has already passed, but a barometric
  // port goes useless through the transonic push — the shock over it drives the sensed
  // pressure up, which reads as the rocket descending — and burnout, the speed peak, the
  // Mach-1 crossing and max-Q all land in exactly that stretch. Read straight off the
  // trace, a Blue Raven flight reports a burnout altitude of −307 ft while its own inertial
  // channel climbs past 1,700 ft, and a TeleMega reads 1,095 ft below a height it had
  // already recorded. Where the trace contradicts itself by more than a barometer's own
  // credible wander, the altitude at that instant is withheld rather than reported: the
  // record cannot say how high the rocket was there. The time, the speed and the event
  // itself are unaffected, and so is the altitude chart.
  // A second altitude recording, where the logger solved for one (a Blue Raven writes its
  // inertial altitude beside the barometric one). It drifts over a whole flight, which is
  // why the analysis rides on the baro — but the drift accumulates with time, so in the
  // first seconds, exactly where the transonic artefact strikes, it is the trustworthy
  // one. Baselined the same way so it reads AGL like everything else.
  const inertialCh = getChannel(flight, 'altitudeInertial');
  let inertial: Float64Array | null = null;
  if (inertialCh && inertialCh.values.length === n) {
    const base = median(inertialCh.values, 0, baseEnd);
    inertial = Float64Array.from(inertialCh.values, (v) => v - (Number.isFinite(base) ? base : 0));
  }

  const ascentFloor = altClean.slice();
  {
    let run = -Infinity;
    for (let i = liftoffRef; i <= apogeeIdx && i < n; i++) {
      const h = altClean[i];
      if (Number.isFinite(h) && h > run) run = h;
      ascentFloor[i] = run;
    }
  }
  // A few percent of the height reached, with a floor for a low flight — below that the
  // backslide is barometric noise, not a broken reading. Across the corpus every sound
  // flight's read-offs sit within 72 ft of the record; the three that trip this are 557 to
  // 1,125 ft below it.
  const contradictionBand = Math.max(30, apogeeAlt * 0.03);

  // The same artefact runs the other way, and the running maximum can't see it: through the
  // supersonic push the shock over the static port can drive the sensed pressure DOWN as
  // well as up, and the trace then climbs faster than the rocket did. One corpus Blue Raven
  // flight reads 98 → 592 → 1,784 → 2,605 ft in half a second — an implied 3,570 ft/s —
  // while its own inertial channel peaks at 1,239 ft/s, so its burnout altitude reported
  // 2,495 ft on a flight whose own speed record allows under 900.
  //
  // What catches it is not a tolerance on the discrepancy but a bound: over any stretch, a
  // rocket's MEAN climb rate cannot exceed the fastest it was going during it (that's the
  // mean value theorem, not a rule of thumb), and the fastest it was going is in the file.
  // So the height gained since liftoff is capped by (peak speed so far) × (time since
  // liftoff). Taking the speed as vertical when it may be axial only makes the cap more
  // generous, which is the right direction for a guard.
  //
  // Only where the speed is MEASURED: a baro-derived velocity comes from this very altitude
  // trace, so the cap would be testing the trace against itself.
  const ascentCeil = new Float64Array(n);
  {
    const hLift = Number.isFinite(altClean[liftoffRef]) ? altClean[liftoffRef] : 0;
    let peak = 0;
    for (let i = liftoffRef; i <= apogeeIdx && i < n; i++) {
      const v = velocity[i];
      if (Number.isFinite(v) && v > peak) peak = v;
      ascentCeil[i] = hLift + peak * (time[i] - liftoffTime);
    }
  }
  const capApplies = velocitySource === 'device';
  // A rocket in flight is also never below its own pad. That catches the same artefact
  // where it strikes before the rocket has climbed far enough for the running maximum to
  // mean anything — a TeleMega reads −542 ft at its Mach-1 crossing.
  const belowGroundBand = Math.max(15, apogeeAlt * 0.005);
  let withheldAnAltitude = false;
  let recoveredFromInertial = false;
  // Which way the trace went wrong, so the warning can say what happened rather than
  // recite every way it could have.
  let sawUnderRead = false;
  let sawOverRead = false;
  /** The altitude at an ascent instant: the logger's inertial solution where the
   *  barometric record contradicts itself and that solution is consistent with it,
   *  otherwise NaN. Every surface formats a non-finite length as "—", so a figure with no
   *  honest answer reads as unknown everywhere. */
  const altAt = (idx: number): number => {
    const h = altClean[idx];
    const onAscent = idx >= liftoffRef && idx <= apogeeIdx && Number.isFinite(h);
    if (!onAscent) return h;
    const tooLow = h < -belowGroundBand || ascentFloor[idx] - h > contradictionBand;
    const tooHigh = capApplies && h - ascentCeil[idx] > contradictionBand;
    if (tooLow || tooHigh) {
      if (tooLow) sawUnderRead = true;
      if (tooHigh) sawOverRead = true;
      // Only when the second recording agrees with what the first already established:
      // between the height the baro itself had reached and the apogee when the trace read
      // too low, and under the speed record's own cap when it read too high. A candidate is
      // held to the bound the barometer just failed, or it is no better than what it replaces.
      const alt = inertial?.[idx];
      const usable =
        alt != null &&
        Number.isFinite(alt) &&
        (tooLow ? alt >= ascentFloor[idx] && alt <= apogeeAlt : true) &&
        (tooHigh ? alt - ascentCeil[idx] <= contradictionBand && alt > -belowGroundBand : true);
      if (usable) {
        recoveredFromInertial = true;
        return alt as number;
      }
      withheldAnAltitude = true;
      return NaN;
    }
    return h;
  };

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

  // A barometric peak speed the flight's own accelerometer cannot account for. On a log
  // carrying both channels the accelerometer bounds the speed from ABOVE: integrate the
  // measured specific force less gravity from liftoff, crediting every measured g as
  // vertical, and the result is a ceiling the rocket cannot have passed — an accelerometer
  // reads the axial force, so a tilted airframe puts only a·cos(tilt) into the climb while
  // this sum takes all of it. (Drag needs no allowance: it is already inside the reading,
  // which is why the sum falls again through the coast.) The
  // unpowered coast bounds it from BELOW: to climb Δh from the end of thrust to apogee a
  // body needs at least √(2g·Δh). Where those two bracket a real speed and the barometric
  // trace reads outside the bracket, the barometer is wrong rather than merely soft — the
  // shock over its pressure port through the transonic push, reading as speed.
  let accelCeiling = NaN;
  let coastFloor = NaN;
  if (
    velocitySource === 'baro' &&
    accelerationSource === 'device' &&
    !accelClipped &&
    liftoffFound &&
    maxVelIdx >= 0
  ) {
    let sum = 0;
    let best = 0;
    let thrustEnd = liftoffRef;
    for (let i = liftoffRef + 1; i <= apogeeIdx && i < n; i++) {
      const step = time[i] - time[i - 1];
      const a0 = signedAccel[i - 1];
      const a1 = signedAccel[i];
      if (!(step > 0) || !Number.isFinite(a0) || !Number.isFinite(a1)) continue;
      sum += ((a0 + a1) / 2 - G0) * step;
      if (sum > best) {
        best = sum;
        thrustEnd = i;
      }
    }
    // The running integral peaks where the measured force falls back through gravity —
    // the accelerometer's own end of thrust, so everything gained after it is coast.
    const coastGain = apogeeAlt - altClean[thrustEnd];
    if (best > 0) accelCeiling = best;
    if (Number.isFinite(coastGain) && coastGain > 0) coastFloor = Math.sqrt(2 * G0 * coastGain);
  }
  // Only trust the ceiling where the coast corroborates it. An accelerometer channel read
  // on a different convention (logged net of gravity, or sampled far too coarsely to
  // integrate) yields a ceiling BELOW the speed the climb demonstrably required — one
  // consumer altimeter's sample flight caps at 2 ft/s against a 666 ft apogee — and that
  // is a broken bound, not a broken barometer. Say nothing rather than accuse the wrong
  // channel over it.
  const velocityBeyondAccel =
    Number.isFinite(accelCeiling) &&
    Number.isFinite(coastFloor) &&
    coastFloor <= accelCeiling &&
    Number.isFinite(maxVelocity) &&
    maxVelocity > accelCeiling * ACCEL_CEILING_MARGIN;
  const beyondAccelRatio = velocityBeyondAccel ? maxVelocity / accelCeiling : NaN;

  // A third way a derived speed gives itself away, on a flight with no accelerometer to
  // bracket it: the climb it implies against the climb that happened. From the peak-speed
  // point a drag-free coast gains v²/2g, and drag only ever takes from that — so the ratio
  // of what the flight actually gained to that vacuum coast is what drag cost. Across 33
  // corpus flights it spans **6.3% to 81.7%**, a wide and continuous spread. Two files sit
  // at **0.1%**: an Eggtimer anomaly reading Mach 4.08 over a 4,661 ft apogee (200 ft gained
  // from the peak-speed point), and an in-air breakup reading 2,671 ft/s over 958 ft. A
  // barometric speed whose vacuum coast is a hundred times the climb is not a speed the
  // flight had; it is the slope of a trace that jumped. The bound sits at 1% — six times
  // below the lowest genuine reading and ten times above the two refused — and it is stated
  // with that basis rather than as a bare threshold.
  //
  // Only for a DERIVED speed. A barometric velocity is the derivative of the very altitude
  // trace it is being checked against, so a contradiction is that one channel disagreeing
  // with itself. A device-measured speed and the altitude are two instruments, and which to
  // believe is not this guard's call — the cross-check surfaces that disagreement instead.
  const COAST_RATIO_FLOOR = 0.01;
  const vacuumFromPeak = Number.isFinite(maxVelocity) ? (maxVelocity * maxVelocity) / (2 * G0) : NaN;
  const climbFromPeak =
    maxVelIdx >= 0 && Number.isFinite(altClean[maxVelIdx]) ? altClean[apogeeIdx] - altClean[maxVelIdx] : NaN;
  const velocityOutclimbsItself =
    velocitySource !== 'device' &&
    Number.isFinite(vacuumFromPeak) &&
    vacuumFromPeak > 0 &&
    Number.isFinite(climbFromPeak) &&
    climbFromPeak / vacuumFromPeak < COAST_RATIO_FLOOR;

  let velocityImplausible = false;
  if (
    Number.isFinite(maxVelocity) &&
    (maxVelocity > IMPLAUSIBLE_VELOCITY || velocityNoiseDominated || velocityBeyondAccel || velocityOutclimbsItself)
  ) {
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
  // Whether the accelerometer actually gave up a thrust-end crossing, as opposed to the
  // velocity-peak proxy standing in. `burnoutSource` used to be decided by whether a signed
  // axial CHANNEL existed, which is not the same question: a flight can have the channel and
  // still fall through to the peak, and it was then labelled "measured" while reporting the
  // max velocity a second time under the burnout label — two readings that look like
  // independent agreement and are one sample.
  let burnoutFromAccel = false;
  if (ascentPresent && accelerationSource === 'device' && !accelerationResultant) {
    // Burnout is a sign change on the axial trace (thrust → drag), so read the
    // signed axis: the resultant magnitude never falls through zero. Only usable
    // for a genuine signed axial channel — a multi-axis logger's noisy body axis
    // can stay positive past burnout and cross zero only at ejection, so those
    // fall through to the velocity-peak proxy below.
    // The search ends at the VELOCITY PEAK, not at apogee. Net acceleration is zero at the
    // peak and negative after it, so a rocket cannot still be under thrust past it — and
    // searching to apogee let the boost peak be found in the wrong event entirely. On three
    // corpus flights the largest signed-axial reading between liftoff and apogee is the
    // apogee ejection charge (187.8, 235.7 and 819.7 m/s²), not the motor; the crossing
    // "after the boost peak" was then the charge settling, and burnout landed a few tenths
    // of a second before apogee. That put a 39.85 s burn time, a 1.9 m/s burnout velocity
    // and an 8,292 m burnout altitude (7 m under the apogee) on a flight whose motor burned
    // for a few seconds and whose real burnout speed was near its 580.9 m/s peak.
    //
    // The existing guard below was meant to catch exactly this but is measured in SAMPLES:
    // two of them is 0.02 s on a 100 Hz logger, so a burnout half a second before apogee
    // passed it. Bounding the search physically is the fix; the guard stays as a backstop.
    const searchEnd = maxVelIdx > liftoffRef ? maxVelIdx : apogeeIdx;
    const peak = argMax(signedAccel, liftoffRef, searchEnd + 1);
    // Inclusive of the endpoint: the axial trace crosses zero AT the velocity peak, so an
    // exclusive bound missed the very sample the crossing lands on and fell through to the
    // proxy below on flights where the accelerometer had the answer.
    for (let i = peak; i <= searchEnd; i++) {
      if (signedAccel[i] <= 0) {
        burnoutIdx = i;
        burnoutFromAccel = true;
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
  // …and where that finds nothing, a record can still end with the rocket demonstrably down:
  // the trace stops changing. The detector above asks for the trace to come within 2 m of the
  // pad, which a barometer 108 s from its own reference does not always do — the corpus Blue
  // Raven's second copy settles at 7.2 m and stays inside 3.5 m peak-to-peak for its last
  // three seconds while its descent had been running at 47 m/s. A rocket in the air is either
  // climbing or falling; it cannot hold an altitude. So a tail that has stopped moving,
  // relative to the descent that this same flight was just doing, is the ground.
  //
  // Only consulted where the primary detector found nothing, so it can add a landing but
  // never move one. The comparison is against the flight's own descent rather than a fixed
  // number of metres, so it means the same thing on a 600 ft sport flight and a 27,000 ft one.
  const AT_REST_FRACTION = 0.05;
  const AT_REST_SECONDS = 2;
  // …and at rest is not enough on its own: a landing is a return to THE GROUND, and the
  // ground is where this record started. Four corpus records end at rest between 2.0% and
  // 7.5% of their own apogee above the pad — one of them 307 m up — and whether that is a
  // barometer's zero wandering or the log simply stopping is not something the record
  // settles. So the claim isn't made. The two that are admitted end 0.23% and 0.25% up,
  // nearly nine times inside the closest refusal, and the bound is a fraction of the
  // flight's own height so it means the same thing at 600 ft and at 27,000.
  const AT_REST_HEIGHT = 0.01;
  if (landingIdx >= n - 1 && apogeeIdx < n - 2) {
    let tailStart = -1;
    for (let i = apogeeIdx + 1; i < n; i++) {
      if (time[n - 1] - time[i] <= AT_REST_SECONDS) { tailStart = i; break; }
    }
    if (tailStart > apogeeIdx + 1 && Number.isFinite(altClean[tailStart]) && Number.isFinite(altClean[n - 1])) {
      const beforeSpan = time[tailStart] - time[apogeeIdx];
      const tailSpan = time[n - 1] - time[tailStart];
      const descentBefore = beforeSpan > 0 ? (altClean[apogeeIdx] - altClean[tailStart]) / beforeSpan : 0;
      const tailRate = tailSpan > 0 ? Math.abs(altClean[n - 1] - altClean[tailStart]) / tailSpan : Infinity;
      const restHeight = Math.abs(altClean[n - 1]);
      if (
        descentBefore > 0 &&
        tailRate < descentBefore * AT_REST_FRACTION &&
        restHeight <= altClean[apogeeIdx] * AT_REST_HEIGHT
      ) {
        landingIdx = tailStart;
      }
    }
  }
  const landingTime = time[landingIdx];
  // A landing needs a descent to have happened before it. Where the record stops sooner
  // after apogee than a vacuum fall from that height would take (see `descentIsInTheRecord`),
  // whatever the detector settled on is the end of the record, not a touchdown — so no
  // landing is marked, and the clock that hangs off it (flight time, descent time) is left
  // unread rather than reported as a number the flight cannot have had.
  const descentRecorded = descentIsInTheRecord(altClean, time, apogeeIdx, landingIdx);
  const landingFound = (landingIdx < n - 1 || altClean[n - 1] < 5) && descentRecorded;
  if (!descentRecorded && apogeeIdx < n - 2) {
    warnings.push(
      `The record stops ${formatSeconds(time[n - 1] - time[apogeeIdx])} after apogee, sooner than this flight could have fallen from ${Math.round(altClean[apogeeIdx])} m even in a vacuum (${formatSeconds(Math.sqrt((2 * altClean[apogeeIdx]) / G0))}). So it holds the climb but not the descent: no landing, no flight time, and no descent rate are read from it.`,
    );
  }
  if (apogeeIdx >= n - 2) {
    warnings.push('The log appears to end at or before apogee — descent numbers may be missing.');
  }
  // The other way a landing goes unread: the record holds the whole fall — long enough that
  // the vacuum test above is satisfied — and then stops with the rocket still well up. Four
  // corpus records do this, ending between 2.0% and 7.5% of their own apogee above the pad,
  // one of them 307 m up. Debrief was withholding the landing, the flight time and the descent
  // time on all four and saying NOTHING about it: the tiles simply weren't there, among
  // warnings about baselines and sample rates that explain something else. A withheld number
  // has to say why it is withheld, so this says it, with the height it stopped at.
  if (descentRecorded && !landingFound && apogeeIdx < n - 2) {
    let lowest = Infinity;
    for (let i = apogeeIdx; i < n; i++) if (Number.isFinite(altClean[i]) && altClean[i] < lowest) lowest = altClean[i];
    if (Number.isFinite(lowest) && apogeeAlt > 0) {
      warnings.push(
        `The record covers the descent but never reaches the ground — the lowest it gets after apogee is ${Math.round(lowest)} m above the pad, ${((lowest / apogeeAlt) * 100).toFixed(1)}% of this flight's own apogee. That may be the log stopping early or the barometer's zero having drifted over a long descent, and the record doesn't settle which, so no landing is marked and flight time and descent time are left unread rather than measured to wherever it happens to stop.`,
      );
    }
  }

  // Where the ground baseline was already doubted AND the record comes to rest well away from
  // zero, the two facts are one fact: the log did not start on the pad, so every height in it
  // is offset by however far the resting end sits from where the record began. A rocket at
  // rest is on the ground, and an observed ground is better evidence than a pad window the
  // record never contained.
  //
  // The corpus makes the size of this concrete. One PerfectFlite log reads a 4,957 m apogee
  // where the device's own summary states 4,686 — a 271 m, 5.79% disagreement, on a file whose
  // record comes to rest 270 m above where it started. Subtracting that resting height gives
  // 4,687 m: 0.9 m from the device's figure, on the only file here that carries one.
  //
  // Debrief states the offset rather than applying it. The device's summary is the check that
  // this is right, and a reading corrected until it matches its own cross-check is agreement
  // dressed up — so the flyer is told the number and what it means, and the two reads stay
  // independent.
  if (!padDataLikely && landingIdx > apogeeIdx && apogeeAlt > 0) {
    const rest = altClean[landingIdx];
    if (Number.isFinite(rest) && Math.abs(rest) > apogeeAlt * 0.01) {
      const dir = rest > 0 ? 'high' : 'low';
      warnings.push(
        `This log doesn't start on the pad, and it comes to rest ${Math.abs(Math.round(rest))} m ${rest > 0 ? 'above' : 'below'} where the record begins — ${Math.abs((rest / apogeeAlt) * 100).toFixed(1)}% of the apogee. A rocket at rest is on the ground, so that resting height is where the ground actually is, and every altitude here (apogee included) reads about ${Math.abs(Math.round(rest))} m too ${dir}. Debrief reports what the record says rather than shifting it: subtract that to get heights above the ground it landed on.`,
      );
    }
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
  // Two ways to ask "is the descent actually here": far enough (this) and long enough
  // (`descentRecorded`). A record can satisfy one and not the other — a cut that drops to a
  // restart baseline falls the whole way in a fraction of a second — and a rate needs both.
  const cameDown = altClean[apogeeIdx] - altClean[landingIdx] > Math.max(3, apogeeAlt * 0.1) && descentRecorded;
  const downward = (v: number) => (Number.isFinite(v) && v > 0 ? v : null);
  // Each leg of the descent gets the same test as the descent as a whole, against the
  // height that leg started from — because a log can stop moments after a deployment and
  // leave a sliver of it. One corpus recording loses power 1.3 s after its main fires at
  // 1,877 ft, and the 26 samples left over average to 2 ft/s against its partner
  // recording's 57 ft/s on the same flight. Two feet per second is not a descent; it is
  // the end of the record, and the honest reading is no reading.
  //
  // And a descent cannot be faster than falling from apogee in a vacuum. At apogee the
  // rocket is at rest — that is what apogee means — so conservation of energy caps every
  // speed after it at √(2·g·h): no drag model, no mass, nothing to tune, the same argument
  // the coast-efficiency read uses in the other direction. A leg whose mean comes out above
  // that ceiling is not a recovery rate; it is a derived-signal artefact, and three real
  // corpus files produced one — a Blue Raven reading 16,495 ft/s, an Eggtimer 8,303 ft/s and
  // another 749 ft/s, all printed as a "main descent" a flyer might size a chute against.
  // Every genuine corpus reading sits far inside its own ceiling (the fastest, 148 ft/s,
  // against 924). Withheld with a reason rather than shown, because a descent rate is a
  // reading of a recovery system and a wrong one is worse than none.
  const freeFallLimit = apogeeAlt > 0 ? Math.sqrt(2 * G0 * apogeeAlt) : Infinity;
  let descentAboveFreeFall = false;
  const legRate = (from: number, to: number): number | null => {
    if (!(to > from + 1)) return null;
    const drop = altClean[from] - altClean[to];
    if (!(drop > Math.max(3, Math.abs(altClean[from]) * 0.1))) return null;
    const rate = downward(mean(descent, from + 1, to));
    if (rate != null && rate > freeFallLimit) {
      descentAboveFreeFall = true;
      return null;
    }
    return rate;
  };
  let drogueDescentRate: number | null = null;
  let mainDescentRate: number | null = null;
  // The whole descent as one figure, where the record shows no deployment to split it at.
  // It used to be written into `mainDescentRate`, which put a drogue-and-main average under
  // the label a flyer sizes a parachute against and — worse — let it be cross-checked against
  // other recordings' actual main legs. See `wholeDescentRate`.
  let wholeDescentRate: number | null = null;
  if (mainIdx !== null && cameDown) {
    drogueDescentRate = legRate(apogeeIdx, mainIdx);
    mainDescentRate = legRate(mainIdx, landingIdx);
  } else if (cameDown) {
    wholeDescentRate = legRate(apogeeIdx, landingIdx);
  }
  if (descentAboveFreeFall) {
    warnings.push(
      `A descent rate read faster than this flight could fall from ${Math.round(apogeeAlt)} m in a vacuum ` +
        `(${Math.round(freeFallLimit)} m/s), so it isn’t a rate the rocket can have had — something in the ` +
        `altitude record jumps. That leg is left unread rather than shown.`,
    );
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
    events.push({ type, label, time: time[idx], index: idx, altitude: altAt(idx), provenance, peakAccel });
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
  // Peak dynamic pressure (½ρv²) over the ASCENT — the structural load case — and the
  // altitude it happened at (a real design point).
  //
  // The window matters, and it used to be the whole record. Because q squares the speed,
  // a velocity that swings hard NEGATIVE contributes as though it were airspeed, and the
  // place that happens is the deployment transient: a charge vents the airframe and a
  // derived or integrated velocity spikes for a fraction of a second. Six of the 34 corpus
  // flights that report a max-Q took it from such a sample rather than from the boost —
  // 3.18x, 2.22x, 2.19x and 1.95x the real ascent peak on four of them, and on the 121 km
  // flight a −8,970 m/s sample read 47,322 kPa against an ascent peak of 404 kPa. A
  // structural load case a hundred times the real one is not a caveat, it is a wrong
  // number in the place a flyer sizes an airframe from.
  //
  // So q is read over the same window as the peak speed it comes from — liftoff to apogee,
  // climbing — which is also where the load case has always lived. A descent has real
  // airspeed and real q, but nothing near the boost's, and none of the six samples above
  // was a descent: they are hundreds of m/s of transient in a trace that measures tens.
  let maxDynamicPressure: number | null = null;
  let maxQIdx = -1;
  // Skip when an ascent gap has already made the velocity untrustworthy, or the peak
  // was physically impossible — q = ½ρv² would inherit the same spurious speed.
  if (ascentPresent && !ascentGapBreaksPeak && !velocityImplausible) {
    for (let i = Math.max(0, liftoffRef); i <= apogeeIdx && i < n; i++) {
      const v = velocity[i];
      const rho = airDensity[i];
      if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(rho)) continue;
      const q = 0.5 * rho * v * v;
      if (maxDynamicPressure === null || q > maxDynamicPressure) {
        maxDynamicPressure = q;
        maxQIdx = i;
      }
    }
  }
  const maxDynamicPressureAltitude = maxQIdx >= 0 ? nullIfNaN(altAt(maxQIdx)) : null;
  const maxVelocityAltitude = maxVelIdx >= 0 ? altAt(maxVelIdx) : NaN;

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
        transonicAltitude = nullIfNaN(altAt(i));
        break;
      }
    }
  }
  // A Mach-1 crossing is confirmed by a speed that was MEASURED — a device velocity
  // standing on an accelerometer, an inertial solution or a Doppler fix. A speed
  // differentiated from an altitude is not one, whichever sensor wrote that altitude, so
  // it is flagged and the headline and exports soften "went supersonic" instead of
  // asserting it.
  //
  // This used to carve GPS out, on the reasoning that nothing distorts a GPS reading
  // through Mach 1 the way a shock over a static port distorts a barometer. That much is
  // true and it is beside the point: the error in a GPS speed comes from differentiating a
  // coarse, lagging altitude, not from the transonic region, and the corpus measures it.
  // On both GPS flights a second instrument also recorded, Debrief's GPS-derived peak
  // lands above the measurement — Mach 1.46 (1,631 ft/s at 0.7 Hz) where a Blue Raven on
  // the same flight measured Mach 1.14 (1,243 ft/s at 50 Hz), and 1,466 ft/s at 2.1 Hz
  // where that tracker's own summary states 1,340 ft/s. +28% and +9%: a reading that can
  // be a third high is not one that settles whether a flight went supersonic.
  const transonicUnconfirmed = transonicTime !== null && velocitySource === 'baro';

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
  //
  // The burnout height here is `altAt`, the same corrected reading the burnout altitude
  // itself reports — not the raw `altClean` sample. On a transonic boost the shock over the
  // static port drives the trace away from the true pressure, and burnout sits squarely in
  // that stretch: two corpus mach-busters read −93 m (below the pad) and 774 m at a burnout
  // whose corrected heights are 482 m and 172 m. Taking the raw sample credited one flight
  // with climbing out of a hole and charged the other for a climb it never made, so the
  // coast efficiency printed beside the corrected burnout altitude disagreed with it —
  // 14.9% against 12.2% one way, 15.6% against 23.9% the other. Where the trace contradicts
  // itself and no inertial solution can stand in, `altAt` is NaN and the reading is withheld
  // by the guard below rather than computed off an altitude the analysis has already
  // rejected; the existing self-contradiction warning says why.
  let coastEfficiency: number | null = null;
  let dragLossAltitude: number | null = null;
  if (burnoutIdx !== null && !velocityImplausible) {
    const vBo = velocity[burnoutIdx];
    const vacuumGain = Number.isFinite(vBo) ? (vBo * vBo) / (2 * G0) : NaN;
    const actualGain = apogeeAlt - altAt(burnoutIdx);
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

  // The GPS receiver's own altitude, where the file carries one: a second, independent
  // altitude recording of the same flight. It is NOT merged into the analysis — the
  // barometric channel is the one that doesn't jump metres between fixes — but its
  // apogee is worth stating beside Debrief's, because the two sensors fail in completely
  // different ways: a barometer drifts with weather and goes useless through the
  // transonic push, a receiver loses lock and quantises to the metre.
  //
  // Two things have to hold before it is a reading. It needs a fix (the parser has
  // already blanked the samples where the receiver had no satellites and was repeating
  // its last position). And the record has to have come back down from its peak — a
  // rocket returns to the ground, so a GPS record whose highest sample is near where it
  // stops never saw an apogee at all; it stopped climbing. Two corpus flights are exactly
  // that (a 20-fix log and a 2.5-second telemetry capture), and without this they would
  // state a 0 ft and a 20 ft "GPS apogee" against a 3,253 ft and 3,547 ft flight.
  let gpsApogeeAltitude: number | null = null;
  let gpsApogeeTime: number | null = null;
  let gpsAscentFixes: number | null = null;
  const gpsAltCh = getChannel(flight, 'altitudeGps');
  if (gpsAltCh && gpsAltCh.values.length === n) {
    const g = gpsAltCh.values;
    // Pad reference: the locked fixes before the rocket moved, or the earliest ones the
    // record has when the log opens after liftoff.
    const padVals: number[] = [];
    for (let i = 0; i < n && padVals.length < 16; i++) {
      if (i > liftoffRef && padVals.length > 0) break;
      if (Number.isFinite(g[i])) padVals.push(g[i]);
    }
    const base = padVals.length > 0 ? padVals.slice().sort((a, b) => a - b)[padVals.length >> 1] : NaN;
    if (Number.isFinite(base)) {
      let peak = -Infinity;
      let peakIdx = -1;
      let last = NaN;
      let fixes = 0;
      for (let i = 0; i < n; i++) {
        const v = g[i];
        if (!Number.isFinite(v)) continue;
        last = v - base;
        if (i <= apogeeIdx) fixes++;
        if (v - base > peak) {
          peak = v - base;
          peakIdx = i;
        }
      }
      // Came back down from its own peak — the record covers a descent, not just a climb.
      const covered = peakIdx >= 0 && Number.isFinite(last) && last < peak * 0.5;
      if (covered && peak > 0) {
        gpsApogeeAltitude = peak;
        gpsApogeeTime = liftoffFound ? time[peakIdx] - liftoffTime : time[peakIdx] - time[0];
        gpsAscentFixes = fixes;
      }
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
    transonicUnconfirmed,
    derivedVelocityFrom: velocitySource === 'device' ? null : altitudeSource,
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
    burnoutAltitude: burnoutIdx !== null ? nullIfNaN(altAt(burnoutIdx)) : null,
    // Reads the velocity trace directly, so it inherits an impossible velocity even
    // when burnout was pinned off the accelerometer — withheld with the rest.
    burnoutVelocity: burnoutIdx !== null && !velocityImplausible ? velocity[burnoutIdx] : null,
    burnoutSource: burnoutIdx === null ? null : burnoutFromAccel ? 'measured' : 'derived',
    burnoutAtVelocityPeak: burnoutIdx !== null && maxVelIdx >= 0 && burnoutIdx === maxVelIdx,
    coastTime: burnoutIdx !== null ? apogeeTime - time[burnoutIdx] : null,
    coastEfficiency,
    dragLossAltitude,
    drogueDescentRate,
    mainDescentRate,
    wholeDescentRate,
    descentTime: landingFound ? landingTime - apogeeTime : null,
    flightTime: liftoffFound && landingFound ? landingTime - liftoffTime : null,
    // One flight, one record — the doubled-recording branch overwrites this where the
    // descent had to be read from the file's second copy.
    descentSource: landingFound ? 'same-record' : null,
    groundTemperature,
    batteryStartV,
    batteryMinV,
    peakRollRate,
    rollRevolutions,
    tiltAtBurnout,
    gpsApogeeAltitude,
    gpsApogeeTime,
    gpsAscentFixes,
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
  } else if (velocitySource === 'baro' && mach !== null && mach >= TRANSONIC_BARO_LOW) {
    // The GPS case, which the block above skips. A GPS altitude has no static port and no
    // shock, so the barometric warning would name the wrong failure — but the speed is
    // still differentiated from it, and the corpus says a coarse GPS altitude differentiated
    // puts the peak high rather than soft.
    warnings.push(
      `The peak speed (about Mach ${mach.toFixed(2)}) is worked out from the GPS altitude rather than measured. Nothing distorts a GPS through the transonic region the way a shock over a pressure port distorts a barometer, but differentiating a coarse, lagging GPS altitude runs the peak high: on both corpus GPS flights that a second instrument also recorded, this read comes out above the measurement — Mach 1.46 where a Blue Raven on the same flight measured Mach 1.14, and 1,466 ft/s where the tracker's own summary states 1,340 ft/s. So it doesn't confirm the rocket went supersonic, and it isn't a floor under how fast it actually went.`,
    );
  }
  if (sampleHz > 0 && sampleHz < 5 && velocitySource === 'baro') {
    warnings.push(
      `The log samples at about ${sampleHz.toFixed(1)} Hz, which is coarse for a derived velocity: real detail between samples is lost, and what noise survives differentiation lands in the peak — so a peak read this way runs high rather than soft.`,
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
  if (recoveredFromInertial || withheldAnAltitude) {
    // Both faults are the same physical cause read in opposite directions, so the sentence
    // is built from what this flight actually did.
    const how = [
      sawUnderRead
        ? 'dropping below the pad, or below a height the record had already reached'
        : '',
      sawOverRead
        ? 'climbing further in a stretch than the flight’s own measured top speed over that stretch can account for'
        : '',
    ]
      .filter(Boolean)
      .join(', and ');
    const cause = `The altitude trace contradicts itself on the way up — ${how}, and a climbing rocket can do neither. It is what a barometric port reads through the transonic push, where the shock over it drives the sensed pressure away from the true static value — upward on some airframes, downward on others.`;
    if (recoveredFromInertial) {
      warnings.push(
        `${cause} Where a reading lands in that stretch, its altitude is taken from the logger’s own inertial solution instead — a second recording in the same file, which doesn’t use the port — rather than off the distorted baro trace, and only where that solution satisfies the bound the barometer failed. The altitude chart still shows the barometric trace as recorded, and you can plot the inertial one against it in the explorer.`,
      );
    }
    if (withheldAnAltitude) {
      warnings.push(
        `${cause} Where a reading lands in that stretch its altitude is withheld (shown as “—”) rather than reported, because the record cannot say how high the rocket was there; the time and speed of those readings, and the altitude chart, are unaffected.`,
      );
    }
  }
  if (velocityNoiseDominated) {
    warnings.push(
      'The velocity on the way up swings well below zero — but a climbing, accelerating rocket has no negative vertical velocity, so this trace is carrying more noise than speed and its peak is that noise, not a reading. It is what a barometer records on an airframe that is tumbling or venting (a spent booster after separation, say), where the pressure at the port stops tracking altitude. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off it; apogee, timings and the descent still read normally.',
    );
  } else if (velocityBeyondAccel) {
    const mach = (v: number) => (series.speedOfSound > 0 ? (v / series.speedOfSound).toFixed(2) : '—');
    warnings.push(
      `The barometric speed reads about ${beyondAccelRatio.toFixed(1)}× faster than this flight’s own accelerometer allows, so it is not a speed. Integrating the measured g from liftoff, with every measured g credited as vertical — which makes it a generous ceiling, since a tilted airframe puts only part of its thrust into the climb — the rocket cannot have passed about Mach ${mach(accelCeiling)}, and the unpowered climb from the end of thrust to apogee needs at least about Mach ${mach(coastFloor)}, so the flight’s own records bracket its top speed between those two. What the barometer reads instead is the shock over its pressure port through the transonic push. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off a figure the rest of the record contradicts; apogee, timings and the descent still read normally.`,
    );
  } else if (velocityOutclimbsItself) {
    warnings.push(
      `The barometric speed contradicts this flight's own climb. From the point it peaks, a drag-free coast at that speed would gain about ${Math.round(vacuumFromPeak)} m — the flight gained ${Math.round(climbFromPeak)} m from there, which is ${(100 * (climbFromPeak / vacuumFromPeak)).toFixed(1)}% of it, where a real flight loses somewhere between a fifth and nineteen twentieths of that climb to drag (6.3–81.7% across this corpus). A speed that would have carried the rocket a hundred times higher than it went is the slope of a trace that jumped, not a speed. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off it; apogee, timings and the descent still read normally.`,
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
