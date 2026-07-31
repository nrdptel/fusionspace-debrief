'use client';

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { planAxes, windowStats, exploreCsv, type PlotChannel } from '@/lib/explore';
import {
  loadPlotView,
  resolveView,
  savePlotView,
  viewId,
  loadPresets,
  savePreset,
  deletePreset,
  builtinViews,
  loadHiddenEvents,
  saveHiddenEvents,
  MAX_PRESETS,
  MAX_PRESET_NAME,
  type PlotPreset,
} from '@/lib/plotView';
import { COMPARE_PALETTE } from '@/lib/compare';
import { download } from '@/lib/download';
import { plotSvg } from '@/lib/svgChart';
import type { FlightEvent } from '@/lib/analyze/types';
import type { UnitChoice } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import EventChips, { eventTypesPresent } from './EventChips';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { type ChartMarker } from './Chart';
import SampleTable from './SampleTable';
import { Button } from './ui';

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
  stem,
}: {
  channels: PlotChannel[];
  time: Float64Array;
  events: FlightEvent[];
  sys: UnitChoice;
  /** Filesystem-safe stem of the source file, for export filenames. */
  stem: string;
}) {
  const dark = useIsDark();
  const [figureDark, toggleFigureDark] = useFigureDark();
  const chartRef = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => new Map(channels.map((c) => [c.key, c])), [channels]);

  // Restored from however the flyer last set the explorer up, where this flight has those
  // channels — the tenth flight of a season is read the same way as the ninth. Falls back
  // to the first channel when nothing matches, so a new logger still opens on something.
  const [yKeys, setYKeys] = useState<string[]>(channels[0] ? [channels[0].key] : []);
  const [xKey, setXKey] = useState('time');
  // Applied once the flight's channels are known, and again when the flight changes.
  const channelIds = channels.map((c) => c.key).join('|');
  useEffect(() => {
    const saved = loadPlotView();
    const restored = resolveView(saved, channels);
    setYKeys(restored.length > 0 ? restored : channels[0] ? [channels[0].key] : []);
    setXKey(saved && (saved.x === 'time' || channels.some((c) => c.key === saved.x)) ? saved.x : 'time');
    // channelIds stands in for the channel set: a new flight with the same channels keeps
    // the view without a needless reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelIds]);

  // Remember any change, so it is there on the next flight and the next visit.
  useEffect(() => {
    if (yKeys.length === 0) return;
    const ids = yKeys.map((k) => byKey.get(k)).filter((c): c is PlotChannel => !!c).map(viewId);
    if (ids.length > 0) savePlotView({ y: ids, x: xKey });
  }, [yKeys, xKey, byKey]);
  // Named views. The single remembered view above covers "open every flight the way I read
  // the last one"; these cover the several things a flyer checks on every flight of a season
  // — the boost, the deployments, the airframe's health — each under its own name.
  const [presets, setPresets] = useState<PlotPreset[]>([]);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  useEffect(() => setPresets(loadPresets()), []);
  // …and a handful that are here on the first visit, so the explorer opens on something
  // worth looking at rather than on whatever channel happened to be first. Only the ones
  // this flight has every channel for.
  const builtins = useMemo(() => builtinViews(channels, presets), [channels, presets]);
  const applyPreset = (p: PlotPreset) => {
    const restored = resolveView(p, channels);
    if (restored.length > 0) setYKeys(restored);
    setXKey(p.x === 'time' || channels.some((c) => c.key === p.x) ? p.x : 'time');
  };
  const commitPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const y = yKeys.map((k) => byKey.get(k)).filter((c): c is PlotChannel => !!c).map(viewId);
    setPresets(savePreset(name, { y, x: xKey }));
    setPresetName('');
    setNaming(false);
  };

  // Visible x-range, reported by the chart; zoom is the measurement selection.
  const [view, setView] = useState<[number, number] | null>(null);
  const onView = useCallback((min: number, max: number) => {
    setView((prev) => (prev && prev[0] === min && prev[1] === max ? prev : [min, max]));
  }, []);

  const selected = yKeys.map((k) => byKey.get(k)).filter((c): c is PlotChannel => !!c);
  const { leftUnit, rightUnit } = planAxes(selected.map((c) => c.unitLabel(sys)));

  const xIsTime = xKey === 'time';
  const xChan = xIsTime ? undefined : byKey.get(xKey);

  // Where an event sits on the current x axis. On the usual time axis that's its own
  // timestamp; with a channel on x it's that channel's displayed value at the event's
  // sample, so "jump to burnout" still lands on the right row of an altitude-vs-velocity
  // plot. Null when the sample isn't in range at all.
  const eventX = useCallback(
    (e: FlightEvent): number | null => {
      if (xIsTime) return Number.isFinite(time[e.index]) ? time[e.index] : null;
      if (!xChan) return null;
      const v = xChan.toDisplay(xChan.values[e.index], sys);
      return Number.isFinite(v) ? v : null;
    },
    [xIsTime, xChan, time, sys],
  );

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
    return sel.map((c, i) => {
      const u = c.unitLabel(sys);
      return {
        label: u ? `${c.label} (${u})` : c.label,
        values: seriesData[i],
        stroke: COMPARE_PALETTE[i % COMPARE_PALETTE.length],
        width: 1.75,
        axis: (u === left ? 'left' : 'right') as 'left' | 'right',
      };
    });
  }, [yKeys, byKey, seriesData, sys]);

  // Which events are called out. All of them, until the flyer says otherwise — measured over
  // the corpus, 28 of 30 flights have two markers inside 6% of the plotted span (the tightest
  // a burnout and an apogee 0.10% apart on a 99-second record), because the boost is a few
  // seconds inside a record minutes long. OpenRocket lets you pick; this is that.
  const [hiddenEvents, setHiddenEvents] = useState<string[]>([]);
  useEffect(() => setHiddenEvents(loadHiddenEvents()), []);
  const toggleEvent = (type: string) => {
    setHiddenEvents((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type];
      saveHiddenEvents(next);
      return next;
    });
  };
  // One chip per event type this flight actually has, in flight order — never a control for
  // something the record doesn't contain.
  const eventTypes = useMemo(() => eventTypesPresent(events.map((e) => e.type)), [events]);

  const markers = useMemo<ChartMarker[]>(
    () =>
      xIsTime
        ? events
            .filter((e) => !hiddenEvents.includes(e.type))
            .map((e) => ({ x: e.time, label: e.label.toLowerCase(), color: EVENT_COLOR[e.type] }))
        : [],
    [xIsTime, events, hiddenEvents],
  );

  if (selected.length === 0) return null;

  const xUnit = xIsTime ? 's' : (xChan?.unitLabel(sys) ?? '');
  const xName = xIsTime ? 'Time' : (xChan?.label ?? 'Time');

  // A channel can be added unless it's already shown, we're at the cap, or it
  // would need a third axis (a third distinct unit). `rightUnit` can legitimately
  // be the empty string (a unitless channel like Mach on the second axis), so test
  // for "a second axis exists" explicitly rather than truthiness.
  const hasRightAxis = rightUnit !== undefined;
  /** Why a channel can't be added right now, or null if it can. The list used to be
   *  FILTERED by this, so a channel that needed a third axis simply vanished: plot a
   *  velocity beside the altitude on a Blue Raven and the menu drops from eleven entries to
   *  five, with Mach, dynamic pressure, battery, temperature and tilt gone and nothing
   *  saying where. The panel's own line is "Plot any channel your logger recorded". A
   *  reading that isn't offered has to say why it isn't, the same as one that is withheld. */
  const whyNot = (c: PlotChannel): string | null => {
    if (yKeys.includes(c.key)) return 'already plotted';
    if (selected.length >= MAX_SERIES) return `at the ${MAX_SERIES}-channel limit`;
    const u = c.unitLabel(sys);
    if (!hasRightAxis || u === leftUnit || u === rightUnit) return null;
    return `needs a third axis; remove a ${leftUnit || 'unitless'} or ${rightUnit || 'unitless'} channel`;
  };
  // Everything the logger recorded stays in the menu; the ones that can't go on right now
  // are disabled with the reason beside them.
  const offerable = channels.filter((c) => !yKeys.includes(c.key));
  const addable = offerable.filter((c) => whyNot(c) === null);

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
  // A vector version of the same plot — crisp at any size for a report or slide.
  const saveSvg = () => {
    const svg = plotSvg({
      x: xVals,
      series: series.map((s) => ({ label: s.label, color: s.stroke, axis: s.axis, values: s.values })),
      xLabel: xUnit ? `${xName} (${xUnit})` : xName,
      leftLabel: leftUnit ?? '',
      rightLabel: rightUnit,
      dark: figureDark,
    });
    download(new Blob([svg], { type: 'image/svg+xml' }), `${stem}-explore.svg`);
  };

  return (
    <div>
      <h3 id="explore-the-data" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
        Explore the data
      </h3>
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
            {c.unitLabel(sys) && <span className="text-zinc-500 dark:text-zinc-400">{c.unitLabel(sys)}</span>}
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
        {offerable.length > 0 && (
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
              const inGroup = offerable.filter((c) => c.group === g);
              if (inGroup.length === 0) return null;
              return (
                <optgroup key={g} label={g}>
                  {inGroup.map((c) => {
                    const blocked = whyNot(c);
                    return (
                      <option key={c.key} value={c.key} disabled={blocked !== null}>
                        {blocked ? `${c.label} — ${blocked}` : c.label}
                      </option>
                    );
                  })}
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

      {/* Named views */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Views</span>
        {builtins.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={() => applyPreset(b)}
            title={b.about}
            className="inline-flex min-h-[1.75rem] items-center rounded-md border border-dashed border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
          >
            {b.name}
          </button>
        ))}
        {presets.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white py-0.5 pl-1.5 pr-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <button
              type="button"
              onClick={() => applyPreset(p)}
              title={`Plot the “${p.name}” view`}
              className="min-h-[1.75rem] px-1 font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-400"
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => setPresets(deletePreset(p.name))}
              aria-label={`Forget the ${p.name} view`}
              title="Forget this view"
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </span>
        ))}
        {naming ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              aria-label="Name for this view"
              value={presetName}
              maxLength={MAX_PRESET_NAME}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPreset();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setPresetName('');
                }
              }}
              placeholder="Boost check"
              className="min-h-[1.75rem] w-36 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <Button size="sm" onClick={commitPreset}>
              Save
            </Button>
          </span>
        ) : (
          presets.length < MAX_PRESETS && (
            <Button
              size="sm"
              onClick={() => setNaming(true)}
              title="Keep this set of channels and axis under a name, for every flight"
            >
              + Save this view
            </Button>
          )
        )}
        {presets.length > 0 ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            kept on this device · a view applies wherever the flight has those channels
          </span>
        ) : (
          builtins.length > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              built in · offered where this flight has every channel they name
            </span>
          )
        )}
      </div>

      {/* Which events are drawn — the same control, and the same stored answer, as the
          comparison overlay uses one surface over. */}
      {xIsTime && (
        <EventChips types={eventTypes} hidden={hiddenEvents} onToggle={toggleEvent} className="mt-3" />
      )}

      {/* Export what's plotted */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={savePng} title="Save the current plot as a PNG">
          Save .png
        </Button>
        <FigureThemeButton dark={figureDark} onToggle={toggleFigureDark} />
        <Button
          size="sm"
          onClick={saveSvg}
          title="Save the plot as a vector SVG — crisp at any size for a report or slide"
        >
          Save .svg
        </Button>
        <Button
          size="sm"
          onClick={saveCsv}
          title="Save the plotted data — your chosen axes, in the displayed units — as CSV"
        >
          Save .csv
        </Button>
      </div>

      <div ref={chartRef} className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Left axis: <span className="font-medium text-zinc-700 dark:text-zinc-300">{leftUnit || 'unitless'}</span>
          {hasRightAxis && (
            <>
              {' · '}Right axis: <span className="font-medium text-zinc-700 dark:text-zinc-300">{rightUnit || 'unitless'}</span>
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
          xSorted={xIsTime}
          // The event markers are drawn on the canvas, so without naming them here a screen
          // reader is told the chart exists and nothing about what is called out on it — and
          // now that the flyer can turn them off, the name has to say which are actually on.
          ariaLabel={
            `Line chart of ${selected.map((c) => c.label).join(', ')} against ${xName}.` +
            (markers.length > 0 ? ` Events marked: ${markers.map((m) => m.label).join(', ')}.` : '')
          }
          onView={onView}
        />
      </div>

      {/* Live stats for whatever's in view — drag across the chart to zoom into a
          phase, double-click to reset; the numbers track the visible window. */}
      <Stats
        channels={selected}
        seriesData={seriesData}
        xVals={xVals}
        time={time}
        sys={sys}
        view={view}
        xName={xName}
        xUnit={xUnit}
        showDeltaRate={xIsTime}
      />

      {/* The numbers behind the plot. Collapsed by default — the chart is the answer most
          of the time — but one click away, and it follows the chart's zoom. */}
      <details className="mt-4">
        <summary className="cursor-pointer select-none text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Show the samples
        </summary>
        <SampleTable
          channels={selected}
          seriesData={seriesData}
          xVals={xVals}
          xName={xName}
          xUnit={xUnit}
          sys={sys}
          view={view}
          events={events}
          eventX={eventX}
        />
      </details>

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
  time,
  sys,
  view,
  xName,
  xUnit,
  showDeltaRate,
}: {
  channels: PlotChannel[];
  seriesData: Float64Array[];
  xVals: Float64Array;
  /** The flight's own clock, whatever is on the x axis — `mean` is weighted by it, because the
   *  mean of a stretch of flight is not the mean of the samples in it when the cadence changes.
   *  See `windowStats`. */
  time: Float64Array;
  sys: UnitChoice;
  view: [number, number] | null;
  xName: string;
  xUnit: string;
  // Δ and rate only mean something on a monotonic time axis; hidden otherwise.
  showDeltaRate: boolean;
}) {
  const [lo, hi] = view ?? [-Infinity, Infinity];
  const rows = useMemo(
    () => channels.map((c, i) => ({ c, i, s: windowStats(xVals, seriesData[i], lo, hi, time) })),
    [channels, seriesData, xVals, lo, hi, time],
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
                    {c.unitLabel(sys) && <span className="text-zinc-500 dark:text-zinc-400">{c.unitLabel(sys)}</span>}
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
        Stats are for the visible window — drag across the chart to zoom into a phase (pinch on
        touch), double-click or double-tap to reset. Values are in each channel&apos;s unit
        {showDeltaRate ? <>; rate is the change per {xUnit}.</> : '.'}
      </p>
    </div>
  );
}
