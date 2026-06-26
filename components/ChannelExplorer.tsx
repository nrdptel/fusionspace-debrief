'use client';

import { useMemo, useState } from 'react';
import type { PlotChannel } from '@/lib/explore';
import type { FlightEvent } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { useIsDark } from './useIsDark';
import Chart, { type ChartMarker } from './Chart';

const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const Y_COLOR = '#6366f1';
const GROUPS: PlotChannel['group'][] = ['Debrief', 'Recorded'];

function num(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const p = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 3;
  const f = Math.pow(10, p);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: p });
}

function Options({ channels }: { channels: PlotChannel[] }) {
  return (
    <>
      {GROUPS.map((g) => {
        const inGroup = channels.filter((c) => c.group === g);
        if (inGroup.length === 0) return null;
        return (
          <optgroup key={g} label={g}>
            {inGroup.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/** Pick any recorded or derived channel for each axis and plot it. The summary
 * above is the fast lane; this is the deep lane — every channel the logger wrote,
 * against time or against another channel. */
export default function ChannelExplorer({
  channels,
  time,
  events,
  sys,
}: {
  channels: PlotChannel[];
  time: Float64Array;
  events: FlightEvent[];
  sys: UnitSystem;
}) {
  const dark = useIsDark();
  const byKey = useMemo(() => new Map(channels.map((c) => [c.key, c])), [channels]);

  const [xKey, setXKey] = useState('time');
  const [yKey, setYKey] = useState(channels[0]?.key ?? '');

  const yChan = byKey.get(yKey) ?? channels[0];
  const xIsTime = xKey === 'time';
  const xChan = xIsTime ? undefined : byKey.get(xKey);

  const xVals = useMemo(() => {
    if (xIsTime || !xChan) return time;
    const out = new Float64Array(xChan.values.length);
    for (let i = 0; i < out.length; i++) out[i] = xChan.toDisplay(xChan.values[i], sys);
    return out;
  }, [xIsTime, xChan, time, sys]);

  const yVals = useMemo(() => {
    if (!yChan) return new Float64Array(0);
    const out = new Float64Array(yChan.values.length);
    for (let i = 0; i < out.length; i++) out[i] = yChan.toDisplay(yChan.values[i], sys);
    return out;
  }, [yChan, sys]);

  if (!yChan) return null;

  const yUnit = yChan.unitLabel(sys);
  const xUnit = xIsTime ? 's' : (xChan?.unitLabel(sys) ?? '');
  const xName = xIsTime ? 'Time' : (xChan?.label ?? 'Time');

  const markers: ChartMarker[] = xIsTime
    ? events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] }))
    : [];

  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Explore the data</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Plot any channel your logger recorded — pick what goes on each axis.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Y axis
          <select aria-label="Y axis channel" value={yKey} onChange={(e) => setYKey(e.target.value)} className={SELECT}>
            <Options channels={channels} />
          </select>
        </label>
        <span className="pb-2 text-xs text-zinc-500 dark:text-zinc-400">vs</span>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          X axis
          <select aria-label="X axis channel" value={xKey} onChange={(e) => setXKey(e.target.value)} className={SELECT}>
            <option value="time">Time</option>
            <Options channels={channels} />
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {yChan.label}
          {yUnit && <span className="text-zinc-500 dark:text-zinc-400"> ({yUnit})</span>}{' '}
          <span className="text-zinc-500 dark:text-zinc-400">vs</span> {xName}
          {xUnit && <span className="text-zinc-500 dark:text-zinc-400"> ({xUnit})</span>}
        </div>
        <Chart
          time={xVals}
          series={[{ label: yChan.label, values: yVals, stroke: Y_COLOR, width: 1.75 }]}
          markers={markers}
          dark={dark}
          height={260}
          fmt={num}
          xFmt={xIsTime ? undefined : num}
          xLabel={xIsTime ? 'time' : xName}
          ariaLabel={`Line chart of ${yChan.label} against ${xName}.`}
        />
      </div>

      {!xIsTime && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Plotting one channel against another draws the path the flight traced through them, in
          time order — so a curve can loop back on itself (for example, the same altitude on the way
          up and the way down).
        </p>
      )}
    </div>
  );
}
