'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightMetrics } from '@/lib/analyze/types';
import { estimateMotor, massToKg, MASS_UNITS, type MassUnit } from '@/lib/motorEstimate';
import { MOTOR_URL } from '@/lib/links';

const MASS_KEY = 'debrief.mass';
const MASS_UNIT_KEY = 'debrief.massUnit';

const INPUT =
  'w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

/** A round number: 0 decimals at ≥100, 1 below, 2 below 10. */
function num(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const p = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return (Math.round(v * 10 ** p) / 10 ** p).toLocaleString('en-US', { maximumFractionDigits: p });
}

/** Estimate the motor behind a flight from its boost and a user-entered liftoff
 *  mass, and point at the Motor Finder for something in that class. Only shown
 *  when the flight actually has a measurable boost. */
export default function MotorEstimate({ metrics }: { metrics: FlightMetrics }) {
  const [mass, setMass] = useState('');
  const [unit, setUnit] = useState<MassUnit>('g');

  // Load the last mass/unit once mounted (client-only, so no hydration mismatch).
  useEffect(() => {
    try {
      const m = localStorage.getItem(MASS_KEY);
      const u = localStorage.getItem(MASS_UNIT_KEY) as MassUnit | null;
      if (m != null) setMass(m);
      if (u && MASS_UNITS.includes(u)) setUnit(u);
    } catch {
      /* private mode — just won't persist */
    }
  }, []);

  const persist = (m: string, u: MassUnit) => {
    try {
      localStorage.setItem(MASS_KEY, m);
      localStorage.setItem(MASS_UNIT_KEY, u);
    } catch {
      /* ignore */
    }
  };

  const massKg = useMemo(() => {
    const v = Number(mass);
    return mass.trim() !== '' && Number.isFinite(v) && v > 0 ? massToKg(v, unit) : NaN;
  }, [mass, unit]);

  const est = useMemo(() => estimateMotor(metrics, massKg), [metrics, massKg]);

  // No measurable boost → nothing to estimate from; keep the panel out of the way.
  if (metrics.burnTime == null || metrics.burnoutVelocity == null) return null;

  const tiles = est
    ? [
        { label: 'Total impulse', value: `${num(est.totalImpulse)} N·s` },
        { label: 'Motor class', value: est.motorClass },
        { label: 'Avg thrust', value: `${num(est.avgThrust)} N` },
        { label: 'Peak thrust', value: est.peakThrust != null ? `${num(est.peakThrust)} N` : '—' },
        { label: 'Thrust-to-weight', value: `${num(est.thrustToWeight)} : 1` },
      ]
    : [];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">Motor estimate</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">rough — from the measured boost</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="liftoff-mass" className="text-sm text-zinc-600 dark:text-zinc-400">
          Liftoff mass
        </label>
        <input
          id="liftoff-mass"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="e.g. 500"
          value={mass}
          onChange={(e) => {
            setMass(e.target.value);
            persist(e.target.value, unit);
          }}
          className={INPUT}
        />
        <label htmlFor="liftoff-mass-unit" className="sr-only">
          Mass unit
        </label>
        <select
          id="liftoff-mass-unit"
          value={unit}
          onChange={(e) => {
            const u = e.target.value as MassUnit;
            setUnit(u);
            persist(mass, u);
          }}
          className={SELECT}
        >
          {MASS_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {est ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t.label}
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.value}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-sm">
            <a
              href={MOTOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400"
            >
              Find a {est.motorClass}-class motor on the Motor Finder &rarr;
            </a>
          </p>

          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Impulse is{' '}
            <abbr title="Aerodynamic drag and the mass the motor sheds as it burns are not modelled.">
              a floor
            </abbr>
            : drag and burning propellant aren&apos;t modelled and the boost is assumed near-vertical, so the
            real motor may be a touch bigger — even a class up. Thrust-to-weight is the average over the burn.
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Enter the rocket&apos;s liftoff mass (motor included) to estimate the total impulse, motor class and
          thrust behind this flight.
        </p>
      )}
    </div>
  );
}
