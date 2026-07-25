'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Comparison, CompareFlight } from '@/lib/compare';
import { crossCheck, statedDaySplit, statedDaysPhrase, DIFFERENT_DAYS_CAVEAT } from '@/lib/compare';
import { accelInG, lengthIn, pressureIn, pressureUnit, speedIn, systemOf, unitsOf, accelIn } from '@/lib/display';
import type { UnitChoice, Units } from '@/lib/display';
import { exploreCsv } from '@/lib/explore';
import { toCsv } from '@/lib/csv';
import { download } from '@/lib/download';
import { copyTable } from '@/lib/copyTable';
import { loadHidden, loadOrder, moveReading, saveHidden, saveOrder, toggleHidden } from '@/lib/reportProfile';
import { loadCompareChannel, saveCompareChannel } from '@/lib/plotView';
import ReadingChooser from './ReadingChooser';
import { zip, type ZipEntry } from '@/lib/zip';
import { compareMarkdown, compareHtml, compareJson, compareMetricRows, compareHasBaroMix, compareHasClippedAccel, type ReportMeta } from '@/lib/report';
import { plotSvg } from '@/lib/svgChart';
import UnitsControl from './UnitsControl';
import { formatFlownAt } from '@/lib/flight/flownAt';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { type ChartMarker } from './Chart';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

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

function seg(active: boolean): string {
  return `rounded-md border px-2.5 py-1 text-xs font-medium transition ${
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-300'
      : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
  }`;
}

/** Trim a file extension for a tidier chart/legend label. */
function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export default function CompareView({
  comparison,
  note,
  sys,
  onToggleUnits,
  onSetUnits,
  onBack,
  backLabel = '← Back to a single flight',
  permalink,
  mappable,
  onMapFile,
}: {
  comparison: Comparison;
  note?: string;
  sys: UnitChoice;
  onToggleUnits: () => void;
  onSetUnits: (units: Units) => void;
  onBack: () => void;
  /** Where back goes depends on where the comparison came from: a drop on the analyze
   *  page returns to that one flight; the compare surface returns to its picker. */
  backLabel?: string;
  /** An address this comparison can be reopened at, where it has one. A comparison built
   *  from a drop exists only until the page does — but the dropped files went into the
   *  logbook on the way in, so the same set can be named by id and offered as a link. */
  permalink?: string;
  /** Files dropped alongside these flights that need their columns mapped, by name. */
  mappable?: string[];
  /** Open the mapper on one of them; it rejoins this comparison when mapped. */
  onMapFile?: (name: string) => void;
}) {
  const dark = useIsDark();
  const [figureDark, toggleFigureDark] = useFigureDark();
  const { time, flights: loaded } = comparison;
  // Keyed off the set, not the order, so re-sorting the table doesn't rebuild the
  // chart and throw away the flyer's zoom.
  const syncKey = useMemo(() => `compare-${loaded.map((f) => f.id).join('-')}`, [loaded]);
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
  // export, because they all read the same array.
  const [sort, setSort] = useState<{ label: string; dir: 'desc' | 'asc' } | null>(null);
  // …or put them in a deliberate order by hand. Ranking by a metric answers "which went
  // highest"; a launch day also has orders that no metric produces — booster then sustainer,
  // flight 1 to 6, the cert flight last. Moving a column is the flyer taking over, so it
  // clears the metric sort, and clicking a metric hands it back.
  const [manual, setManual] = useState<string[] | null>(null);
  const flights = useMemo(() => {
    if (manual) {
      const byId = new Map(loaded.map((f) => [f.id, f]));
      const chosen = manual.map((id) => byId.get(id)).filter((f): f is (typeof loaded)[number] => !!f);
      // Anything not in the remembered order (a flight added since) keeps its loaded place
      // at the end rather than disappearing.
      return [...chosen, ...loaded.filter((f) => !manual.includes(f.id))];
    }
    if (!sort) return loaded;
    const row = compareMetricRows(loaded, sys).find((r) => r.label === sort.label);
    if (!row) return loaded;
    const sign = sort.dir === 'desc' ? -1 : 1;
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
  }, [loaded, manual, sort, sys]);
  // Third click on the same metric clears the sort, back to the order they loaded in.
  const cycleSort = (label: string) => {
    setManual(null);
    setSort((s) => (s?.label !== label ? { label, dir: 'desc' } : s.dir === 'desc' ? { label, dir: 'asc' } : null));
  };
  /** Swap a flight one place left or right, and take over from any metric sort. */
  const move = (id: string, delta: -1 | 1) => {
    const order = flights.map((f) => f.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setSort(null);
    setManual(order);
  };
  const chartRef = useRef<HTMLDivElement>(null);

  // An optional caption for the comparison — for a redundant-altimeter or staged-flight
  // write-up. It rides into the exported bundle's Markdown and JSON, and belongs to the
  // set in view, so a different comparison clears it.
  const [reportLabel, setReportLabel] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  useEffect(() => {
    setReportLabel('');
    setReportNotes('');
  }, [syncKey]);
  // Which readings the flyer wants — the same stored choice the flight report uses, so
  // "what I care about" is answered once rather than per surface.
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setHidden(loadHidden());
    setOrder(loadOrder());
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

  // Memoized so an Analyzer re-render (e.g. a background recents refresh) doesn't
  // change these prop identities and rebuild the chart, resetting any zoom.
  const liftoffMarker = useMemo<ChartMarker[]>(() => [{ x: 0, label: 'liftoff', color: dark ? '#a1a1aa' : '#52525b' }], [dark]);

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
  // Acceleration overlays only when at least one flight measured it; a baro-derived
  // acceleration is left out at build time, so an all-barometric comparison drops the
  // option entirely rather than offer an empty chart.
  const metrics = allMetrics.filter((m) => m.key !== 'acceleration' || flights.some((f) => f.acceleration.some((v) => Number.isFinite(v))));
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
  const overlayCsv = (): string => {
    const x = { label: 'time after liftoff', unit: 's', values: time };
    const ys = metrics.flatMap((m) =>
      flights.map((f) => ({
        label: `${stem(f.name)} — ${m.label}`,
        unit: m.unit,
        values: Float64Array.from(m.get(f), (v) => m.toDisplay(v)),
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
   *  them can't disagree about what the table says. */
  const metricsTable = (): { header: string[]; rows: string[][] } => ({
    header: ['Metric', ...flights.map((f) => stem(f.name)), ...(spread ? ['Spread (%)'] : [])],
    rows: metricRows.map((r) => [
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
    out.toBlob((blob) => blob && download(blob, `compare-${metric}.png`));
  };
  // Vector version of an overlay — every flight's curve for one channel on the
  // liftoff-aligned grid, crisp at any size for a report (and recolourable there).
  type MetricDef = (typeof metrics)[number];
  const overlaySvg = (m: MetricDef): string =>
    plotSvg({
      x: time,
      series: flights.map((f) => ({
        label: stem(f.name),
        color: f.color,
        axis: 'left' as const,
        values: Array.from(m.get(f), (v) => m.toDisplay(v)),
      })),
      xLabel: 'Time after liftoff (s)',
      leftLabel: m.unit ? `${m.label} (${m.unit})` : m.label,
      markers: liftoffMarker.map((mk) => ({ x: mk.x, label: mk.label, color: mk.color })),
      dark: figureDark,
    });
  const saveChartSvg = () => {
    download(new Blob([overlaySvg(active)], { type: 'image/svg+xml' }), `compare-${metric}.svg`);
  };

  // One self-contained HTML comparison report — the cross-check, the metrics matrix and the
  // overlay charts inline — to document a redundant-altimeter or stage check as a single
  // portable file. The overlay figures are those actually offered (acceleration only when a
  // flight measured it).
  const saveHtml = () => {
    const figs = (['altitude', 'velocity', 'acceleration'] as MetricKey[])
      .map((k) => metrics.find((m) => m.key === k))
      .filter((m): m is MetricDef => !!m)
      .map((m) => ({ title: m.label, svg: overlaySvg(m) }));
    download(new Blob([compareHtml(comparison, sys, note, reportMeta, figs)], { type: 'text/html' }), 'compare-debrief.html');
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
      // Only figures for metrics actually offered (acceleration drops out of an
      // all-barometric comparison), so the bundle never holds an empty acceleration plot.
      const figureKeys = (['altitude', 'velocity', 'acceleration'] as MetricKey[]).filter((k) => metrics.some((m) => m.key === k));
      const entries: ZipEntry[] = [
        { name: 'compare-summary.md', data: compareMarkdown(comparison, sys, note, reportMeta) },
        { name: 'compare-metrics.csv', data: metricsCsv() },
        { name: 'compare-data.csv', data: overlayCsv() },
        { name: 'compare.json', data: compareJson(comparison, sys, note, reportMeta) },
        ...figureKeys.map((k) => ({ name: `compare-${k}.svg`, data: overlaySvg(metrics.find((m) => m.key === k)!) })),
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
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          {backLabel}
        </button>
        {permalink && (
          <a
            href={permalink}
            title="Open this comparison at its own address — reloadable, bookmarkable, and it can sit in a second tab beside one flight's report. The flights are already in this browser's logbook; the link names them by id and carries no flight data."
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Give this comparison an address →
          </a>
        )}
        <UnitsControl sys={sys} onToggleUnits={onToggleUnits} onSetUnits={onSetUnits} />
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Comparing {flights.length} flight{flights.length === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Aligned at liftoff (t = 0, or the start of the log when no liftoff was detected) and
          resampled onto a shared time base. Read locally — never uploaded.
        </p>
        {note && (
          <p
            role="status"
            className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {note}
          </p>
        )}
        {/* Files from the same drop that Debrief doesn't auto-detect. A batch can't run the
            column mapper — it needs an answer per file — but that is a reason to ASK, not a
            reason to leave them out: without this the flyer starts the launch day over, one
            file at a time, and loses the comparison they already have. Mapping one brings it
            straight back here with the others. */}
        {onMapFile && mappable && mappable.length > 0 && (
          <div className="mt-2 rounded-md border border-indigo-300/70 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200">
            <p>
              {mappable.length === 1 ? 'One more file from that drop isn’t' : `${mappable.length} more files from that drop aren’t`}{' '}
              a format Debrief recognizes — map the columns and{' '}
              {mappable.length === 1 ? 'it joins' : 'each one joins'} this comparison.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mappable.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onMapFile(name)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-indigo-400 bg-white px-2.5 py-1 font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/60 dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                >
                  Map <span className="font-mono">{stem(name)}</span> →
                </button>
              ))}
            </div>
          </div>
        )}
        {/* The flyer's own caption for this comparison, once set. */}
        {(reportLabel.trim() || reportNotes.trim()) && (
          <div className="mt-3 space-y-1">
            {reportLabel.trim() && (
              <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
      <details className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/30">
        <summary className="cursor-pointer select-none text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Label this comparison{reportLabel.trim() || reportNotes.trim() ? ' ✓' : ' (optional)'}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="compare-label" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Label
            </label>
            <input
              id="compare-label"
              type="text"
              value={reportLabel}
              onChange={(e) => setReportLabel(e.target.value)}
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
              onChange={(e) => setReportNotes(e.target.value)}
              rows={3}
              placeholder="What these recordings are, conditions — anything you'd add to a write-up."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Rides into the exported bundle&apos;s Markdown and JSON. Kept on your device; a new
            comparison clears it.
          </p>
        </div>
      </details>

      {/* Cross-check: how closely the readings agree, as independent measurements. */}
      {(() => {
        const agree = crossCheck(flights);
        if (agree.length === 0) return null;
        // The files can refute the premise this panel rests on: recordings dated days apart
        // are not one flight, so the same numbers mean something else and are introduced as
        // what they are — with the one thing that could make the dates lie named beside it,
        // and each day attributed to the file that states it so a wrong clock is findable.
        const otherDays = statedDaySplit(flights);
        return (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              {otherDays ? 'Flight to flight' : 'Cross-check'}
            </p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {otherDays ? (
                <>
                  The files date these on different days — {statedDaysPhrase(otherDays, stem)} — so
                  what follows is how far apart they are, not how closely two recordings of one
                  flight agree. They differ by{' '}
                </>
              ) : (
                <>If these are recordings of the same flight, the independent readings agree to within{' '}</>
              )}
              {agree.map((a, i) => (
                <span key={a.key}>
                  {i > 0 && (i === agree.length - 1 ? ' and ' : ', ')}
                  <span className={a.spreadPct > 10 ? 'font-medium text-amber-700 dark:text-amber-400' : 'font-medium text-emerald-700 dark:text-emerald-400'}>
                    {a.spreadPct.toFixed(a.spreadPct < 1 ? 1 : 0)}% on {a.label}
                    {a.mixedSource ? '*' : ''}
                    {a.saturated ? '†' : ''}
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
                    *the recordings mix a measured value with one derived from altitude, which reads
                    softer at the peak — so read that agreement as the looser bound.
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
            </p>
          </div>
        );
      })()}

      {/* Side-by-side metrics */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 bg-white py-2 pr-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 sm:pr-4 dark:bg-zinc-950 dark:text-zinc-400"
              >
                Metric{' '}
                {(sort || manual) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSort(null);
                      setManual(null);
                    }}
                    title="Back to the order the flights loaded in"
                    className="ml-2 font-medium normal-case tracking-normal text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {sort ? 'clear sort' : 'clear order'}
                  </button>
                )}
              </th>
              {flights.map((f, i) => (
                <th key={f.id} scope="col" className="px-1.5 py-2 text-right align-bottom sm:px-3">
                  {flights.length > 1 && (
                    <span className="mb-0.5 hidden items-center justify-end gap-0.5 sm:flex print:hidden">
                      {/* Buttons, not drag handles: a thumb on a phone and a keyboard both
                          reach these, and a drag target on a table header reaches neither. */}
                      <button
                        type="button"
                        onClick={() => move(f.id, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${stem(f.name)} left`}
                        title="Move left"
                        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition enabled:hover:bg-zinc-100 enabled:hover:text-zinc-700 disabled:opacity-30 dark:enabled:hover:bg-zinc-800 dark:enabled:hover:text-zinc-200"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(f.id, 1)}
                        disabled={i === flights.length - 1}
                        aria-label={`Move ${stem(f.name)} right`}
                        title="Move right"
                        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition enabled:hover:bg-zinc-100 enabled:hover:text-zinc-700 disabled:opacity-30 dark:enabled:hover:bg-zinc-800 dark:enabled:hover:text-zinc-200"
                      >
                        ▶
                      </button>
                    </span>
                  )}
                  <span className="flex items-center justify-end gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: f.color }}
                      aria-hidden="true"
                    />
                    <span
                      title={stem(f.name)}
                      className="max-w-[5rem] truncate font-mono text-xs font-medium text-zinc-700 sm:max-w-[10rem] dark:text-zinc-300"
                    >
                      {stem(f.name)}
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
                      className="mt-0.5 block text-[11px] font-normal text-amber-600 dark:text-amber-400"
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
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100 dark:border-zinc-900">
                <th
                  scope="row"
                  aria-sort={sort?.label === row.label ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  className="sticky left-0 bg-white py-2 pr-2 text-left font-medium text-zinc-600 sm:pr-4 dark:bg-zinc-950 dark:text-zinc-400"
                >
                  <button
                    type="button"
                    onClick={() => cycleSort(row.label)}
                    title={`Order the flights by ${row.label.toLowerCase()}`}
                    className={`group inline-flex items-center gap-1 text-left transition hover:text-indigo-600 dark:hover:text-indigo-400 ${
                      sort?.label === row.label ? 'text-indigo-600 dark:text-indigo-400' : ''
                    }`}
                  >
                    {row.label}
                    <span aria-hidden="true" className={sort?.label === row.label ? '' : 'opacity-0 group-hover:opacity-40'}>
                      {sort?.label === row.label && sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                </th>
                {flights.map((f, i) => (
                  <td
                    key={f.id}
                    className={`px-1.5 py-2 text-right font-mono tabular-nums sm:px-3 ${
                      i === row.best
                        ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                        : 'text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {row.cells[i]}
                    {i === row.best && <span className="sr-only"> (highest)</span>}
                  </td>
                ))}
                {/* Hidden on a phone, where it is the column that doesn't fit: cut off at the
                    edge it showed the first digit of each percentage, which reads as a number
                    rather than as a fragment. Nothing is lost — the cross-check panel above
                    states every one of these spreads in prose. */}
                {spread && (
                  <td className="hidden px-1.5 py-2 text-right font-mono tabular-nums text-zinc-500 sm:table-cell sm:px-3 dark:text-zinc-400">
                    {row.spreadPct != null ? `${row.spreadPct.toFixed(row.spreadPct < 1 ? 1 : 0)}%` : '—'}
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
          <span className="font-mono">(baro)</span> — derived from altitude rather than logged by the
          device, so it reads softer at peak speed; compare those values with that in mind.
        </p>
      )}

      {clippedAccel && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(clipped)</span> — the accelerometer saturated at its full-scale
          limit, so its peak is a floor, not the true maximum; the highest-acceleration mark is withheld
          because the comparison can&apos;t settle which flight actually pulled the most g.
        </p>
      )}

      {/* Overlaid chart — pick which quantity to compare across the flights. */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Channel</span>
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => chooseMetric(m.key)}
              aria-pressed={m.key === metric}
              className={seg(m.key === metric)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Export the comparison — chart, the overlaid data, or the table. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={savePng} title="Save the comparison chart as a PNG" className={ACTION_BTN}>
            Save .png
          </button>
          <FigureThemeButton dark={figureDark} onToggle={toggleFigureDark} className={ACTION_BTN} />
          <button
            type="button"
            onClick={saveChartSvg}
            title="Save the comparison chart as a scalable SVG (vector — crisp at any size)"
            className={ACTION_BTN}
          >
            Save .svg
          </button>
          <button
            type="button"
            onClick={saveOverlayCsv}
            title="Save every overlaid channel — altitude, velocity, acceleration, Mach and dynamic pressure — for all flights, on the shared liftoff-aligned timeline, as one CSV"
            className={ACTION_BTN}
          >
            Save chart data
          </button>
          <button
            type="button"
            onClick={copyMetrics}
            title="Copy the side-by-side table to the clipboard — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
            className={ACTION_BTN}
          >
            Copy table
          </button>
          <button
            type="button"
            onClick={saveMetricsCsv}
            title="Save the side-by-side metrics table as CSV"
            className={ACTION_BTN}
          >
            Save metrics
          </button>
          <button
            type="button"
            onClick={saveHtml}
            title="Save a self-contained HTML comparison report — the cross-check, the side-by-side metrics and the overlay charts inline, in one file you can open, print, email or archive anywhere (nothing uploaded)"
            className={ACTION_BTN}
          >
            Save .html
          </button>
          <button
            type="button"
            onClick={saveBundle}
            title="Save one ZIP with the Markdown cross-check write-up, the metrics CSV and the altitude/velocity/acceleration overlay figures — the whole comparison, zipped in the browser"
            className={ACTION_BTN}
          >
            Save bundle
          </button>
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

        <ChartBlock title={active.unit ? `${active.label} (${active.unit})` : active.label}>
          <div ref={chartRef}>
            <Chart
              time={time}
              series={metricSeries}
              markers={liftoffMarker}
              dark={dark}
              height={320}
              fmt={metricFmt}
              ariaLabel={chartLabel}
              syncKey={syncKey}
            />
          </div>
        </ChartBlock>
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Hover to read every flight at the same instant · drag across the chart to zoom (pinch on
        touch) · double-click or double-tap to reset
      </p>
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h3>
      </div>
      {children}
    </div>
  );
}
