'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightSeries } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { fmtSpeed, fmtMach } from '@/lib/display';
import { railExitVelocity, RAIL_LENGTHS_M, DEFAULT_RAIL_M, MARGINAL_RAIL_VELOCITY } from '@/lib/rail';

const PREF_KEY = 'debrief.rail';

/** A rail length, named the way the hobby does (feet, with metres alongside). */
function railLabel(m: number): string {
  const ft = Math.round(m / 0.3048);
  const metres = (Math.round(m * 10) / 10).toFixed(1);
  return `${ft} ft (${metres} m)`;
}

function readInitialRail(): number {
  if (typeof window === 'undefined') return DEFAULT_RAIL_M;
  const saved = Number(window.localStorage.getItem(PREF_KEY));
  return RAIL_LENGTHS_M.includes(saved) ? saved : DEFAULT_RAIL_M;
}

/**
 * Rail-exit (rail-departure) velocity — how fast the rocket was actually moving
 * when it cleared the launch rail. Read straight from the flown record at the
 * height one rail-length above the pad; nothing is predicted or modelled.
 *
 * Only meaningful with barometric altitude: rail clearance happens in the first
 * couple of metres, far finer than a GPS fix can resolve, so the caller omits
 * this for GPS-only flights.
 */
export default function RailExit({ series, sys }: { series: FlightSeries; sys: UnitSystem }) {
  const [railM, setRailM] = useState<number>(DEFAULT_RAIL_M);

  useEffect(() => {
    setRailM(readInitialRail());
  }, []);

  const onPick = (m: number) => {
    setRailM(m);
    try {
      window.localStorage.setItem(PREF_KEY, String(m));
    } catch {
      /* ignore */
    }
  };

  const v = useMemo(() => railExitVelocity(series.altitude, series.velocity, railM), [series, railM]);
  const mach = v != null && series.speedOfSound > 0 ? v / series.speedOfSound : null;
  const marginal = v != null && v < MARGINAL_RAIL_VELOCITY;
  const approx = series.velocitySource !== 'device';

  return (
    <section
      aria-labelledby="rail-exit-heading"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="rail-exit-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Rail-exit velocity
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            How fast it was going as it left the rail — measured from your flight, not predicted.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Rail length</span>
          <select
            aria-label="Launch rail length"
            value={railM}
            onChange={(e) => onPick(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {RAIL_LENGTHS_M.map((m) => (
              <option key={m} value={m}>
                {railLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {v != null ? fmtSpeed(v, sys) : '—'}
        </span>
        {mach != null && Math.abs(mach) >= 0.8 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{fmtMach(mach)}</span>
        )}
        {v != null && approx && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">approximate — velocity derived from altitude</span>
        )}
      </div>

      {v == null && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          The log doesn’t reach {railLabel(railM)} above the pad with a readable velocity, so there’s nothing to
          measure here.
        </p>
      )}
      {marginal && (
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          That’s on the low side. A rocket that leaves the rail slowly has less airflow over its fins to hold it
          straight — many fliers look for more margin than this. It’s your call, not a rule.
        </p>
      )}
    </section>
  );
}
