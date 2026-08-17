/**
 * Dynamic pressure (½ρv²) as a per-sample series — read over the one window Debrief stands
 * behind it in, and in ONE place, because four surfaces used to answer this question separately.
 *
 * **Why this file exists.** `analyzeFlight` computes the max-Q headline over liftoff → apogee
 * and says why: q squares the speed, so a velocity that swings hard NEGATIVE contributes as
 * though it were airspeed, and the place that happens is the deployment transient — a charge
 * vents the airframe and a derived velocity spikes for a fraction of a second. That fix landed on
 * the headline and nowhere else. Three other surfaces went on building the same quantity over the
 * whole record:
 *
 * - `lib/explore.ts` — the channel explorer's *Dynamic pressure* trace, its statistics table
 *   (whose own comment calls these "the numbers a cert document quotes"), `Copy these stats`,
 *   the plotted-data `.csv`, and the `.png` / `.svg` of the plot;
 * - `lib/compare.ts` — the comparison overlay and `compare-data.csv`;
 * - `lib/report.ts` — the analyzed-data `.csv`, the file a flyer pastes into a cert document.
 *
 * Measured 2026-08-17 over the 37 corpus recordings that analyse end to end, **4 published a
 * max-Q above the headline's**: ×117 (`blueraven__reddit-meraki2-121km`, 47,322 kPa against an
 * ascent peak of 404 kPa, off a −8,970 m/s sample 542 s after apogee), ×6.7
 * (`missileworks-rrc3__euroc-stacarl2`), ×3.2 (`blueraven__trf-f1machbuster-jan18`) and ×2.2
 * (`eggtimer__euroc-skyward-lynx`). None of the four carried any caveat. A structural load case a
 * hundred times the real one is not a caveat, it is a wrong number in the place a flyer sizes an
 * airframe from — the analyzer's own words about the same samples.
 *
 * **The Mach channel was measured and is NOT changed here, which is the other half of the
 * result.** Mach keeps the sign of the velocity, so the same negative transient reads as a large
 * NEGATIVE Mach and never becomes a maximum; across the same 37 recordings the plotted Mach
 * exceeded its headline on **zero** of them. Squaring is what makes q different, and only q is
 * corrected. Said plainly rather than tidied away, so a later session does not "fix" a channel
 * that measured clean.
 *
 * @see lib/analyze/types.ts — `FlightSeries.ascent`, the window this reads.
 */
import type { FlightSeries } from './analyze/types';

/**
 * The sentence shown beside this curve, so the truncation reads as a decision rather than as
 * missing data. Shared for the reason the whole module is: a caveat worded differently on the
 * explorer and in an export is two claims about one number.
 *
 * **Where it reaches today, stated exactly rather than aspirationally** — an earlier version of
 * this comment claimed "every surface" and was wrong when it was written: the channel explorer's
 * stats table, its `Copy these stats`, and its `.csv` (through `CsvColumn.caveat`). It does NOT
 * yet reach the comparison overlay, `compare-data.csv`, the analyzed-data `.csv`, or the `.png` /
 * `.svg` of the plot — those show a curve that stops at apogee with nothing saying why. Filed in
 * `BACKLOG.md`; the plot writers have no caveat channel at all, which is why it is a slice rather
 * than a line.
 */
export const Q_ASCENT_CAVEAT =
  'drawn over the ascent only — past apogee a deployment charge makes the derived velocity ' +
  'spike, and ½ρv² squares that spike into a load case the airframe never saw';

/**
 * ½ρv² at each sample inside the ascent, `NaN` everywhere else.
 *
 * `NaN` rather than 0 on purpose: it is the value every plotting, resampling and CSV path here
 * already treats as "no reading", so an excluded sample leaves a gap in a curve and an empty cell
 * in an export rather than a fabricated zero that would drag an axis and a mean.
 *
 * Withholds the whole series — every sample `NaN` — when the peak speed was withheld for any
 * reason (`series.velocityUnusable`, the one flag), or when the record has no ascent at all
 * (`series.ascent === null`). Both are cases where the analysis publishes no max-Q either, which
 * is the agreement `lib/dynamicPressure.test.ts` holds the two sides to across the corpus.
 */
export function dynamicPressureSeries(series: FlightSeries): Float64Array {
  const q = new Float64Array(series.velocity.length).fill(NaN);
  const win = series.ascent;
  if (!win || series.velocityUnusable) return q;
  const end = Math.min(win.end, series.velocity.length - 1, series.airDensity.length - 1);
  for (let i = Math.max(0, win.start); i <= end; i++) {
    const v = series.velocity[i];
    const rho = series.airDensity[i];
    // A NEGATIVE sample inside the ascent window is not airspeed on the way up, and squaring it
    // would smuggle back a small version of exactly the transient this module excludes. A sample
    // that is exactly ZERO is kept, and the difference matters: velocity crosses zero AT apogee,
    // which is the last index of this window, and q there really is zero. The analyzer skips
    // `v <= 0` because it is hunting a maximum and the distinction cannot change one; a SERIES is
    // read point by point, and writing `NaN` over a true zero would put a hole in the curve at
    // the one place every flight has a reading.
    //
    // **This guard is defensive rather than load-bearing today, and that was measured rather
    // than assumed.** Removing it leaves the whole suite green: no corpus ascent contains a
    // negative sample, because liftoff → apogee is the climbing part. It stays because it is
    // what keeps this loop IDENTICAL to the analyzer's, and `lib/dynamicPressure.test.ts`'s
    // max-agreement check is what would redden if a future file ever made the two differ.
    if (!Number.isFinite(v) || v < 0 || !Number.isFinite(rho)) continue;
    q[i] = 0.5 * rho * v * v;
  }
  return q;
}

/** True when this record has a dynamic-pressure curve to draw at all. */
export function hasDynamicPressure(series: FlightSeries): boolean {
  const q = dynamicPressureSeries(series);
  for (let i = 0; i < q.length; i++) if (Number.isFinite(q[i])) return true;
  return false;
}
