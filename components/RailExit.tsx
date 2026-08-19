'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightSeries } from '@/lib/analyze/types';
import { fmtMach, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import {
  canMeasureRailExit,
  railExitVelocity,
  RAIL_LENGTHS_M,
  DEFAULT_RAIL_M,
  MARGINAL_RAIL_VELOCITY,
} from '@/lib/rail';
import { Card, Readout, Select } from './ui';

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
 * when it cleared the launch rail. Read straight from the flown record by integrating
 * velocity from liftoff to one rail-length of travel; nothing is predicted or modelled.
 *
 * Needs a logged (device/inertial) velocity: rail clearance happens in the first metre
 * or two, where a barometric velocity is far too soft and noisy to read reliably (and a
 * GPS fix can't resolve it at all), so this is withheld for a baro-derived velocity — a
 * wrong figure this low would be worse than none, and could false-flag a healthy boost.
 */
export default function RailExit({
  series,
  sys,
  liftoffIndex,
}: {
  series: FlightSeries;
  sys: UnitChoice;
  liftoffIndex: number | null;
}) {
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

  // Only a logged velocity is trustworthy this low; a baro-derived one is withheld.
  // A logged one the analysis has REFUSED is withheld too, and for a different reason —
  // so the two are kept apart below rather than sharing a message. `velocitySource`
  // says where the trace came from; `velocityUnusable` says whether it can be believed,
  // and reading only the first published a rail-exit speed, its Mach, and the low-airflow
  // caution off a trace the headline had already declined to report.
  const logged = series.velocitySource === 'device';
  const refused = series.velocityUnusable === true;
  const measurable = canMeasureRailExit(series, liftoffIndex);
  const v = useMemo(
    () => (measurable ? railExitVelocity(series.time, series.velocity, railM, liftoffIndex as number) : null),
    [series, railM, measurable, liftoffIndex],
  );
  const mach = v != null && series.speedOfSound > 0 ? v / series.speedOfSound : null;
  const marginal = v != null && v < MARGINAL_RAIL_VELOCITY;

  return (
    <Card as="section" aria-labelledby="rail-exit-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="rail-exit-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Rail-exit velocity
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            How fast it was going as it left the rail — measured from your flight, not predicted.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span>Rail length</span>
          <Select
            ariaLabel="Launch rail length"
            value={railM}
            onChange={(v) => onPick(Number(v))}
            className="font-medium"
          >
            {RAIL_LENGTHS_M.map((m) => (
              <option key={m} value={m}>
                {railLabel(m)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <Readout
        size="hero"
        layout="inline"
        className="mt-3"
        value={v != null ? fmtSpeed(v, sys) : '—'}
        sub={mach != null && Math.abs(mach) >= 0.8 && fmtMach(mach)}
      />

      {/* The refusal is only worth naming on a flight that HAS a logged velocity — otherwise
          the standing reason below is the true one, and leading with the refusal would tell a
          barometric flyer that a judgement about this flight is what stopped the reading when
          in fact no barometric flight can ever produce it. Every refusal reached so far is
          barometric, so ordering these the other way round would have hidden the real message
          on every flight that gets one. */}
      {!measurable && logged && refused && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This flight’s speed trace is one Debrief won’t stand behind — the same reason its peak speed is withheld —
          so nothing read off it is shown here either.
        </p>
      )}
      {!measurable && !(logged && refused) && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Rail clearance happens in the first metre or two, where a velocity derived from barometric altitude is too
          soft to read reliably — this needs a logged (accelerometer) velocity, which this flight doesn’t have.
        </p>
      )}
      {measurable && v == null && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The log doesn’t cover {railLabel(railM)} of travel with a readable velocity, so there’s nothing to measure
          here.
        </p>
      )}
      {marginal && (
        <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          That’s on the low side. A rocket that leaves the rail slowly has less airflow over its fins to hold it
          straight — many fliers look for more margin than this. It’s your call, not a rule.
        </p>
      )}
    </Card>
  );
}
