// Cross-check: the logger's OWN headline figures (read from a summary the file
// carries) beside Debrief's independent read of the same flight. Two independent
// measurements — close agreement builds confidence; a gap is a flag worth a look,
// never averaged away or hidden. Debrief states both and judges neither.

import type { FlightMetrics } from '@/lib/analyze/types';
import type { ReportedValue } from '@/lib/flight/types';
import type { UnitSystem } from '@/lib/display';
import { fmtLength, fmtSpeed, fmtAccel } from '@/lib/display';
import { compareReported } from '@/lib/flight/reported';

function fmt(metric: ReportedValue['metric'], si: number, sys: UnitSystem): string {
  if (metric === 'apogeeAltitude') return fmtLength(si, sys);
  if (metric === 'maxVelocity' || metric === 'burnoutVelocity' || metric === 'mainDescentRate') return fmtSpeed(si, sys);
  return fmtAccel(si);
}

export default function DeviceSummary({
  reported,
  metrics,
  sys,
}: {
  reported: ReportedValue[];
  metrics: FlightMetrics;
  sys: UnitSystem;
}) {
  const rows = compareReported(reported, metrics).map(({ reported: r, computed, hasComputed: has, deltaPct, status }) => ({
    r,
    computed,
    has,
    deltaPct,
    status,
  }));

  return (
    <section
      aria-labelledby="devsum-heading"
      className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <p id="devsum-heading" className="mb-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        The logger&apos;s own summary
      </p>
      <p className="mb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        The device wrote these figures into the file. Shown beside Debrief&apos;s independent read as a cross-check —
        agreement builds confidence, a gap is worth a look.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="py-1 pr-4 font-medium">Reading</th>
              <th className="py-1 pr-4 font-medium">Logger</th>
              <th className="py-1 pr-4 font-medium">Debrief</th>
              <th className="py-1 font-medium">Agreement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, computed, has, deltaPct, status }) => (
              <tr key={r.metric} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1.5 pr-4 text-zinc-700 dark:text-zinc-300">{r.label}</td>
                <td className="py-1.5 pr-4 font-mono text-zinc-800 dark:text-zinc-200">{fmt(r.metric, r.value, sys)}</td>
                <td className="py-1.5 pr-4 font-mono text-zinc-800 dark:text-zinc-200">
                  {has ? fmt(r.metric, computed, sys) : '—'}
                </td>
                <td className="py-1.5">
                  {status == null ? (
                    <span className="text-zinc-500 dark:text-zinc-400">not computed</span>
                  ) : status === 'agree' ? (
                    <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      agree · {deltaPct! < 0.05 ? '≈0' : deltaPct!.toFixed(1)}%
                    </span>
                  ) : status === 'consistent' ? (
                    <span
                      title="A descent rate is a windowed average of an unsteady descent, not a single instant, so two independent reads are expected to differ by more than a peak would — this is consistent, not a discrepancy."
                      className="inline-flex items-center rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      consistent · {deltaPct!.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      differ · {deltaPct!.toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
