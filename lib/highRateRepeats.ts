// A replayed block is not a recording.
//
// A Blue Raven *backup* download can write the same samples more than once. The board's own
// low-rate half already gets caught — `lib/analyze/index.ts` sees a record that returns to the
// ground and climbs again to the same height and says *"holds the same flight written twice"* —
// but the HIGH-rate half has no altitude, so nothing in that machinery can see it, and the
// stream was being drawn as though every sample were a fresh instant of the flight.
//
// ## What the corpus holds, measured over all four Blue Raven high-rate pairs
//
// Row identity is the payload from the `Sync` column onward — the vendor's own sensor block.
// `Year,Month,Day,Time` is a wall clock and `Flight_Time_(s)` is monotonic, so including either
// makes every row unique and finds nothing at all. That is not hypothetical: it is exactly the
// mistake that made a first pass at re-deriving these numbers report zero repeats on a file that
// has 27,261 of them.
//
//   jan10   64,290 rows   4 overlapping blocks   →  27,261 rows are a verbatim replay
//   jan18   93,164 rows   4 overlapping blocks   →  44,793 rows are a verbatim replay
//   lemiv   96,630 rows   none                   →  0
//   meraki 192,000 rows   none                   →  0
//
// **The blocks OVERLAP, and counting them without a union is how a first attempt got its number
// wrong.** jan10's four blocks sum to 41,463 rows; the union of what they mark as a COPY of
// something earlier is 27,261. The union is the honest count — a row replayed twice is still one
// row that is not its own instant — and it is what `repeatedSampleCount` returns.
//
// ## A repeat is only worth telling a flyer about if it is inside what they are shown
//
// This is the clause that made a previous version of this feature wrong enough to revert, and it
// is not obvious. Debrief ALREADY truncates jan10: its low-rate half is doubled too, so the
// analysis reads the first copy and the report draws `0 – 20.22 s`. jan10's largest block —
// 20,160 samples — sits at flight clock ≈40 s, **entirely outside the stretch drawn**, while a
// 7,101-sample block starts at ≈14.1 s, inside it. A note naming the big one describes something
// the flyer cannot see and stays silent about the one corrupting the trace in front of them.
//
// So detection and STATEMENT are deliberately separate. `findRepeatedSpans` is pure and knows
// nothing about extents; `repeatedSpanNote` takes the analysis's own `ReadExtent` and says only
// what falls inside it. The extent is decided by the analysis long after the parser that can see
// the repeat, which is why the spans travel on the flight rather than being turned into prose
// where they are found.
//
// **And the note states only quantities it can ground.** A first version of THIS version clipped
// the RANGE to the extent while keeping the whole span's sample count, so jan10 read
// *"14.1–20.2 s … 7,101 of them"* for a 6.1 s window holding about 3,065 — a 2.3× over-claim a
// flyer could catch from two numbers in one paragraph. The span's own range and its own count are
// both facts about the file; where the read ends is a separate fact. All three are stated, and
// none is derived from the others.
//
// ## What this does NOT do
//
// It computes no reading off the stream — D8's slice 1 boundary is untouched. It removes nothing.
// And it makes no claim about how much of the file reaches the chart: the high-rate trace is an
// ENVELOPE, one sample per flight instant, so "every sample is drawn" would be false by about 64×
// on jan10 and is not said. `lib/highRate.ts`'s own note is where the envelope is explained.

import type { ReadExtent } from './analyze/types';
import { fmtTime } from './display';

/** A stretch of a recording that repeats an earlier stretch of the same recording, verbatim.
 *  Seconds on the flight's own clock — the same clock a chart's axis is drawn on, so a flyer can
 *  put the number against what is in front of them. */
export interface RepeatedSpan {
  fromS: number;
  toS: number;
  /** How many samples the copy holds. A fact about the FILE, independent of what is drawn. */
  samples: number;
}

/** Runs shorter than this are not evidence of anything. At 500 Hz this is a tenth of a second,
 *  and a handful of consecutive equal samples is what a still board or a quantised sensor
 *  produces on its own. Measured: at 50 the four corpus files split cleanly into two with
 *  thousands-long blocks and two with none at all, so nothing here sits near the threshold. */
const MIN_RUN = 50;

/** At most this many candidate lags are examined.
 *
 *  **Not for the reason a first draft of this comment gave.** It claimed a long constant stretch
 *  would generate a candidate per offset; it does not, because candidates come from CONSECUTIVE
 *  occurrence gaps only, so *m* identical rows contribute *m−1* hits to lag 1 and nothing to any
 *  other lag. The real reason is cheap insurance: the candidate list is whatever the file's own
 *  content produces, and a file engineered to produce thousands of long-run lags would make the
 *  verification pass below quadratic. A replay's hit count is its block length — thousands — so
 *  it ranks far above any incidental lag and the cap cannot evict a real one on this corpus. It
 *  is still the one place a repeat could vanish in silence; `BACKLOG.md` carries that. */
const MAX_LAGS = 16;

/** Two samples of the same multi-channel series are the same sample. NaN is treated as equal to
 *  NaN: a run of unrecorded samples repeating is still a repeat, and `===` would say otherwise. */
function sameSample(series: readonly (Float64Array | readonly number[])[], i: number, j: number): boolean {
  for (const s of series) {
    const a = s[i];
    const b = s[j];
    if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) return false;
  }
  return true;
}

/** A cheap 32-bit mix of one sample's channel values, used only to BUCKET candidates — every
 *  match it proposes is then confirmed by `sameSample`, so a collision costs a comparison and
 *  never a wrong answer.
 *
 *  Numeric rather than a concatenated string, and that is a memory decision with a measured
 *  reason: one string per sample cost **130 MB** transiently on meraki's 192,000 rows, on the
 *  main thread, beside the 15 MB file text — a real out-of-memory surface on a phone. An
 *  Int32Array of the same length is 768 KB. */
function sampleHash(series: readonly (Float64Array | readonly number[])[], i: number): number {
  let h = 0x811c9dc5;
  for (const s of series) {
    // Fold the double through two 32-bit halves so 1 and 1.0000001 do not collide by rounding.
    const v = s[i];
    const scaled = Number.isFinite(v) ? v * 1000 : 0;
    h = Math.imul(h ^ (scaled | 0), 0x01000193);
    h = Math.imul(h ^ ((scaled * 4294967296) | 0), 0x01000193);
  }
  return h | 0;
}

/**
 * Every stretch that repeats an earlier stretch of the same series, verbatim.
 *
 * Returns the COPIES, merged: the ranges that repeat something earlier, unioned so a sample
 * caught by two overlapping blocks is counted once. The source stretch is deliberately not
 * returned — it is the recording, and only the copy is the thing that is not its own instant.
 */
export function findRepeatedSpans(
  series: readonly (Float64Array | readonly number[])[],
  times: Float64Array | readonly number[],
  length = times.length,
): RepeatedSpan[] {
  const n = length;
  if (n < MIN_RUN * 2 || series.length === 0) return [];

  const hashes = new Int32Array(n);
  for (let i = 0; i < n; i++) hashes[i] = sampleHash(series, i);

  const at = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const prev = at.get(hashes[i]);
    if (prev) prev.push(i);
    else at.set(hashes[i], [i]);
  }
  const lagHits = new Map<number, number>();
  for (const idxs of at.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length - 1; a++) {
      // Confirm the hash match before it votes for a lag — a collision must not invent one.
      if (!sameSample(series, idxs[a], idxs[a + 1])) continue;
      const lag = idxs[a + 1] - idxs[a];
      lagHits.set(lag, (lagHits.get(lag) ?? 0) + 1);
    }
  }
  const lags = [...lagHits.entries()]
    .filter(([, hits]) => hits >= MIN_RUN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LAGS)
    .map(([lag]) => lag);

  const copies: [number, number][] = [];
  for (const lag of lags) {
    let run = 0;
    for (let i = 0; i + lag < n; i++) {
      if (hashes[i] === hashes[i + lag] && sameSample(series, i, i + lag)) {
        run++;
        continue;
      }
      if (run >= MIN_RUN) copies.push([i - run + lag, i + lag]);
      run = 0;
    }
    if (run >= MIN_RUN) copies.push([n - run, n]);
  }
  if (copies.length === 0) return [];

  // **A board that sat still is not a board that replayed anything.** Identical samples repeat
  // trivially while nothing is moving, and a lag inside such a stretch satisfies every test above
  // without a single sample having been written twice. A block only means a replay if the stretch
  // it covers actually VARIES. Measured: this removes nothing from the corpus — all of jan10's
  // and jan18's blocks vary — so it guards a file the corpus does not hold rather than filtering
  // one it does, and it is kept because the alternative is telling a flyer their download is
  // corrupt because their rocket was on the pad.
  const varying = copies.filter(([lo, hi]) => {
    for (let i = lo + 1; i < hi; i++) if (!sameSample(series, lo, i)) return true;
    return false;
  });
  if (varying.length === 0) return [];

  varying.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [varying[0]];
  for (const [lo, hi] of varying.slice(1)) {
    const last = merged[merged.length - 1];
    if (lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }

  return merged.map(([lo, hi]) => ({
    fromS: times[lo],
    toS: times[hi - 1],
    samples: hi - lo,
  }));
}

/** Total samples marked as a copy. The spans are already unioned, so this is a plain sum. */
export function repeatedSampleCount(spans: readonly RepeatedSpan[]): number {
  return spans.reduce((sum, s) => sum + s.samples, 0);
}

/** Merge a newly-found set of spans into any already on a flight, unioning overlaps so the sum
 *  stays the honest count. Reachable only where two high-rate streams pair to one flight, which
 *  `pairHighRate` does not currently prevent; without the union that case would double-count. */
export function mergeRepeatedSpans(
  existing: readonly RepeatedSpan[] | undefined,
  found: readonly RepeatedSpan[],
): RepeatedSpan[] {
  const all = [...(existing ?? []), ...found].sort((a, b) => a.fromS - b.fromS);
  if (all.length === 0) return [];
  const out: RepeatedSpan[] = [{ ...all[0] }];
  for (const s of all.slice(1)) {
    const last = out[out.length - 1];
    if (s.fromS <= last.toS) {
      // Overlapping ranges on one clock: keep the union, and keep the larger count rather than
      // adding two counts that describe overlapping stretches of the same file.
      last.toS = Math.max(last.toS, s.toS);
      last.samples = Math.max(last.samples, s.samples);
    } else out.push({ ...s });
  }
  return out;
}

/**
 * What to tell the flyer — about the stretch they are actually being shown, and nothing else.
 *
 * Returns null when the record has no repeat, and also when every repeat it has falls outside the
 * analysis's extent. Both are silence for the same reason: a note about a stretch the report does
 * not draw is a claim about something the flyer cannot check.
 *
 * **Every number here is a fact stated on its own.** The span's range and the span's sample count
 * are facts about the file; where the read ends is a fact about the analysis. None is derived
 * from the others, because the obvious derivation — clipping the range and keeping the count —
 * over-claimed by 2.3× on the one file this exists for.
 *
 * The count is localised like every other number in `lib/`: a bare template literal renders
 * `20.160` in a de-DE browser, which reads as twenty point one six zero.
 */
export function repeatedSpanNote(spans: readonly RepeatedSpan[] | undefined, extent: ReadExtent): string | null {
  if (!spans || spans.length === 0) return null;
  // A span that merely touches an edge is not inside it — it shares one instant and draws nothing.
  const inside = spans.filter((s) => s.toS > extent.startTime && s.fromS < extent.endTime);
  if (inside.length === 0) return null;

  // "14.1 s to 28.3 s" rather than "14.1–28.3 s": `fmtTime` carries its own unit and its own
  // locale separators, and stripping one off to build a dash range would be a second, worse
  // formatter living beside the app's real one.
  const ranges = inside.map((s) => `${fmtTime(s.fromS)} to ${fmtTime(s.toS)}`).join('; ');
  const samples = repeatedSampleCount(inside).toLocaleString('en-US');
  const runsPast = inside.some((s) => s.toS > extent.endTime);
  const outside = spans.length - inside.length;

  return (
    `This board's high-rate download writes part of the flight more than once. ` +
    `${inside.length === 1 ? 'A stretch' : `${inside.length} stretches`} of it — ${ranges} on this ` +
    `flight's clock, ${samples} samples in all — repeat${inside.length === 1 ? 's' : ''} an earlier ` +
    `stretch of the same file verbatim, so the high-rate traces there replay an earlier moment ` +
    `rather than reading that one.` +
    (runsPast
      ? ` The record read here ends at ${fmtTime(extent.endTime)}, so only the part before that is drawn.`
      : '') +
    (outside > 0
      ? ` ${outside === 1 ? 'One further repeated stretch lies' : `${outside} further repeated stretches lie`} ` +
        `outside the record read here.`
      : '')
  );
}
