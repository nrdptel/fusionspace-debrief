import type { FlightMetrics } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { fmtLength, fmtSpeed, fmtAccel, fmtTemp, fmtTime, fmtMach, fmtPressure, fmtVoltage } from '@/lib/display';

interface Tile {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}

/** Mach (when known) and the altitude the peak speed was reached at. */
function maxVelocitySub(m: FlightMetrics, sys: UnitSystem): string | undefined {
  const parts: string[] = [];
  if (m.mach) parts.push(fmtMach(m.mach));
  if (Number.isFinite(m.maxVelocityAltitude)) parts.push(`at ${fmtLength(m.maxVelocityAltitude, sys)}`);
  if (parts.length) return parts.join(' · ');
  return Number.isFinite(m.maxVelocity) ? undefined : 'not in this log';
}

function tiles(m: FlightMetrics, sys: UnitSystem): Tile[] {
  const out: Tile[] = [
    {
      label: 'Apogee',
      value: fmtLength(m.apogeeAltitude, sys),
      sub: Number.isFinite(m.timeToApogee) ? `${fmtTime(m.timeToApogee)} to apogee` : undefined,
      primary: true,
    },
    {
      label: 'Max velocity',
      value: fmtSpeed(m.maxVelocity, sys),
      sub: maxVelocitySub(m, sys),
      primary: true,
    },
  ];
  // Acceleration is omitted for a GPS-only flight (it's not meaningful), so only
  // show the tile when there's a real figure.
  if (Number.isFinite(m.maxAcceleration)) {
    out.push({
      label: 'Max acceleration',
      value: fmtAccel(m.maxAcceleration),
      sub:
        m.accelerationSource === 'device'
          ? m.accelClipped
            ? 'measured · may be clipped'
            : 'measured'
          : 'derived',
      primary: true,
    });
  }

  if (m.avgBoostAcceleration != null)
    out.push({ label: 'Avg acceleration', value: fmtAccel(m.avgBoostAcceleration), sub: 'over the boost' });
  if (m.burnTime != null) out.push({ label: 'Burn time', value: fmtTime(m.burnTime) });
  if (m.burnoutAltitude != null)
    out.push({ label: 'Burnout altitude', value: fmtLength(m.burnoutAltitude, sys) });
  if (m.burnoutVelocity != null)
    out.push({ label: 'Burnout velocity', value: fmtSpeed(m.burnoutVelocity, sys) });
  if (m.coastTime != null) out.push({ label: 'Coast to apogee', value: fmtTime(m.coastTime) });
  if (m.maxDynamicPressure != null)
    out.push({
      label: 'Max Q',
      value: fmtPressure(m.maxDynamicPressure, sys),
      sub: m.maxDynamicPressureAltitude != null ? `at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : undefined,
    });
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
  // Battery: the lowest it sagged to, with the resting voltage alongside so a
  // drop (a weak pack — a common cause of a charge that didn't fire) is visible.
  if (m.batteryMinV != null)
    out.push({
      label: 'Battery low',
      value: fmtVoltage(m.batteryMinV),
      sub: m.batteryStartV != null ? `${fmtVoltage(m.batteryStartV)} at rest` : undefined,
    });

  // Roll/spin about the long axis, when the logger recorded a roll-rate channel.
  if (m.peakRollRate != null)
    out.push({
      label: 'Peak roll rate',
      value: `${Math.round(m.peakRollRate)} °/s`,
      sub: `${(m.peakRollRate / 360).toFixed(1)} rev/s`,
    });
  if (m.rollRevolutions != null)
    out.push({
      label: 'Revolutions',
      value: m.rollRevolutions.toFixed(m.rollRevolutions < 10 ? 1 : 0),
      sub: 'total roll',
    });

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
              {t.sub && <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{t.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {metrics.transonicTime != null && (
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          Went supersonic — crossed Mach 1
          {metrics.transonicAltitude != null ? ` at ${fmtLength(metrics.transonicAltitude, sys)}` : ''},{' '}
          {fmtTime(metrics.transonicTime)} after liftoff.
        </p>
      )}
    </div>
  );
}
