'use client';

import { useMemo } from 'react';
import type { FlightMetrics } from '@/lib/analyze/types';
import { fmtLength, fmtSpeed, systemOf } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { descentStoppedAloft, landingRate, landingRateIsWholeDescent } from '@/lib/readings';
import { landingEnergyJoules, joulesToFtLbf, dropHeightM, massToKg, MASS_TO_KG, MAX_REASONABLE_MASS_KG } from '@/lib/landing';
import { Card } from './ui';

/** Mass unit to enter the descending mass in — grams (metric) or ounces (imperial). */
function massUnit(sys: UnitChoice): 'g' | 'oz' {
  return systemOf(sys) === 'imperial' ? 'oz' : 'g';
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

/**
 * Landing kinetic energy — how hard the rocket actually came in: ½·m·v² from the
 * descent rate the logger measured near touchdown and the descending mass the
 * flier supplies. A measurement of this flight, not a prediction; it's the figure
 * a cert flight card and many club waivers ask for, usually in ft·lbf. The
 * descending mass is owned by the report (shared with the parachute-Cd panel).
 */
export default function LandingEnergy({
  metrics,
  sys,
  massKg,
  onMassKg,
}: {
  metrics: FlightMetrics;
  sys: UnitChoice;
  massKg: number | null;
  onMassKg: (kg: number | null) => void;
}) {
  const unit = massUnit(sys);
  // The touchdown speed: the main leg where the record resolved a deployment, otherwise the
  // whole descent — which, on a record showing no deployment change, is the same descent all
  // the way down as far as it can tell. Named as such rather than silently equated.
  // `landingRate` returns null where the record never reached the ground, which is not the
  // same as a flight with no deployment change: an average over a descent that stops 2,540 m
  // up is a drogue-leg figure, and squaring it into a landing energy a flyer sizes a canopy
  // against is the kind of confident wrong number this tool exists not to print.
  const rate = landingRate(metrics);
  const wholeDescent = landingRateIsWholeDescent(metrics);
  // Why the number is missing, and it has to be the RIGHT why — see `descentStoppedAloft`.
  // Deciding it here, on `wholeDescentRate` alone, sent every flight that resolved a main and
  // then stopped recording under canopy to the other branch, where the panel said "no landing
  // descent rate was read from this log (it may end at or before apogee)" over a flight that
  // had logged a main leg at 50 ft/s.
  const stoppedAbove = descentStoppedAloft(metrics);

  const massField = massKg == null ? '' : plain(massKg / MASS_TO_KG[unit], unit === 'oz' ? 1 : 0);

  const onMass = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      onMassKg(null);
      return;
    }
    onMassKg(Math.min(massToKg(n, unit), MAX_REASONABLE_MASS_KG));
  };

  const joules = useMemo(() => (massKg != null ? landingEnergyJoules(massKg, rate) : null), [massKg, rate]);
  const ftlbf = joules != null ? joulesToFtLbf(joules) : null;
  // The landing speed as a free-fall drop height — exact, needs no mass, and makes
  // the rate intuitive for the "was that too hard?" call.
  const drop = dropHeightM(rate);

  return (
    <Card
      as="section"
      aria-labelledby="landing-energy-heading"
      // Nothing to print until a mass is entered — don't put an empty input on a
      // printed card. Once it computes, it prints with the rest.
      className={ftlbf == null ? 'print:hidden' : ''}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3
            id="landing-energy-heading"
            className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300"
          >
            Landing energy
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            How hard it came in — ½·m·v² from your measured landing descent rate. Enter the descending mass.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
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
              className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            />
            <span className="font-mono">{unit}</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100">
          {ftlbf != null && joules != null
            ? systemOf(sys) === 'metric'
              ? `${round(joules, 0)} J`
              : `${round(ftlbf, ftlbf < 100 ? 1 : 0)} ft·lbf`
            : '—'}
        </span>
        {ftlbf != null && joules != null && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {systemOf(sys) === 'metric' ? `${round(ftlbf, ftlbf < 100 ? 1 : 0)} ft·lbf` : `${round(joules, 0)} J`}
            {rate != null && ` · at ${fmtSpeed(rate, sys)} down`}
          </span>
        )}
      </div>

      {/* The landing speed as a free-fall drop height — exact and mass-free, so it
          shows even before a mass is entered, giving the gut-feel "how hard". */}
      {drop != null && rate != null && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {wholeDescent && 'Averaged over the whole descent — no deployment change is in this record. '}
          Touched down at <span className="font-medium">{fmtSpeed(rate, sys)}</span> — the speed of a free-fall drop from{' '}
          <span className="font-medium">{fmtLength(drop, sys)}</span>.
        </p>
      )}

      {rate == null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {stoppedAbove
            ? 'This record stops before the ground, so the descent rate it carries is the rate of the descent that was recorded — not a touchdown speed. Landing energy and parachute Cd are left unread rather than computed from it.'
            : 'No landing descent rate was read from this log (it may end at or before apogee), so there’s no landing energy to compute.'}
        </p>
      ) : massKg == null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Enter your rocket’s descending mass (without propellant) to read the energy it landed with. Kept on this
          device; compare it against your club or certification limit.
        </p>
      ) : null}
    </Card>
  );
}
