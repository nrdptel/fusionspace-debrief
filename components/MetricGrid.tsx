import type { FlightMetrics } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { fmtLength, fmtSpeed, fmtAccel, fmtTemp, fmtTime, fmtMach } from '@/lib/display';

interface Tile {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}

function tiles(m: FlightMetrics, sys: UnitSystem): Tile[] {
  const out: Tile[] = [
    {
      label: 'Apogee',
      value: fmtLength(m.apogeeAltitude, sys),
      sub: `${fmtTime(m.timeToApogee)} to apogee`,
      primary: true,
    },
    {
      label: 'Max velocity',
      value: fmtSpeed(m.maxVelocity, sys),
      sub: m.mach ? fmtMach(m.mach) : undefined,
      primary: true,
    },
    {
      label: 'Max acceleration',
      value: fmtAccel(m.maxAcceleration),
      sub: m.accelerationSource === 'device' ? 'measured' : 'derived',
      primary: true,
    },
  ];

  if (m.burnTime != null) out.push({ label: 'Burn time', value: fmtTime(m.burnTime) });
  if (m.burnoutAltitude != null)
    out.push({ label: 'Burnout altitude', value: fmtLength(m.burnoutAltitude, sys) });
  if (m.burnoutVelocity != null)
    out.push({ label: 'Burnout velocity', value: fmtSpeed(m.burnoutVelocity, sys) });
  if (m.coastTime != null) out.push({ label: 'Coast to apogee', value: fmtTime(m.coastTime) });
  if (m.drogueDescentRate != null)
    out.push({ label: 'Drogue descent', value: fmtSpeed(m.drogueDescentRate, sys) });
  if (m.mainDescentRate != null)
    out.push({
      label: m.drogueDescentRate != null ? 'Main descent' : 'Descent rate',
      value: fmtSpeed(m.mainDescentRate, sys),
    });
  if (m.descentTime != null) out.push({ label: 'Descent time', value: fmtTime(m.descentTime) });
  if (m.flightTime != null) out.push({ label: 'Flight time', value: fmtTime(m.flightTime) });
  if (m.groundTemperature != null)
    out.push({ label: 'Ground temp', value: fmtTemp(m.groundTemperature, sys) });

  return out;
}

export default function MetricGrid({ metrics, sys }: { metrics: FlightMetrics; sys: UnitSystem }) {
  const all = tiles(metrics, sys);
  const primary = all.filter((t) => t.primary);
  const rest = all.filter((t) => !t.primary);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {primary.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t.label}
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.value}
            </div>
            {t.sub && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t.sub}</div>}
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rest.map((t) => (
            <div
              key={t.label}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t.label}
              </div>
              <div className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {t.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
