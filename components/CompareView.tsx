'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Comparison, CompareFlight } from '@/lib/compare';
import { crossCheck } from '@/lib/compare';
import type { FlightMetrics } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { exploreCsv } from '@/lib/explore';
import { toCsv } from '@/lib/csv';
import { download } from '@/lib/download';
import {
  lengthIn,
  speedIn,
  accelInG,
  pressureIn,
  pressureUnit,
  UNIT_LABEL,
  fmtLength,
  fmtSpeed,
  fmtAccel,
  fmtTime,
  fmtMach,
  fmtPressure,
} from '@/lib/display';
import { useIsDark } from './useIsDark';
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

interface Row {
  label: string;
  get: (m: FlightMetrics) => string;
  /** When 'max', the largest finite value across flights is emphasized. */
  best?: 'max';
  value?: (m: FlightMetrics) => number;
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
  const { time, flights } = comparison;
  const syncKey = useMemo(() => `compare-${flights.map((f) => f.id).join('-')}`, [flights]);
  const [metric, setMetric] = useState<MetricKey>('altitude');
  const chartRef = useRef<HTMLDivElement>(null);

  // Velocity and acceleration can be device-logged on one flight and derived from
  // the barometer on another; a derived curve under-reads at peak speed, so when
  // the compared flights MIX sources we mark the baro ones rather than silently
  // crowning a "best" across methods that aren't directly comparable. (When every
  // flight shares a source, the comparison is fair and the marks would be noise.)
  const velMixed = new Set(flights.map((f) => f.metrics.maxVelocitySource)).size > 1;
  const accMixed = new Set(flights.map((f) => f.metrics.accelerationSource)).size > 1;
  const baroTag = (mixed: boolean, source: 'device' | 'baro', finite: boolean) =>
    mixed && source === 'baro' && finite ? ' (baro)' : '';

  const rows: Row[] = [
    { label: 'Apogee', get: (m) => fmtLength(m.apogeeAltitude, sys), best: 'max', value: (m) => m.apogeeAltitude },
    { label: 'Time to apogee', get: (m) => fmtTime(m.timeToApogee) },
    {
      label: 'Max velocity',
      get: (m) => fmtSpeed(m.maxVelocity, sys) + baroTag(velMixed, m.maxVelocitySource, Number.isFinite(m.maxVelocity)),
      best: 'max',
      value: (m) => m.maxVelocity,
    },
    { label: 'Max Mach', get: (m) => fmtMach(m.mach), best: 'max', value: (m) => m.mach ?? NaN },
    {
      label: 'Max acceleration',
      get: (m) => fmtAccel(m.maxAcceleration) + baroTag(accMixed, m.accelerationSource, Number.isFinite(m.maxAcceleration)),
      best: 'max',
      value: (m) => m.maxAcceleration,
    },
    { label: 'Max Q', get: (m) => fmtPressure(m.maxDynamicPressure, sys), best: 'max', value: (m) => m.maxDynamicPressure ?? NaN },
    { label: 'Burn time', get: (m) => (m.burnTime != null ? fmtTime(m.burnTime) : '—') },
    { label: 'Burnout altitude', get: (m) => (m.burnoutAltitude != null ? fmtLength(m.burnoutAltitude, sys) : '—') },
    { label: 'Drogue descent', get: (m) => (m.drogueDescentRate != null ? fmtSpeed(m.drogueDescentRate, sys) : '—') },
    { label: 'Main descent', get: (m) => (m.mainDescentRate != null ? fmtSpeed(m.mainDescentRate, sys) : '—') },
    { label: 'Flight time', get: (m) => (m.flightTime != null ? fmtTime(m.flightTime) : '—') },
  ];

  // Index of the flight holding the best (max) value per emphasized row. Only
  // emphasize when at least two flights have a finite value — "best of one" isn't
  // a comparison.
  const bestIdx = (row: Row): number => {
    if (row.best !== 'max' || !row.value) return -1;
    let bi = -1;
    let bv = -Infinity;
    let finite = 0;
    let ties = 0;
    flights.forEach((f, i) => {
      const v = row.value!(f.metrics);
      if (!Number.isFinite(v)) return;
      finite++;
      if (v > bv) {
        bv = v;
        bi = i;
        ties = 1;
      } else if (v === bv) {
        ties++;
      }
    });
    // Only crown a single winner: needs ≥2 flights with a value, and no tie for top.
    return finite >= 2 && ties === 1 ? bi : -1;
  };

  // Memoized so an Analyzer re-render (e.g. a background recents refresh) doesn't
  // change these prop identities and rebuild the chart, resetting any zoom.
  const liftoffMarker = useMemo<ChartMarker[]>(() => [{ x: 0, label: 'liftoff', color: dark ? '#a1a1aa' : '#52525b' }], [dark]);

  // Pick which quantity to overlay across flights. All three are derived for
  // every analyzed flight, so they overlay cleanly regardless of logger.
  const metrics: {
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

  // Export the comparison — all on-device, like the rest. The overlay CSV is the
  // currently selected channel for every flight on the shared (liftoff-aligned)
  // grid; the metrics CSV is the side-by-side table; the PNG is the chart.
  const saveOverlayCsv = () => {
    const x = { label: 'time after liftoff', unit: 's', values: time };
    const ys = flights.map((f) => ({
      label: stem(f.name),
      unit: active.unit,
      values: Float64Array.from(active.get(f), (v) => active.toDisplay(v)),
    }));
    download(new Blob([exploreCsv(x, ys)], { type: 'text/csv' }), `compare-${metric}.csv`);
  };
  const saveMetricsCsv = () => {
    const header = ['Metric', ...flights.map((f) => stem(f.name))];
    const body = rows.map((r) => [r.label, ...flights.map((f) => r.get(f.metrics))]);
    download(new Blob([toCsv([header, ...body])], { type: 'text/csv' }), 'compare-metrics.csv');
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
      </div>

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
                  </span>
                </span>
              ))}
              . Close agreement builds confidence; a wide gap is a flag worth chasing — not a verdict, just the spread.
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const bi = bestIdx(row);
              return (
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
                        i === bi
                          ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                          : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {row.get(f.metrics)}
                      {i === bi && <span className="sr-only"> (highest)</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(velMixed || accMixed) && (
        <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">(baro)</span> — derived from altitude rather than logged by the
          device, so it reads softer at peak speed; compare those values with that in mind.
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
          <button
            type="button"
            onClick={saveOverlayCsv}
            title={`Save the overlaid ${active.label.toLowerCase()} curves (one column per flight) as CSV`}
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
        </div>

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
