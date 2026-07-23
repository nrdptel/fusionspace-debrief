// Build the data for comparing several flights on one set of axes. Each flight
// is analyzed independently (its own time base); to overlay them we align every
// flight at its detected liftoff (t = 0) and resample altitude and velocity onto
// a shared, uniform time grid. uPlot needs one x-array shared by all series, so
// the resampling is what makes the overlay possible at all.

import type { FlightAnalysis, FlightMetrics } from './analyze/types';

// Distinct, colour-blind-friendly-ish strokes; one per flight, in order. Caps the
// number of flights a comparison shows (more than this gets visually unreadable).
export const COMPARE_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#a855f7'];
export const MAX_COMPARE = COMPARE_PALETTE.length;

const GRID_POINTS = 800;

export interface CompareInput {
  id: string;
  name: string;
  formatLabel: string;
  analysis: FlightAnalysis;
}

export interface CompareFlight {
  id: string;
  name: string;
  formatLabel: string;
  color: string;
  /** Altitude (m AGL) resampled onto the shared grid; NaN outside the flight. */
  altitude: Float64Array;
  /** Velocity (m/s) resampled onto the shared grid; NaN outside the flight. */
  velocity: Float64Array;
  /** Acceleration (m/s²) resampled onto the shared grid; NaN outside the flight. */
  acceleration: Float64Array;
  /** Mach number resampled onto the shared grid; NaN outside the flight. */
  mach: Float64Array;
  /** Dynamic pressure (Pa) resampled onto the shared grid; NaN outside the flight. */
  dynamicPressure: Float64Array;
  /** Whether a real liftoff was detected. When false the flight is aligned at its
   *  first sample instead of a true t=0, so the overlay says so. */
  liftoffDetected: boolean;
  metrics: FlightMetrics;
}

export interface Comparison {
  /** Shared x-axis: seconds after liftoff. */
  time: Float64Array;
  flights: CompareFlight[];
}

/** Liftoff time on a flight's own series clock (falls back to the first sample). */
function liftoffTime(a: FlightAnalysis): number {
  const lo = a.events.find((e) => e.type === 'liftoff');
  return lo ? lo.time : (a.series.time[0] ?? 0);
}

/**
 * Linear-resample (srcTime, srcVal) onto `grid`. Both time arrays are ascending.
 * A grid point outside the source's time span is NaN, so a shorter flight's line
 * simply stops instead of being extrapolated. O(n + m) via a forward cursor.
 */
export function resample(srcTime: Float64Array, srcVal: Float64Array, grid: Float64Array): Float64Array {
  const out = new Float64Array(grid.length);
  // Defensive: never read past either array if a parser left them mismatched.
  const n = Math.min(srcTime.length, srcVal.length);
  if (n === 0) {
    out.fill(NaN);
    return out;
  }
  const first = srcTime[0];
  const last = srcTime[n - 1];
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i];
    if (t < first || t > last) {
      out[i] = NaN;
      continue;
    }
    while (j < n - 1 && srcTime[j + 1] < t) j++;
    const ta = srcTime[j];
    const tb = srcTime[j + 1] ?? ta;
    const va = srcVal[j];
    const vb = srcVal[j + 1] ?? va;
    // Clamp the fraction to [0,1] so a non-monotonic or duplicated source
    // timestamp can never extrapolate past the bracketing samples.
    const f = tb === ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    out[i] = va + (vb - va) * f;
  }
  return out;
}

/** Build the overlay/compare model from up to MAX_COMPARE analyzed flights. */
export function buildComparison(inputs: CompareInput[]): Comparison {
  const items = inputs.slice(0, MAX_COMPARE);

  // Each flight's time relative to its own liftoff, plus the overall span.
  const rels = items.map((it) => {
    const t0 = liftoffTime(it.analysis);
    const time = it.analysis.series.time;
    const rel = new Float64Array(time.length);
    for (let i = 0; i < time.length; i++) rel[i] = time[i] - t0;
    return rel;
  });

  let gStart = Infinity;
  let gEnd = -Infinity;
  for (const rel of rels) {
    if (rel.length === 0) continue;
    gStart = Math.min(gStart, rel[0]);
    gEnd = Math.max(gEnd, rel[rel.length - 1]);
  }
  if (!Number.isFinite(gStart) || !Number.isFinite(gEnd) || gEnd <= gStart) {
    gStart = 0;
    gEnd = 1;
  }
  // Keep at most ~1.5 s of pre-launch context; the interesting part is t ≥ 0.
  gStart = Math.max(gStart, -1.5);

  const grid = new Float64Array(GRID_POINTS);
  const step = (gEnd - gStart) / (GRID_POINTS - 1);
  for (let i = 0; i < GRID_POINTS; i++) grid[i] = gStart + step * i;

  const flights: CompareFlight[] = items.map((it, idx) => {
    const { series, metrics } = it.analysis;
    // Per-sample Mach and dynamic pressure from the same atmosphere the analysis
    // used, built here so they resample onto the shared grid like the rest.
    const n = Math.min(series.velocity.length, series.airDensity.length);
    const mach = new Float64Array(series.velocity.length);
    const q = new Float64Array(series.velocity.length);
    const sos = series.speedOfSound;
    // A velocity judged impossible had its Mach and max-Q headlines withheld; don't
    // draw the overlay curves derived from it either (the velocity line still shows).
    const velUsable = !series.velocityImplausible;
    for (let i = 0; i < mach.length; i++) {
      const v = series.velocity[i];
      mach[i] = velUsable && sos > 0 ? v / sos : NaN;
      q[i] = velUsable && i < n ? 0.5 * series.airDensity[i] * v * v : NaN;
    }
    return {
      id: it.id,
      name: it.name,
      formatLabel: it.formatLabel,
      color: COMPARE_PALETTE[idx % COMPARE_PALETTE.length],
      altitude: resample(rels[idx], series.altitude, grid),
      velocity: resample(rels[idx], series.velocity, grid),
      acceleration: resample(rels[idx], series.acceleration, grid),
      mach: resample(rels[idx], mach, grid),
      dynamicPressure: resample(rels[idx], q, grid),
      liftoffDetected: it.analysis.events.some((e) => e.type === 'liftoff'),
      metrics,
    };
  });

  return { time: grid, flights };
}

export interface Agreement {
  key: string;
  /** Lower-case metric name for a sentence ("apogee", "max speed"). */
  label: string;
  min: number;
  max: number;
  /** Spread as a percentage of the mean — how far apart the readings are. */
  spreadPct: number;
  count: number;
  /** True when the contributing flights don't all share one measurement source —
   *  e.g. one max speed is device-measured and another is altitude-derived. A
   *  derived peak reads softer, so some of the spread is method, not flight, and the
   *  agreement should be read as the looser bound. */
  mixedSource: boolean;
  /** True when at least one contributing value is a floor rather than the true peak —
   *  today an accelerometer that saturated at its full-scale limit. Its real peak is
   *  higher than logged, so the spread shown is misleading (it may be smaller than it
   *  looks): flagged so the cross-check doesn't read a sensor limit as a flight gap. */
  saturated: boolean;
}

/**
 * How closely the compared flights' headline numbers agree. Read as a cross-check:
 * if these are independent recordings of the SAME flight (redundant altimeters, a
 * booster and its sustainer bay), close agreement builds confidence and a large gap
 * is a flag worth chasing; if they're different flights, it's just the spread. A
 * measurement of the recordings, never a verdict — so it's stated as a range, not a
 * single blessed number. Only metrics with a finite value on two or more flights.
 */
export function crossCheck(flights: CompareFlight[]): Agreement[] {
  const specs: {
    key: string;
    label: string;
    get: (m: FlightMetrics) => number | null;
    source?: (m: FlightMetrics) => string;
    /** Marks a contributing value as a floor rather than a true peak (a saturated sensor). */
    soft?: (m: FlightMetrics) => boolean;
  }[] = [
    // Apogee is altitude-sourced on every logger, so there's no measured/derived
    // mix to flag — even a GPS-vs-baro apogee pair is independent corroboration.
    { key: 'apogee', label: 'apogee', get: (m) => m.apogeeAltitude },
    // Time to apogee is a pure timing (liftoff → apogee) — a temporal cross-check that
    // corroborates the spatial apogee agreement and shares no measurement source with it.
    // Two recordings of one flight saw the same climb, so it should match tightly.
    { key: 'timeToApogee', label: 'time to apogee', get: (m) => (Number.isFinite(m.timeToApogee) ? m.timeToApogee : null) },
    // Velocity can be device-measured on one flight and altitude-derived on another;
    // a derived peak reads softer, so a mixed cross-check is flagged (mixedSource).
    { key: 'maxVelocity', label: 'max speed', get: (m) => m.maxVelocity, source: (m) => m.maxVelocitySource },
    // Peak acceleration, when two recordings both carry it — a redundant-altimeter
    // check on the g the airframe felt. Baro-derived acceleration is a soft second
    // derivative, so a measured-vs-derived pair is flagged like max speed.
    {
      key: 'maxAcceleration',
      label: 'max acceleration',
      get: (m) => (Number.isFinite(m.maxAcceleration) ? m.maxAcceleration : null),
      source: (m) => m.accelerationSource,
      // A clipped peak is a floor, not the truth — flag the spread rather than read a
      // sensor's full-scale limit as a difference between the flights.
      soft: (m) => m.accelClipped === true,
    },
  ];
  const out: Agreement[] = [];
  for (const s of specs) {
    // Keep each contributing flight's value with its measurement source, so the
    // spread and the mixed-source flag are read off exactly the same set.
    const contrib = flights
      .map((f) => ({ v: s.get(f.metrics), src: s.source?.(f.metrics), soft: s.soft?.(f.metrics) ?? false }))
      .filter((c): c is { v: number; src: string | undefined; soft: boolean } => c.v != null && Number.isFinite(c.v) && c.v > 0);
    if (contrib.length < 2) continue;
    const vals = contrib.map((c) => c.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    // Only a genuine mix of differing, tracked sources counts (an untracked source
    // is undefined and ignored).
    const mixedSource = new Set(contrib.map((c) => c.src).filter((x): x is string => x != null)).size > 1;
    const saturated = contrib.some((c) => c.soft);
    out.push({ key: s.key, label: s.label, min, max, spreadPct: mean > 0 ? ((max - min) / mean) * 100 : 0, count: vals.length, mixedSource, saturated });
  }
  return out;
}
