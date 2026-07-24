'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Comparison, CompareFlight } from '@/lib/compare';
import { crossCheck } from '@/lib/compare';
import type { UnitSystem } from '@/lib/display';
import { exploreCsv } from '@/lib/explore';
import { toCsv } from '@/lib/csv';
import { download } from '@/lib/download';
import { zip, type ZipEntry } from '@/lib/zip';
import { compareMarkdown, compareJson, compareMetricRows, compareHasBaroMix, compareHasClippedAccel, type ReportMeta } from '@/lib/report';
import { plotSvg } from '@/lib/svgChart';
import { lengthIn, speedIn, accelInG, pressureIn, pressureUnit, UNIT_LABEL } from '@/lib/display';
import { useIsDark } from './useIsDark';
import { useFigureDark, FigureThemeButton } from './FigureTheme';
import Chart, { type ChartMarker } from './Chart';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

type MetricKey = 'altitude' | 'velocity' | 'acceleration' | 'mach' | 'dynamicPressure';

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
  onBack,
}: {
  comparison: Comparison;
  note?: string;
  sys: UnitSystem;
  onToggleUnits: () => void;
  onBack: () => void;
}) {
  const dark = useIsDark();
  const [figureDark, toggleFigureDark] = useFigureDark();
  const { time, flights } = comparison;
  const syncKey = useMemo(() => `compare-${flights.map((f) => f.id).join('-')}`, [flights]);
  const [metric, setMetric] = useState<MetricKey>('altitude');
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
  const reportMeta = useMemo<ReportMeta>(() => ({ label: reportLabel, notes: reportNotes }), [reportLabel, reportNotes]);

  // The side-by-side rows (with best-of emphasis and the mixed-source "(baro)"
  // tagging) come from one shared builder, so the on-screen table, the metrics CSV
  // and the Markdown bundle can't drift.
  const metricRows = compareMetricRows(flights, sys);
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
    { key: 'altitude', label: 'Altitude', unit: UNIT_LABEL[sys].length, get: (f) => f.altitude, toDisplay: (v) => lengthIn(v, sys) },
    { key: 'velocity', label: 'Velocity', unit: UNIT_LABEL[sys].speed, get: (f) => f.velocity, toDisplay: (v) => speedIn(v, sys) },
    { key: 'acceleration', label: 'Acceleration', unit: 'g', get: (f) => f.acceleration, toDisplay: (v) => accelInG(v) },
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
          return round1(accelInG(v));
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
  const pair = flights.length === 2;
  const metricsCsv = (): string => {
    const header = ['Metric', ...flights.map((f) => stem(f.name)), ...(pair ? ['Difference (%)'] : [])];
    const body = metricRows.map((r) => [
      r.label,
      ...r.cells,
      ...(pair ? [r.spreadPct != null ? r.spreadPct.toFixed(r.spreadPct < 1 ? 1 : 0) : ''] : []),
    ]);
    return toCsv([header, ...body]);
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

  // The comparison as one report-grade ZIP: the Markdown write-up (cross-check +
  // metrics table), the metrics CSV, and the altitude/velocity/acceleration overlay
  // figures — a redundant-altimeter or stage assembly check as a single download.
  // Zipped in the browser; nothing uploaded.
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
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
          ← Back to a single flight
        </button>
        <button
          type="button"
          onClick={onToggleUnits}
          aria-label={`Units: ${sys === 'imperial' ? 'feet' : 'meters'}. Switch to ${sys === 'imperial' ? 'meters' : 'feet'}.`}
          className={ACTION_BTN}
        >
          Units: {sys === 'imperial' ? 'feet' : 'meters'}
        </button>
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
        return (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Cross-check</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              If these are recordings of the same flight, the independent readings agree to within{' '}
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
              . Close agreement builds confidence; a wide gap is a flag worth chasing — not a verdict, just the spread.
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
                className="sticky left-0 bg-white py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"
              >
                Metric
              </th>
              {flights.map((f) => (
                <th key={f.id} scope="col" className="px-3 py-2 text-right align-bottom">
                  <span className="flex items-center justify-end gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: f.color }}
                      aria-hidden="true"
                    />
                    <span className="max-w-[10rem] truncate font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {stem(f.name)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                    {f.formatLabel}
                  </span>
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
              {pair && (
                <th
                  scope="col"
                  className="px-3 py-2 text-right align-bottom text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  title="The spread between the two: |a − b| as a percent of their mean — how closely two recordings of one flight agree, or how much one flight differs from another."
                >
                  Diff
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100 dark:border-zinc-900">
                <th
                  scope="row"
                  className="sticky left-0 bg-white py-2 pr-4 text-left font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"
                >
                  {row.label}
                </th>
                {flights.map((f, i) => (
                  <td
                    key={f.id}
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      i === row.best
                        ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                        : 'text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {row.cells[i]}
                    {i === row.best && <span className="sr-only"> (highest)</span>}
                  </td>
                ))}
                {pair && (
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {row.spreadPct != null ? `${row.spreadPct.toFixed(row.spreadPct < 1 ? 1 : 0)}%` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              onClick={() => setMetric(m.key)}
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
            onClick={saveMetricsCsv}
            title="Save the side-by-side metrics table as CSV"
            className={ACTION_BTN}
          >
            Save metrics
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
