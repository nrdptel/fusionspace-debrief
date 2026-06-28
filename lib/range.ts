// The finite extent of a numeric series, skipping gaps (NaN / null / undefined).
// Charts lean on this to range their axes: uPlot finds the x-extent by reading the
// first and last samples (assuming sorted x) and mis-ranges a series that's been
// NaN-padded onto a shared grid — both of which this scan handles honestly.
export function finiteMinMax(values: ArrayLike<number | null | undefined>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? [lo, hi] : null;
}
