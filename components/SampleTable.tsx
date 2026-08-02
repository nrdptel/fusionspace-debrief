'use client';

import { useMemo, useRef, useState } from 'react';
import { copyTable } from '@/lib/copyTable';
import type { PlotChannel } from '@/lib/explore';
import type { UnitChoice } from '@/lib/display';
import type { FlightEvent } from '@/lib/analyze/types';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { Frame } from './ui';

// The numbers themselves. AltosUI has a data tab and Excel *is* one, and a measurement
// instrument that will only draw you a picture of your own record is missing something:
// reading an exact value off a plot is guesswork, and "export the CSV and open it
// somewhere else" is the workflow this tool exists to replace.
//
// A flight log runs to hundreds of thousands of samples, so only the rows on screen are
// rendered — the scroll container is sized to the full count and the visible slice is
// computed from the scroll offset. That keeps a 190,000-row Blue Raven high-rate file as
// responsive as a 600-row sport flight, and keeps every row exact: nothing is decimated
// away, because a sample you can't see is a sample you can't check.

const ROW_H = 24; // px — fixed, so a scroll offset maps straight to a row index
/** The x column's stand-in key. It is not one of `channels`, so it needs a name of its own to be
 *  sorted by identity like the rest; `-1` remains its index everywhere below. */
const X_KEY = '\u0000x';
const OVERSCAN = 6;

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const places = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return v.toFixed(places);
}

/** A column heading that sorts. A button inside the `th` rather than a click handler on it,
 *  so it is reachable and operable from the keyboard, with `aria-sort` on the header itself —
 *  which is what a screen reader reads to say how the table is ordered. */
function SortableHeader({
  label,
  state,
  onClick,
  onCopy,
}: {
  label: string;
  state: 'none' | 'ascending' | 'descending';
  onClick: () => void;
  onCopy: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={state}
      className="px-0 py-0 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
    >
      <span className="flex items-center justify-end gap-0.5 pr-1">
        <button
          type="button"
          onClick={onClick}
          title={`Sort by ${label}`}
          className={`flex items-center justify-end gap-1 py-1.5 pl-3 uppercase tracking-wide transition hover:text-zinc-800 dark:hover:text-zinc-200 ${
            state === 'none' ? '' : 'text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {label}
          <span aria-hidden="true" className={state === 'none' ? 'opacity-0' : ''}>
            {state === 'ascending' ? '▲' : '▼'}
          </span>
        </button>
        {/* One channel, straight to the clipboard. The whole set has always been a CSV
            away, but "save it, find it, open it, delete the other columns" is the workflow
            this table exists to replace — and a flyer wanting the descent rates in a
            spreadsheet wants one column, not eleven. */}
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy the ${label} column`}
          title={`Copy the ${label} column — every row in this window, in view order`}
          className="rounded-md px-1 py-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <span aria-hidden="true">⧉</span>
        </button>
      </span>
    </th>
  );
}

export default function SampleTable({
  channels,
  seriesData,
  xVals,
  xName,
  xUnit,
  sys,
  view,
  events,
  eventX,
}: {
  channels: PlotChannel[];
  /** Display-unit values, one array per plotted channel — the same numbers the chart drew. */
  seriesData: Float64Array[];
  xVals: Float64Array;
  xName: string;
  xUnit: string;
  sys: UnitChoice;
  /** The chart's current zoom, so the table shows the stretch being looked at. */
  view: [number, number] | null;
  /** The flight's events, so the table can be jumped to one. */
  events: FlightEvent[];
  /** Where an event sits on the current x axis — its time, or the plotted channel's value
   *  at that sample when something other than time is on x. Null when it can't be placed. */
  eventX: (e: FlightEvent) => number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(360);

  // The rows in the visible x-window. Stored as an index range, not a copy, so zooming a
  // 190k-sample flight costs a scan rather than an allocation.
  const [from, to] = useMemo(() => {
    const n = Math.min(xVals.length, ...seriesData.map((s) => s.length));
    if (!view) return [0, n];
    const [lo, hi] = view;
    let a = 0;
    while (a < n && !(xVals[a] >= lo)) a++;
    let b = n;
    while (b > a && !(xVals[b - 1] <= hi)) b--;
    return [a, b];
  }, [view, xVals, seriesData]);

  const total = Math.min(xVals.length, ...seriesData.map((s) => s.length));
  const rows = Math.max(0, to - from);
  // The explorer keeps a view even unzoomed, so compare against the whole set rather
  // than trusting `view` to be null.
  const windowed = rows < total;
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visible = Math.min(rows - first, Math.ceil(height / ROW_H) + OVERSCAN * 2);

  // Reading a value AT an event is the thing a spreadsheet makes you hunt for: scroll to the
  // right row out of tens of thousands. The events are already known, so each one gets a
  // button that scrolls its row to the top of the window — and the row is highlighted so it
  // is obvious which one you landed on.
  // Order the rows by a column, the way a spreadsheet does — the gap next to Excel that a
  // raw sample table most obviously had. It is not decoration on a time series: sorting by
  // altitude descending is how you tell a real apogee from a one-sample spike, because the
  // top of the list reads 681, 673, 670, 670 and the answer is in the gap. Sample order is
  // always one more click away, and the x column is still there on every row, so nothing
  // about which sample is which is lost.
  //
  // Index order, not a copy of the data: the channels stay where they are and only a list of
  // row numbers moves. Measured on this machine at 7 ms for the largest analysable corpus
  // file (36,701 rows) and 56 ms for 200,000, so it stays a click rather than a wait — and it
  // only runs when a sort is actually on.
  //
  // Held by the column's KEY, not by its index. The set of columns is not fixed any more — the
  // table shows every channel by default and the flyer can drop it back to the chart's own
  // selection — and an index into a list that just got shorter is a different column or no column
  // at all. Stored as an index it went silently wrong in both directions: sorting by a channel the
  // narrower set does not contain left `sort` armed at an index whose `seriesData` entry was
  // `undefined`, so `order` fell back to null and the rows quietly reverted to sample order while
  // every header read `aria-sort="none"` — a sort that was on, showing nothing, with no way for
  // the flyer to see it or turn it off. Keyed, the sort follows its column when it survives the
  // change and clears itself when it does not.
  const [sortKey, setSortKey] = useState<{ key: string; dir: 'desc' | 'asc' } | null>(null);
  const colOf = (key: string) => (key === X_KEY ? -1 : channels.findIndex((c) => c.key === key));
  const sort = useMemo(() => {
    if (!sortKey) return null;
    const col = colOf(sortKey.key);
    return col === -1 && sortKey.key !== X_KEY ? null : { col, dir: sortKey.dir };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, channels]);

  const order = useMemo(() => {
    if (!sort) return null;
    const src = sort.col < 0 ? xVals : seriesData[sort.col];
    if (!src) return null;
    const idx: number[] = new Array(Math.max(0, to - from));
    for (let k = 0; k < idx.length; k++) idx[k] = from + k;
    const sign = sort.dir === 'desc' ? -1 : 1;
    idx.sort((a, b) => {
      const va = src[a];
      const vb = src[b];
      // A gap in a channel sinks to the end either way round, rather than sorting as if it
      // were the smallest value there is.
      const fa = Number.isFinite(va);
      const fb = Number.isFinite(vb);
      if (!fa || !fb) return fa === fb ? a - b : fa ? -1 : 1;
      return va === vb ? a - b : sign * (va - vb);
    });
    return Int32Array.from(idx);
  }, [sort, from, to, xVals, seriesData]);

  /** Third click on a column returns the samples to the order they were recorded in. */
  const cycleSort = (key: string) => {
    setSortKey((s) => (s?.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null));
  };
  const sortState = (col: number): 'none' | 'ascending' | 'descending' =>
    sort?.col !== col ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';

  const [copied, setCopied] = useState<string | null>(null);
  /** Copy one channel — the column's own values for every row in this window, in the order
   *  the table is showing them, so what lands in the spreadsheet is what is on screen. */
  const copyColumn = async (col: number, label: string) => {
    const src = col < 0 ? xVals : seriesData[col];
    if (!src) return;
    const out: string[][] = [];
    for (let k = 0; k < to - from; k++) {
      const i = order ? order[k] : from + k;
      out.push([fmt(src[i])]);
    }
    const ok = await copyTable([label], out);
    setCopied(ok ? `${label} copied — ${out.length.toLocaleString('en-US')} rows` : 'This browser wouldn’t let Debrief write to the clipboard.');
    window.setTimeout(() => setCopied(null), 4000);
  };

  /** The row a sample index is drawn at — its place in the sort, or its place in time. */
  const rowOf = (sampleIndex: number): number => {
    if (!order) return sampleIndex - from;
    for (let k = 0; k < order.length; k++) if (order[k] === sampleIndex) return k;
    return -1;
  };

  const [landed, setLanded] = useState<number | null>(null);
  const jumpTo = (e: FlightEvent) => {
    const x = eventX(e);
    if (x == null) return;
    // The nearest sample in the visible window, by x — the table's own ordering.
    let best = -1;
    let bestD = Infinity;
    for (let i = from; i < to; i++) {
      const d = Math.abs(xVals[i] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    setLanded(best);
    const el = scrollRef.current;
    const row = rowOf(best);
    if (el && row >= 0) el.scrollTop = Math.max(0, row * ROW_H);
  };
  const jumpable = events.filter((e) => eventX(e) != null);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {windowed ? 'Samples in this window' : 'Every sample'}
        </h4>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {rows.toLocaleString('en-US')} {rows === 1 ? 'row' : 'rows'} · exact values, in your units ·
          click a column to sort, ⧉ to copy it
        </p>
      </div>
      {/* One element, always mounted, empty when there's nothing to say: a live region that
          appears and disappears announces unreliably, and a second sr-only copy would put
          the same message in the page twice. */}
      <p role="status" aria-live="polite" className="mt-1 min-h-4 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
        {copied ?? ''}
      </p>
      {jumpable.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Jump to
          </span>
          {jumpable.map((e) => (
            <button
              key={e.type + e.index}
              type="button"
              onClick={() => jumpTo(e)}
              className="inline-flex min-h-[1.75rem] items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: EVENT_COLOR[e.type] }}
                aria-hidden="true"
              />
              {e.label}
            </button>
          ))}
        </div>
      )}
      <Frame
        ref={(el) => {
          scrollRef.current = el;
          if (el && el.clientHeight && el.clientHeight !== height) setHeight(el.clientHeight);
        }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="mt-1.5 max-h-[22rem] overflow-auto"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <SortableHeader
                label={`${xName}${xUnit ? ` (${xUnit})` : ''}`}
                state={sortState(-1)}
                onClick={() => cycleSort(X_KEY)}
                onCopy={() => void copyColumn(-1, `${xName}${xUnit ? ` (${xUnit})` : ''}`)}
              />
              {channels.map((c, ci) => {
                const label = `${c.label}${c.unitLabel(sys) ? ` (${c.unitLabel(sys)})` : ''}`;
                return (
                  <SortableHeader
                    key={c.key}
                    label={label}
                    state={sortState(ci)}
                    onClick={() => cycleSort(c.key)}
                    onCopy={() => void copyColumn(ci, label)}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Spacers stand in for the rows above and below the rendered slice, so the
                scrollbar reflects the whole set. */}
            {first > 0 && (
              <tr aria-hidden="true" style={{ height: first * ROW_H }}>
                <td colSpan={channels.length + 1} />
              </tr>
            )}
            {Array.from({ length: Math.max(0, visible) }, (_, k) => {
              const i = order ? order[first + k] : from + first + k;
              return (
                <tr
                  key={i}
                  className={`border-t border-zinc-100 dark:border-zinc-900 ${
                    i === landed ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                  }`}
                  style={{ height: ROW_H }}
                >
                  <td className="px-3 py-0.5 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {fmt(xVals[i])}
                  </td>
                  {seriesData.map((s, si) => (
                    <td key={si} className="px-3 py-0.5 text-right font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                      {fmt(s[i])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows - first - Math.max(0, visible) > 0 && (
              <tr aria-hidden="true" style={{ height: (rows - first - Math.max(0, visible)) * ROW_H }}>
                <td colSpan={channels.length + 1} />
              </tr>
            )}
            {rows === 0 && (
              <tr>
                <td colSpan={channels.length + 1} className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No samples in this window — zoom out on the chart, or double-click it to reset.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Frame>
    </div>
  );
}
