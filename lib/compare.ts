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
    return {
      id: it.id,
      name: it.name,
      formatLabel: it.formatLabel,
      color: COMPARE_PALETTE[idx % COMPARE_PALETTE.length],
      altitude: resample(rels[idx], series.altitude, grid),
      velocity: resample(rels[idx], series.velocity, grid),
      acceleration: resample(rels[idx], series.acceleration, grid),
      metrics,
    };
  });

  return { time: grid, flights };
}
