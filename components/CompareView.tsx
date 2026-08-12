'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Comparison, CompareFlight } from '@/lib/compare';
import { crossCheck, crossCheckLede, CROSS_CHECK_WIDE, statedDaySplit, statedDaysPhrase, undatedNote, DIFFERENT_DAYS_CAVEAT, distinguishingLabels, recoveryDisagreement } from '@/lib/compare';
import { lengthIn, pressureIn, pressureUnit, speedIn, systemOf, unitsOf, accelIn } from '@/lib/display';
import type { UnitChoice, Units } from '@/lib/display';
import { exploreCsv } from '@/lib/explore';
import { toCsv } from '@/lib/csv';
import { download } from '@/lib/download';
import { copyTable } from '@/lib/copyTable';
import { savePlotPng } from '@/lib/plotPng';
import { syntheticBandLine, syntheticHeader } from '@/lib/synthetic';
import { derivedPeakCaveat } from '@/lib/derivedPeak';
import { loadFigureOrder, loadHidden, loadHiddenFigures, loadOrder, moveReading, orderRows, saveFigureOrder, saveHidden, saveHiddenFigures, saveOrder, toggleHidden } from '@/lib/reportProfile';
import { loadCompareChannel, saveCompareChannel, loadHiddenEvents, saveHiddenEvents } from '@/lib/plotView';
import ReadingChooser from './ReadingChooser';
import FigureChooser from './FigureChooser';
import EventChips, { eventTypesPresent } from './EventChips';
import type { EventType } from '@/lib/analyze/types';
import { zip, type ZipEntry } from '@/lib/zip';
import { compareMarkdown, compareHtml, compareJson, compareMetricRows, compareTableRows, compareHasBaroMix, compareHasClippedAccel, compareHasPartialDescent, compareHasUnprovenApogee, type ReportMeta } from '@/lib/report';
import { captionKey, loadMemory, memoryCarriedForward, rememberCompare, rememberShown, EMPTY, type CompareMemory, type CompareSort } from '@/lib/compareMemory';
import { plotSvg } from '@/lib/svgChart';
import { loadSeriesColors, saveSeriesColors, withSeriesColors } from '@/lib/seriesColor';
import { formatFlownAt } from '@/lib/flight/flownAt';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { type ChartMarker } from './Chart';
import { TOUCH_TARGET_SQUARE } from '@/lib/ui-tokens';
import { Button, Card, Disclosure, Figure, Notice, Segmented } from './ui';

const METRIC_KEYS = ['altitude', 'velocity', 'acceleration', 'mach', 'dynamicPressure'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

function round0(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

function round1(v: number): string {
  return Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : '—';
}

function round2(v: number): string {
  return Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—';
}

/** Trim a file extension for a tidier chart/legend label. */
function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export default function CompareView({
  comparison,
  note,
  sys,
  onBack,
  backLabel = '← Back to a single flight',
  permalink,
  stitchIds,
  mappable,
  headingLevel = 'h2',
  onMapFile,
}: {
  comparison: Comparison;
  note?: string;
  sys: UnitChoice;
  onBack: () => void;
  /** Where back goes depends on where the comparison came from: a drop on the analyze
   *  page returns to that one flight; the compare surface returns to its picker. */
  backLabel?: string;
  /** An address this comparison can be reopened at, where it has one. A comparison built
   *  from a drop exists only until the page does — but the dropped files went into the
   *  logbook on the way in, so the same set can be named by id and offered as a link. */
  permalink?: string;
  /** The logbook ids of these flights, comma-joined, where they ARE logbook ids. Absent on a
   *  comparison assembled straight from a drop, whose ids are synthetic — see the composite link. */
  stitchIds?: string;
  /** Files dropped alongside these flights that need their columns mapped, by name. */
  mappable?: string[];
  /** Which level "Comparing N flights" sits at. It is the page's subject on /compare, where
   *  the site header steps aside — and a section of the analyze page, which keeps its own
   *  h1. Defaults to the latter, so only the surface that owns the page asks for h1. */
  headingLevel?: 'h1' | 'h2';
  /** Open the mapper on one of them; it rejoins this comparison when mapped. */
  onMapFile?: (name: string) => void;
}) {
  const dark = useIsDark();
  const Heading = headingLevel;
  const [figureDark, toggleFigureDark] = useFigureDark();
  const { time, flights: loaded } = comparison;
  // Keyed off the set, not the order, so re-sorting the table doesn't rebuild the
  // chart and throw away the flyer's zoom.
  const syncKey = useMemo(() => `compare-${loaded.map((f) => f.id).join('-')}`, [loaded]);
  // A comparison has no id of its own — it IS its set of flights — so the set is what everything
  // the flyer arranged about it is stored under. `captionOf` is that set, order-independent, so a
  // re-ordering is not a different comparison.
  const loadedIds = useMemo(() => loaded.map((f) => f.id), [loaded]);
  const captionOf = captionKey(loadedIds);
  // The channel the flyer was last looking at, remembered on this device: comparing a
  // season's boosts means velocity every time, and clicking past altitude on each one is
  // the tool forgetting what it was just told.
  const [metric, setMetric] = useState<MetricKey>('altitude');
  useEffect(() => {
    const saved = loadCompareChannel();
    if (saved && (METRIC_KEYS as readonly string[]).includes(saved)) setMetric(saved as MetricKey);
  }, []);
  const chooseMetric = useCallback((key: MetricKey) => {
    setMetric(key);
    saveCompareChannel(key);
  }, []);

  // Order the flights by one of the metrics. A launch day is six files at once, and
  // "which went highest" shouldn't mean reading across a wide table by eye — so any
  // row can order the columns, and the order carries into the chart legend and every
  // export, because they all read the same array — which is true as of `arranged` below,
  // and was not before it.
  // …or put them in a deliberate order by hand. Ranking by a metric answers "which went
  // highest"; a launch day also has orders that no metric produces — booster then sustainer,
  // flight 1 to 6, the cert flight last. Moving a column is the flyer taking over, so it
  // clears the metric sort, and clicking a metric hands it back.
  //
  // The sort and the hand-made order live in the same state as the label and notes, and are
  // stored the same way, because they are the same kind of thing: work the flyer did on this
  // comparison, which every export reads. See lib/compareMemory.ts.
  // Seeded from storage on the FIRST render rather than in the effect below, so a reload paints
  // the table once, already arranged. The effect alone meant every reload of a six-column
  // comparison painted it in load order and then shuffled it. Safe to read storage here because
  // this view is never server-rendered: the surface reaches `ready` only after the flights come
  // back from IndexedDB, so there is no prerendered markup for this to disagree with.
  const [memory, setMemory] = useState<CompareMemory>(
    () => loadMemory(loadedIds) ?? memoryCarriedForward(loadedIds) ?? EMPTY,
  );
  const { label: reportLabel, notes: reportNotes, order: manual, sort } = memory;
  // The latest memory, updated SYNCHRONOUSLY by `remember` rather than at the next render. A real
  // double-click on "Move ▶" fires two handlers in one tick; the second read the pre-first-click
  // state, so the second move was lost — and once the order is stored, a lost move is not a
  // repaint away from correct, it is written down and comes back on every reload.
  const memoryRef = useRef(memory);
  /** Change part of what this comparison remembers, and keep it. */
  const remember = (patch: Partial<CompareMemory> | ((prev: CompareMemory) => Partial<CompareMemory> | null)) => {
    const prev = memoryRef.current;
    const p = typeof patch === 'function' ? patch(prev) : patch;
    if (!p) return;
    const next = { ...prev, ...p };
    memoryRef.current = next;
    setMemory(next);
    rememberShown(loadedIds, next);
    // Written on EDIT, not in an effect keyed on the fields. That effect fires on mount with the
    // empty initial state and deletes the stored record before the restore below has run — the
    // store is genuinely empty for that commit, which another tab can read, and every mount
    // churns a delete and a re-insert through the eviction order for nothing.
    rememberCompare(loadedIds, p);
  };
  /** The columns in the order this memory puts them in.
   *
   *  A metric sort WINS over the hand-made order while it is set, and does not erase it: clicking
   *  a metric row to see which went highest used to throw away a six-flight arrangement, with no
   *  way back — and once the order was stored, that loss was permanent rather than a re-drag away.
   *  Clearing the sort now returns to the flyer's own order, and clearing that returns to the
   *  order they loaded in. */
  const arrangeBy = useCallback(
    (mem: CompareMemory): CompareFlight[] => {
      if (mem.sort) {
        const row = compareMetricRows(loaded, sys).find((r) => r.label === mem.sort?.label);
        if (row) {
          const sign = mem.sort.dir === 'desc' ? -1 : 1;
          return loaded
            .map((f, i) => ({ f, i }))
            .sort((a, b) => {
              const av = row.values[a.i];
              const bv = row.values[b.i];
              // A flight without this figure sinks to the end, keeping its loaded order.
              if (!Number.isFinite(av) || !Number.isFinite(bv)) {
                if (Number.isFinite(av)) return -1;
                if (Number.isFinite(bv)) return 1;
                return a.i - b.i;
              }
              return av === bv ? a.i - b.i : sign * (av - bv);
            })
            .map((x) => x.f);
        }
      }
      if (mem.order) {
        const wanted = mem.order;
        const byId = new Map(loaded.map((f) => [f.id, f]));
        const chosen = wanted.map((id) => byId.get(id)).filter((f): f is CompareFlight => !!f);
        // Anything not in the remembered order (a flight added since) keeps its loaded place
        // at the end rather than disappearing.
        return [...chosen, ...loaded.filter((f) => !wanted.includes(f.id))];
      }
      return loaded;
    },
    [loaded, sys],
  );
  // The flyer's own colours, applied ONCE here so every consumer below reads the same value:
  // the chart series, the legend swatch, the event markers, the overlay SVG and the PNG all
  // take `f.color`, and a colour applied per-consumer is a colour that eventually disagrees.
  const [seriesColors, setSeriesColors] = useState<Record<string, string>>({});
  useEffect(() => setSeriesColors(loadSeriesColors()), []);
  const flights = useMemo(
    () => withSeriesColors(arrangeBy(memory), seriesColors),
    [arrangeBy, memory, seriesColors],
  );
  const setFlightColor = (id: string, color: string) =>
    setSeriesColors((prev) => {
      const next = { ...prev, [id]: color };
      saveSeriesColors(next);
      return next;
    });
  /** Back to the palette's own colour for this flight — a way out of a choice, which
   *  `MAINTAINING.md` names as a tell when it is missing. */
  const clearFlightColor = (id: string) =>
    setSeriesColors((prev) => {
      const next = { ...prev };
      delete next[id];
      saveSeriesColors(next);
      return next;
    });
  // The header labels, computed against the set on screen — so they change when the set
  // does, and stay stable while it is only reordered.
  const columnLabels = useMemo(() => distinguishingLabels(flights.map((f) => f.name)), [flights]);

  // Third click on the same metric drops the sort — back to the flyer's own order if they made
  // one, else the order the flights loaded in. It does NOT touch that order.
  const cycleSort = (label: string) => {
    remember((prev) => ({
      sort:
        prev.sort?.label !== label
          ? { label, dir: 'desc' }
          : prev.sort.dir === 'desc'
            ? { label, dir: 'asc' }
            : null,
    }));
  };
  /** Swap a flight one place left or right, and take over from any metric sort. */
  const move = (id: string, delta: -1 | 1) => {
    // Derived from the LATEST memory, not from the rendered `flights`: two moves in one tick must
    // compose, and the render behind a double-click is one move stale.
    remember((prev) => {
      const next = arrangeBy(prev).map((f) => f.id);
      const i = next.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= next.length) return null;
      [next[i], next[j]] = [next[j], next[i]];
      return { sort: null, order: next };
    });
  };
  const chartRef = useRef<HTMLDivElement>(null);

  // Restored rather than blanked. The caption is the only thing on this screen the flyer TYPED
  // and the column order is the only thing they ARRANGED; both ride into the exported Markdown,
  // HTML, JSON, CSV and figures, and a comparison has an address built to be reloadable — so
  // coming back to it without them is the same loss the flight report's caption already had
  // fixed. The order was worse off than the caption: a DROP unmounts this view, so it did not
  // even take a reload to lose it.
  useEffect(() => {
    // Nothing stored for this set? If it GREW out of the one just on screen, the arrangement
    // comes with it — adding today's sixth log to the five lined up is the same write-up with one
    // more flight in it, and a drop appends now, so that is the ordinary way one gets built.
    const stored = loadMemory(loadedIds);
    const carried = stored ?? memoryCarriedForward(loadedIds);
    const next = carried ?? EMPTY;
    memoryRef.current = next;
    setMemory(next);
    rememberShown(loadedIds, next);
    if (!stored && carried) rememberCompare(loadedIds, carried);
  }, [captionOf, loadedIds]);
  // Which readings the flyer wants — the same stored choice the flight report uses, so
  // "what I care about" is answered once rather than per surface.
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  // And which FIGURES, from the same store, for the same reason. The readings have been
  // shared between the two surfaces since they were built; the figures were not, so a flyer
  // who turned Acceleration off on the report still got an acceleration plot in the
  // comparison bundle. Read after mount, never during render — this is a static export and a
  // render-time localStorage read trips hydration.
  const [hiddenFigures, setHiddenFigures] = useState<string[]>([]);
  const [figureOrder, setFigureOrder] = useState<string[]>([]);
  useEffect(() => {
    setHidden(loadHidden());
    setOrder(loadOrder());
    setHiddenFigures(loadHiddenFigures());
    setFigureOrder(loadFigureOrder());
  }, []);
  const toggleFigure = useCallback((title: string) => {
    setHiddenFigures((prev) => {
      const next = toggleHidden(prev, title);
      saveHiddenFigures(next);
      return next;
    });
  }, []);
  const toggleReading = useCallback((label: string) => {
    setHidden((prev) => {
      const next = toggleHidden(prev, label);
      saveHidden(next);
      return next;
    });
  }, []);

  const reportMeta = useMemo<ReportMeta>(
    () => ({ label: reportLabel, notes: reportNotes, hidden, order }),
    [reportLabel, reportNotes, hidden, order],
  );

  // The side-by-side rows (with best-of emphasis and the mixed-source "(baro)"
  // tagging) come from one shared builder, so the on-screen table, the metrics CSV
  // and the Markdown bundle can't drift.
  const allRows = useMemo(() => compareMetricRows(flights, sys, undefined, order), [flights, sys, order]);
  const metricRows = useMemo(
    () => compareMetricRows(flights, sys, hidden, order),
    [flights, sys, hidden, order],
  );
  /** The rows the TABLE renders — the readings, plus the provenance row when one of these
   *  flights is made up.
   *
   *  **The screen used to render `metricRows` while only the CSV and the clipboard went
   *  through the table builder, so the provenance row reached both exports and never the
   *  table a flyer looks at.** A made-up flight sat in a column beside real ones with
   *  nothing on screen saying which was which, on the surface whose entire job is putting
   *  flights next to each other — while the CSV saved from that same screen said
   *  "made up by Debrief, not flown". One builder decides the rows now. */
  const tableRows = useMemo(
    () => compareTableRows(flights, sys, hidden, order),
    [flights, sys, hidden, order],
  );
  const moveReadingBy = useCallback(
    (label: string, delta: -1 | 1) => {
      setOrder((prev) => {
        const next = moveReading(prev, compareMetricRows(flights, sys).map((r) => r.label), label, delta);
        saveOrder(next);
        return next;
      });
    },
    [flights, sys],
  );
  const baroMix = compareHasBaroMix(flights);
  const clippedAccel = compareHasClippedAccel(flights);
  const partialDescent = compareHasPartialDescent(flights);
  const unprovenApogee = compareHasUnprovenApogee(flights);

  // Which events are called out, from the same stored answer the single-flight explorer uses —
  // a flyer who turned landing off there does not find it back here.
  const [hiddenEvents, setHiddenEvents] = useState<string[]>([]);
  useEffect(() => setHiddenEvents(loadHiddenEvents()), []);
  const toggleEvent = (type: EventType) => {
    setHiddenEvents((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type];
      saveHiddenEvents(next);
      return next;
    });
  };
  const eventTypes = useMemo(() => eventTypesPresent(flights.flatMap((f) => f.events.map((e) => e.type))), [flights]);

  // Memoized so an Analyzer re-render (e.g. a background recents refresh) doesn't
  // change these prop identities and rebuild the chart, resetting any zoom.
  //
  // Liftoff is one shared marker at x=0, because that is where every flight was aligned. Every
  // OTHER event is drawn per flight, in that flight's own colour, which is the whole point: two
  // bays that agree on apogee can still fire main a second and a half apart, and the table can
  // only tell you the number where the overlay shows you the gap. The chart already staggers
  // labels that would crowd, so a set that agrees reads as one thick line rather than a mess.
  const markers = useMemo<ChartMarker[]>(() => {
    const out: ChartMarker[] = [{ x: 0, label: 'liftoff', color: dark ? '#a1a1aa' : '#52525b' }];
    for (const f of flights) {
      for (const e of f.events) {
        if (hiddenEvents.includes(e.type)) continue;
        out.push({ x: e.t, label: e.label.toLowerCase(), color: f.color });
      }
    }
    // Left to right, so the label stagger sees them in the order it draws them.
    return out.sort((a, b) => a.x - b.x);
  }, [flights, hiddenEvents, dark]);

  // Pick which quantity to overlay across flights. All three are derived for
  // every analyzed flight, so they overlay cleanly regardless of logger.
  const allMetrics: {
    key: MetricKey;
    label: string;
    unit: string;
    get: (f: CompareFlight) => Float64Array;
    toDisplay: (v: number) => number;
  }[] = [
    { key: 'altitude', label: 'Altitude', unit: unitsOf(sys).length, get: (f) => f.altitude, toDisplay: (v) => lengthIn(v, sys) },
    { key: 'velocity', label: 'Velocity', unit: unitsOf(sys).speed, get: (f) => f.velocity, toDisplay: (v) => speedIn(v, sys) },
    { key: 'acceleration', label: 'Acceleration', unit: unitsOf(sys).accel, get: (f) => f.acceleration, toDisplay: (v) => accelIn(v, sys) },
    { key: 'mach', label: 'Mach', unit: '', get: (f) => f.mach, toDisplay: (v) => v },
    { key: 'dynamicPressure', label: 'Dynamic pressure', unit: pressureUnit(sys), get: (f) => f.dynamicPressure, toDisplay: (v) => pressureIn(v, sys) },
  ];
  // A metric is offered only when at least one flight actually carries it, so a chart that
  // could only ever be empty is not on the menu at all.
  //
  // This used to name `acceleration` alone — a baro-derived acceleration is left out at build
  // time, so an all-barometric comparison had to drop that option rather than offer an empty
  // chart. The same is true of Mach and dynamic pressure and was not handled: `buildComparison`
  // fills both with NaN for any recording whose peak speed the analysis withheld
  // (`lib/compare.ts`, `velUsable`), so a comparison of flights that all withheld it still
  // offered both, and selecting either drew a blank. That is the "control that is always
  // enabled and fails only when pressed" tell. Testing what the data holds covers every metric,
  // including any added later.
  const metrics = allMetrics.filter((m) => flights.some((f) => m.get(f).some((v) => Number.isFinite(v))));
  // The figures the DOCUMENTS carry: every overlay this comparison can actually draw, minus
  // the ones the flyer turned off. Both exports read this one list, so the .html and the
  // bundle can never disagree about which plots the flyer asked for — and it is no longer the
  // literal ['altitude','velocity','acceleration'] that both used to spell out, which ignored
  // the choice and silently withheld the Mach and dynamic-pressure overlays from every
  // document even though the surface draws them.
  // In the flyer's order, then minus what they turned off. Ordered FIRST so the chooser's
  // ▲/▼ act on the same sequence the document will carry — ordering the survivors instead
  // would silently renumber the list every time a figure is hidden.
  const orderedFigures = orderRows(metrics, (m) => m.label, figureOrder);
  const documentFigures = orderedFigures.filter((m) => !hiddenFigures.includes(m.label));
  const figureTitles = orderedFigures.map((m) => m.label);
  const moveFigure = (title: string, delta: -1 | 1) =>
    setFigureOrder((prev) => {
      const next = moveReading(prev, figureTitles, title, delta);
      saveFigureOrder(next);
      return next;
    });
  const active = metrics.find((m) => m.key === metric) ?? metrics[0];
  const metricSeries = useMemo(
    () => flights.map((f) => ({ label: stem(f.name), values: f[metric], stroke: f.color, width: 2 })),
    [flights, metric],
  );
  const metricFmt = useCallback(
    (v: number) => {
      switch (metric) {
        case 'altitude':
          return round0(lengthIn(v, sys));
        case 'velocity':
          return round0(speedIn(v, sys));
        case 'acceleration':
          return round1(accelIn(v, sys));
        case 'mach':
          return round2(v);
        case 'dynamicPressure':
          return round1(pressureIn(v, sys));
        default:
          return String(v);
      }
    },
    [metric, sys],
  );
  const chartLabel = `${active.label} against time after liftoff for ${flights.length} flights.`;

  // Export the comparison — all on-device, like the rest. The overlay CSV is every
  // channel for every flight on the shared (liftoff-aligned) grid; the metrics CSV is
  // the side-by-side table; the PNG is the chart.
  // Every overlaid channel for every flight, grouped by channel so a reader can line one
  // quantity up across the recordings — the whole reconciliation in one file, not just the
  // curve currently on screen. All on the shared, liftoff-aligned grid.
  // A comparison figure can hold a demonstration beside a recording, so one sentence claiming the
  // whole image is made up would be false about the curve next to it. The band says so and the
  // LEGEND says which — `syntheticHeader` on each made-up flight's series label, the same helper
  // the overlay CSV tags its columns with, so the two documents in one bundle answer one question
  // one way. The first cut named a COUNT instead, which the CSV's own constant rejects by name.
  const bandNote = syntheticBandLine(flights.filter((f) => f.synthetic).length, flights.length);
  const overlayCsv = (): string => {
    const x = { label: 'time after liftoff', unit: 's', values: time };
    const ys = metrics.flatMap((m) =>
      flights.map((f) => ({
        label: `${stem(f.name)} — ${m.label}`,
        unit: m.unit,
        values: Float64Array.from(m.get(f), (v) => m.toDisplay(v)),
        // Per column, because a comparison is exactly where a made-up flight sits beside a
        // recording: the table above says which is which per COLUMN, and this file's columns are
        // the same flights. The shared time base is left unmarked — it belongs to no one flight.
        synthetic: f.synthetic,
      })),
    );
    return exploreCsv(x, ys);
  };
  const saveOverlayCsv = () => {
    download(new Blob([overlayCsv()], { type: 'text/csv' }), 'compare-data.csv');
  };
  // Every comparison gets the spread column: (max − min) as a percent of the mean, over
  // the flights that recorded each figure. For two recordings of one flight that's their
  // agreement; for three it's the full range, which is the number that matters when a
  // flyer flies triple redundancy — two agreeing says nothing if the third is 8% out.
  const spread = flights.length >= 2;
  /** The table as header + rows — one shape, so the CSV, the clipboard and anything after
   *  them can't disagree about what the table says.
   *
   *  The provenance row used to be assembled here, which is why the `.md`, `.html` and `.json`
   *  exports never got one: they build their tables from `lib/report.ts` and this row lived in
   *  the component. It comes from `compareTableRows()` now — one builder decides which rows the
   *  comparison has, and every surface that renders the table gets the same answer. */
  const metricsTable = (): { header: string[]; rows: string[][] } => ({
    header: ['Metric', ...flights.map((f) => stem(f.name)), ...(spread ? ['Spread (%)'] : [])],
    rows: tableRows.map((r) => [
      r.label,
      ...r.cells,
      ...(spread ? [r.spreadPct != null ? r.spreadPct.toFixed(r.spreadPct < 1 ? 1 : 0) : ''] : []),
    ]),
  });
  const metricsCsv = (): string => {
    const { header, rows } = metricsTable();
    return toCsv([header, ...rows]);
  };
  const copyMetrics = async () => {
    const { header, rows } = metricsTable();
    const ok = await copyTable(header, rows);
    setCopyMsg(
      ok
        ? 'Table copied — paste it into a spreadsheet, an email or a cert document.'
        : 'This browser wouldn’t let the page write to the clipboard. Save metrics gives you the same table as a file.',
    );
  };
  const saveMetricsCsv = () => {
    download(new Blob([metricsCsv()], { type: 'text/csv' }), 'compare-metrics.csv');
  };
  const savePng = () => {
    savePlotPng(chartRef.current, { dark, filename: `compare-${metric}.png`, syntheticNote: bandNote });
  };
  // Vector version of an overlay — every flight's curve for one channel on the
  // liftoff-aligned grid, crisp at any size for a report (and recolourable there).
  type MetricDef = (typeof metrics)[number];
  const overlaySvg = (m: MetricDef): string =>
    plotSvg({
      x: time,
      series: flights.map((f) => ({
        label: syntheticHeader(stem(f.name), f.synthetic),
        color: f.color,
        axis: 'left' as const,
        values: Array.from(m.get(f), (v) => m.toDisplay(v)),
      })),
      xLabel: 'Time after liftoff (s)',
      leftLabel: m.unit ? `${m.label} (${m.unit})` : m.label,
      markers: markers.map((mk) => ({ x: mk.x, label: mk.label, color: mk.color })),
      dark: figureDark,
      syntheticNote: bandNote,
    });
  const saveChartSvg = () => {
    download(new Blob([overlaySvg(active)], { type: 'image/svg+xml' }), `compare-${metric}.svg`);
  };

  // The comparison AS ARRANGED, for anything that writes a document. `comparison` holds the
  // flights in the order they loaded; `flights` is the order the flyer put them in, which the
  // table, the metrics CSV, the clipboard copy and the figures have always used. The Markdown,
  // HTML and JSON took the raw object, so a flyer who dragged the columns into the order their
  // write-up needs got a DIFFERENT order in the saved document than on the screen they arranged —
  // and the figures beside it in the same bundle disagreed with the table above it.
  const arranged = useMemo(() => ({ ...comparison, flights }), [comparison, flights]);

  // One self-contained HTML comparison report — the cross-check, the metrics matrix and the
  // overlay charts inline — to document a redundant-altimeter or stage check as a single
  // portable file. The overlay figures are those actually offered (acceleration only when a
  // flight measured it).
  const saveHtml = () => {
    const figs = documentFigures.map((m) => ({ title: m.label, svg: overlaySvg(m) }));
    download(new Blob([compareHtml(arranged, sys, note, reportMeta, figs)], { type: 'text/html' }), 'compare-debrief.html');
  };

  // The comparison as one report-grade ZIP: the Markdown write-up (cross-check +
  // metrics table), the metrics CSV, and the altitude/velocity/acceleration overlay
  // figures — a redundant-altimeter or stage assembly check as a single download.
  // Zipped in the browser; nothing uploaded.
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const saveBundle = async () => {
    setBundleMsg('Building bundle…');
    try {
      const entries: ZipEntry[] = [
        { name: 'compare-summary.md', data: compareMarkdown(arranged, sys, note, reportMeta) },
        { name: 'compare-metrics.csv', data: metricsCsv() },
        { name: 'compare-data.csv', data: overlayCsv() },
        { name: 'compare.json', data: compareJson(arranged, sys, note, reportMeta) },
        ...documentFigures.map((m) => ({ name: `compare-${m.key}.svg`, data: overlaySvg(m) })),
      ];
      download(await zip(entries), 'compare-debrief.zip');
      setBundleMsg('Bundle saved — cross-check, metrics and figures, all zipped locally.');
      setTimeout(() => setBundleMsg(null), 4000);
    } catch {
      setBundleMsg('Couldn’t build the bundle in this browser — the individual Save buttons still work.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" onClick={onBack} className="text-sm">
          {backLabel}
        </Button>
        <span className="flex flex-wrap items-center gap-3">
          {/* The way on to the composite, offered from the surface that already has the set.
              
              Here rather than on either page because BOTH render this view, and a comparison built
              from a drop never goes through the logbook path — so a flyer who dropped a booster and
              a sustainer had no route to `/stitch` at all except starting again from the header. A
              capability reachable only by knowing where to start over is a named tell, and a
              closing cold walk of this run's own new surface is what found it.
              
              Two flights, not more: a composite is the stages of ONE launch, and offering it over
              six unrelated flights from a launch day would be inviting the wrong statement.
              
              And only where the flights are ADDRESSABLE. A comparison assembled from a drop mints
              synthetic ids (`Analyzer.tsx`: `${name}-${i}`) rather than logbook ones, so a link
              built from them would 404 into the composite's own "no longer in this logbook"
              refusal — offering a way on that cannot be taken is worse than not offering one.
              `permalink` already carries exactly that guarantee, so this rides on it. */}
          {flights.length === 2 && stitchIds && (
            <a
              href={`/stitch/?ids=${stitchIds}`}
              title="Stages of one launch read as one timeline — every mark in order on the clock they share, each naming the recording it came from. Nothing is merged into a single reading."
              className="inline-flex items-center pointer-coarse:min-h-11 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Read them as one timeline →
            </a>
          )}
          {permalink && (
            <a
              href={permalink}
              title="Open this comparison at its own address — reloadable, bookmarkable, and it can sit in a second tab beside one flight's report. The flights are already in this browser's logbook; the link names them by id and carries no flight data."
              className="inline-flex items-center pointer-coarse:min-h-11 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Give this comparison an address →
            </a>
          )}
        </span>
      </div>

      <div>
        <Heading className="text-xl font-semibold tracking-tight">
          Comparing {flights.length} flight{flights.length === 1 ? '' : 's'}
        </Heading>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Aligned at liftoff (t = 0, or the start of the log when no liftoff was detected) and
          resampled onto a shared time base. Read locally — never uploaded. Each flight&apos;s colour
          is the swatch beside its name — tap it to change it, or double-tap for the default.
        </p>
        {note && (
          <Notice as="p" role="status" className="mt-2">
            {note}
          </Notice>
        )}
        {/* Files from the same drop that Debrief doesn't auto-detect. A batch can't run the
            column mapper — it needs an answer per file — but that is a reason to ASK, not a
            reason to leave them out: without this the flyer starts the launch day over, one
            file at a time, and loses the comparison they already have. Mapping one brings it
            straight back here with the others. */}
        {onMapFile && mappable && mappable.length > 0 && (
          <Notice tone="accent" className="mt-2">
            <p>
              {mappable.length === 1 ? 'One more file from that drop isn’t' : `${mappable.length} more files from that drop aren’t`}{' '}
              a format Debrief recognizes — map the columns and{' '}
              {mappable.length === 1 ? 'it joins' : 'each one joins'} this comparison.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mappable.map((name) => (
                // Was an indigo-outlined variant of `ACTION_BTN` — a fifth button weight, where
                // `DESIGN.md` §5 allows three plus danger, and the last control in the app at the
                // off-scale `px-2.5`. Not `primary`: the logbook's own Compare button is this
                // surface's primary, and two primaries on one screen means neither is.
                <Button key={name} size="sm" onClick={() => onMapFile(name)}>
                  Map <span className="font-mono">{stem(name)}</span> →
                </Button>
              ))}
            </div>
          </Notice>
        )}
        {/* The flyer's own caption for this comparison, once set. */}
        {(reportLabel.trim() || reportNotes.trim()) && (
          <div className="mt-3 space-y-1">
            {reportLabel.trim() && (
              <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {reportLabel.trim()}
              </h3>
            )}
            {reportNotes.trim() && (
              <p className="max-w-2xl whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
                {reportNotes.trim()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Optional caption for a redundant-altimeter or staged-flight write-up; rides into
          the exported bundle's Markdown and JSON. Tucked away so it never clutters the read. */}
      <Disclosure summary={<>Label this comparison{reportLabel.trim() || reportNotes.trim() ? ' ✓' : ' (optional)'}</>}>
          <div>
            <label htmlFor="compare-label" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Label
            </label>
            <input
              id="compare-label"
              type="text"
              value={reportLabel}
              onChange={(e) => remember({ label: e.target.value })}
              placeholder="e.g. Nimbus IV — booster vs sustainer"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="compare-notes" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Notes
            </label>
            <textarea
              id="compare-notes"
              value={reportNotes}
              onChange={(e) => remember({ notes: e.target.value })}
              rows={3}
              placeholder="What these recordings are, conditions — anything you'd add to a write-up."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Rides into the exported bundle&apos;s Markdown, HTML and JSON. Kept on this device for
            these flights — along with the order you put the columns in — so a reload, or adding
            the next log of the day, comes back to the write-up you were making. Clearing the
            logbook takes it with the flights.
          </p>
        
      </Disclosure>

      {/* Cross-check: how closely the readings agree, as independent measurements. */}
      {(() => {
        const agree = crossCheck(flights);
        /**
         * **A cross-check withheld says WHY, rather than leaving a gap where a panel was.**
         * `crossCheck` excludes a flight Debrief made up — it is not an independent measurement,
         * so it can neither corroborate a recording nor contradict one — and on the set a
         * demonstration is most often opened in (one real flight beside it) that leaves a single
         * recording and no agreement to report. Falling silent there is the failure the
         * MEASUREMENT invariant names: a withheld number that explains nothing looks exactly like
         * a number the tool forgot to compute.
         *
         * Only when a made-up flight is the REASON. A comparison of real flights that share no
         * metric still renders nothing, because there the absence is ordinary.
         */
        if (agree.length === 0) {
          const madeUp = flights.filter((f) => f.synthetic).length;
          if (madeUp === 0) return null;
          const recorded = flights.length - madeUp;
          return (
            <Notice as="p" tone="warn" data-synthetic="cross-check">
              No cross-check:{' '}
              {madeUp === flights.length
                ? 'every flight here is one Debrief made up.'
                : `${recorded === 1 ? 'only one of these is a recording' : `only ${recorded} of these are recordings`}, and ${madeUp === 1 ? 'the other is a flight Debrief made up' : `the other ${madeUp} are flights Debrief made up`}.`}{' '}
              A demonstration is not an independent measurement, so it can neither agree with a
              recording nor disagree with one. Drop a second real log to compare them.
            </Notice>
          );
        }
        const recoveryNote = recoveryDisagreement(flights, agree);
        // The files can refute the premise this panel rests on: recordings dated days apart
        // are not one flight, so the same numbers mean something else and are introduced as
        // what they are — with the one thing that could make the dates lie named beside it,
        // and each day attributed to the file that states it so a wrong clock is findable.
        const otherDays = statedDaySplit(flights);
        return (
          <Card tone="sunken" className="text-sm">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              {otherDays ? 'Flight to flight' : 'Cross-check'}
            </p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {otherDays ? (
                <>
                  The files date these on different days — {statedDaysPhrase(otherDays, stem)}
                  {undatedNote(otherDays, flights)} — so
                  what follows is how far apart they are, not how closely two recordings of one
                  flight agree. They differ by{' '}
                </>
              ) : (
                <>If these are recordings of the same flight, the independent readings {crossCheckLede(agree)}{' '}</>
              )}
              {agree.map((a, i) => (
                <span key={a.key}>
                  {i > 0 && (i === agree.length - 1 ? ' and ' : ', ')}
                  <span className={a.spreadPct > CROSS_CHECK_WIDE ? 'font-medium text-amber-700 dark:text-amber-400' : 'font-medium text-emerald-700 dark:text-emerald-400'}>
                    {a.spreadPct.toFixed(a.spreadPct < 1 ? 1 : 0)}% on {a.label}
                    {a.mixedSource ? '*' : ''}
                    {a.saturated ? '†' : ''}
                    {a.partialLeg ? '‡' : ''}
                  </span>
                </span>
              ))}
              .{' '}
              {otherDays
                ? 'A season\u2019s spread is what changed between them \u2014 airframe, motor, conditions \u2014 not a disagreement to resolve.'
                : 'Close agreement builds confidence; a wide gap is a flag worth chasing \u2014 not a verdict, just the spread.'}
              {otherDays && (
                <>
                  {' '}
                  <span className="text-zinc-500 dark:text-zinc-400">{DIFFERENT_DAYS_CAVEAT}</span>
                </>
              )}
              {agree.some((a) => a.mixedSource) && (
                <>
                  {' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    *{derivedPeakCaveat().charAt(0).toLowerCase()}{derivedPeakCaveat().slice(1)}
                  </span>
                </>
              )}
              {agree.some((a) => a.saturated) && (
                <>
                  {' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    †one recording&apos;s accelerometer saturated at its full-scale limit, so its peak
                    is a floor, not the truth — the real spread may be smaller than shown.
                  </span>
                </>
              )}
              {agree.some((a) => a.partialLeg) && (
                <>
                  {' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    ‡at least one recording&apos;s descent leg stops before the ground, so it is averaged
                    over a shorter span than a leg that reached it — part of that spread is the spans, not
                    the flight. It reads high, by 13% and 21% on the two corpus groups that pair a
                    truncated leg with a landed one, because a leg cut short over-weights the fast
                    moments just after deployment.
                  </span>
                </>
              )}
              {/* A disagreement of KIND, which a spread cannot express: one recording resolved a
                  deployment and another read a single descent, so every descent key has one
                  contributor and all three are skipped. Without this the panel is silent about the
                  descent on exactly the pair that disagrees about whether a charge fired. */}
              {recoveryNote && (
                <>
                  {' '}
                  <span className="text-amber-700 dark:text-amber-400">{recoveryNote}</span>
                </>
              )}
            </p>
          </Card>
        );
      })()}

      {/* Side-by-side metrics — ONE table, laid out two ways.

          **`ON-6`: a vertical layout is not a narrowed one.** P4's *done when* is two floors —
          nothing under 44 px, nothing hover-only — and a floor is satisfiable by a desktop layout
          that has merely been made touch-safe, which is what this was: `overflow-x-auto`, so at
          390 px a flyer scrolled sideways to read a metric across its flights, and the Spread
          column was hidden outright because clipped at the edge it showed the leading digit of each
          percentage, which reads as a number rather than a fragment.

          **The first attempt rendered a second, stacked component beside the table, and that was
          wrong structurally rather than cosmetically.** Two trees carrying the same numbers means
          every existing `getByText(...).first()` in the suite starts resolving to whichever copy is
          hidden at that width — five e2e cases broke on exactly that, and the ones that did not
          would have been luck. Worse, it is two places one value is rendered, which is the
          disagreement this surface exists to prevent.

          So the table itself changes shape. Below `sm` its rows become blocks and its cells become
          labelled lines, each carrying the flight's name in a `sm:hidden` span — the only thing
          duplicated, and a LABEL rather than a reading. One DOM, one set of value cells, and every
          query in the suite keeps meaning what it meant. */}
      <div className="sm:overflow-x-auto">
        <table className="block min-w-full border-separate border-spacing-0 text-sm sm:table">
          {/* **NOT hidden below `sm`, and the first version of this change hid it — which
              deleted the column-reorder buttons and the colour swatches from the phone entirely,
              the exact capability-missing-on-one-form-factor failure this slice exists to fix.
              `e2e/touch.spec.ts` caught it.** As a block it stops being a header ROW and becomes
              what a vertical layout actually wants: the flights, with their controls, above the
              metrics that follow. */}
          <thead className="block sm:table-header-group">
            <tr className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pb-2 sm:table-row sm:gap-0 sm:pb-0">
              <th
                scope="col"
                className="block py-0 pr-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 sm:sticky sm:left-0 sm:table-cell sm:bg-white sm:py-2 sm:pr-4 dark:text-zinc-400 dark:sm:bg-zinc-950"
              >
                {/* The word labels a COLUMN, and below `sm` there is no column to label — but the
                    control beside it is a real affordance and stays at every width. */}
                <span className="hidden sm:inline">Metric</span>{' '}
                {(sort || manual) && (
                  <Button
                    variant="link"
                    onClick={() => remember(sort ? { sort: null } : { order: null })}
                    title={
                      sort && manual
                        ? 'Drop the ranking, back to the order you put them in'
                        : 'Back to the order the flights loaded in'
                    }
                    className="ml-2 normal-case tracking-normal"
                  >
                    {sort ? 'clear sort' : 'clear order'}
                  </Button>
                )}
              </th>
              {flights.map((f, i) => (
                <th key={f.id} scope="col" className="block text-right align-bottom sm:table-cell sm:px-3 sm:py-2">
                  {flights.length > 1 && (
                    <span className="mb-0.5 flex items-center justify-end gap-0.5 print:hidden">
                      {/* Buttons, not drag handles: a thumb on a phone and a keyboard both
                          reach these, and a drag target on a table header reaches neither.
                          They used to be `hidden sm:flex`, which meant the only way to put a
                          comparison in a deliberate order was a pointer — the feature simply
                          did not exist on the device a flyer has at the field. A thumb needs
                          the 44 px floor; a pointer doesn't, and 44 px of chrome above every
                          column would crowd a desktop table, so the size follows the screen. */}
                      <button
                        type="button"
                        onClick={() => move(f.id, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${stem(f.name)} left`}
                        title="Move left"
                        className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 transition enabled:hover:bg-zinc-100 enabled:hover:text-zinc-700 dark:text-zinc-400 disabled:opacity-30 sm:h-6 sm:w-6 dark:enabled:hover:bg-zinc-800 dark:enabled:hover:text-zinc-200"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(f.id, 1)}
                        disabled={i === flights.length - 1}
                        aria-label={`Move ${stem(f.name)} right`}
                        title="Move right"
                        className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 transition enabled:hover:bg-zinc-100 enabled:hover:text-zinc-700 dark:text-zinc-400 disabled:opacity-30 sm:h-6 sm:w-6 dark:enabled:hover:bg-zinc-800 dark:enabled:hover:text-zinc-200"
                      >
                        ▶
                      </button>
                    </span>
                  )}
                  <span className="flex items-center justify-end gap-1.5">
                    {/* The swatch IS the control. D5 asks for the series colours to be the
                        flyer's, and a certification package or a club thread often needs one
                        specific flight in one specific colour. Double-click returns it to the
                        palette's own choice — a way back out of the change. */}
                    {/* The hit area is on the LABEL — see `FigureChooser` for the measurement. A
                        colour input is a replaced element, so it can carry no `::after` and the
                        `.touch-area` helper cannot reach it; wrapping forwards the tap while the
                        ink stays a 10 px dot in a dense legend. */}
                    <label className={`${TOUCH_TARGET_SQUARE} inline-flex shrink-0 cursor-pointer items-center justify-center`}>
                      <input
                        type="color"
                        value={f.color}
                        onChange={(e) => setFlightColor(f.id, e.target.value)}
                        onDoubleClick={() => clearFlightColor(f.id)}
                        aria-label={`Colour for ${stem(f.name)} — double-click to reset`}
                        title={`Colour for ${stem(f.name)} — double-click to reset`}
                        className="h-2.5 w-2.5 shrink-0 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                        style={{ backgroundColor: f.color }}
                      />
                    </label>
                    <span
                      title={stem(f.name)}
                      // Wrapped to two lines rather than truncated: at the phone clamp of 80 px a
                      // single line paints about eleven characters, which is not enough to tell
                      // three recordings of one flight apart even after the shared head is elided.
                      // Two lines reach the tail, where the recording's own id lives.
                      className="line-clamp-2 max-w-[5rem] break-all font-mono text-xs font-medium text-zinc-700 sm:max-w-[10rem] dark:text-zinc-300"
                    >
                      {columnLabels[i]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                    {f.formatLabel}
                  </span>
                  {/* The launch day, where the file stated it — on a launch day's comparison
                      that's the column's real identity, not its file name. */}
                  {f.flownAt && (
                    <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      {formatFlownAt(f.flownAt)}
                    </span>
                  )}
                  {!f.liftoffDetected && (
                    <span
                      className="mt-0.5 block text-[11px] font-normal text-amber-700 dark:text-amber-400"
                      title="No liftoff was detected, so this flight is aligned at its first sample rather than a true t=0."
                    >
                      ≈ est. liftoff
                    </span>
                  )}
                </th>
              ))}
              {spread && (
                <th
                  scope="col"
                  className="hidden px-1.5 py-2 text-right align-bottom text-xs font-medium uppercase tracking-wide text-zinc-500 sm:table-cell sm:px-3 dark:text-zinc-400"
                  title="How far apart the readings are: (highest − lowest) as a percent of their mean, over the flights that recorded the figure — how closely several recordings of one flight agree, or how much the flights differ from each other."
                >
                  Spread
                </th>
              )}
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {tableRows.map((row) => (
              // A separator, NOT a card. The first version of this gave each metric block the
              // sunken card treatment by hand, and DESIGN.md §9's card ratchet refused it as a
              // FOURTH hand-rolled card — correctly, and it could not have been the `Card`
              // primitive either, because a <tr> cannot be a <div>. A vertical layout needs the
              // metrics told apart, which the row's own top border already does at every width;
              // it does not need each of them to be a container.
              //
              // Do not quote the offending class string here, even to explain it: that ratchet
              // greps the source, so a comment naming the treatment IS the treatment as far as it
              // can tell. This comment cost a red gate learning that.
              <tr
                key={row.label}
                className="block border-t border-zinc-100 py-2 sm:table-row sm:py-0 dark:border-zinc-900"
              >
                <th
                  scope="row"
                  /* The provenance row is not a reading, so it is not sortable and carries no
                     sort state: `aria-sort` on a row that cannot be ordered announces an
                     affordance that isn't there. */
                  aria-sort={
                    row.provenance
                      ? undefined
                      : sort?.label === row.label
                        ? sort.dir === 'desc'
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                  }
                  className="block pb-1 text-left font-medium text-zinc-600 sm:sticky sm:left-0 sm:table-cell sm:bg-white sm:py-2 sm:pr-4 sm:pb-2 dark:text-zinc-400 dark:sm:bg-zinc-950"
                >
                  {row.provenance ? (
                    row.label
                  ) : (
                  <button
                    type="button"
                    onClick={() => cycleSort(row.label)}
                    title={`Order the flights by ${row.label.toLowerCase()}`}
                    className={`group inline-flex items-center gap-1 text-left transition hover:text-indigo-600 dark:hover:text-indigo-400 ${
                      sort?.label === row.label ? 'text-indigo-600 dark:text-indigo-400' : ''
                    }`}
                  >
                    {row.label}
                    {/* The sort cue was `opacity-0 group-hover:opacity-40`, and `(hover: hover)` is
                        false on a phone — so measured at 390 px every column that was not already
                        the active sort rendered its arrow at computed opacity 0, and **nothing on
                        this surface said the table sorted at all**. `DESIGN.md` §8: "No hover-only
                        state." A pointer keeps the quiet reveal; a coarse pointer, which has no
                        hover to reveal it with, gets it standing. */}
                    <span
                      aria-hidden="true"
                      className={
                        sort?.label === row.label ? '' : 'opacity-0 group-hover:opacity-40 pointer-coarse:opacity-40'
                      }
                    >
                      {sort?.label === row.label && sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                  )}
                </th>
                {flights.map((f, i) => (
                  <td
                    key={f.id}
                    /* A glyph and weight mark the best of the row, never hue. §2 gives indigo
                       exactly one meaning — "interactive, selected" — and nothing here is either:
                       the flyer did not pick this cell and pressing it does nothing. §2 also
                       forbids colouring a number by whether it is large, outright, which is
                       precisely what ranking a row does.
                       **Dropping the colour without adding a glyph would have been the worse
                       bug**, and review caught it: weight alone left zinc-900 against zinc-800, a
                       1.19:1 step in light and 1.15:1 in dark, so the mark a sighted low-vision
                       flyer relies on all but disappeared while the screen-reader text stayed
                       perfect. The ★ is the logbook's own mark for the same idea, so the two
                       surfaces that rank flights now say it the same way instead of one using a
                       glyph and the other a colour.
                       Every cell is §2's PRIMARY text, because every one of them is a number being
                       read; the previous `zinc-800/zinc-200` was not a §2 text token at all. */
                    /* The provenance row carries a sentence per flight, not a figure, so it
                       drops the monospace tabular treatment and the right alignment that make a
                       column of numbers scan — applied to prose those turn the claim into a
                       ragged column pretending to be data. It takes §2's `warn` text instead,
                       the same meaning the logbook row's `Chip tone="warn"` gives the same
                       claim, so the two surfaces say it in one vocabulary. */
                    className={
                      row.provenance
                        ? `flex items-baseline justify-between gap-3 py-0.5 sm:table-cell sm:px-3 sm:py-2 ${
                            // Amber is §2's `warn`, and only the made-up column is a caveat. A
                            // cell reading "recorded" in caveat amber would say the opposite of
                            // what it means, on the row that exists to tell the two apart.
                            f.synthetic
                              ? 'font-medium text-amber-700 dark:text-amber-400'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`
                        : `flex items-baseline justify-between gap-3 py-0.5 font-mono tabular-nums text-zinc-900 sm:table-cell sm:px-3 sm:py-2 sm:text-right dark:text-zinc-100 ${
                            i === row.best ? 'font-semibold' : ''
                          }`
                    }
                  >
                    {/* The only thing this layout duplicates, and it is a LABEL rather than a
                        reading: as blocks there is no column header above the value to say which
                        flight it belongs to. `aria-hidden` because the table's own `scope="col"`
                        header already names it to a screen reader at every width. */}
                    <span
                      aria-hidden="true"
                      className="min-w-0 truncate font-sans font-normal text-zinc-500 sm:hidden dark:text-zinc-400"
                    >
                      {columnLabels[i]}
                    </span>
                    <span className="shrink-0">
                      {i === row.best && (
                        <span className="mr-0.5" title="Highest of the flights being compared">
                          ★
                        </span>
                      )}
                      {row.cells[i]}
                      {i === row.best && <span className="sr-only"> (highest)</span>}
                    </span>
                  </td>
                ))}
                {/* It USED to be `hidden … sm:table-cell`, with a comment claiming "nothing is
                    lost — the cross-check panel above states every one of these spreads in prose".
                    Measured 2026-08-09 over the real two-altimeter pair: the table carries 10
                    spreads and that panel restates 8, under different names. Max Mach and Flight
                    time were available at no width below `sm` at all. As a labelled line rather
                    than a cell at the edge it cannot be clipped into looking like a reading, so
                    there is nothing left to hide. */}
                {spread && (
                  <td className="mt-1 flex items-baseline justify-between gap-3 border-t border-zinc-200 pt-1 font-mono tabular-nums text-zinc-500 sm:mt-0 sm:table-cell sm:border-0 sm:px-3 sm:py-2 sm:text-right dark:border-zinc-800 dark:text-zinc-400">
                    <span aria-hidden="true" className="font-sans sm:hidden">
                      Spread
                    </span>
                    <span className="shrink-0">
                      {row.spreadPct != null ? `${row.spreadPct.toFixed(row.spreadPct < 1 ? 1 : 0)}%` : '—'}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The same chooser, and the same stored choice, as the flight report's — a flyer
          answers "what do I care about?" once, not once per surface. */}
      <ReadingChooser
        labels={allRows.map((r) => r.label)}
        hidden={hidden}
        onToggle={toggleReading}
        onMove={moveReadingBy}
        where="Applies to this table, its copy, and the .md, .html, metrics-CSV and bundle exports."
        noun="comparison"
      />

      {baroMix && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(baro)</span> — differentiated out of the altitude rather than
          logged by the device, so its peak reads high, not soft; compare those values with that in mind.
        </p>
      )}

      {clippedAccel && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(clipped)</span> — the accelerometer saturated at its full-scale
          limit, so its peak is a floor, not the true maximum; the highest-acceleration mark is withheld
          because the comparison can&apos;t settle which flight actually pulled the most g.
        </p>
      )}

      {unprovenApogee && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(unproven)</span> — Debrief does not trust that recording&apos;s
          altitude channel: its climb is too slow to be a flight, so the height it reports is in doubt
          and no “highest” is crowned.
        </p>
      )}

      {partialDescent && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(stops in the air)</span> — that recording&apos;s file ends while
          the rocket is still under canopy, so the rate is averaged over the descent that WAS recorded
          and is not a landing speed.
        </p>
      )}

      {/* Overlaid chart — pick which quantity to compare across the flights. */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Channel</span>
          <Segmented
            value={metric}
            onChange={chooseMetric}
            options={metrics.map((m) => ({ value: m.key, label: m.label }))}
            ariaLabel="Channel"
            size="sm"
          />
        </div>

        {/* Export the comparison — chart, the overlaid data, or the table. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={savePng} title="Save the comparison chart as a PNG">
            Save .png
          </Button>
          <FigureThemeButton dark={figureDark} onToggle={toggleFigureDark} />
          <Button
            size="sm"
            onClick={saveChartSvg}
            title="Save the comparison chart as a scalable SVG (vector — crisp at any size)"
          >
            Save .svg
          </Button>
          <Button
            size="sm"
            onClick={saveOverlayCsv}
            title="Save every overlaid channel — altitude, velocity, acceleration, Mach and dynamic pressure — for all flights, on the shared liftoff-aligned timeline, as one CSV"
          >
            Save chart data
          </Button>
          <Button
            size="sm"
            onClick={copyMetrics}
            title="Copy the side-by-side table to the clipboard — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
          >
            Copy table
          </Button>
          <Button
            size="sm"
            onClick={saveMetricsCsv}
            title="Save the side-by-side metrics table as CSV"
          >
            Save metrics
          </Button>
          <Button
            size="sm"
            onClick={saveHtml}
            title="Save a self-contained HTML comparison report — the cross-check, the side-by-side metrics and the overlay charts inline, in one file you can open, print, email or archive anywhere (nothing uploaded)"
          >
            Save .html
          </Button>
          <Button
            size="sm"
            onClick={saveBundle}
            title="Save one ZIP with the Markdown cross-check write-up, the metrics CSVs and the overlay figures you chose — the whole comparison, zipped in the browser"
          >
            Save bundle
          </Button>
        </div>
        {/* Which overlays travel into the .html and the bundle — the same stored choice, and now
            the same control, as the flight report's. */}
        <div className="mb-3">
          <FigureChooser
            titles={figureTitles}
            hidden={hiddenFigures}
            onToggle={toggleFigure}
            onMove={moveFigure}
            what="the .html comparison and the bundle"
          />
        </div>
        {copyMsg && (
          <p role="status" aria-live="polite" className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            {copyMsg}
          </p>
        )}
        {bundleMsg && (
          <p role="status" aria-live="polite" className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            {bundleMsg}
          </p>
        )}

        <Figure title={active.label} unit={active.unit || undefined}>
          <div ref={chartRef}>
            <Chart
              time={time}
              series={metricSeries}
              markers={markers}
              dark={dark}
              height={320}
              fmt={metricFmt}
              ariaLabel={chartLabel}
              syncKey={syncKey}
            />
          </div>
        </Figure>
      </div>

      {/* Which events are called out, in each flight's own colour. "Flight events" rather than
          "Events", because "Events" beside a table of several flights reads as a column heading. */}
      <EventChips types={eventTypes} hidden={hiddenEvents} onToggle={toggleEvent} label="Flight events" />

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Hover to read every flight at the same instant · drag across the chart to zoom (pinch on
        touch) · double-click or double-tap to reset
      </p>
    </div>
  );
}

