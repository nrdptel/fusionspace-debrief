'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { planAxes, windowStats, exploreCsv, type PlotChannel } from '@/lib/explore';
import { COMPARE_PALETTE } from '@/lib/compare';
import { download } from '@/lib/download';
import type { FlightEvent } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { useIsDark } from './useIsDark';
import Chart, { type ChartMarker } from './Chart';

const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';
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
  stem,
}: {
  channels: PlotChannel[];
  time: Float64Array;
  events: FlightEvent[];
  sys: UnitSystem;
  /** Filesystem-safe stem of the source file, for export filenames. */
  stem: string;
}) {
  const dark = useIsDark();
  const chartRef = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => new Map(channels.map((c) => [c.key, c])), [channels]);

  const [yKeys, setYKeys] = useState<string[]>(channels[0] ? [channels[0].key] : []);
  const [xKey, setXKey] = useState('time');
  // Visible x-range, reported by the chart; zoom is the measurement selection.
  const [view, setView] = useState<[number, number] | null>(null);
  const onView = useCallback((min: number, max: number) => {
    setView((prev) => (prev && prev[0] === min && prev[1] === max ? prev : [min, max]));
  }, []);

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

  // Memoized so a zoom (which updates `view` for the stats panel) doesn't change
  // these prop identities and force the chart to re-initialize, which would snap
  // the zoom straight back to the full range.
  const series = useMemo(() => {
    const sel = yKeys.map((k) => byKey.get(k)).filter((c): c is PlotChannel => !!c);
    const units: string[] = [];
    for (const c of sel) {
      const u = c.unitLabel(sys);
      if (!units.includes(u)) units.push(u);
    }
    const left = units[0];
    return sel.map((c, i) => ({
      label: `${c.label} (${c.unitLabel(sys)})`,
      values: seriesData[i],
      stroke: COMPARE_PALETTE[i % COMPARE_PALETTE.length],
      width: 1.75,
      axis: (c.unitLabel(sys) === left ? 'left' : 'right') as 'left' | 'right',
    }));
  }, [yKeys, byKey, seriesData, sys]);

  const markers = useMemo<ChartMarker[]>(
    () => (xIsTime ? events.map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] })) : []),
    [xIsTime, events],
  );

  if (selected.length === 0) return null;

  const xUnit = xIsTime ? 's' : (xChan?.unitLabel(sys) ?? '');
  const xName = xIsTime ? 'Time' : (xChan?.label ?? 'Time');

  // A channel can be added unless it's already shown, we're at the cap, or it
  // would need a third axis (a third distinct unit).
  const canAdd = (c: PlotChannel) => {
    if (yKeys.includes(c.key) || selected.length >= MAX_SERIES) return false;
    const u = c.unitLabel(sys);
    return !rightUnit || u === leftUnit || u === rightUnit;
  };
  const addable = channels.filter(canAdd);

  // Export exactly what's plotted — the CSV is the displayed data in the chosen
  // units; the PNG is the current chart. Both stay on-device (no upload).
  const saveCsv = () => {
    const x = { label: xName, unit: xUnit, values: xVals };
    const ys = selected.map((c, i) => ({ label: c.label, unit: c.unitLabel(sys), values: seriesData[i] }));
    download(new Blob([exploreCsv(x, ys)], { type: 'text/csv' }), `${stem}-explore.csv`);
  };
  const savePng = () => {
    const canvas = chartRef.current?.querySelector('canvas');
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = dark ? '#09090b' : '#ffffff'; // solid background, not transparent
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => blob && download(blob, `${stem}-explore.png`));
  };

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

      {/* Export what's plotted */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={savePng} title="Save the current plot as a PNG" className={ACTION_BTN}>
          Save .png
        </button>
        <button
          type="button"
          onClick={saveCsv}
          title="Save the plotted data — your chosen axes, in the displayed units — as CSV"
          className={ACTION_BTN}
        >
          Save .csv
        </button>
      </div>

      <div ref={chartRef} className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
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
          onView={onView}
        />
      </div>

      {/* Live stats for whatever's in view — drag across the chart to zoom into a
          phase, double-click to reset; the numbers track the visible window. */}
      <Stats
        channels={selected}
        seriesData={seriesData}
        xVals={xVals}
        sys={sys}
        view={view}
        xName={xName}
        xUnit={xUnit}
        showDeltaRate={xIsTime}
      />

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

const TH_NUM = 'px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const TD_NUM = 'px-3 py-1.5 text-right font-mono tabular-nums text-zinc-800 dark:text-zinc-200';

/** Min / max / mean / Δ / rate for each plotted channel over the visible window
 * (the current zoom). Zoom is the selection — these numbers track it. */
function Stats({
  channels,
  seriesData,
  xVals,
  sys,
  view,
  xName,
  xUnit,
  showDeltaRate,
}: {
  channels: PlotChannel[];
  seriesData: Float64Array[];
  xVals: Float64Array;
  sys: UnitSystem;
  view: [number, number] | null;
  xName: string;
  xUnit: string;
  // Δ and rate only mean something on a monotonic time axis; hidden otherwise.
  showDeltaRate: boolean;
}) {
  const [lo, hi] = view ?? [-Infinity, Infinity];
  const rows = useMemo(
    () => channels.map((c, i) => ({ c, i, s: windowStats(xVals, seriesData[i], lo, hi) })),
    [channels, seriesData, xVals, lo, hi],
  );
  const [fullLo, fullHi] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (let i = 0; i < xVals.length; i++) {
      const v = xVals[i];
      if (!Number.isFinite(v)) continue;
      if (v < a) a = v;
      if (v > b) b = v;
    }
    return [a, b];
  }, [xVals]);

  const shownLo = Number.isFinite(lo) ? lo : fullLo;
  const shownHi = Number.isFinite(hi) ? hi : fullHi;
  const zoomed = view != null && (shownLo > fullLo + 1e-6 || shownHi < fullHi - 1e-6);
  const emptyCols = showDeltaRate ? 5 : 3;

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {zoomed ? 'In the selected window' : 'Across the whole flight'}
        </h4>
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {xName} {num(shownLo)}–{num(shownHi)} {xUnit}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Channel
              </th>
              <th scope="col" className={TH_NUM}>min</th>
              <th scope="col" className={TH_NUM}>max</th>
              <th scope="col" className={TH_NUM}>mean</th>
              {showDeltaRate && (
                <>
                  <th scope="col" className={TH_NUM}>Δ</th>
                  <th scope="col" className={TH_NUM}>rate</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, i, s }) => (
              <tr key={c.key} className="border-t border-zinc-100 dark:border-zinc-900">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.label}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{c.unitLabel(sys)}</span>
                  </span>
                </th>
                {s ? (
                  <>
                    <td className={TD_NUM}>{num(s.min)}</td>
                    <td className={TD_NUM}>{num(s.max)}</td>
                    <td className={TD_NUM}>{num(s.mean)}</td>
                    {showDeltaRate && (
                      <>
                        <td className={TD_NUM}>{num(s.delta)}</td>
                        <td className={TD_NUM}>{num(s.rate)}</td>
                      </>
                    )}
                  </>
                ) : (
                  <td colSpan={emptyCols} className="px-3 py-1.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    no samples in range
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Stats are for the visible window — drag across the chart to zoom into a phase, double-click
        to reset. Values are in each channel&apos;s unit
        {showDeltaRate ? <>; rate is the change per {xUnit}.</> : '.'}
      </p>
    </div>
  );
}
