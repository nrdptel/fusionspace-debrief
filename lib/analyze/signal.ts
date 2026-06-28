// Small numerical helpers for the analysis pipeline. Everything here tolerates
// NaN gaps and non-uniform time steps, because real logs have both.

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
    buf.sort((a, b) => a - b);
    const m = buf.length >> 1;
    out[i] = buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
  }
  return out;
}

function medianOf(buf: number[]): number {
  buf.sort((a, b) => a - b);
  const m = buf.length >> 1;
  return buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
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
