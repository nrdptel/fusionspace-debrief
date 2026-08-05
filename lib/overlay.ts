// Putting two traces on one chart when they do NOT share a clock.
//
// `uPlot` takes one x array and every series aligned to it, so a prediction on its own time base
// cannot simply be pushed into a flight's `series[]`. There are three ways out and only one is
// allowed here:
//
//   - Resample the prediction onto the flight's samples. This is what the comparison surface does
//     to overlay several FLIGHTS, and it says so in its own words. **Forbidden for a prediction:**
//     resampling a simulation onto a measured liftoff makes the prediction look like it was
//     measured, which is the one thing D9 exists not to do.
//   - A second chart underneath. Cheap, and it throws away the only thing the overlay is for —
//     seeing where the two curves part company.
//   - Merge the two time bases into a UNION x, keeping every original sample of each and NaN
//     everywhere the other one has a sample. No value is invented and none is moved; each line
//     draws through the other's samples via uPlot's `spanGaps`. That is what this does.

/** One trace on its own clock. */
export interface TimedTrace {
  time: ArrayLike<number>;
  values: ArrayLike<number>;
}

export interface UnionResult {
  /** Every instant either trace has a sample at, ascending, de-duplicated. */
  time: Float64Array;
  /** One array per input, aligned to `time`, NaN where that input has no sample. */
  values: Float64Array[];
}

/**
 * Merge N traces onto one ascending x, each keeping exactly its own samples.
 *
 * Two samples at the SAME instant share a slot rather than producing two — otherwise a flight
 * and a prediction that both start at t=0 would open the axis with a duplicated x, which uPlot
 * reads as a zero-width interval. Where one input has two samples at one instant (a logger that
 * wrote a row twice), the last one wins, which matches what a chart would draw anyway.
 *
 * A non-finite time is dropped: it cannot be placed on an axis, and carrying it would put a NaN
 * into the x array where uPlot expects a number.
 */
export function unionTimeBase(traces: TimedTrace[]): UnionResult {
  const instants: number[] = [];
  for (const t of traces) {
    const n = Math.min(t.time.length, t.values.length);
    for (let i = 0; i < n; i++) {
      const x = t.time[i];
      if (Number.isFinite(x)) instants.push(x);
    }
  }
  instants.sort((a, b) => a - b);

  // De-duplicate in place; `instants` is already sorted so equal values are adjacent.
  const x = new Float64Array(instants.length);
  let m = 0;
  for (let i = 0; i < instants.length; i++) {
    if (m === 0 || instants[i] !== x[m - 1]) x[m++] = instants[i];
  }
  const time = x.subarray(0, m);

  // Each trace's own samples, placed by a binary search on the union. Ascending inputs would
  // allow a merge walk, but a trace is not guaranteed ascending here and a search cannot be
  // wrong about it.
  const values = traces.map((t) => {
    const out = new Float64Array(m).fill(NaN);
    const n = Math.min(t.time.length, t.values.length);
    for (let i = 0; i < n; i++) {
      const xi = t.time[i];
      if (!Number.isFinite(xi)) continue;
      let lo = 0;
      let hi = m - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (time[mid] === xi) {
          out[mid] = t.values[i];
          break;
        }
        if (time[mid] < xi) lo = mid + 1;
        else hi = mid - 1;
      }
    }
    return out;
  });

  return { time: new Float64Array(time), values };
}
