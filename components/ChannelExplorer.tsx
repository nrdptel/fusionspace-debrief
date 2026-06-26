'use client';

import { useMemo, useState } from 'react';
import { planAxes, type PlotChannel } from '@/lib/explore';
import { COMPARE_PALETTE } from '@/lib/compare';
import type { FlightEvent } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { useIsDark } from './useIsDark';
import Chart, { type ChartMarker } from './Chart';

const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const GROUPS: PlotChannel['group'][] = ['Debrief', 'Recorded'];
const MAX_SERIES = COMPARE_PALETTE.length;

function num(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const p = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 3;
  const f = Math.pow(10, p);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: p });
}

/** Pick any recorded or derived channels and overlay them. The summary above is
 * the fast lane; this is the deep lane — every channel the logger wrote, against
 * time or against another channel, with a second axis so different units (say
 * altitude and battery voltage) share one chart without flattening each other. */
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

  const [yKeys, setYKeys] = useState<string[]>(channels[0] ? [channels[0].key] : []);
  const [xKey, setXKey] = useState('time');

  const selected = yKeys.map((k) => byKey.get(k)).filter((c): c is PlotChannel => !!c);
  const { leftUnit, rightUnit } = planAxes(selected.map((c) => c.unitLabel(sys)));

  const xIsTime = xKey === 'time';
  const xChan = xIsTime ? undefined : byKey.get(xKey);

  const xVals = useMemo(() => {
    if (xIsTime || !xChan) return time;
    const out = new Float64Array(xChan.values.length);
    for (let i = 0; i < out.length; i++) out[i] = xChan.toDisplay(xChan.values[i], sys);
    return out;
  }, [xIsTime, xChan, time, sys]);

  const seriesData = useMemo(
    () =>
      yKeys
        .map((k) => byKey.get(k))
        .filter((c): c is PlotChannel => !!c)
        .map((c) => {
          const out = new Float64Array(c.values.length);
          for (let i = 0; i < out.length; i++) out[i] = c.toDisplay(c.values[i], sys);
          return out;
        }),
    [yKeys, byKey, sys],
  );

  if (selected.length === 0) return null;

  const xUnit = xIsTime ? 's' : (xChan?.unitLabel(sys) ?? '');
  const xName = xIsTime ? 'Time' : (xChan?.label ?? 'Time');

  const series = selected.map((c, i) => ({
    label: `${c.label} (${c.unitLabel(sys)})`,
    values: seriesData[i],
    stroke: COMPARE_PALETTE[i % COMPARE_PALETTE.length],
    width: 1.75,
    axis: c.unitLabel(sys) === leftUnit ? ('left' as const) : ('right' as const),
  }));

  const markers: ChartMarker[] = xIsTime
    ? events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] }))
    : [];

  // A channel can be added unless it's already shown, we're at the cap, or it
  // would need a third axis (a third distinct unit).
  const canAdd = (c: PlotChannel) => {
    if (yKeys.includes(c.key) || selected.length >= MAX_SERIES) return false;
    const u = c.unitLabel(sys);
    return !rightUnit || u === leftUnit || u === rightUnit;
  };
  const addable = channels.filter(canAdd);

  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Explore the data</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Plot any channel your logger recorded — overlay a few, and choose what goes on each axis.
      </p>

      {/* Selected Y channels as removable chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {selected.map((c, i) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white py-1 pl-2 pr-1 text-xs dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
              aria-hidden="true"
            />
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.label}</span>
            <span className="text-zinc-500 dark:text-zinc-400">{c.unitLabel(sys)}</span>
            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => setYKeys((ks) => ks.filter((k) => k !== c.key))}
                aria-label={`Remove ${c.label} from the plot`}
                title="Remove"
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {addable.length > 0 && (
          <select
            aria-label="Add a channel to the plot"
            value=""
            onChange={(e) => {
              if (e.target.value) setYKeys((ks) => [...ks, e.target.value]);
            }}
            className={SELECT}
          >
            <option value="">+ Add channel…</option>
            {GROUPS.map((g) => {
              const inGroup = addable.filter((c) => c.group === g);
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
          </select>
        )}
      </div>

      {/* X axis selector */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          X axis
          <select aria-label="X axis channel" value={xKey} onChange={(e) => setXKey(e.target.value)} className={SELECT}>
            <option value="time">Time</option>
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
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Left axis: <span className="font-medium text-zinc-700 dark:text-zinc-300">{leftUnit}</span>
          {rightUnit && (
            <>
              {' · '}Right axis: <span className="font-medium text-zinc-700 dark:text-zinc-300">{rightUnit}</span>
            </>
          )}
          {' · '}X: <span className="font-medium text-zinc-700 dark:text-zinc-300">{xName}{xUnit && ` (${xUnit})`}</span>
        </div>
        <Chart
          time={xVals}
          series={series}
          markers={markers}
          dark={dark}
          height={280}
          fmt={num}
          fmtRight={rightUnit ? num : undefined}
          xFmt={xIsTime ? undefined : num}
          xLabel={xIsTime ? 'time' : xName}
          ariaLabel={`Line chart of ${selected.map((c) => c.label).join(', ')} against ${xName}.`}
        />
      </div>

      {!xIsTime && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Plotting against another channel draws the path the flight traced through them, in time
          order — so a curve can loop back on itself (the same altitude on the way up and the way
          down).
        </p>
      )}
    </div>
  );
}
