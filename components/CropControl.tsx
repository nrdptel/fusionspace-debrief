'use client';

import { useEffect, useId, useState } from 'react';
import type { ReadExtent } from '@/lib/analyze/types';
import { Card } from './ui';

/** The first sample at or after `t`, and the last at or before it — a plain binary search,
 *  because a flight's time base is ascending by construction. */
export function indexAtOrAfter(time: Float64Array, t: number): number {
  let lo = 0;
  let hi = time.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function indexAtOrBefore(time: Float64Array, t: number): number {
  const at = indexAtOrAfter(time, t);
  return time[at] > t && at > 0 ? at - 1 : at;
}

/** The fewest samples the analysis will read. Below this it throws rather than guess. */
export const MIN_CROP_SAMPLES = 4;

const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * "This stretch is my flight."
 *
 * Debrief's own segmentation is a reading of the trace, and it is refusable: a logger that
 * armed late, a file that holds a flight and a bench test, a booster and a sustainer written
 * into one download — all of them are records where the flyer knows something the altitude
 * column does not. This is where they say it.
 *
 * The chart above is the selector. It already drags to zoom on a pointer and pinches on a
 * phone, and it reports the window it is showing; the flyer frames the stretch and presses
 * the button. The two boxes are the same choice typed rather than dragged, which is what
 * makes this reachable from a keyboard and exact when a flyer knows the seconds they want.
 */
export default function CropControl({
  time,
  view,
  extent,
  onRead,
  busy,
  error,
}: {
  /** The FILE's own time base — the crop is expressed in its indices. */
  time: Float64Array;
  /** The window the charts are showing, on the file's clock. */
  view: [number, number] | null;
  extent: ReadExtent;
  onRead: (from: number, to: number) => void;
  busy?: boolean;
  /** Why the last stretch asked for could not be read. Shown in place of the summary line,
   *  because a control that fails silently is worse than one that refuses out loud. */
  error?: string;
}) {
  const id = useId();
  const fileStart = time[0] ?? 0;
  const fileEnd = time[time.length - 1] ?? 0;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // The boxes follow the charts, so "read this view" and "read these seconds" are one choice
  // rather than two that can disagree. A flyer who has typed into them keeps what they typed:
  // the sync is on the view, and typing does not move the view.
  useEffect(() => {
    if (!view) return;
    setFrom(view[0].toFixed(1));
    setTo(view[1].toFixed(1));
  }, [view]);

  const f = num(from);
  const t = num(to);
  const lo = f == null ? null : Math.max(0, indexAtOrAfter(time, f));
  const hi = t == null ? null : Math.min(time.length, indexAtOrBefore(time, t) + 1);
  const samples = lo != null && hi != null ? hi - lo : 0;
  const tooShort = samples < MIN_CROP_SAMPLES;
  const whole = lo === 0 && hi === time.length;
  const already = lo === extent.from && hi === extent.to;
  const problem =
    f == null || t == null
      ? 'Give a start and an end, in seconds.'
      : t <= f
        ? 'The end has to come after the start.'
        : tooShort
          ? `That stretch holds ${samples} sample${samples === 1 ? '' : 's'} — too few to read a flight from.`
          : already
            ? 'That is the stretch already on screen.'
            : null;

  return (
    <Card tone="sunken" className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <p className="basis-full text-xs font-medium text-zinc-700 dark:text-zinc-300">
          This stretch is my flight
          <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
            — frame it on the chart above, or type the seconds. The analysis reads what you choose.
          </span>
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span id={`${id}-from-label`}>From (s)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={fileStart}
              max={fileEnd}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-labelledby={`${id}-from-label`}
              className="h-11 w-28 rounded-md border border-zinc-300 bg-white px-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span id={`${id}-to-label`}>To (s)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={fileStart}
              max={fileEnd}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-labelledby={`${id}-to-label`}
              className="h-11 w-28 rounded-md border border-zinc-300 bg-white px-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!!problem || !!busy}
          onClick={() => lo != null && hi != null && onRead(lo, hi)}
          className="h-11 rounded-md border border-indigo-500 bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {busy ? 'Reading…' : 'Read this stretch'}
        </button>
        {extent.source === 'chosen' && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onRead(0, time.length)}
            className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
          >
            Read the whole file
          </button>
        )}
      </div>
      {/* Says what pressing it would do, or why it is off — a control that fails only when
          pressed, or that is disabled and silent, is the thing this row exists to avoid. */}
      <p
        className={`text-xs ${error ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}
        role="status"
      >
        {error
          ? error
          : problem
          ? problem
            : `Reads ${samples.toLocaleString()} samples${whole ? ' — the whole file' : ''}, from ${f?.toFixed(1)} s to ${t?.toFixed(1)} s of a ${fileEnd.toFixed(1)} s file.`}
      </p>
    </Card>
  );
}
