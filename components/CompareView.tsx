'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Comparison, CompareFlight } from '@/lib/compare';
import type { FlightMetrics } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { lengthIn, speedIn, accelInG, UNIT_LABEL, fmtLength, fmtSpeed, fmtAccel, fmtTime } from '@/lib/display';
import { useIsDark } from './useIsDark';
import Chart, { type ChartMarker } from './Chart';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

type MetricKey = 'altitude' | 'velocity' | 'acceleration';

function round0(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

function round1(v: number): string {
  return Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : '—';
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

  const rows: Row[] = [
    { label: 'Apogee', get: (m) => fmtLength(m.apogeeAltitude, sys), best: 'max', value: (m) => m.apogeeAltitude },
    { label: 'Time to apogee', get: (m) => fmtTime(m.timeToApogee) },
    { label: 'Max velocity', get: (m) => fmtSpeed(m.maxVelocity, sys), best: 'max', value: (m) => m.maxVelocity },
    { label: 'Max acceleration', get: (m) => fmtAccel(m.maxAcceleration), best: 'max', value: (m) => m.maxAcceleration },
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
  const metrics: { key: MetricKey; label: string; unit: string; get: (f: CompareFlight) => Float64Array }[] = [
    { key: 'altitude', label: 'Altitude', unit: UNIT_LABEL[sys].length, get: (f) => f.altitude },
    { key: 'velocity', label: 'Velocity', unit: UNIT_LABEL[sys].speed, get: (f) => f.velocity },
    { key: 'acceleration', label: 'Acceleration', unit: 'g', get: (f) => f.acceleration },
  ];
  const active = metrics.find((m) => m.key === metric) ?? metrics[0];
  const metricSeries = useMemo(
    () => flights.map((f) => ({ label: stem(f.name), values: f[metric], stroke: f.color, width: 2 })),
    [flights, metric],
  );
  const metricFmt = useCallback(
    (v: number) =>
      metric === 'altitude' ? round0(lengthIn(v, sys)) : metric === 'velocity' ? round0(speedIn(v, sys)) : round1(accelInG(v)),
    [metric, sys],
  );
  const chartLabel = `${active.label} against time after liftoff for ${flights.length} flights.`;

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
        <h2 className="text-xl font-semibold tracking-tight">Comparing {flights.length} flights</h2>
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
        <ChartBlock title={`${active.label} (${active.unit})`}>
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
        </ChartBlock>
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Hover to read every flight at the same instant · drag across the chart to zoom · double-click
        to reset
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
