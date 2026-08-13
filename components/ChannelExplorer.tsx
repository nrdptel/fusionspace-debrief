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
import { savePlotPng } from '@/lib/plotPng';
import type { FlightEvent } from '@/lib/analyze/types';
import type { UnitChoice } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { syntheticHeader, syntheticBandLine } from '@/lib/synthetic';
import EventChips, { eventTypesPresent } from './EventChips';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { type ChartMarker } from './Chart';
import SampleTable from './SampleTable';
import { Button, Card, Chip, ChipButton, CopyTableButton, DismissibleChip, Segmented } from './ui';

const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const GROUPS: PlotChannel['group'][] = ['Debrief', 'Recorded'];
// The explorer's own limit, for the same reason `MAX_COMPARE` is: how many traces stay
// readable is a fact about the eye, not about how many strokes the palette happens to hold.
const MAX_SERIES = 6;

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
  synthetic,
}: {
  channels: PlotChannel[];
  time: Float64Array;
  events: FlightEvent[];
  sys: UnitChoice;
  /** Filesystem-safe stem of the source file, for export filenames. */
  stem: string;
  /** Did Debrief make this flight up? Every channel here is that flight's, so it rides on all
   *  THREE things this panel puts in a flyer's hands: the plotted-data CSV, the sample table's
   *  per-column clipboard copy, and the window-stats table.
   *
   *  Required, with no default, on `MetricGrid`'s stated rule — a default is only safe where a
   *  missed call site is VISIBLE, and here it is invisible: the exports are byte-identical to
   *  their pre-D10 form, so no type error, no unit test and no walk can fail. */
  synthetic: boolean;
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

  // Which channels the SAMPLE TABLE shows, which is a different question from which the chart
  // draws — see the note at its call site. Every channel by default: that is the reading a flyer
  // came for, and the chart's six-trace limit has no business deciding it.
  const [tableScope, setTableScope] = useState<'all' | 'plotted'>('all');
  const [samplesOpen, setSamplesOpen] = useState(false);
  // Converted only once the table is actually open. A log can run to hundreds of thousands of
  // samples and this is one array per channel — 15 channels of a 190,000-sample file is ~23 MB,
  // which is not worth holding for a panel that is collapsed by default and often never opened.
  //
  // `samplesOpen` gates the CHANNEL LIST as well as the data, and must: the table draws its
  // headers from `channels` and its cells from `seriesData`, so handing it eleven channels and
  // an empty data array yields eleven headers over rows of one cell. That is invisible inside a
  // closed `<details>`, which is exactly why it would have survived — the fix is to keep the two
  // in step rather than to special-case the render.
  const showAll = tableScope === 'all' && samplesOpen && channels.length > selected.length;
  const tableChannels = showAll ? channels : selected;
  // Its own memo, depending on the channel set and the units and NOTHING else. Folded into the
  // branch below it would have carried `seriesData` as a dependency — which the every-channel
  // path never reads — so adding or removing one chart chip, or applying a saved view, would
  // re-allocate all fifteen arrays for a table whose contents had not changed. That is the exact
  // cost the deferral above exists to avoid, reintroduced through a dependency array.
  const allSeriesData = useMemo(
    () =>
      samplesOpen
        ? channels.map((c) => {
            const out = new Float64Array(c.values.length);
            for (let i = 0; i < out.length; i++) out[i] = c.toDisplay(c.values[i], sys);
            return out;
          })
        : [],
    [samplesOpen, channels, sys],
  );
  const tableSeriesData = showAll ? allSeriesData : seriesData;

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
  // Every channel in this panel is one flight's, so the figure carries the whole claim or none.
  const bandNote = syntheticBandLine(synthetic ? 1 : 0, 1);
  const saveCsv = () => {
    // Every column here is one flight's, x included — unlike the comparison's shared clock — so a
    // made-up flight marks the whole file: the header of each column, and a `Provenance` cell on
    // every row for a block pasted without its headers.
    const x = { label: xName, unit: xUnit, values: xVals, synthetic };
    const ys = selected.map((c, i) => ({ label: c.label, unit: c.unitLabel(sys), values: seriesData[i], synthetic }));
    download(new Blob([exploreCsv(x, ys)], { type: 'text/csv' }), `${stem}-explore.csv`);
  };
  const savePng = () => {
    savePlotPng(chartRef.current, { dark, filename: `${stem}-explore.png`, syntheticNote: bandNote });
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
      syntheticNote: bandNote,
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
        {selected.map((c, i) =>
          // **A `Chip` on the LAST one, not a `DismissibleChip` with a hidden ✕**, and the two are
          // the same height by construction — §5's rule. The remove control disappears on the last
          // channel because a plot of nothing is not a state this panel has; a chip that keeps the
          // control and refuses the press would be the "control that lies" tell instead.
          selected.length > 1 ? (
            <DismissibleChip
              key={c.key}
              swatch={COMPARE_PALETTE[i % COMPARE_PALETTE.length]}
              onDismiss={() => setYKeys((ks) => ks.filter((k) => k !== c.key))}
              dismissLabel={`Remove ${c.label} from the plot`}
              dismissTitle="Remove"
            >
              {c.label}
              {c.unitLabel(sys) && <span className="ml-1.5 font-normal text-zinc-600 dark:text-zinc-400">{c.unitLabel(sys)}</span>}
            </DismissibleChip>
          ) : (
            <Chip
              key={c.key}
              mono={false}
              lead={
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
                  aria-hidden="true"
                />
              }
              value={
                <>
                  <span className="font-medium">{c.label}</span>
                  {/* `zinc-600`, not the `zinc-500` this chip carried when it was hand-rolled on `bg-white`.
                      `Chip`'s `default` tone is a raised `zinc-100` tile, and the same ink over that fill
                      measures 4.4:1 — under AA. §9's SOURCE census cannot see it (the class has a `dark:`
                      partner and no `/NN` opacity, so it rates clean); axe caught it on the report the first
                      time this branch rendered. Same ink, different FILL. */}
                  {c.unitLabel(sys) && <span className="ml-1.5 text-zinc-600 dark:text-zinc-400">{c.unitLabel(sys)}</span>}
                </>
              }
            />
          ),
        )}
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
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
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
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Views</span>
        {builtins.map((b) => (
          <ChipButton key={b.name} dashed onClick={() => applyPreset(b)} title={b.about}>
            {b.name}
          </ChipButton>
        ))}
        {/* A saved view is the one chip here with TWO things to do — apply it, and forget it — so
            it is `DismissibleChip` with `onActivate` rather than a `ChipButton`. It used to hand-roll
            the shape at `py-0.5 pl-1.5 pr-0.5` with a `Button variant="link"` re-padded at the call
            site, and measured 34 px beside the 26 px built-in views next to it. */}
        {presets.map((p) => (
          <DismissibleChip
            key={p.name}
            onActivate={() => applyPreset(p)}
            activateTitle={`Plot the “${p.name}” view`}
            onDismiss={() => setPresets(deletePreset(p.name))}
            dismissLabel={`Forget the ${p.name} view`}
            dismissTitle="Forget this view"
          >
            {p.name}
          </DismissibleChip>
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
              className="min-h-[1.75rem] w-36 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
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

      <Card ref={chartRef} className="mt-3">
        <div className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
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
      </Card>

      {/* Live stats for whatever's in view — drag across the chart to zoom into a
          phase, double-click to reset; the numbers track the visible window. */}
      <Stats
        channels={selected}
        seriesData={seriesData}
        xVals={xVals}
        time={time}
        sys={sys}
        view={view}
        synthetic={synthetic}
        xName={xName}
        xUnit={xUnit}
        showDeltaRate={xIsTime}
      />

      {/* The numbers behind the plot. Collapsed by default — the chart is the answer most
          of the time — but one click away, and it follows the chart's zoom. */}
      <details className="mt-4" onToggle={(e) => setSamplesOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer select-none text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Show the samples
        </summary>
        {/* The table's columns are its own choice, not the chart's. `MAX_SERIES` is a fact about
            how many TRACES stay readable — six lines over two axes — and it was silently deciding
            how many COLUMNS of numbers a flyer could see. Measured over the corpus: of the 25 files
            a parser auto-detects as a flight, 23 carry more channels than the chart draws at once,
            the richest carries 15, and 119
            channels in total could not be read as numbers without going back to the chart and
            swapping the selection. `analyzedDataCsv` has always carried every one of them, so the
            data was there and only the in-app view was capped. */}
        {channels.length > selected.length && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              ariaLabel="Which channels the sample table shows"
              value={tableScope}
              onChange={setTableScope}
              options={[
                { value: 'all', label: `Every channel (${channels.length})` },
                { value: 'plotted', label: `Just what's plotted (${selected.length})` },
              ]}
            />
          </div>
        )}
        <SampleTable
          channels={tableChannels}
          seriesData={tableSeriesData}
          xVals={xVals}
          xName={xName}
          xUnit={xUnit}
          sys={sys}
          view={view}
          events={events}
          eventX={eventX}
          synthetic={synthetic}
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
const TD_NUM =
  'flex items-baseline justify-between gap-3 py-0.5 font-mono tabular-nums text-zinc-800 sm:table-cell sm:px-3 sm:py-1.5 sm:text-right dark:text-zinc-200';

/** A stat cell: the number at every width, its column name only where there is no column header.
 *
 *  The label is the ONLY thing this layout duplicates, and it is a label rather than a reading —
 *  `aria-hidden`, because the table's own `scope="col"` header names it to a screen reader at every
 *  width regardless of what CSS does to the header's box. */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td className={TD_NUM}>
      <span aria-hidden="true" className="font-sans text-xs uppercase tracking-wide text-zinc-500 sm:hidden dark:text-zinc-400">
        {label}
      </span>
      <span className="shrink-0">{children}</span>
    </td>
  );
}

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
  synthetic,
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
  /** Did Debrief make this flight up? Required, with no default, for the reason `MetricGrid`'s is:
   *  the safe-looking default is the defect value, and an omitted prop here ships a made-up
   *  flight's figures to a cert document reading exactly like a recording's. */
  synthetic: boolean;
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
      {/* These are the numbers a cert document quotes — min, max and mean of each channel over
          the stretch of flight the flyer zoomed to — and until now the only way to get them into
          one was to retype them off the screen. The rows are built at press time, so the copy
          follows the zoom rather than whatever the window was when the panel mounted. */}
      {rows.length > 0 && (
        <CopyTableButton
          label="Copy these stats"
          title="Copy this window's figures — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
          header={[
            'Channel',
            'Unit',
            'min',
            'max',
            'mean',
            ...(showDeltaRate ? ['Δ', `rate (per ${xUnit})`] : []),
          ]}
          rows={() =>
            rows.map(({ c, s }) => [
              // The caveat rides in the CHANNEL cell rather than in a column of its own, so it
              // survives a paste into a spreadsheet that only takes the first two columns — and
              // so a figure Debrief refused on the report cannot reach a cert document from here
              // wearing no qualifier at all.
              //
              // **The made-up claim rides in the same cell, and it took a pre-push review to find
              // that it did not.** This panel's third export was missing from D10's sink audit
              // entirely: the slice that labelled the plotted-data CSV and the per-column copy
              // wrote, four lines from here, that the claim "rides on every column this panel
              // writes out" — while these figures, which the comment above calls the ones a cert
              // document quotes, went to the clipboard bare. Same cell as the caveat because it is
              // the same argument, and the synthetic claim is the stronger of the two.
              syntheticHeader(c.caveat ? `${c.label} — ${c.caveat}` : c.label, synthetic),
              c.unitLabel(sys),
              ...(s
                ? [num(s.min), num(s.max), num(s.mean), ...(showDeltaRate ? [num(s.delta), num(s.rate)] : [])]
                : Array(showDeltaRate ? 5 : 3).fill('no samples in range')),
            ])
          }
        />
      )}
      {/* ONE table, laid out two ways — the same shape `components/CompareView.tsx` took for the
          same reason, and `ON-6`'s second named surface. Measured at 390×844 before it was
          changed: this table renders **395 px inside a 358 px container**, so reading a channel's
          Δ or rate meant scrolling the table sideways. Below `sm` its rows become blocks and its
          cells labelled lines; nothing is duplicated but each cell's column NAME, and the header
          group hides because in block form there is no column left for it to label.

          Unlike the comparison's header, this one carries no controls — only the six words — so
          hiding it below `sm` removes nothing a flyer can press. That was checked rather than
          assumed: hiding the comparison's header deleted its reorder buttons and colour swatches
          from the phone, which is the mistake this comment exists to stop being repeated. */}
      <div className="sm:overflow-x-auto">
        {/* Named, because this page carries seven tables and an unnamed one is "table" in a
            screen reader's list of them. It also gives a test something unambiguous to address,
            which is how the omission was noticed. */}
        <table
          aria-label="Channel statistics over the visible window"
          className="block min-w-full border-separate border-spacing-0 text-sm sm:table"
        >
          <thead className="hidden sm:table-header-group">
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
          <tbody className="block sm:table-row-group">
            {rows.map(({ c, i, s }) => (
              <tr key={c.key} className="block border-t border-zinc-100 py-1.5 sm:table-row sm:py-0 dark:border-zinc-900">
                <th scope="row" className="block px-0 pb-1 text-left font-normal sm:table-cell sm:px-3 sm:py-1.5 sm:pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.label}</span>
                    {c.unitLabel(sys) && <span className="text-zinc-500 dark:text-zinc-400">{c.unitLabel(sys)}</span>}
                  </span>
                  {/* §2's caveat hue, on the one row whose numbers the report refused. The trace
                      above is kept deliberately so a mis-scaled column can be diagnosed; these
                      statistics are a different claim and carry the headline's reason with them.
                      `text-sm`, not `text-xs`: §3 keeps caption size for the text AROUND a value —
                      its unit, its provenance — and this is a sentence saying the value beside it
                      is not one to quote. P1 already made exactly this correction on the seven
                      derived-reading panels, which rendered every state message at caption size
                      including a flight-safety caution. */}
                  {c.caveat && (
                    <span className="mt-0.5 block text-sm text-amber-700 dark:text-amber-500">{c.caveat}</span>
                  )}
                </th>
                {s ? (
                  <>
                    <Stat label="min">{num(s.min)}</Stat>
                    <Stat label="max">{num(s.max)}</Stat>
                    <Stat label="mean">{num(s.mean)}</Stat>
                    {showDeltaRate && (
                      <>
                        <Stat label="Δ">{num(s.delta)}</Stat>
                        <Stat label="rate">{num(s.rate)}</Stat>
                      </>
                    )}
                  </>
                ) : (
                  <td colSpan={emptyCols} className="block py-0.5 text-sm text-zinc-500 sm:table-cell sm:px-3 sm:py-1.5 sm:text-right dark:text-zinc-400">
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
