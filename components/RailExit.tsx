'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightSeries } from '@/lib/analyze/types';
import { fmtMach, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { railExitReading, RAIL_LENGTHS_M, DEFAULT_RAIL_M, MARGINAL_RAIL_VELOCITY } from '@/lib/rail';
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
  accelClipped,
}: {
  series: FlightSeries;
  sys: UnitChoice;
  liftoffIndex: number | null;
  /** `metrics.accelClipped`. A saturated accelerometer reports a FLOOR, so no ceiling is built
   *  from one — see `railExitBound`. Required with no default: the safe-looking default here is
   *  the one that refuses the fastest real boosts. */
  accelClipped: boolean;
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

  // **One call, and it answers both halves.** Whether this flight can produce a rail-exit reading
  // at all and what that reading is are the same question, and splitting them is what let a
  // measurable-looking flight publish an unmeasurable number: the surface asked
  // `canMeasureRailExit` — which reads only where the trace came from and whether it was refused —
  // and then integrated regardless. `railExitReading` asks the record itself.
  const reading = useMemo(
    () => railExitReading(series, railM, liftoffIndex, accelClipped),
    [series, railM, liftoffIndex, accelClipped],
  );
  const v = reading.velocity;
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

      {/* **A withheld number says why it is withheld**, and each of these names a different fact
          about the RECORD. The order below is the order they are reached in, which is also
          least-specific-last: a barometric flight can never produce this reading, so leading with
          a judgement about the flight would tell that flyer the wrong thing. */}
      {reading.refused && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {reading.refused === 'traceRefused' && (
            <>
              This flight’s speed trace is one Debrief won’t stand behind — the same reason its peak speed is
              withheld — so nothing read off it is shown here either.
            </>
          )}
          {reading.refused === 'notLogged' && (
            <>
              Rail clearance happens in the first metre or two, where a velocity derived from barometric altitude is
              too soft to read reliably — this needs a logged (accelerometer) velocity, which this flight doesn’t
              have.
            </>
          )}
          {reading.refused === 'noLiftoff' && (
            <>
              Liftoff couldn’t be pinpointed in this recording, and this reading is measured from it — so there’s no
              point to measure {railLabel(railM)} of travel from.
            </>
          )}
          {reading.refused === 'tooShort' && (
            <>
              The log doesn’t cover {railLabel(railM)} of travel with a readable velocity, so there’s nothing to
              measure here.
            </>
          )}
          {/* The two guards added 2026-08-20. Both say the same thing in the end — this record
              doesn't contain the rocket leaving a rail — but they say it from different evidence,
              and a flyer who wants to know WHY their file is different deserves the specific one. */}
          {reading.refused === 'unsampled' && (
            <>
              This recording clears {railLabel(railM)} inside a single sample, so there’s no reading between the pad
              and the end of the rail to take. Measuring it needs a log that samples the first fraction of a second
              more finely than this one does.
            </>
          )}
          {reading.refused === 'aboveOwnAcceleration' && (
            <>
              This recording doesn’t contain the rocket leaving a rail. Reading it the usual way gives a speed higher
              than this flight’s own measured acceleration could reach over {railLabel(railM)} from a standstill —
              a ceiling of {fmtSpeed(reading.bound as number, sys)} — which happens when a log starts after the
              rocket is already moving, or when the recording is a sustainer that was carried up rather than
              launched from a rail.
            </>
          )}
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
