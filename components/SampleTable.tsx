'use client';

import { useMemo, useRef, useState } from 'react';
import type { PlotChannel } from '@/lib/explore';
import type { UnitChoice } from '@/lib/display';
import type { FlightEvent } from '@/lib/analyze/types';
import { EVENT_COLOR } from '@/lib/eventStyle';

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
const OVERSCAN = 6;

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const places = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return v.toFixed(places);
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
    if (el) el.scrollTop = Math.max(0, (best - from) * ROW_H);
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
          select and copy, or use <em>Save .csv</em> for the whole set
        </p>
      </div>
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
              className="inline-flex min-h-[1.75rem] items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
      <div
        ref={(el) => {
          scrollRef.current = el;
          if (el && el.clientHeight && el.clientHeight !== height) setHeight(el.clientHeight);
        }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="mt-1.5 max-h-[22rem] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {xName}
                {xUnit ? ` (${xUnit})` : ''}
              </th>
              {channels.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {c.label}
                  {c.unitLabel(sys) ? ` (${c.unitLabel(sys)})` : ''}
                </th>
              ))}
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
              const i = from + first + k;
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
      </div>
    </div>
  );
}
