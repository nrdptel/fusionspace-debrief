'use client';

import type { RawFlight } from '@/lib/flight/types';
import type { FlightAnalysis } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { lengthIn, speedIn, accelInG, UNIT_LABEL, fmtLength, fmtSpeed, fmtAccel, fmtTime } from '@/lib/display';
import { EVENT_COLOR } from '@/lib/eventStyle';
import { useIsDark } from './useIsDark';
import Chart, { type ChartMarker } from './Chart';
import MetricGrid from './MetricGrid';

function round(v: number, p: number): string {
  const f = Math.pow(10, p);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: p });
}

export default function FlightReport({
  flight,
  analysis,
  sys,
  onToggleUnits,
}: {
  flight: RawFlight;
  analysis: FlightAnalysis;
  sys: UnitSystem;
  onToggleUnits: () => void;
}) {
  const dark = useIsDark();
  const { series, events, metrics, warnings } = analysis;
  const notes = flight.notes;

  const markers: ChartMarker[] = events.map((e) => ({
    x: e.time,
    label: e.label.toLowerCase(),
    color: EVENT_COLOR[e.type],
  }));

  const hasAccel = series.acceleration.some((v) => Number.isFinite(v) && v !== 0);

  const eventSummary = events.map((e) => `${e.label.toLowerCase()} at ${fmtTime(e.time)}`).join(', ');
  const altLabel = `Line chart: altitude above ground against time, peaking at ${fmtLength(metrics.apogeeAltitude, sys)}. Marked events: ${eventSummary}.`;
  const velLabel = `Line chart: velocity against time${Number.isFinite(metrics.maxVelocity) ? `, peaking at ${fmtSpeed(metrics.maxVelocity, sys)}` : ''}.`;
  const accLabel = `Line chart: acceleration against time${Number.isFinite(metrics.maxAcceleration) ? `, peaking at ${fmtAccel(metrics.maxAcceleration)}` : ''}.`;

  return (
    <div className="space-y-8">
      <h2 className="sr-only">Flight report for {flight.source}</h2>
      {/* File / format line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{flight.source}</span>
          <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-300">
            {flight.formatLabel}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">read locally — never uploaded</span>
        </div>
        <button
          type="button"
          onClick={onToggleUnits}
          title="Switch units"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Units: {sys === 'imperial' ? 'feet' : 'metres'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <ul className="space-y-1">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <MetricGrid metrics={metrics} sys={sys} />

      {/* Charts */}
      <div className="space-y-6">
        <ChartBlock title={`Altitude (${UNIT_LABEL[sys].length} AGL)`}>
          <Chart
            time={series.time}
            series={[{ label: 'altitude', values: series.altitude, stroke: '#6366f1', width: 2 }]}
            markers={markers}
            dark={dark}
            height={300}
            fmt={(v) => round(lengthIn(v, sys), 0)}
            ariaLabel={altLabel}
          />
        </ChartBlock>

        <ChartBlock
          title={`Velocity (${UNIT_LABEL[sys].speed})`}
          note={series.velocitySource === 'device' ? 'logged by the device' : 'derived from altitude'}
        >
          <Chart
            time={series.time}
            series={[{ label: 'velocity', values: series.velocity, stroke: '#10b981' }]}
            markers={markers}
            dark={dark}
            height={200}
            fmt={(v) => round(speedIn(v, sys), 0)}
            ariaLabel={velLabel}
          />
        </ChartBlock>

        {hasAccel && (
          <ChartBlock
            title="Acceleration (g)"
            note={series.accelerationSource === 'device' ? 'logged by the device' : 'derived from velocity'}
          >
            <Chart
              time={series.time}
              series={[{ label: 'acceleration', values: series.acceleration, stroke: '#f59e0b' }]}
              markers={markers}
              dark={dark}
              height={200}
              fmt={(v) => round(accelInG(v), 1)}
              ariaLabel={accLabel}
            />
          </ChartBlock>
        )}
      </div>

      {/* Event legend */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Events</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <div
              key={e.type + e.index}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: EVENT_COLOR[e.type] }}
                  aria-hidden="true"
                />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{e.label}</span>
                {e.provenance !== 'measured' && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{e.provenance}</span>
                )}
              </span>
              <span className="text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {fmtTime(e.time)} · {fmtLength(e.altitude, sys)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartBlock({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h3>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </div>
      {children}
    </div>
  );
}
