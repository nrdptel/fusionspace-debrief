// Small numerical helpers for the analysis pipeline. Everything here tolerates
// NaN gaps and non-uniform time steps, because real logs have both.

/**
 * In-place quickselect: returns the k-th smallest of a[0..len-1] and partitions
 * `a` so that a[0..k-1] are all ≤ a[k]. A median-of-three pivot keeps it ~O(len)
 * on the nearly-sorted windows this sees — a sliding window over a smooth flight
 * trace is almost in order, exactly where a naïve pivot degrades to O(len²). It
 * also avoids Array.sort's per-comparison callback, the real cost on a big log:
 * the median filters dominate the analysis, and they only ever need the median,
 * not a fully sorted window.
 */
function quickselect(a: number[], len: number, k: number): number {
  let lo = 0;
  let hi = len - 1;
  while (lo < hi) {
    if (hi - lo >= 2) {
      // Order a[lo] ≤ a[mid] ≤ a[hi] of the three, leaving their median at a[hi].
      const mid = (lo + hi) >> 1;
      let t: number;
      if (a[mid] < a[lo]) { t = a[lo]; a[lo] = a[mid]; a[mid] = t; }
      if (a[hi] < a[lo]) { t = a[lo]; a[lo] = a[hi]; a[hi] = t; }
      if (a[mid] < a[hi]) { t = a[mid]; a[mid] = a[hi]; a[hi] = t; }
    } else if (a[hi] < a[lo]) {
      const t = a[lo]; a[lo] = a[hi]; a[hi] = t;
    }
    const pivot = a[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      if (a[i] < pivot) {
        const t = a[i]; a[i] = a[store]; a[store] = t;
        store++;
      }
    }
    const t = a[store]; a[store] = a[hi]; a[hi] = t; // pivot to its sorted place
    if (store === k) return a[k];
    if (store < k) lo = store + 1;
    else hi = store - 1;
  }
  return a[lo];
}

/** Median of a scratch buffer (mutated in place). Even lengths average the two
 *  middle order statistics, matching a sort-then-pick exactly. */
function medianOf(buf: number[]): number {
  const n = buf.length;
  if (n === 1) return buf[0];
  const mid = n >> 1;
  if (n & 1) return quickselect(buf, n, mid);
  // Even: after selecting the upper-middle element, a[0..mid-1] are all ≤ it, so
  // the lower-middle order statistic is simply the largest of that left segment.
  const upper = quickselect(buf, n, mid);
  let lower = buf[0];
  for (let i = 1; i < mid; i++) if (buf[i] > lower) lower = buf[i];
  return (lower + upper) / 2;
}

/** Median of a window — the workhorse for killing single-sample ejection spikes. */
export function medianFilter(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const half = Math.max(0, Math.floor(window / 2));
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    buf.length = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= n) continue;
      const v = values[j];
      if (Number.isFinite(v)) buf.push(v);
    }
    if (buf.length === 0) {
      out[i] = values[i];
      continue;
    }
    out[i] = medianOf(buf);
  }
  return out;
}

/**
 * Hampel filter: replace any sample that sits more than `nSigma` robust standard
 * deviations from its local median with that median. Because the median is taken
 * over the whole window, this rejects multi-sample spikes (an ejection-charge
 * pressure pop is often 2–4 samples wide) that a plain median filter of the same
 * width lets through — and, unlike a moving average, it leaves the true apogee
 * peak untouched.
 */
export function hampelFilter(values: Float64Array, window: number, nSigma = 4): Float64Array {
  const n = values.length;
  const out = values.slice();
  const half = Math.max(1, Math.floor(window / 2));
  const win: number[] = [];
  const dev: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(values[i])) continue;
    win.length = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= n) continue;
      if (Number.isFinite(values[j])) win.push(values[j]);
    }
    if (win.length < 3) continue;
    // Sort `win` in place — the deviation loop below is order-independent, so the
    // throwaway copy was pure allocation churn (this filter is the analysis's hot
    // loop on a large log).
    const med = medianOf(win);
    dev.length = 0;
    for (const v of win) dev.push(Math.abs(v - med));
    const mad = medianOf(dev);
    const sigma = 1.4826 * mad;
    if (sigma > 0 && Math.abs(values[i] - med) > nSigma * sigma) out[i] = med;
  }
  return out;
}

/** Centred moving average. Window is in samples; NaNs are skipped. */
export function movingAverage(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const half = Math.max(0, Math.floor(window / 2));
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= n) continue;
      const v = values[j];
      if (Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    out[i] = count ? sum / count : values[i];
  }
  return out;
}

/**
 * Central-difference derivative on a possibly non-uniform time base.
 * d[i] = (y[i+1] - y[i-1]) / (t[i+1] - t[i-1]).
 */
export function derivative(time: Float64Array, values: Float64Array): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n < 2) return out;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    const dt = time[hi] - time[lo];
    out[i] = dt > 0 ? (values[hi] - values[lo]) / dt : 0;
  }
  return out;
}

/** Median sample interval — robust against the odd duplicated timestamp. */
export function medianDt(time: Float64Array): number {
  if (time.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (dt > 0) diffs.push(dt);
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[diffs.length >> 1];
}

/** Largest absolute finite value within `half` samples either side of `center`
 *  (the peak magnitude of a transient like a deployment shock), or NaN if the
 *  window holds no finite samples. */
export function peakAbsInWindow(values: Float64Array, center: number, half: number): number {
  let peak = NaN;
  const lo = Math.max(0, center - half);
  const hi = Math.min(values.length - 1, center + half);
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      const a = Math.abs(v);
      if (!(a <= peak)) peak = a; // NaN-safe max
    }
  }
  return peak;
}

/** Longest run of consecutive finite samples within `eps` of `target`, over
 *  [from, to). A flat top at the trace's own extreme is how a saturated (railed)
 *  sensor reads — a real boost rounds over its peak rather than holding it dead
 *  flat — so this is the tell for an accelerometer that hit its full-scale limit. */
export function longestRunNear(
  values: Float64Array,
  from: number,
  to: number,
  target: number,
  eps: number,
): number {
  let best = 0;
  let run = 0;
  const hi = Math.min(values.length, to);
  for (let i = Math.max(0, from); i < hi; i++) {
    const v = values[i];
    if (Number.isFinite(v) && Math.abs(v - target) <= eps) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Index of the maximum finite value, or -1. */
export function argMax(values: Float64Array, from = 0, to = values.length): number {
  let best = -1;
  let bestV = -Infinity;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i]) && values[i] > bestV) {
      bestV = values[i];
      best = i;
    }
  }
  return best;
}

/** Index of the minimum finite value, or -1. */
export function argMin(values: Float64Array, from = 0, to = values.length): number {
  let best = -1;
  let bestV = Infinity;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i]) && values[i] < bestV) {
      bestV = values[i];
      best = i;
    }
  }
  return best;
}
