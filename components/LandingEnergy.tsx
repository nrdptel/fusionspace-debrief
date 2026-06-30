'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightMetrics } from '@/lib/analyze/types';
import type { UnitSystem } from '@/lib/display';
import { fmtSpeed } from '@/lib/display';
import { landingEnergyJoules, joulesToFtLbf, massToKg, MASS_TO_KG, MAX_REASONABLE_MASS_KG } from '@/lib/landing';

const MASS_KEY = 'debrief.mass.kg';

/** Mass unit to enter the descending mass in — grams (metric) or ounces (imperial). */
function massUnit(sys: UnitSystem): 'g' | 'oz' {
  return sys === 'imperial' ? 'oz' : 'g';
}

function round(v: number, places: number): string {
  const f = Math.pow(10, places);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: places });
}

/** Like round, but without thousands separators — a grouped "1,500" is invalid in
 *  a number input, so the editable mass field uses this (a heavy rocket is ≥1 kg). */
function plain(v: number, places: number): string {
  const f = Math.pow(10, places);
  return String(Math.round(v * f) / f);
}

function readInitialMassKg(): number | null {
  if (typeof window === 'undefined') return null;
  const v = Number(window.localStorage.getItem(MASS_KEY));
  return Number.isFinite(v) && v > 0 && v <= MAX_REASONABLE_MASS_KG ? v : null;
}

/**
 * Landing kinetic energy — how hard the rocket actually came in: ½·m·v² from the
 * descent rate the logger measured near touchdown and the descending mass the
 * flier supplies. A measurement of this flight, not a prediction; it's the figure
 * a cert flight card and many club waivers ask for, usually in ft·lbf.
 */
export default function LandingEnergy({ metrics, sys }: { metrics: FlightMetrics; sys: UnitSystem }) {
  const [massKg, setMassKg] = useState<number | null>(null);

  useEffect(() => {
    setMassKg(readInitialMassKg());
  }, []);

  const unit = massUnit(sys);
  const rate = metrics.mainDescentRate; // landing descent rate (m/s), measured

  const massField = massKg == null ? '' : plain(massKg / MASS_TO_KG[unit], unit === 'oz' ? 1 : 0);

  const onMass = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setMassKg(null);
      try {
        window.localStorage.removeItem(MASS_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const kg = Math.min(massToKg(n, unit), MAX_REASONABLE_MASS_KG);
    setMassKg(kg);
    try {
      window.localStorage.setItem(MASS_KEY, String(kg));
    } catch {
      /* ignore */
    }
  };

  const joules = useMemo(() => (massKg != null ? landingEnergyJoules(massKg, rate) : null), [massKg, rate]);
  const ftlbf = joules != null ? joulesToFtLbf(joules) : null;

  return (
    <section
      aria-labelledby="landing-energy-heading"
      // Nothing to print until a mass is entered — don't put an empty input on a
      // printed card. Once it computes, it prints with the rest.
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${
        ftlbf == null ? 'print:hidden' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3
            id="landing-energy-heading"
            className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300"
          >
            Landing energy
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            How hard it came in — ½·m·v² from your measured landing descent rate. Enter the descending mass.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Descending mass</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={unit === 'oz' ? 0.1 : 1}
              value={massField}
              onChange={(e) => onMass(e.target.value)}
              aria-label={`Descending mass (${unit === 'oz' ? 'ounces' : 'grams'})`}
              placeholder={unit === 'oz' ? 'oz' : 'g'}
              className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            />
            <span className="font-mono">{unit}</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {ftlbf != null && joules != null
            ? sys === 'metric'
              ? `${round(joules, 0)} J`
              : `${round(ftlbf, ftlbf < 100 ? 1 : 0)} ft·lbf`
            : '—'}
        </span>
        {ftlbf != null && joules != null && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {sys === 'metric' ? `${round(ftlbf, ftlbf < 100 ? 1 : 0)} ft·lbf` : `${round(joules, 0)} J`}
            {rate != null && ` · at ${fmtSpeed(rate, sys)} down`}
          </span>
        )}
      </div>

      {rate == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          No landing descent rate was read from this log (it may end at or before apogee), so there’s no landing
          energy to compute.
        </p>
      ) : massKg == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Enter your rocket’s descending mass (without propellant) to read the energy it landed with. Kept on this
          device; compare it against your club or certification limit.
        </p>
      ) : null}
    </section>
  );
}
