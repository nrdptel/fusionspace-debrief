// Helpers shared by the parsers whose files carry a separate time column per
// channel (Featherweight Raven FIP, Entacore AIM). Each channel is read as its
// own (time, value) series, then resampled onto a chosen master clock so the
// curves line up into one coherent flight.

export interface Series {
  t: number[];
  v: number[];
}

/** Read one channel as a strictly-ascending (time, value) series, dropping
 *  non-numeric cells and de-duplicating timestamps (keeping the latest), so the
 *  analysis and resample's forward cursor can assume monotonic time. */
export function readChannel(dataRows: string[][], timeCol: number, valCol: number): Series {
  const pairs: [number, number][] = [];
  for (const row of dataRows) {
    const tc = row[timeCol];
    const vc = row[valCol];
    if (!tc || !vc) continue;
    const tn = Number(tc);
    const vn = Number(vc);
    if (Number.isFinite(tn) && Number.isFinite(vn)) pairs.push([tn, vn]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const t: number[] = [];
  const v: number[] = [];
  for (const [tn, vn] of pairs) {
    if (t.length > 0 && tn === t[t.length - 1]) {
      v[v.length - 1] = vn; // duplicate timestamp: keep the latest sample
      continue;
    }
    t.push(tn);
    v.push(vn);
  }
  return { t, v };
}

/** Linearly resample (src.t, src.v) onto the target time grid (both ascending);
 *  values outside the source span are clamped to its ends, gaps interpolated. */
export function resample(src: Series, target: Float64Array): Float64Array {
  const out = new Float64Array(target.length);
  const n = src.t.length;
  if (n === 0) {
    out.fill(NaN);
    return out;
  }
  let j = 0;
  for (let i = 0; i < target.length; i++) {
    const t = target[i];
    while (j < n - 1 && src.t[j + 1] < t) j++;
    if (t <= src.t[0]) out[i] = src.v[0];
    else if (t >= src.t[n - 1]) out[i] = src.v[n - 1];
    else {
      const t0 = src.t[j];
      const t1 = src.t[j + 1];
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      out[i] = src.v[j] + f * (src.v[j + 1] - src.v[j]);
    }
  }
  return out;
}

/** The densest (most samples) of several series — used as the master clock. */
export function densest(series: Series[]): Series | null {
  let best: Series | null = null;
  for (const s of series) if (s.t.length > 0 && (!best || s.t.length > best.t.length)) best = s;
  return best;
}
