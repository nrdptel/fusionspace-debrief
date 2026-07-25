'use client';

import { useMemo, useRef, useState } from 'react';
import type { PlotChannel } from '@/lib/explore';
import type { UnitChoice } from '@/lib/display';

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
      <div
        ref={(el) => {
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
                <tr key={i} className="border-t border-zinc-100 dark:border-zinc-900" style={{ height: ROW_H }}>
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
