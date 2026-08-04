// The analysis pipeline. Given a canonical flight, it establishes a ground
// baseline, finds the flight events, and reads off the headline numbers — doing
// its best with whatever channels the logger recorded, and noting where it had
// to estimate or couldn't be sure. See docs/plan.md for the reasoning behind each
// step, and the in-app "Where the numbers come from" section for the user-facing
// version.

import type { RawFlight, Channel } from '../flight/types';
import { getChannel } from '../flight/types';
import { sliceFlight } from '../flight/slice';
import { G0 } from '../units';
import { lenTok, spdTok } from '../caveatTokens';
import { derivedPeakList } from '../derivedPeak';
import type {
  AnalyzeOptions,
  FlightAnalysis,
  FlightEvent,
  FlightMetrics,
  FlightSegment,
  FlightSeries,
  ReadWindow,
} from './types';
import {
  medianFilter,
  hampelFilter,
  movingAverage,
  derivative,
  medianDt,
  finiteDifferenceMatch,
  argMax,
  argMin,
  peakAbsInTimeBracket,
  longestRunNear,
} from './signal';

/** How far around a deployment the accelerometer is read for the snatch shock, as `[back, fwd]`
 *  SECONDS of clock — and the two events get different brackets because they are DETECTED
 *  differently, which is the whole reason this is not one number.
 *
 *  Apogee is a maximum of the altitude trace, so the index is where the rocket stopped climbing.
 *  A charge fires at apogee give or take the motor's delay, and it fires BEFORE the peak as often
 *  as after — measured over the corpus, every apogee charge that a bracket finds sits 0.35–0.78 s
 *  ahead of the detected index.
 *
 *  Main is detected from the CHANGE IN DESCENT RATE, which the charge causes rather than
 *  coincides with: the canopy has to come out and the rate has to settle before the change is
 *  detectable at all. So its lag is structurally larger, and it measures 2.0–2.9 s across the
 *  corpus — an order of magnitude more than apogee's.
 *
 *  Both brackets are set past the largest lag measured rather than at it. Exported because the
 *  corpus invariant that two exports of one recording must publish the same shock has to state
 *  the bracket it is holding them to. */
export const SHOCK_BRACKET_S: Record<'apogee' | 'main', readonly [number, number]> = {
  apogee: [1.0, 1.0],
  main: [3.5, 1.0],
};

/** Window (in samples) covering roughly `seconds`, clamped to something sane. */
function windowFor(dt: number, seconds: number): number {
  if (dt <= 0) return 3;
  const w = Math.round(seconds / dt);
  return Math.max(3, Math.min(401, w | 1)); // odd, bounded
}

/**
 * Whether a channel holds a measurement at all, rather than a column the logger wrote and
 * never filled. A dead column is exactly zero at every sample (or has no finite sample), and
 * that is not what an accelerometer records: at rest it senses +1 g, and on a gravity-removed
 * channel it sits at ~0 with the sensor's own noise on it — tenths, hundredths, but not an
 * unbroken run of exact zeros over an entire flight.
 *
 * The distinction matters because a dead column is not harmless. Its zeros pass through the
 * gravity-removed normalisation as a flat +9.80665, and every reading taken off it is then a
 * fabricated 1.0000 g reported as MEASURED — a peak acceleration, a boost average, a
 * thrust-to-weight of exactly 1.00 — on all six surfaces that ask `accelerationSource`.
 */
function hasLiveSamples(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i]) && values[i] !== 0) return true;
  }
  return false;
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

/** The mean of `values` over the stretch of TIME from sample `from` to sample `to` inclusive —
 *  not the mean over the samples in it.
 *
 *  A rate averaged over sample index answers "what did a typical sample read", which is only the
 *  same question as "what did this stretch of flight average" when the samples are evenly spaced.
 *  Plenty of loggers are not: a Featherweight GPS drops from 10 Hz to 0.5 Hz once the flight is
 *  under way, so the seconds either side of apogee — where the rocket has barely started falling —
 *  carry twenty times the weight of the seconds where it is coming down fastest.
 *
 *  Measured on `fwgps__trf-f1machbuster-jan10`, whose cadence runs 0.1–2.0 s: over Debrief's own
 *  drogue leg the index mean is 49.33 m/s and the time mean 63.89 m/s **of the file's own VERTV
 *  column**, and the leg's altitude chord is 64.47 m/s. Debrief printed 50.73 m/s — a descent rate
 *  21% low, on the reading a flyer sizes a canopy against. The device's own measurement and the
 *  altitude agree with each other to 0.9%; nothing agrees with the index mean except the bug.
 *
 *  **Trapezoidal, and covering the CLOSING interval — both of those were got wrong first.** The
 *  obvious version weights sample `i` by `time[i] − time[i−1]` over `i < to`, which silently drops
 *  the gap that ends the leg: on `fwgps__trf-lemiv-l3`'s main leg the last sample spans 2.0 s of
 *  an 8.0 s leg, so a quarter of the leg's duration carried no weight at all — in a function whose
 *  whole contract is weighting by duration. It also lands on the wrong side of the very figure the
 *  fix is checked against: on the file above it gives 65.62 m/s where the trapezoid gives 64.80,
 *  against a device-measured 63.89.
 *
 *  So each interval is weighted by the mean of the two samples that bound it, which is exact for a
 *  rate that varies linearly across the gap and telescopes to the leg's own chord when `values` is
 *  the finite difference of the altitude. An interval whose step is missing, zero or backwards
 *  contributes nothing; an interval where either end is non-finite falls back to the end that is
 *  finite, so one bad sample costs its own two gaps rather than the whole leg.
 *
 *  **DO NOT WIRE THIS BACK INTO `legRate`.** One caller in this file — the liftoff
 *  thrust-to-weight, which averages a RAW measured channel over a fixed stretch of clock, which is
 *  exactly the shape the rule above is right for. `lib/explore.ts` implements it case for case for
 *  the channel explorer's window statistics and names this function as its authority. What it is
 *  NOT right for is the published descent rate, and the
 *  reason is in the last paragraph above: it telescopes to the leg's chord **when `values` is the
 *  finite difference of the altitude**, and `descent` is that difference after three index-window
 *  smoothers. Handed a smoothed series it does not telescope, and on a log whose cadence changes
 *  it weights a smeared sample by a gap it has nothing to do with. `legRate` takes the chord
 *  directly now. Measured 2026-08-04; see the comment there. */
function timeMean(values: Float64Array, time: Float64Array, from: number, to: number): number {
  let sum = 0;
  let weight = 0;
  for (let i = from + 1; i <= to; i++) {
    const dt = time[i] - time[i - 1];
    if (!Number.isFinite(dt) || dt <= 0) continue;
    const a = values[i - 1];
    const b = values[i];
    const okA = Number.isFinite(a);
    const okB = Number.isFinite(b);
    if (!okA && !okB) continue;
    sum += (okA && okB ? (a + b) / 2 : okA ? a : b) * dt;
    weight += dt;
  }
  // A stretch with no usable interval at all — a single sample, or a clock that does not advance —
  // has no time to average over, and the index mean is the only answer left rather than a silently
  // different one. Unreachable on every corpus file; kept because the alternative is NaN.
  return weight > 0 ? sum / weight : mean(values, from, to);
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

/**
 * A descent leg's altitude at one end, as the median of a short SYMMETRIC window rather than
 * the one sample that happens to sit there.
 *
 * Symmetric on purpose. Both ends of a descent are places the rocket is near enough
 * stationary — apogee is a turning point and landing is the ground — so a fraction of a
 * second of altitude either side is flat, and the median of it is the local consensus. A
 * one-sided window leaning into the leg would be biased instead: at apogee it would only see
 * altitudes already falling and at landing only altitudes still above the ground, and both
 * errors shrink the drop. That is a bias mid-leg and it is a bias here.
 *
 * 0.3 s matches the Hampel window the altitude was already cleaned with. Kept deliberately
 * short: this is a de-spiking measure, not a smoother, and a long window on a fast descent
 * would pull the endpoint toward the middle of the leg and understate the drop.
 */
function legEndpoint(alt: Float64Array, at: number, dt: number): number {
  const half = Math.max(1, windowFor(dt, 0.3) >> 1);
  const lo = Math.max(0, at - half);
  const hi = Math.min(alt.length, at + half + 1);
  // `median` takes a half-open range and ignores non-finite samples.
  const m = median(alt, lo, hi);
  return Number.isFinite(m) ? m : alt[at];
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

/** How far past the velocity peak the burnout zero-crossing may be looked for. The motor
 *  tails off rather than stopping dead, and on specific force the two instants are distinct:
 *  the velocity peak is where the axial trace passes +1 g (dv/dt = a − g), while thrust =
 *  drag — the end of thrust — is where it passes 0, necessarily a little later. Measured
 *  across the corpus's fourteen signed-axial flights, that gap is 0.05–0.40 s; a full second
 *  covers it with margin. It stays far short of the apogee ejection charge the search bound
 *  exists to exclude: on every flight the window matters to, the crossing lands 8.1–34.5 s
 *  before apogee. */
const BURNOUT_TAIL_S = 1;

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
 * The smallest climb this reads as a flight when it is deciding where one record ends and
 * the next begins. Below it, a bump in the trace is ground noise rather than a flight.
 *
 * A metre value, because the thing it has to clear — the pressure transient a rocket leaves
 * as it clears the pad, the spikes a logger writes after touchdown, the wobble on a record
 * that never held a flight at all — is a property of the sensor, not of the day's biggest
 * flight. Across the 46 corpus records that analyse (34 through a named parser, 12 through
 * the column mapper), those artefacts run 39, 48, 49, 61 and 76 m, and 100 m sits 31% clear
 * of the largest.
 *
 * But a flat 100 m would merge a whole class of real download. A Jolly Logic AltimeterThree
 * runs continuously through a club session and writes every flight of it into one file, and
 * a B or C motor lands squarely under 100 m — the corpus's own AltimeterThree sample is a
 * Semroc Mini Aerobee at 203 m, and that is the LARGE end of what that device sees; the
 * smallest flight in the whole corpus is a 52 m SRAD-computer record. So the floor comes
 * down on a record whose own best is small, to a quarter of it, and never below 30 m: a 60 m
 * and a 95 m flight in one file are two flights, while 13 m of barometric wobble on a
 * misparsed fragment is not.
 *
 * This is a fraction of the record's peak, which is what the 2x cliff this function used to
 * have was made of — but as a CEILING on an absolute floor, never as the test itself. The
 * first flight has to clear 100 m to be found beside a big one, whatever the big one is;
 * there is no ratio at which that flips.
 *
 * The cost, stated rather than hidden and repeated on the methods page: a download whose
 * FIRST flight is under the floor is read as one flight.
 */
const FLIGHT_FLOOR_M = 100;
const FLIGHT_FLOOR_MIN_M = 30;
const flightFloor = (recordPeak: number) =>
  Math.max(FLIGHT_FLOOR_MIN_M, Math.min(FLIGHT_FLOOR_M, 0.25 * recordPeak));

/** A climb slower than this is weather, not a rocket — a barometer drifting through an
 *  afternoon, or a flyer carrying the airframe back up a hill with the logger still running.
 *
 *  Half of the slowest climb that can clear the floor above: a coast to 100 m takes at most
 *  √(2·100/g) = 4.5 s, so even that flight averages 22 m/s, while 2,000 m of barometric
 *  drift over five minutes averages 6.7. The three real second flights in the corpus average
 *  120, 139 and 176 m/s. */
const MIN_CLIMB_MS = 10;

/** "Back on the deck" has to mean near the ground. A fraction of the record's own peak does
 *  not: on the corpus 121 km flight, 5% is 3.8 km, and a rocket still that high has not
 *  landed. The band is a fraction of the flight's own height up to this cap — and it is
 *  measured from where this record's ground actually IS, not from zero, so a rocket that
 *  came to rest on higher ground or a barometer that drifted through the afternoon still
 *  reads as landed. Fifty-five metres of offset is a rocket on a rise, or 6.5 hPa over a
 *  launch day; against a fixed band it silently swallowed the whole second flight. */
const DECK_CAP_M = 50;

/** How quickly a record may be back at a height it had already reached before that stops
 *  being a second flight and becomes a gap in the trace. See the walk below for the four
 *  measurements this sits between. */
const REJOIN_S = 2;

/** And how long a record has to sit on the ground between two climbs before they are two
 *  climbs rather than one with a dip in it. Nobody launches again ten seconds later. */
const UNSEGMENTED_GAP_S = 10;

/** The ground band for a flight that reached `peak`. */
const deckFor = (peak: number) => Math.max(3, Math.min(peak * 0.05, DECK_CAP_M));

/** How far ahead "the ground here" is allowed to look. Long enough to cover a rocket coming
 *  to rest and the trace settling under it; short enough that what the record does twenty
 *  minutes later cannot reach back and move it. */
const GROUND_HORIZON_S = 60;

/** And how far above the pad that ground may ever sit. Terrain and a launch day's barometric
 *  drift move the ground by tens of metres, not hundreds — while a record that stops in the
 *  air ends wherever the rocket was, and the corpus 121 km flight's last sample is 355 m up.
 *  Without this bound that reads as a landing on very high ground, and a single 121 km flight
 *  is announced as two. */
const GROUND_RISE_CAP_M = 200;

/**
 * Where this record's ground is at each sample: the lowest the trace gets over the next
 * minute, never below the pad.
 *
 * **Local, not global.** A rocket that comes to rest on a rise, or a barometer that drifts up
 * through the afternoon, puts the deck tens of metres above zero, and a band measured from
 * zero never registers a landing at all — 55 m of offset, a rocket on a rise or 6.5 hPa over
 * a launch day, silently swallowed the second flight in a download. But taking that ground
 * from the whole REST of the record is worse than either: one sample below it, anywhere
 * later, retro-actively collapses the band under the resting level the first flight actually
 * reached. Measured on a launch day whose airframe was carried back down off the rise after
 * the last flight, that read a 1,235.7 s flight time against an honest 224.5 s — a headline
 * number 5.5x wrong, with the multi-flight warning gone too. Below 1,000 m it took 16 m of
 * offset, which is under 2 hPa: a couple of hours of ordinary weather.
 *
 * Clamped at the pad below, because a trace that reads BELOW where it started has not found
 * lower ground — it has lost its reference. The corpus Eggtimer anomaly ends 445 m under its
 * own pad, and a deck taken from there sits 400 m underground: the early deployment that has
 * to be cut is at 0 m, nowhere near it, and the file would be read whole, publishing
 * 8,969 ft of baro spike as the apogee of a 4,661 ft flight.
 */
function localGround(altitude: Float64Array, time: Float64Array): Float64Array {
  const n = altitude.length;
  const out = new Float64Array(n);
  // Two sliding-window minima, then the lower of the two — the window is CENTRED on the
  // sample, because at a touchdown the resting level is as much behind as ahead, and a
  // forward-only window mid-descent reads the ground as wherever the rocket happens to be a
  // minute later. Both are walked left to right, so each is an ordinary monotonic deque:
  // samples enter at the right and expire at the left.
  const back = new Float64Array(n); // the lowest over [t − horizon, t]
  const dqb: number[] = [];
  let left = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(altitude[i])) {
      while (dqb.length && altitude[dqb[dqb.length - 1]] >= altitude[i]) dqb.pop();
      dqb.push(i);
    }
    while (left < i && time[left] < time[i] - GROUND_HORIZON_S) left++;
    while (dqb.length && dqb[0] < left) dqb.shift();
    back[i] = dqb.length ? altitude[dqb[0]] : Infinity;
  }
  const dqf: number[] = []; // the lowest over [t, t + horizon]
  let right = -1;
  for (let i = 0; i < n; i++) {
    while (right + 1 < n && time[right + 1] <= time[i] + GROUND_HORIZON_S) {
      right++;
      if (!Number.isFinite(altitude[right])) continue;
      while (dqf.length && altitude[dqf[dqf.length - 1]] >= altitude[right]) dqf.pop();
      dqf.push(right);
    }
    while (dqf.length && dqf[0] < i) dqf.shift();
    const fwd = dqf.length ? altitude[dqf[0]] : Infinity;
    const lowest = Math.min(back[i], fwd);
    out[i] = Number.isFinite(lowest) ? Math.min(GROUND_RISE_CAP_M, Math.max(0, lowest)) : 0;
  }
  return out;
}

/** A body released at `peak` reaches the ground at √(2gh) and no faster. Doubled for
 *  barometric headroom, this bounds both directions: a step DOWN into the ground band
 *  quicker than this is not a fall the rocket took, and a mean climb rate above it is not
 *  an ascent an airframe flew. The corpus files that trip the first clear it by 9.6x, 32x
 *  and 315x; the real climbs measured against the second sit at 30–36% of it, while the two
 *  artefacts that clear the flight floor are 5x and 51x over. */
const tooFast = (peak: number) => 2 * Math.sqrt(2 * G0 * Math.max(0, peak));

/**
 * Is there another flight in `altitude` from `from` on? Answered by shape, not by size
 * relative to anything else in the file: it has to climb past the flight floor, and it has
 * to climb at a rate an airframe makes — neither the crawl of a drifting barometer nor the
 * single-sample leap of a spike.
 *
 * `peakIdx` is where that climb tops out, which is what the caller needs to find the trough
 * between the two flights.
 */
function nextFlightIn(
  altitude: Float64Array,
  time: Float64Array,
  from: number,
  floor: number,
): { peakIdx: number } | null {
  // The highest thing in the rest of the record is not always the next flight — it can be a
  // dropped pressure reading. One 3,500 m sample near the end of a [3000, 300] launch day
  // used to take the whole detection with it: the candidate was the spike, the spike is not a
  // climb, and the record came back as one flight with a flight time spanning both. So the
  // candidates are taken in descending order until one is shaped like a flight.
  let ceiling = Infinity;
  for (let attempt = 0; attempt < MAX_PEAK_CANDIDATES; attempt++) {
    const found = flightAtHighestBelow(altitude, time, from, floor, ceiling);
    if (found.peakIdx < 0) return null;
    if (found.ok) return { peakIdx: found.peakIdx };
    ceiling = found.peak;
  }
  return null;
}

/** As many spikes as it is worth stepping over before calling the rest of a record flat. */
const MAX_PEAK_CANDIDATES = 8;

function flightAtHighestBelow(
  altitude: Float64Array,
  time: Float64Array,
  from: number,
  floor: number,
  ceiling: number,
): { ok: boolean; peak: number; peakIdx: number } {
  const n = altitude.length;
  let peak = -Infinity;
  let peakIdx = -1;
  for (let i = from; i < n; i++) {
    if (Number.isFinite(altitude[i]) && altitude[i] < ceiling && altitude[i] > peak) { peak = altitude[i]; peakIdx = i; }
  }
  if (peakIdx < 0) return { ok: false, peak: -Infinity, peakIdx: -1 };

  // How fast it rose, measured over the TOP HALF of the climb rather than from a fixed band
  // near the ground. That is not a refinement, it is the only version that survives weather:
  // a flyer waiting between flights is waiting through it, and a barometric baseline 60 m
  // higher by the second launch never comes back under a fixed band at all. Measured from
  // there, the climb of a 3,000 m flight after a ten-minute wait averaged 9.5 m/s — the ten
  // minutes of standing about included — which read as no flight in the rest of the file and
  // put the first Sev-1 straight back. Half the flight's own height is above any drift worth
  // the name, and the rate over that half is a rocket's whatever the ground did.
  let ground = Infinity;
  for (let i = from; i <= peakIdx; i++) if (Number.isFinite(altitude[i]) && altitude[i] < ground) ground = altitude[i];
  const no = { ok: false, peak, peakIdx };
  if (!Number.isFinite(ground)) return no;
  // Never below the pad, for the same reason the deck is not: a trace that reads under where
  // it started has lost its reference, not found lower ground. The corpus Eggtimer anomaly
  // ends 445 m under its own pad, and unclamped that credited every later wobble with 445 m
  // of climb — a 10 m bump was announced as a third flight in the file.
  ground = Math.max(0, ground);
  const height = peak - ground;
  if (!(height >= floor)) return no;
  const half = ground + 0.5 * height;
  let lo = from;
  for (let k = peakIdx; k >= from; k--) {
    if (Number.isFinite(altitude[k]) && altitude[k] <= half) { lo = k; break; }
  }
  const climb = time[peakIdx] - time[lo];
  const rate = climb > 0 ? (peak - altitude[lo]) / climb : Infinity;
  if (!(rate >= MIN_CLIMB_MS) || !(rate <= tooFast(height))) return no;
  return { ok: true, peak, peakIdx };
}


/**
 * What to say about a record the walk could NOT cut, but which does not look like one flight.
 *
 * The segmenter refuses a boundary it cannot justify, and every one of those refusals is
 * silent: the reading comes back as an ordinary flight report over the whole record. That is
 * the honest half of "every flight in one download" — where Debrief cannot tell, it has to
 * say so rather than read through it, because the alternative is a liftoff from one flight
 * and an apogee from another under one set of headline numbers.
 *
 * The signal is not another threshold on the same question. It is the count of times the
 * trace leaves the ground and comes back to it — measured on the record's own ground band,
 * with no flight floor at all. Where that count is more than one and the walk still found no
 * cut, the two disagree, and the flyer is the one who can settle it.
 */
function unsegmentedNote(altitude: Float64Array, time: Float64Array, noise: number): string | null {
  const n = altitude.length;
  const ground = localGround(altitude, time);
  let peak = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(altitude[i]) && altitude[i] > peak) peak = altitude[i];
  if (!(peak > 0)) return null;
  // "Off the ground" against the record's OWN noise, never against its best flight — that is
  // the mistake this whole function exists downstream of. A record whose pad wobbles by 3 m
  // needs a 15 m bar; one whose pad is quiet needs 3.
  const bar = Math.max(3, 5 * noise);
  const minClimb = Math.max(15, 8 * noise);
  const climbs: { peak: number; at: number; from: number; to: number }[] = [];
  let up = false;
  let runPeak = 0;
  let runAt = 0;
  let runFrom = 0;
  for (let i = 0; i < n; i++) {
    const h = altitude[i];
    if (!Number.isFinite(h)) continue;
    const above = h - ground[i] > bar;
    if (above) {
      if (!up) { up = true; runPeak = 0; runAt = i; runFrom = i; }
      if (h - ground[i] > runPeak) { runPeak = h - ground[i]; runAt = i; }
    } else if (up) {
      up = false;
      climbs.push({ peak: runPeak, at: runAt, from: runFrom, to: i });
    }
  }
  if (up) climbs.push({ peak: runPeak, at: runAt, from: runFrom, to: n - 1 });
  // Two climbs with a moment of ground between them are one climb with a dip in it. Nobody
  // launches again ten seconds later, so anything closer than that is the trace, not the day:
  // the pressure transient a rocket leaves clearing the pad reads as a separate 49 m climb
  // 3.8 s before the real one on two corpus iREC records, and a single-sample dive on a
  // corpus StratoLogger reads as one 0.05 s later.
  const merged: typeof climbs = [];
  for (const c of climbs) {
    const last = merged[merged.length - 1];
    if (last && time[c.from] - time[last.to] < UNSEGMENTED_GAP_S) {
      if (c.peak > last.peak) { last.peak = c.peak; last.at = c.at; }
      last.to = c.to;
    } else merged.push({ ...c });
  }
  const real = merged.filter((c) => c.peak >= minClimb);
  if (real.length < 2) return null;
  const where = real.slice(1, 4).map((c) => formatSeconds(time[c.at] - time[0])).join(', ');
  return (
    `Debrief read this record as one flight, but the trace leaves the ground and returns to it ` +
    `${real.length} times — the later climbs peak around ${where}. It could not justify cutting the record ` +
    `there, so nothing has been split: if these are separate flights, choose the stretch that is yours ` +
    `and the analysis will read that instead. If they are one flight, the readings below are of all of it.`
  );
}

/**
 * Where a second flight begins in a record that holds more than one, or null for the
 * normal single-flight file. The test is a thing a rocket cannot do: come back to the
 * ground and then climb again.
 *
 * **Every threshold here is measured against the flight in hand, never against the record's
 * own highest flight.** That distinction is the whole of this function's history. The
 * earlier version asked whether the trace had reached half the RECORD's peak, which reads
 * correctly only while a file's flights are within 2x of each other: a launch day of a
 * 300 m sport flight and a 3,000 m certification flight tripped nothing at all, and the two
 * were read as one — liftoff pinned in the first, apogee taken from the second, and
 * `timeToApogee`, `burnTime` and `flightTime` spanning both and printed as headline
 * readings with no caveat. The cliff was exactly 2.00x, in both directions.
 *
 * So the walk carries the peak of the segment it is inside, and asks three physical
 * questions at every return to that segment's own ground band:
 *
 *   - Did the record DESCEND into the band, or jump into it? A logger that restarts
 *     mid-flight writes the next copy's pad straight after the last sample of the one
 *     before, and the join is a fall no rocket could have taken. On the corpus Blue Raven
 *     `jan18 LR` the trace is still at 823.2 ft and the sample 0.020 s later is −3.4 ft, a
 *     step of 41,330 ft/s on a flight whose descent ran at 55. From that came a 122.90 s
 *     flight time and a 55 ft/s descent rate published against the device's own stated
 *     29.0 — a 3.6x error in the landing energy read off it.
 *   - If it descended, did it take at least as long as a body dropped from that peak? A
 *     barometric port reads the rocket below the pad through the transonic push; that dip
 *     is not a landing, and on a 98 m segment it reaches the ground band 4.5 s sooner than
 *     free fall from that height allows.
 *   - Does the record come back ABOVE the height it had already reached? Then it never left
 *     the sky. A trace that drops out to zero mid-ascent and resumes 1.2 km higher lost its
 *     data; it did not land and launch again.
 *
 * A Blue Raven backup file in the corpus holds one flight recorded twice: it climbs to
 * 10,230 ft by 18 s, drops to 0, then climbs to 10,266 ft again. Read as one flight its
 * apogee lands in the second copy while liftoff sits in the first, so time-to-apogee came
 * out 39.6 s where the GPS recording the same flight puts apogee 19.3 s after liftoff.
 */
function nextFlightStart(altitude: Float64Array, time: Float64Array): number | null {
  const n = altitude.length;
  const groundFrom = localGround(altitude, time);
  let recordPeak = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(altitude[i]) && altitude[i] > recordPeak) recordPeak = altitude[i];
  const floor = flightFloor(recordPeak);

  let segPeak = 0; // the highest this segment has reached…
  let segPeakIdx = 0; // …and when
  let flew = false; // has it climbed far enough to be a flight at all?
  for (let i = 0; i < n; i++) {
    const h = altitude[i];
    if (!Number.isFinite(h)) continue;
    if (h > segPeak) { segPeak = h; segPeakIdx = i; }
    // A dip to the ground before anything climbed (a GPS losing lock through the boost
    // reads zero) is not a landing, so the climb has to come first.
    // Measured from the pad, which is where the altitude channel is zeroed and where every
    // first flight starts. Not from `groundFrom`: a record that dips below its own pad after
    // landing would then credit that dip to the climb, and a 49 m pressure transient on a
    // record whose trace reaches −60 m would arm the detector at 109 m.
    if (!flew) { flew = segPeak >= floor; continue; }
    // Taken where the record IS, not where it peaked: the deck is the ground under this
    // sample, and a flight's peak can be a hundred seconds and several kilometres away.
    const ground = groundFrom[i];
    const fell = segPeak - ground; // how far this flight has to come down
    const deck = ground + deckFor(fell);
    if (h > deck) continue;

    let before = i - 1;
    while (before >= 0 && !Number.isFinite(altitude[before])) before--;
    const step =
      before >= 0 && time[i] > time[before] ? (altitude[before] - altitude[i]) / (time[i] - time[before]) : 0;
    // Did the record STEP into the ground band rather than descend into it? That is what a
    // logger restarting mid-flight writes, and it is also what a dropout and a transonic dip
    // write — so a step alone decides nothing except where the cut goes. What tells the three
    // apart is what the record does next.
    const jumped = step > tooFast(fell);

    // A record that is back at a height it had ALREADY reached never left the sky: the trace
    // lost its way and the same climb carried on. Two shapes of that, and it takes both tests.
    //
    // A dropout — a GPS losing lock, a logger writing zeros — comes back ABOVE where it went
    // quiet in one sample, because the rocket kept climbing while the trace did not: five
    // seconds of zeros two seconds into a 6,000 m climb resumes at 1,854 m against a 538 m
    // peak. That test is only asked of a record that STEPPED into the band, because a record
    // that descended into it did not lose anything — and on a coarse log one sample of a real
    // second flight's boost crosses from below the deck to above the first flight's apogee,
    // which read a 1 Hz launch day as one flight.
    if (jumped) {
      let back = -1;
      for (let k = i; k < n; k++) if (Number.isFinite(altitude[k]) && altitude[k] > deck) { back = k; break; }
      // Skip the whole quiet stretch rather than the one sample: inside a five-second dropout
      // every sample after the first has a flat step behind it, so a per-sample `continue`
      // hands the same gap back to the walk as an ordinary descent two samples later.
      if (back >= 0 && altitude[back] >= segPeak) { i = back; continue; }
    }
    // A barometric port under the transonic push comes back BELOW the deck first, gradually,
    // and is only caught by the clock: over four shapes of that artefact it is back above
    // where it was within 0.45–0.80 s. A record that genuinely landed and launched again
    // takes 18.4 and 20.2 s to climb back through it (the two corpus Blue Ravens), and the
    // sharpest real case Debrief must still cut — an Eggtimer whose baro fires off a cliff
    // after an early deployment — takes 4.2 s. Two seconds sits 2.5x clear of both sides.
    let regained = Infinity;
    for (let k = i; k < n; k++) {
      if (!Number.isFinite(altitude[k])) continue;
      if (altitude[k] >= segPeak) { regained = time[k] - time[i]; break; }
    }
    if (regained < REJOIN_S) continue;

    const next = nextFlightIn(altitude, time, i, floor);
    if (!next) return null; // it came down and stayed down: one flight, in full.

    // A join is cut AT the join. Cutting at the trough there hands the first copy the NEXT
    // copy's pad samples, and the landing detector takes one. The first copy ends at the
    // join, and what it then lacks (on `jan18 LR` it stops 250.9 m up, 13.1% of its own
    // apogee) is withheld and said, or supplied by the second copy where the file holds one
    // flight twice.
    if (jumped) return i >= 4 ? i : null;

    // A real landing is cut at the LOW POINT between the two — the first sample of the
    // trough — rather than where the record crossed the ground band, so the first flight
    // gets its touchdown and the next one the quiet stretch its baseline is measured from.
    let low = Infinity;
    for (let k = i; k < next.peakIdx; k++) if (Number.isFinite(altitude[k]) && altitude[k] < low) low = altitude[k];
    let cut = i;
    for (let k = i; k < next.peakIdx; k++) {
      if (Number.isFinite(altitude[k]) && altitude[k] <= low + 1) {
        cut = k;
        break;
      }
    }
    // Too short a first segment to analyze is better read whole than truncated to nothing.
    return cut >= 4 ? cut : null;
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
    second = analyzeFlight(sliceFlight(flight, cut, flight.time.length), { depth: 1, datum });
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
      `${lenTok(apo)}. Descent time and flight time come from that second copy; the climb, the apogee and every reading above them come from the first.`,
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

/** As many flights as one download is ever going to hold. A record that keeps producing
 *  boundaries past this is not a launch day; the list says it stopped counting rather than
 *  running the walk over a corrupt trace forever. */
const MAX_SEGMENTS = 24;

/**
 * Every flight in a record that holds more than one, in file order, with the one that was
 * read marked. The first boundary is already known — the caller found it — and the rest come
 * from running the same detector over what is left, which is exactly what it does on the
 * whole record: a later flight starts on the ground in the trough after the one before, so
 * it is an ordinary record from the detector's point of view. Measured on a three-flight
 * synthetic, the segments read 299.9 / 499.8 / 249.9 m against a true 300 / 500 / 250.
 *
 * The apogees come off the spike-cleaned trace, because the ejection pop a barometer records
 * would otherwise put a row in this list several hundred feet above what the report says
 * about the same flight. The row for the flight that WAS read carries the analysis's own
 * figure instead, so those two can never disagree at all.
 */
function flightCuts(altitude: Float64Array, time: Float64Array, firstCut: number): number[] {
  const cuts: number[] = [0, firstCut];
  let at = firstCut;
  while (cuts.length < MAX_SEGMENTS) {
    const rel = nextFlightStart(altitude.subarray(at), time.subarray(at));
    if (rel == null) break;
    at += rel;
    cuts.push(at);
  }
  return cuts;
}

function allFlights(
  altitude: Float64Array,
  time: Float64Array,
  cuts: number[],
  dt: number,
  read: ReadWindow | null,
  readApogee: number,
): FlightSegment[] {
  const n = altitude.length;
  const clean = hampelFilter(altitude, windowFor(dt, 0.3));
  return cuts.map((from, i) => {
    const to = i + 1 < cuts.length ? cuts[i + 1] : n;
    let peak = -Infinity;
    for (let k = from; k < to; k++) if (Number.isFinite(clean[k]) && clean[k] > peak) peak = clean[k];
    // The row the analysis is OF carries the analysis's own apogee, so the list and the
    // headline reading cannot disagree. A crop that is not one of these flights matches no
    // row, and the strip says so rather than marking one the readings do not belong to.
    const isRead = !!read && read.from === from && read.to === to;
    return {
      index: i + 1,
      from,
      to,
      startTime: time[from],
      endTime: time[Math.max(from, to - 1)],
      apogeeM: isRead && Number.isFinite(readApogee) ? readApogee : peak,
      read: isRead,
    };
  });
}

/**
 * Every flight in the FILE, worked out without analysing it — for a report that is showing a
 * crop and still has to offer the way back to the others.
 *
 * Without this a flyer who opens flight 2 of a launch day loses the list that got them there:
 * the crop is a slice, a slice holds one flight, and the strip vanishes. That is a state with
 * no way out of it, which is worse than the thing it was trying to help with.
 */
function fileSegments(flight: RawFlight, read: ReadWindow, readApogee: number): FlightSegment[] | undefined {
  const time = flight.time;
  const n = time.length;
  if (n < 4) return undefined;
  const dt = medianDt(time);
  const altCh = getChannel(flight, 'altitude');
  const presCh = getChannel(flight, 'pressure');
  let altitude: Float64Array;
  if (altCh) altitude = altCh.values.slice();
  else if (presCh) {
    const baseShort = Math.max(3, Math.min(n, Math.round(0.3 / (dt || 0.1))));
    altitude = altitudeFromPressure(presCh.values, median(presCh.values, 0, baseShort));
  } else return undefined;
  const { baseEnd, offset } = padBaseline(altitude, dt);
  for (let i = 0; i < n; i++) altitude[i] -= offset;
  const firstCut = nextFlightStart(altitude, time);
  if (firstCut == null) return undefined;
  const cuts = flightCuts(altitude, time, firstCut);
  // The SAME question the uncropped reading asked, with the same answer to hand. Asked with
  // `padDataLikely` hardcoded true instead, a two-flight file with no quiet pad window is two
  // flights uncropped and "one flight written twice" on every crop — so the strip offers
  // flight 2 and then destroys itself the moment it is opened.
  const padDataLikely = baseEnd >= Math.max(5, Math.round(0.4 / (dt || 0.1)));
  if (cuts.length === 2 && recordedTwice(altitude, firstCut, padDataLikely)) return undefined;
  return allFlights(altitude, time, cuts, dt, read, readApogee);
}

/** "3 of them", or "at least 24 of them" where the walk stopped counting. */
function segmentCount(segments: FlightSegment[]): string {
  return `${segments.length >= MAX_SEGMENTS ? `at least ${MAX_SEGMENTS}` : segments.length} of them`;
}

/** Where the flights Debrief did not read start, so the sentence is checkable against the
 *  trace rather than asking to be believed. */
function othersAt(segments: FlightSegment[]): string {
  const rest = segments.filter((s) => !s.read);
  const listed = rest.slice(0, 6);
  const parts = listed.map(
    (s) => `flight ${s.index} at ${formatSeconds(s.startTime - segments[0].startTime)}${Number.isFinite(s.apogeeM) ? ` (${lenTok(s.apogeeM)})` : ''}`,
  );
  const more = rest.length - listed.length;
  return `The rest of the file holds ${parts.join(', ')}${more > 0 ? ` and ${more} more` : ''}.`;
}

/**
 * Read a flight.
 *
 * `opts.read` is the flyer's own answer to "which stretch of this file is my flight", and it
 * is the only option a caller outside this module has any business setting: it overrules
 * Debrief's segmentation, and it is measured against the FILE's own pad rather than against
 * the crop's opening samples. That distinction is the whole of it — a crop starting 1.5 s
 * after liftoff on a 300 m record reads 170.7 m, 43% low, if it takes its own baseline.
 *
 * The rest are internal. `depth` guards the multi-segment recursion below; `datum` and
 * `padPressure` are the file's ground references, handed to a slice that has no pad of its
 * own. That copy starts in the trough between two recordings, and measuring it against itself
 * is what made an earlier attempt read 10,723 ft where the device said 10,266.
 */
export function analyzeFlight(flight: RawFlight, opts: AnalyzeOptions = {}): FlightAnalysis {
  const { depth = 0, datum, padPressure: padPressureIn, padLikely } = opts;

  // The flyer's crop, honoured before anything else is read. The file's own ground references
  // are taken from the WHOLE record first and handed to the slice, because a stretch chosen
  // from the middle of a flight has no pad in it to measure against.
  if (opts.read && depth === 0) {
    const { from, to } = opts.read;
    const lo = Math.max(0, Math.min(from, flight.time.length - 1));
    const hi = Math.max(lo + 4, Math.min(to, flight.time.length));
    // A crop that is the whole file is not a crop — it is the way back out of one, and it has
    // to land on the ordinary reading: the segmentation runs again, and nothing tells the
    // flyer they chose a stretch when what they chose was all of it.
    if (lo === 0 && hi === flight.time.length) return analyzeWhole(flight, 0, undefined, undefined);
    const refs = groundReferences(flight);
    const cropped = analyzeFlight(sliceFlight(flight, lo, hi), { depth: 1, ...refs });
    // The file's own flights come along, so the strip that offered this crop is still there
    // to offer the others. Marked against the crop: where it IS one of them the row says so,
    // and where it is a stretch of the flyer's own no row is marked.
    const segments = fileSegments(flight, { from: lo, to: hi }, cropped.metrics.apogeeAltitude);
    // The crop is honoured whatever is in it — the flyer said this is their flight, and the
    // readings are of exactly what they chose. But a stretch that still holds a landing and
    // another launch produces a liftoff from one flight and an apogee from another, which is
    // the original Sev-1 arrived at by a different road. Read as asked, and say so.
    const spansMore = segments
      ? segments.filter((seg) => seg.from < hi && seg.to > lo).length > 1
      : false;
    return {
      ...cropped,
      ...(segments ? { segments } : {}),
      extent: {
        from: lo,
        to: hi,
        startTime: flight.time[lo],
        endTime: flight.time[hi - 1],
        fileEndTime: flight.time[flight.time.length - 1],
        source: 'chosen',
      },
      warnings: [
        `You chose the stretch Debrief read: ${formatSeconds(flight.time[lo])} to ${formatSeconds(flight.time[hi - 1])} of a ${formatSeconds(flight.time[flight.time.length - 1])} file. Every reading here is of that stretch, measured against the file's own pad baseline rather than the start of your selection.`,
        ...(spansMore
          ? [
              'The stretch you chose reaches across more than one of the flights in this file, so it was read as a single flight: liftoff comes from the first of them and apogee from whichever went highest, and the time between them spans both. Narrow the selection to one flight, or pick one from the list above.',
            ]
          : []),
        ...cropped.warnings,
      ],
    };
  }
  return analyzeWhole(flight, depth, datum, padPressureIn, padLikely);
}

/**
 * The ground this file was launched from, in the units each reference is used in. Taken from
 * the whole record so a slice out of the middle can be measured against the pad rather than
 * against wherever it happens to start.
 */
function groundReferences(flight: RawFlight): { datum?: number; padPressure?: number; padLikely: boolean } {
  const dt = medianDt(flight.time);
  const n = flight.time.length;
  const minQuiet = Math.max(5, Math.round(0.4 / (dt || 0.1)));
  const altCh = getChannel(flight, 'altitude');
  const presCh = getChannel(flight, 'pressure');
  const probe = altCh ? altCh.values.slice() : presCh ? altitudeFromPressure(presCh.values, median(presCh.values, 0, Math.max(3, Math.min(n, Math.round(0.3 / (dt || 0.1)))))) : null;
  // Whether the FILE started on the pad, which is a property of the file and not of the
  // stretch chosen out of it. A crop taken from the middle of a flight has no quiet window in
  // it and would otherwise be told it does not start on the pad — true of the crop, useless
  // to the flyer, and it hides the case where the FILE genuinely didn't.
  const padLikely = probe ? padBaseline(probe, dt).baseEnd >= minQuiet : false;
  if (altCh) return { datum: padBaseline(altCh.values.slice(), dt).offset, padLikely };
  if (presCh) {
    const baseShort = Math.max(3, Math.min(n, Math.round(0.3 / (dt || 0.1))));
    return { padPressure: median(presCh.values, 0, baseShort), padLikely };
  }
  return { padLikely: false };
}

function analyzeWhole(
  flight: RawFlight,
  depth: number,
  datum: number | undefined,
  padPressureIn: number | undefined,
  padLikely?: boolean,
): FlightAnalysis {
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
    // A crop hands in the FILE's pad pressure: a stretch out of the middle of a flight has
    // no pad of its own, and altitude derived from pressure takes its reference from that.
    const padPressure = padPressureIn ?? median(presCh.values, 0, baseShort);
    altitude = altitudeFromPressure(presCh.values, padPressure);
    warnings.push('No altitude channel — altitude was derived from barometric pressure.');
  } else {
    throw new Error('This file has no altitude or pressure data to analyze.');
  }

  // Pad baseline from the quiet pre-launch window (see `padBaseline`) — unless a caller
  // handed us the file's own datum, which only the doubled-recording branch does.
  const { baseEnd, offset: ownOffset } = padBaseline(altitude, dt);
  // A supplied pad PRESSURE has already put this altitude on the file's ground — subtracting
  // a baseline taken from the slice's own opening samples would move it a second time, and
  // on a crop that starts mid-climb that reads 205 m off a 300 m flight.
  const baseOffset = datum ?? (padPressureIn != null && !altCh ? 0 : ownOffset);
  for (let i = 0; i < n; i++) altitude[i] -= baseOffset;

  // If there's no real quiet window, the file probably starts mid-flight, so the
  // baseline (and anything measured against it) can't be fully trusted.
  const baselineNoise = stdev(altitude, 0, baseEnd);
  const minQuiet = Math.max(5, Math.round(0.4 / (dt || 0.1)));
  // A datum handed in by the doubled-recording branch came from a real pad window, because
  // that branch measured it on a record that started on one. A CROP's datum did not: the file
  // it came from may never have started on the pad at all, and taking the datum as proof of
  // one drops both pad caveats and reads the ground pressure and temperature out of mid-air.
  // So a crop says which it is, and only that answer is believed.
  const padDataLikely = padLikely ?? (datum != null || baseEnd >= minQuiet);
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
  const secondFlightAt = nextFlightStart(altitude, time);
  if (secondFlightAt != null && depth === 0) {
    const first = analyzeFlight(sliceFlight(flight, 0, secondFlightAt), { depth: 1 });
    const opening = formatSeconds(time[secondFlightAt] - time[0]);
    const cuts = flightCuts(altitude, time, secondFlightAt);
    // Two different files trip this detector, and telling them apart changes what the flyer
    // should do about it. Both corpus Blue Ravens hold ONE flight written twice; telling
    // their owner to "read the others by splitting the file" would hand them the same flight
    // again, and telling them the file holds more than one flight is simply false.
    //
    // A doubled recording holds exactly TWO segments, and both corpus files that are one do.
    // Without that clause the peak comparison is enough to call a launch day of five flights
    // to the same altitude "the same flight written twice — there is no second flight to
    // read", which is the most confidently wrong sentence this function can produce.
    const twice = cuts.length === 2 && recordedTwice(altitude, secondFlightAt, padDataLikely);
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
    // Every flight in the download, not just the one that was read. A doubled recording is
    // one flight and gets no list — "flight 2 of 2" would be a second flight that isn't there.
    const segments = twice
      ? undefined
      : allFlights(altitude, time, cuts, dt, { from: 0, to: secondFlightAt }, base.metrics.apogeeAltitude);
    return {
      ...base,
      ...(segments ? { segments } : {}),
      extent: {
        from: 0,
        to: secondFlightAt,
        startTime: time[0],
        endTime: time[secondFlightAt - 1],
        fileEndTime: time[n - 1],
        source: 'segmented',
      },
      warnings: [
        twice
          ? `This file holds the same flight written twice — the record returns to the ground and climbs again to the same height (within ${(RECORDED_TWICE_AGREEMENT * 100).toFixed(0)}%, measured against this file's own pad baseline). Debrief read the first copy (the opening ${opening} of the file), which is the one that starts on the pad. There is no second flight to read.`
          : `This file holds more than one flight — ${segmentCount(segments!)}. The record returns to the ground and climbs again. Debrief read the first, the opening ${opening} of the file. ${othersAt(segments!)}`,
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

  // …and where there is no cut, say whether the record still looks like it holds more than
  // one flight. The walk refuses a boundary it cannot justify — a climb under the floor, a
  // dip it read through — and a refusal that produces no sentence is a reading of the whole
  // record presented as a reading of one flight. `unsegmented` is what that refusal knows.
  const unsure = depth === 0 ? unsegmentedNote(altitude, time, baselineNoise) : null;
  if (unsure) warnings.push(unsure);

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
  // A dead column is treated as no accelerometer at all, HERE, rather than guarded at each
  // surface that reads one. Six of them branch on `accelerationSource === 'device'` — the
  // metric grid, the report and its exports, the explorer, the comparison overlay, the share
  // card and the drag Cd — and exactly one carried a liveness check, which tested the array
  // AFTER the gravity-removed shift had already turned the zeros into a flat +1 g. So the
  // one guard that existed was the one the shift defeated. Deciding it at the source means
  // the flight simply has no measured acceleration, which every surface already handles.
  //
  // `pickAxialChannel` returns the largest-excursion axis, so if the picked one is dead every
  // axis is, and the resultant built from them is dead too — one check covers both.
  const accChRaw = pickAxialChannel(flight) ?? getChannel(flight, 'accelTotal');
  const accCh = accChRaw && hasLiveSamples(accChRaw.values) ? accChRaw : undefined;
  const resultant = accCh ? axialResultant(flight) : null;
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

    // Put the trace on Debrief's convention: SPECIFIC FORCE, the thing an accelerometer
    // actually measures, which reads +1 g standing still on the pad.
    //
    // Loggers do not agree on this. AltusMetrum's `acceleration` column has the pad's 1 g
    // already taken out and rests at ~0 — the same row reads −0.98 there while its own
    // `accel_x` body axis reads 9.78. Read as specific force, such a channel is a full g
    // low in EVERY reading taken off it, and the corpus shows all of them: the peak g, the
    // boost average, the drag Cd, the thrust-to-weight, the accel-ceiling integral (which
    // subtracts G0 itself, so gravity came off twice), and the burnout crossing — a
    // gravity-removed trace crosses zero at the velocity peak rather than at the end of
    // thrust, because dv/dt = 0 is exactly where it sits.
    //
    // A stationary accelerometer on a vertical rocket reads +1 g; that is not a convention
    // but a fact about the sensor, so the quiet pad window fixes the offset outright. This
    // corrects a sensor's resting bias by the same stroke, which is why an already
    // specific-force logger still shifts by the tenth of a g it was actually out by.
    // Must come AFTER the sign flip: on an aft-mounted sensor, adding g first and then
    // flipping would give −(a + g), moving the trace the wrong way.
    //
    // Only where the window is genuinely still. `baseEnd` ends at the first sample the
    // altitude has climbed off the pad, so a record that opens under thrust yields a
    // short, moving window — spread that away and leave the trace alone rather than
    // shifting a good one by a number read off a rocket already flying.
    // Put the trace on Debrief's convention: SPECIFIC FORCE. Only the channel it came from
    // can say whether it is already there — a record that opens after the motor lit holds no
    // resting sample to read the convention off, and most of this family's do exactly that.
    // So the parser flags it and the analyzer adds the g back, keeping file-format knowledge
    // in the importer where the architecture puts it.
    //
    // The resultant, where there is one, is √(Σaₖ²) over raw body axes and already rests at
    // +1 g; it is not the flagged channel and is deliberately left alone.
    if (accCh.gravityRemoved) {
      for (let i = 0; i < signedAccel.length; i++) signedAccel[i] += G0;
    }

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
  // A gap in the ascent is a gap in the SAMPLED ALTITUDE, not only in the clock. A
  // ground-station GPS log keeps writing a row every second through a dropout — the same
  // cadence, an empty altitude field — so the clock stays continuous while the data the
  // derivative needs is simply absent, and the test below used to see nothing wrong.
  // `fwgps__trf-f1machbuster-jan18__GPS_GS03748` loses four consecutive fixes at
  // t=962.01–965.01 and the smoothed derivative bridges them: 268.0, 497.0, 496.4,
  // 268.7 m/s where the climb either side averages 288 m/s (149.7 m at t=961.03 to
  // 1584.0 m at t=966.00). 497.0 m/s became the reported peak — and, at Mach 1.46, a
  // supersonic reading — off four rows the record does not contain. The clock never skips:
  // its largest ascent step is 2.068 s, which clears the 1.5 s test but not the 5·dt one
  // (dt ≈ 1 s), so the old rule was never close to firing. Counting samples is what makes
  // the rule say what it means, and the 4.98 s below is the span between the fixes that
  // BRACKET the hole, not a gap in the clock.
  // Two or more consecutive samples, because a first derivative needs a neighbour and a
  // single dropped fix still has one; more than 1.5 s, the same span the clock rule uses,
  // because a hole shorter than that cannot hide a peak; and more than three times this
  // record's own altitude cadence, so a logger that simply writes fixes sparsely is not
  // read as one that dropped them.
  let ascentGapBreaksPeak = false;
  if (velocitySource === 'baro') {
    const start = Math.max(1, liftoffRef);
    for (let i = start; i <= apogeeIdx && i < n; i++) {
      const g = time[i] - time[i - 1];
      if (Number.isFinite(g) && g > 1.5 && dt > 0 && g > 5 * dt) {
        ascentGapBreaksPeak = true;
        break;
      }
    }
    // The altitude samples themselves, and the steps between them. Seeded from the last
    // usable sample BEFORE the ascent so a hole at the very start is bracketed like any
    // other — without it a log whose fixes drop out right at liftoff is never examined.
    const usable: number[] = [];
    for (let k = start - 1; k >= 0; k--) {
      if (Number.isFinite(altitudeRaw[k])) {
        usable.push(k);
        break;
      }
    }
    for (let i = start; i <= apogeeIdx && i < n; i++) if (Number.isFinite(altitudeRaw[i])) usable.push(i);
    // A hole is a step much longer than this record's OWN altitude cadence — not merely
    // longer than its row cadence. A logger that writes a fix every third row has a
    // two-row "hole" between every pair of fixes and no dropout at all; measuring against
    // the median step is what tells the two apart, so a sparse cadence isn't withheld with
    // a dropout's explanation.
    const steps: number[] = [];
    for (let j = 1; j < usable.length; j++) steps.push(time[usable[j]] - time[usable[j - 1]]);
    const finiteSteps = steps.filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
    const typical = finiteSteps.length ? finiteSteps[finiteSteps.length >> 1] : NaN;
    if (!ascentGapBreaksPeak && Number.isFinite(typical)) {
      for (let j = 1; j < usable.length; j++) {
        const span = time[usable[j]] - time[usable[j - 1]];
        const missing = usable[j] - usable[j - 1] - 1;
        if (missing >= 2 && Number.isFinite(span) && span > 1.5 && span > 3 * typical) {
          ascentGapBreaksPeak = true;
          break;
        }
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
  //
  // **Judged over the WHOLE ascent, not just up to the peak.** The physics above is a statement
  // about the climb: from liftoff to apogee the rocket is going up. Stopping the window at
  // `maxVelIdx` made the check weakest exactly where a trace is worst, because an artefact that
  // drags the peak toward liftoff shrinks the window it would be judged in.
  //
  // **This was measured wrongly, reverted, then re-measured and restored — all on 2026-07-31.** The
  // first sweep said it "flags zero additional flights and costs a sound read". Both halves were
  // artefacts of the sweep: it only took files `importFlight` returns as `kind: 'flight'`, so it
  // silently skipped the eleven records reaching analysis through the COLUMN MAPPER, and reported
  // 38 records where the digest covers 50. Over all 50 it changes exactly ONE record —
  // `perfectflite…endurance-20211030`, which published **Mach 1.19 with a Mach-1 crossing 30.5 m
  // off the pad** against the **Mach 0.93 its flight's TeleMetrum measured**, off a log opening
  // below the pad (−31 → −27 → −14 → +9 → +30 ft). `app/validation/page.tsx` already cited that
  // pair as a trace that "stops being a reading of the speed at all".
  //
  // The second objection was that widening might shadow `velocityOutclimbsItself` on real files.
  // Measured, per record, by which warning fires: **that guard fires on ZERO of the 50**, before
  // and after. It has no real-file coverage to lose — the guards ahead of it in the chain reach
  // every record it would. It stays as a backstop, and its cover is synthetic by nature.
  //
  // Two details are part of the rule rather than patches on it:
  //
  //  - **Apogee itself is excluded**, which is the definition and not a fudge: apogee is the instant
  //    the vertical velocity passes through zero, so the ascent is the open interval before it.
  //    Including that sample tests the one point where "the rocket is going up" is false, and it
  //    fired — `perfectflite…intrepid3tf1` has its whole-ascent minimum AT the apogee sample,
  //    −38.1 m/s against a 146.3 m/s peak, 26%, which would have withheld a sound Mach 0.43 reading
  //    for the flight having reached the top.
  //  - **The excursion is read through a 3-point median**, so ONE sample cannot withhold a flight.
  //    This is the rule the analysis already applies to altitude and states on the validation page —
  //    "one sample standing well clear of both its neighbours is sensor noise" — pointed at the
  //    velocity. It decides a real record: `eggtimer…skyward-lynx` writes a single glitched row at
  //    t = 5.65 s (altitude 4,274 → 3,996 → 4,096 ft, raw velocity −5,560 ft/s between neighbours of
  //    +1,520 and +2,000), putting the filtered channel at −122 m/s against a 427 m/s peak — 29%,
  //    enough to lose a sound Mach 1.27 reading over one row in 460. Through the median that sample
  //    reads +24 m/s and the flight stands. A genuinely noise-dominated trace dips for longer than
  //    one sample, which is the difference being drawn.
  let velocityNoiseDominated = false;
  if (liftoffFound && maxVelIdx >= 0 && Number.isFinite(maxVelocity) && maxVelocity > 0) {
    const vAt = (i: number): number => (Number.isFinite(velocity[i]) ? velocity[i] : 0);
    let worst = 0;
    for (let i = liftoffRef; i < apogeeIdx; i++) {
      const a = vAt(i - 1 >= liftoffRef ? i - 1 : i);
      const b = vAt(i);
      const c = vAt(i + 1 < apogeeIdx ? i + 1 : i);
      const median = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
      if (median < worst) worst = median;
    }
    velocityNoiseDominated = -worst / maxVelocity > ASCENT_NOISE_FRACTION;
  }

  // The fastest moment of a climb is never the sample liftoff was detected on. `liftoffRef` is
  // where the record first shows the rocket moving — `altClean > 3 m` AND `velocity > 2 m/s` — and
  // a peak sitting exactly there means the same jump satisfied the liftoff test and is being
  // reported as the flight's top speed. The trace and the detection cannot both be right.
  //
  // **Say that precisely rather than as "the rocket is at rest at liftoff".** It is not:
  // `liftoffRef` is already past a 2 m/s threshold by construction, and this comment claimed rest
  // until a pre-push review measured `velocity[liftoffRef] = 385 m/s` on a real corpus record. What
  // the condition detects is the coincidence, not a violation of rest.
  //
  // It needs no constant, which matters because the ratio guard above cannot see this case ON
  // PRINCIPLE: that guard divides by the peak, so the more absurd the spike the SMALLER its own
  // noise ratio. The record this catches swings to −182 m/s on the way up against a "peak" of
  // 2,401 m/s — 7.6%, comfortably inside a 20% tolerance — where the same swing against its real
  // 679 m/s peak would be 27% and refused at once.
  //
  // Measured over all **50** records that analyse — the set `corpus-digests.json` covers, including
  // the eleven reaching analysis through the column mapper: exactly one has its peak AT the liftoff
  // sample. A second record, `perfectflite…endurance-20211030`, peaks 0.050 s after liftoff and was
  // the same pathology; it is refused by the ascent-noise guard above rather than by relaxing this
  // condition to a window, which would have meant a threshold with one data point. An earlier draft
  // claimed the nearest published peak was 0.700 s away; that was the minimum over the named-parser
  // subset only — exactly the subset that excluded the counterexample.
  const velocityPeakAtLiftoff = liftoffFound && maxVelIdx >= 0 && maxVelIdx === liftoffRef;

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

  // Captured before the judgement below can null it out.
  const peakVelIdxBeforeJudgement = maxVelIdx;
  let velocityImplausible = false;
  if (
    Number.isFinite(maxVelocity) &&
    (maxVelocity > IMPLAUSIBLE_VELOCITY ||
      velocityNoiseDominated ||
      velocityPeakAtLiftoff ||
      velocityBeyondAccel ||
      velocityOutclimbsItself)
  ) {
    velocityImplausible = true;
    maxVelocity = NaN;
    maxVelIdx = -1;
  }
  // Where the speed turned over, kept even where the speed ITSELF has just been withheld.
  // The judgement above is about the MAGNITUDE of maxVelocity — a peak that is noise, or one
  // beyond what the flight's own accelerometer allows. WHERE the trace turned over is a
  // separate fact, and even a coarse one bounds "the motor had stopped by here" far better
  // than the whole climb does. Throwing it away with the value left the burnout crossing
  // search running all the way to apogee on 4 of the corpus's 14 signed-axial flights — the
  // exact case that bound exists to prevent, with the apogee ejection charge inside the
  // window it was meant to exclude. Identical to `maxVelIdx` whenever the speed stands.
  const velTurnoverIdx = velocityImplausible ? peakVelIdxBeforeJudgement : maxVelIdx;
  // Let the explorer and the comparison overlay see the same judgement, so they can withhold
  // the Mach and dynamic-pressure curves derived from a peak this analysis would not stand
  // behind. **Both reasons, not just one** — a gap across the ascent withholds the headline
  // exactly as an impossible magnitude does, and for a while this line propagated only the
  // second, so the curves went out on a flight whose peak the report had already refused.
  series.velocityUnusable = velocityImplausible || ascentGapBreaksPeak;

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
    // The search is bounded, because the largest signed-axial reading between liftoff and
    // apogee is not always the motor: on three corpus flights it is the apogee ejection
    // charge (187.8, 235.7 and 819.7 m/s²), and a search running that far took its "crossing
    // after the boost peak" from the charge settling. That put a 39.85 s burn time, a 1.9 m/s
    // burnout velocity and an 8,292 m burnout altitude (7 m under the apogee) on a flight
    // whose motor burned under six seconds to near its 580.9 m/s peak. The guard below was
    // meant to catch that but is measured in SAMPLES — two of them is 0.02 s on a 100 Hz
    // logger — so bounding the search is the fix and the guard stays as a backstop.
    //
    // But the bound belongs a short way PAST the velocity peak, not at it. Debrief reads
    // acceleration as specific force, so dv/dt = a − g: the velocity peak is by definition
    // where the axial trace passes +1 g, while thrust = drag (a = 0) — the end of thrust
    // being searched for — is only reached a little later, as the motor tails off. Ending at
    // the peak stopped one instant short of the event: seven of the corpus's fourteen
    // signed-axial flights cross zero 0.05–0.40 s past it (stargazer1 0.05, kairos booster
    // 0.07, irec2023 0.08/0.09, sg1.2 0.11, kairos sustainer 0.22, sg1.1 0.40) and every one
    // fell through to the velocity-peak proxy, reporting max velocity a second time under
    // the burnout label.
    //
    // One second of tail covers that with margin and stays far clear of the charge: on every
    // flight the window matters to, the crossing lands 8.1–34.5 s before apogee. Measured in
    // TIME rather than samples — a lossy radio-telemetry capture drops seconds between rows,
    // so a sample count off the nominal dt is a different window on every file, and on the
    // corpus's Kairos sustainer telemetry it reached a crossing five minutes downrange.
    const velPeakEnd = velTurnoverIdx > liftoffRef ? velTurnoverIdx : apogeeIdx;
    // The boost peak is always before the velocity peak, so look for it there.
    const peak = argMax(signedAccel, liftoffRef, velPeakEnd + 1);
    const tailEnd = time[velPeakEnd] + BURNOUT_TAIL_S;
    for (let i = peak; i <= apogeeIdx && time[i] <= tailEnd; i++) {
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
      `The record stops ${formatSeconds(time[n - 1] - time[apogeeIdx])} after apogee, sooner than this flight could have fallen from ${lenTok(altClean[apogeeIdx])} even in a vacuum (${formatSeconds(Math.sqrt((2 * altClean[apogeeIdx]) / G0))}). So it holds the climb but not the descent: no landing, no flight time, and no descent rate are read from it.`,
    );
  }
  const apogeeIsFloor = apogeeIdx >= n - 2;
  if (apogeeIsFloor) {
    warnings.push('The log appears to end at or before apogee — descent numbers may be missing.');
  }

  /**
   * The mirror of the check above, pointing at the CLIMB: a record whose ascent takes far longer
   * than a vertical throw to the same height is not describing a free flight at all.
   *
   * **This is a wrong number a flyer would act on, and it is live on a real corpus file.** The raw
   * `@ LOG_LOW` serial capture of a Blue Raven reports **apogee 9 m reached 30.9 s after liftoff**
   * — an average climb of 0.3 m/s — while a second altimeter in the same airframe recorded
   * 2,115 m. Debrief printed the 9 m as an unqualified reading, and the comparison surface then
   * headlined a 177% disagreement against the board that was right. Measured: that file's `Bo:`
   * pressure token spans 48821–48897 of 50000 across the whole record, flat to 0.15%, so the 9 m
   * is a faithful read of a barometric channel that does not contain the flight. The corpus has
   * carried this as a `knownIssue` — the gap was documented where a maintainer could see it and
   * nowhere a flyer could.
   *
   * **The bound is scale-free and was measured rather than tuned.** `sqrt(2h/g)` is how long a
   * vertical throw takes to coast to height `h`; a real rocket does most of its climb under thrust
   * and reaches apogee SOONER than that, so the ratio sits below 1 for a boosted flight. Across
   * the 37 corpus flights that produce both figures, the highest legitimate ratio is **1.52** —
   * the 75 km flight, whose long burn and thin air genuinely stretch the ascent — and the next is
   * **1.10**. The misparse sits at **22.2**. A limit of 4 is 2.6x above anything real in the
   * corpus and 5.5x below the defect, so it discriminates on a gap of more than fourteen-fold
   * rather than on a threshold anyone had to choose carefully.
   *
   * It WARNS rather than withholding, deliberately. Where a peak speed is contradicted there is a
   * separate altitude reading to fall back on, so withholding the speed still leaves a report;
   * here the altitude channel is the report, and blanking it would leave nothing to look at and
   * nothing to compare against the second altimeter that disagrees. Naming the contradiction with
   * both numbers is what lets the flyer see which board to believe.
   */
  const ASCENT_VS_VACUUM_LIMIT = 4;
  let altitudeUnproven = false;
  if (liftoffFound && Number.isFinite(apogeeAlt) && apogeeAlt > 0) {
    const climbTime = apogeeTime - liftoffTime;
    const vacuumClimb = Math.sqrt((2 * apogeeAlt) / G0);
    if (climbTime > 0 && vacuumClimb > 0 && climbTime > ASCENT_VS_VACUUM_LIMIT * vacuumClimb) {
      // The flag travels with the metrics so the apogee carries it wherever it goes; the warning
      // below is the long form for the page.
      altitudeUnproven = true;
      warnings.push(
        `This record does not describe a rocket flight. It reaches its highest point, ${lenTok(apogeeAlt)}, ` +
          `${formatSeconds(climbTime)} after liftoff — but a rocket that only ever got that high would be back on the ` +
          `ground in about ${formatSeconds(2 * vacuumClimb)}, and would pass that height ${formatSeconds(vacuumClimb)} ` +
          `into the flight. An ascent ${(climbTime / vacuumClimb).toFixed(0)}x slower than that is not a climb, so the ` +
          `altitude channel here almost certainly is not the one that recorded the flight — a stuck or disconnected ` +
          `barometer, or a column read as a height that is not one. Every reading on this page rests on that channel ` +
          `and should be treated as unproven until a second recording of the same flight, or the altimeter's own ` +
          `summary, agrees with it.`,
      );
    }
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
        `The record covers the descent but never reaches the ground — the lowest it gets after apogee is ${lenTok(lowest)} above the pad, ${((lowest / apogeeAlt) * 100).toFixed(1)}% of this flight's own apogee. That may be the log stopping early or the barometer's zero having drifted over a long descent, and the record doesn't settle which, so no landing is marked and flight time and descent time are left unread rather than measured to wherever it happens to stop.`,
      );
    }
  }

  // Where the ground baseline was already doubted AND the record's last sample sits well away
  // from zero, that end is worth stating: if the rocket was AT REST there, the log did not start
  // on the pad and every height in it is offset by that much.
  //
  // **The "if" is load-bearing, and this warning used to assert it.** It read "it comes to rest
  // … A rocket at rest is on the ground … subtract that", which is an instruction. Measured over
  // the corpus, that instruction is right once and wrong seven times:
  //
  //   fires on 12 of 50 analysable flights. Eight can be checked against ground truth — the
  //   file's own device summary or the corpus manifest — and subtracting the resting height
  //   HELPS exactly one of them (`intrepid3tf2 AL0`: +5.8% error becomes −0.0%, which is where
  //   the old wording came from) and HURTS the other seven: `iss-endurance` −0.4% → −3.7%,
  //   `xprs2015` ×2, `euroc-skyward-lynx` −0.1% → −34.2%, `euroc-stacarl2` +1.2% → −34.3%,
  //   `irec_2023_easymega` −0.2% → −66.2%, and the Kairos sustainer, whose apogee is right to
  //   0.9 m against its 13,268 ft cert figure and which the instruction would have made 63% low.
  //
  // No rule separates the one from the seven. Not the resting fraction — 3.3% hurts, 5.5% helps,
  // 7.5% hurts. Not `landingFound`: it is false on AL0 *and* on the Kairos sustainer. Not the
  // "never reaches the ground" note below: it fires on both. The difference is whether the record
  // came to rest or merely stopped, and **nothing in the record settles that** — which is exactly
  // what the other note says in the same list, so asserting it here contradicted it there.
  //
  // So this states the observation and both readings of it, and gives no instruction. The flyer's
  // own altimeter summary is what settles it — that is what settled AL0 — and saying so is worth
  // more than a subtraction that is wrong seven times in eight.
  if (!padDataLikely && landingIdx > apogeeIdx && apogeeAlt > 0) {
    const rest = altClean[landingIdx];
    if (Number.isFinite(rest) && Math.abs(rest) > apogeeAlt * 0.01) {
      const m = Math.abs(Math.round(rest));
      const dir = rest > 0 ? 'high' : 'low';
      warnings.push(
        `This log doesn't start on the pad, and its last sample sits ${lenTok(Math.abs(rest))} ${rest > 0 ? 'above' : 'below'} where the record begins — ${Math.abs((rest / apogeeAlt) * 100).toFixed(1)}% of the apogee. If the rocket was at rest there, that is where the ground is, and every altitude here (apogee included) reads about ${lenTok(Math.abs(rest))} too ${dir}. If the log instead stopped while the rocket was still coming down, they read correctly and nothing should be taken off them. Nothing in the record settles which, so Debrief neither shifts these heights nor tells you to — check the apogee against your altimeter's own summary before taking ${lenTok(Math.abs(rest))} off it.`,
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
    // The leg's OWN CHORD: how far it fell, over how long it took. That is what a mean
    // descent rate is, and it is measured on the altitude the flight recorded rather than on
    // anything derived from it.
    //
    // This used to be `timeMean(descent, …)`, and the two are supposed to be the same number.
    // `timeMean`'s docstring says it "telescopes to the leg's own chord" — but it says so
    // *when `values` is the finite difference of the altitude*, and `descent` is that finite
    // difference passed through THREE index-window smoothers (`altSmooth` at :1276, `baroVel`
    // at :1328, `descent` at :2246). Telescoping is exactly what smoothing destroys, and the
    // damage is not small on a log whose cadence changes: a moving average is an INDEX window,
    // so a fast sample beside a long gap is smeared onto the samples that BOUND that gap, and
    // `timeMean` then weights the smeared value by the gap's whole duration. `issuiuc-sg1.2`
    // sustainer — 25 Hz climbing, 3 Hz descending, gaps to 11 s — published 15.59 m/s
    // (51.2 ft/s) where its altitude falls 2,113 m → 150 m in 307.5 s and its own speed column
    // reads 6.5 m/s. It reads 6.36 m/s now: two independent channels had been sitting 2.4×
    // below the published figure, on the reading a flyer sizes a canopy against.
    //
    // **THE ENDPOINTS ARE MEDIANS, NOT SAMPLES, AND THAT IS NOT A REFINEMENT.** A chord taken
    // between two single samples rests the whole published figure on 2 of up to 27,077 — and
    // one of those two is `argMax(altClean)`, the record's most extreme sample BY
    // CONSTRUCTION, which is precisely where a positive spike survives. The Hampel filter does
    // not save it: on `blueraven meraki2-121km` the apogee sample reads 75,515 m between
    // neighbours of 54,233 and 58,509, because the whole neighbourhood is that noisy and there
    // is no local consensus to test it against. Read as a bare chord that leg published
    // 138.85 m/s off that one sample. A short symmetric median at each end costs nothing on a
    // clean trace — at apogee and at landing the rocket is near enough stationary that the
    // window is flat — and it is the difference between a safety number resting on 2 samples
    // and on a few dozen. Falsified in `analyze.test.ts` by spiking one endpoint sample.
    //
    // The same-flight pairs settle that this is the right FIGURE and not a preference, because
    // recordings of ONE flight have no reason to agree better unless the reading improved.
    // Over the 8 groups where two or more recordings publish the same leg: 7 tightened, 1 was
    // unchanged, NONE widened. XPRS 2015 40.1% → 1.8%, Stargazer 1 9.0% → 0.3%, sg1.1 drogue
    // 10.6% → 0.5% and main 11.5% → 0.8%, lemiv L3 main 19.9% → 4.3%.
    //
    // `descent` is still what finds the main deployment below; detecting a sharp step is the
    // job smoothing is FOR. It is only the published rate that must not be read off it.
    const span = time[to] - time[from];
    if (!(span > 0)) return null;
    const top = legEndpoint(altClean, from, dt);
    const bottom = legEndpoint(altClean, to, dt);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
    const rate = downward((top - bottom) / span);
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
      `A descent rate read faster than this flight could fall from ${lenTok(apogeeAlt)} in a vacuum ` +
        `(${spdTok(freeFallLimit)}), so it isn’t a rate the rocket can have had — something in the ` +
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
  //
  // Read over a bracket of CLOCK, and an asymmetric one. Two things were wrong here and only
  // the first is obvious.
  //
  // The window used to be ±`round(0.3 / dt)` SAMPLES, with `dt` the median interval of the
  // whole record — a property of the export rather than of the flight, because a board writes
  // the pad slowly and the boost fast, and AltusMetrum writes the same recording again at a
  // different rate as a second format. The span it really covered ran from 0.13 s to 8.24 s,
  // so ONE Kairos Booster recording published 22.8 g from its `.csv` and 1.5 g from its
  // `.eeprom`: one board, one launch, one charge, two numbers.
  //
  // The second is the reason this is a bracket and not a window, and it is the one that
  // matters: **a charge does not fire at the index Debrief detects the deployment at.** Apogee
  // is the altitude maximum, and every apogee charge in the corpus fires 0.35–0.78 s BEFORE
  // it — stargazer1's is a single 63.2 g sample at −0.70 s, with the barometer visibly
  // disturbed for the second after. Main is detected from the change in descent rate, which
  // the charge causes rather than coincides with, so its lag is far larger: 2.0–2.9 s.
  //
  // Which means a symmetric ±0.3 s at the detected index is not a tighter read of the same
  // thing — it reads the quiet coast next to the charge and reports THAT as the shock. It
  // would have taken stargazer1 from 63.2 g to 0.65 g and SG1.1's main from 26.5 g to 1.9 g,
  // understating the snatch a flyer sizes a shock cord against by 14x. The old code caught
  // those two only because its window happened to be seconds wide on those files; on Kairos
  // it missed the real 84.6 g charge entirely and published 22.8 g of nothing in particular.
  // Both readings were wrong; only one of them was wrong in a direction that looks safe.
  const shockAt = (idx: number | null, type: 'apogee' | 'main'): number | undefined => {
    if (idx === null || accelerationSource !== 'device') return undefined;
    const [back, fwd] = SHOCK_BRACKET_S[type];
    const peak = peakAbsInTimeBracket(time, acceleration, idx, back, fwd);
    return Number.isFinite(peak) ? peak : undefined;
  };

  const events: FlightEvent[] = [];
  const push = (type: FlightEvent['type'], idx: number | null, label: string, provenance: FlightEvent['provenance']) => {
    if (idx === null || idx < 0 || idx >= n) return;
    const peakAccel = type === 'apogee' || type === 'main' ? shockAt(idx, type) : undefined;
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
  // Where a GPS flight has a second instrument recording it, Debrief's GPS-derived peak
  // lands above the measurement: 1,466 ft/s at 2.1 Hz against a Blue Raven's measured
  // 1,401 ft/s on the same flight (+5% on the speeds, +8% comparing the two Mach figures),
  // and above that tracker's own stated 1,340 ft/s (+9%). Every derived peak the corpus can
  // check runs the same way — the figures are in `lib/derivedPeak.ts` and are recomputed from
  // the corpus on every run. This comment used to add "a PerfectFlite baro against an
  // AltusMetrum inertial on the endurance flight by +30%", and that pair was real: its
  // StratoLogger read Mach 1.19 against the TeleMetrum's measured 0.93. The ascent-noise guard
  // withholds that peak now — 0.050 s after liftoff at 30.5 m AGL, off a log that opens below the
  // pad — so the pair stopped existing while the figure went on being printed. A reading that is
  // high by an amount nothing on the file bounds is not one that settles whether a flight went
  // supersonic.
  // The corpus used to appear to say +28% for GPS specifically, from a ground-station log
  // whose peak was differentiated across four missing fixes; that peak is withheld now.
  // Quote a speed ratio or a Mach ratio, but say which — they differ by three points here.
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
  // Read against the rocket's OWN resting reading, because loggers do not agree on
  // what an accelerometer channel means.
  //
  // This used to be `mean(accel)/g`, which is T/W only if the channel is SPECIFIC
  // FORCE — the thing an accelerometer actually measures, reading +1 g at rest.
  // AltusMetrum's `acceleration` column is not that: it is the axial reading with the
  // pad's 1 g already removed, so it sits at ~0 on the pad. Eight of eight AltusMetrum
  // corpus flights rest at −0.79…+1.34 m/s² where the six AltimeterCloud flights rest
  // at 9.60…10.05. The same AltusMetrum row proves it outright — `acceleration` reads
  // −0.98 while its own `accel_x` body axis reads 9.78 on the same sample. Divided by
  // g, a gravity-removed channel yields exactly **T/W − 1**: a full point low, on the
  // reading whose stated purpose is the 5:1 rail-departure check. One corpus flight
  // reported 3.27:1 for a real 4.27:1, and a genuine 5.2 would have printed 4.2 —
  // below the rule it is quoted against.
  //
  // Differencing against the resting reading removes the convention instead of
  // encoding a per-logger table. Write the channel as `specific force − O` for an
  // unknown offset O (O = 0 for a true specific-force channel, O = g for a
  // gravity-removed one). At rest a_pad = g − O; under vertical boost a_boost = T/m − O.
  // The offset cancels in the difference, so (a_boost − a_pad)/g + 1 = T/(mg) = T/W
  // exactly, for either convention and without a threshold to tune.
  //
  // Measured trace only, averaged over a short window off the pad (capped at burnout
  // for a very short motor), and withheld if that window was saturated — a railed
  // reading understates the true thrust, so it's better to show nothing than a floor.
  let liftoffTWR: number | null = null;
  if (ascentPresent && liftoffFound && accelerationSource === 'device') {
    // **The window is 0.2 SECONDS, taken off the clock — not a sample count.** It used to be
    // `round(0.2 / dt)` samples, where `dt` is the median interval of the WHOLE RECORD, and a
    // flight log's rate is not one number: AltusMetrum writes the pad slowly and the boost fast,
    // and the same board's `.eeprom` and `.csv` exports of one flight are written at different
    // rates again. So the window was 0.2 s only on a record that happened to be uniform, and
    // somewhere between 0.02 s and 0.2 s on the rest — always short, because a rate that rises
    // at liftoff makes the median too coarse. Measured over the corpus, against the same window
    // taken by time:
    //
    //   Kairos Booster, ONE device and ONE flight in two formats — `.csv` (median dt 0.04 s, 5
    //   samples, a 0.050 s window) published 4.98:1 and `.eeprom` (median dt 0.10 s, floored at
    //   2 samples, a 0.020 s window) published 4.83:1. The true 0.2 s window is 6.44:1 on both.
    //   The two exports of one flight disagreed with each other and both were a quarter low.
    //
    //   irec2023, TeleMega 9.49:1 against the EasyMega beside it on the same airframe at 11.23:1
    //   — a 15% spread that was the two boards' logging rates, not the rocket. By time they read
    //   11.95 and 11.34, which agree to 5%.
    //
    // This is quoted against a range-safety minimum. A number that reads 20–25% low, and reads
    // differently depending on which file the flyer exported, is the whole reading being wrong.
    //
    // The mean is time-weighted for the same reason: an index mean over a stretch whose rate
    // changes inside it weights the densely-sampled part, which at liftoff is the part after the
    // motor is already up to pressure.
    let hi = liftoffRef + 1;
    while (hi < n && time[hi] - liftoffTime < 0.2) hi++;
    // Two samples minimum — an interval to average over at all — and never past burnout, which
    // is what keeps a very short motor from averaging its own coast into the thrust.
    hi = Math.min(n, Math.max(hi, liftoffRef + 2), burnoutIdx ?? n);
    const m = hi > liftoffRef + 1 ? timeMean(acceleration, time, liftoffRef, hi - 1) : NaN;
    // The quiet stretch before the motor lit. Ends a little before liftoff so the
    // ignition transient is outside it.
    let padSum = 0;
    let padCount = 0;
    for (let i = 0; i < liftoffRef; i++) {
      const t = time[i];
      if (t < liftoffTime - 1 || t >= liftoffTime - 0.05) continue;
      const v = acceleration[i];
      if (Number.isFinite(v)) {
        padSum += v;
        padCount++;
      }
    }
    const padRest = padCount >= 3 ? padSum / padCount : NaN;
    if (
      Number.isFinite(m) &&
      Number.isFinite(padRest) &&
      !(accelClipped && m >= 0.97 * maxAcceleration)
    ) {
      const twr = (m - padRest) / G0 + 1;
      // A rocket that left the pad lifted more than it weighed. Anything at or below
      // 1 means the window did not catch the boost, not a flight that hovered.
      if (twr > 1) liftoffTWR = twr;
    } else if (Number.isFinite(m) && m > 0 && !(accelClipped && m >= 0.97 * maxAcceleration)) {
      // No usable pad stretch — a record that begins at the rail leaves nothing to
      // difference against, and the channel's convention is then unknowable from the
      // file. Withheld rather than published under an assumption, because the number
      // is quoted against a safety rule.
      warnings.push(
        'The record starts too close to liftoff to read the accelerometer’s resting value, and loggers differ on whether that channel already has gravity removed. Thrust-to-weight is left unread rather than reported a full point out.',
      );
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
      // **A FIX, not a sample, and the difference is two orders of magnitude.** A receiver that
      // has no new solution does not write nothing — it holds its last position — so a 100 Hz log
      // with a 1–5 Hz receiver repeats each fix dozens of times, and counting rows counted the
      // repeats. `irec2023` published **4,010** ascent fixes behind a GPS apogee that rests on
      // **40**; `sg1.1` published 1,232 for 6. Worse, it disagreed with itself: the Kairos booster
      // reads 2,259 from its `.csv` and 24 from its `.eeprom`, one flight, where the truth is 24
      // for both — the `.eeprom` looked right only because it happens to be written at the
      // receiver's own rate. This number's entire job is saying how much independent evidence is
      // behind the GPS apogee, which is precisely the claim the repeats inflated.
      //
      // A new solution is one whose POSITION differs from the last — altitude, latitude or
      // longitude. The `satellites` channel is deliberately not consulted: a sample with none is a
      // held-over value by definition, so it cannot differ from the one it was held over from, and
      // measured across every corpus flight that states a GPS apogee the satellite gate changes
      // not one count. Implied, not ignored.
      const latCh = getChannel(flight, 'latitude')?.values;
      const lonCh = getChannel(flight, 'longitude')?.values;
      let prevG = NaN;
      let prevLat = NaN;
      let prevLon = NaN;
      for (let i = 0; i < n; i++) {
        const v = g[i];
        if (!Number.isFinite(v)) continue;
        last = v - base;
        if (i <= apogeeIdx) {
          const moved =
            v !== prevG ||
            (latCh != null && latCh[i] !== prevLat) ||
            (lonCh != null && lonCh[i] !== prevLon);
          if (moved) fixes++;
          prevG = v;
          if (latCh != null) prevLat = latCh[i];
          if (lonCh != null) prevLon = lonCh[i];
        }
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
    apogeeIsFloor,
    altitudeUnproven,
    timeToApogee: liftoffFound ? apogeeTime - liftoffTime : NaN,
    maxVelocity,
    maxVelocityWithheld: Number.isFinite(maxVelocity) ? null : ascentGapBreaksPeak ? 'gap' : velocityImplausible ? 'implausible' : null,
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
    //
    // **Weighted by TIME, not by sample count**, and that is a question about WHICH QUANTITY is
    // being reported rather than which estimator is better. "The average acceleration over the
    // boost" means `∫a dt / T` — the thing that integrates to the burn's Δv. A mean of the samples
    // answers a different question and coincides with it only when the sampling is uniform, which
    // no flight log is: the rate changes across a burn, and an index mean then weights the densely
    // sampled part. The window itself (liftoff → burnout) was always right; only the weighting was
    // wrong. Measured over the corpus it moves `issuiuc-intrepid1` by **16.1%** and
    // `issuiuc-endurance` by 4.7%, with 17 of the 25 under 1.3%.
    //
    // **This is deliberately NOT justified by same-flight agreement, and the check was run.**
    // Unlike the liftoff thrust-to-weight beside it — where two exports of one recording published
    // two different ratios and the fix collapsed them onto one — the recon groups do not tighten
    // here (irec2023 2.2% → 2.2%, lilnuke 8.4% → 8.7%, stargazer1 17.2% → 17.2%). They do not,
    // because their spread is not this: `stargazer1`'s two exports detect BURNOUT 0.58 s apart
    // (4.190 s against 3.910 s) on identical peak acceleration, so they are averaging over
    // different windows, and `corpus.test.ts` already records that loggers legitimately disagree
    // about where a burn ends. Corroboration would have been the wrong evidence to look for, and
    // the definition is the right one — which is why the pinning test computes the answer in
    // closed form on a deliberately non-uniform trace rather than pointing at a corpus file.
    avgBoostAcceleration:
      ascentPresent && burnoutIdx !== null && accelerationSource === 'device'
        ? (() => {
            const m = timeMean(acceleration, time, liftoffRef, burnoutIdx);
            return Number.isFinite(m) ? m : null;
          })()
        : null,
    maxDeceleration,
    accelerationSource,
    accelClipped,
    liftoffTWR,
    // Measured from liftoff, like burnTime beside it, so it is comparable across
    // recordings that each start their clock somewhere different.
    mainDeployTime: mainIdx !== null && mainIdx >= 0 && liftoffFound ? time[mainIdx] - liftoffTime : null,
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
        `The peak speed (about Mach ${mach.toFixed(2)}) is at or past the transonic region, where a barometric speed is unreliable — the shock wave over the pressure port distorts the sensed pressure, and the error runs both ways — the corpus pairs span ${derivedPeakList('speed')} on the speeds, usually high but not always. So this figure can neither confirm the rocket went supersonic nor bound how fast it actually went. An accelerometer, an inertial solution or GPS would settle it.`,
      );
    }
  } else if (velocitySource === 'baro' && mach !== null && mach >= TRANSONIC_BARO_LOW) {
    // The GPS case, which the block above skips. A GPS altitude has no static port and no
    // shock, so the barometric warning would name the wrong failure — but the speed is
    // still differentiated from it, and the corpus says a coarse GPS altitude differentiated
    // puts the peak high rather than soft.
    warnings.push(
      `The peak speed (about Mach ${mach.toFixed(2)}) is worked out from the GPS altitude rather than measured. Nothing distorts a GPS through the transonic region the way a shock over a pressure port distorts a barometer, but differentiating a coarse, lagging GPS altitude runs the peak high: on the corpus GPS flight a second instrument also recorded, this read comes out above the measurement — 1,466 ft/s where a Blue Raven on the same flight measured 1,401 ft/s, and above the tracker's own stated 1,340 ft/s: +5% and +9% on the speeds, or +8% comparing the two Mach figures. Almost every derived peak the corpus can check runs the same way; the pairs span ${derivedPeakList('speed')} on the speeds, and one runs the other way. So it doesn't confirm the rocket went supersonic, and it isn't a floor under how fast it actually went.`,
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
  } else if (velocityPeakAtLiftoff) {
    warnings.push(
      'The fastest moment of the climb reads as the instant the rocket left the pad, and a rocket is at rest when it does that — so the peak and the liftoff cannot both be right. What that means in practice is that a jump in the trace at the start of the record was fast enough to be read as the launch, and the same jump is the “top speed”. It is what a barometer writes when a log opens part-way into the flight or before the sensor has settled. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off it; apogee, timings and the descent still read normally.',
    );
  } else if (velocityBeyondAccel) {
    const mach = (v: number) => (series.speedOfSound > 0 ? (v / series.speedOfSound).toFixed(2) : '—');
    warnings.push(
      `The barometric speed reads about ${beyondAccelRatio.toFixed(1)}× faster than this flight’s own accelerometer allows, so it is not a speed. Integrating the measured g from liftoff, with every measured g credited as vertical — which makes it a generous ceiling, since a tilted airframe puts only part of its thrust into the climb — the rocket cannot have passed about Mach ${mach(accelCeiling)}, and the unpowered climb from the end of thrust to apogee needs at least about Mach ${mach(coastFloor)}, so the flight’s own records bracket its top speed between those two. What the barometer reads instead is the shock over its pressure port through the transonic push. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off a figure the rest of the record contradicts; apogee, timings and the descent still read normally.`,
    );
  } else if (velocityOutclimbsItself) {
    warnings.push(
      `The barometric speed contradicts this flight's own climb. From the point it peaks, a drag-free coast at that speed would gain about ${lenTok(vacuumFromPeak)} — the flight gained ${lenTok(climbFromPeak)} from there, which is ${(100 * (climbFromPeak / vacuumFromPeak)).toFixed(1)}% of it, where a real flight loses somewhere between a fifth and nineteen twentieths of that climb to drag (6.3–81.7% across this corpus). A speed that would have carried the rocket a hundred times higher than it went is the slope of a trace that jumped, not a speed. Max velocity, Mach, max-Q and every figure derived from the velocity (burnout velocity, coast efficiency) are withheld rather than reported off it; apogee, timings and the descent still read normally.`,
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

  return {
    series,
    events,
    metrics,
    warnings,
    extent: {
      from: 0,
      to: n,
      startTime: time[0],
      endTime: time[n - 1],
      fileEndTime: time[n - 1],
      source: 'file',
    },
  };
}
