'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UnitSystem } from '@/lib/display';
import { fmtSpeed } from '@/lib/display';
import { parachuteCd, chuteDiameterToM, CHUTE_LEN_TO_M, MAX_REASONABLE_CHUTE_M } from '@/lib/parachute';

const DROGUE_KEY = 'debrief.drogue.m';

function plain(v: number, places: number): string {
  const f = Math.pow(10, places);
  return String(Math.round(v * f) / f);
}

function readNum(key: string, max: number): number | null {
  if (typeof window === 'undefined') return null;
  const v = Number(window.localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 && v <= max ? v : null;
}

function store(key: string, v: number | null) {
  try {
    if (v == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
}

/**
 * Drogue drag coefficient, measured from the drogue-phase descent — the same force
 * balance as the main (Cd = 2·m·g / ρv²A), applied to the fast fall between apogee
 * and the main deploy, with the thinner air up there. A reading of how the drogue
 * performed, the number to check a drogue you sized against. Softer than the main
 * reading: a drogue is often small and may not be fully at terminal velocity, so
 * it's flagged approximate.
 */
export default function DrogueCd({
  descentRate,
  airDensity,
  sys,
  massKg,
}: {
  descentRate: number | null;
  /** Air density at the drogue's (higher, thinner) altitude — not the ground value. */
  airDensity: number;
  sys: UnitSystem;
  /** Descending mass (kg), owned by the report and shared with landing energy. */
  massKg: number | null;
}) {
  const [drogueM, setDrogueM] = useState<number | null>(null);

  useEffect(() => {
    setDrogueM(readNum(DROGUE_KEY, MAX_REASONABLE_CHUTE_M));
  }, []);

  const unit = sys === 'imperial' ? 'in' : 'cm';
  const field = drogueM == null ? '' : plain(drogueM / CHUTE_LEN_TO_M[unit], 0);

  const onDiameter = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setDrogueM(null);
      store(DROGUE_KEY, null);
      return;
    }
    const m = Math.min(chuteDiameterToM(n, unit), MAX_REASONABLE_CHUTE_M);
    setDrogueM(m);
    store(DROGUE_KEY, m);
  };

  const cd = useMemo(
    () => (massKg != null && drogueM != null ? parachuteCd(massKg, drogueM, descentRate, airDensity) : null),
    [massKg, drogueM, descentRate, airDensity],
  );

  return (
    <section
      aria-labelledby="drogue-cd-heading"
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${
        cd == null ? 'print:hidden' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="drogue-cd-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Drogue Cd (measured)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            How the drogue performed on the fast fall to the main. Enter the descending mass and drogue diameter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Drogue diameter</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={field}
                onChange={(e) => onDiameter(e.target.value)}
                aria-label={`Drogue diameter (${unit === 'in' ? 'inches' : 'centimetres'})`}
                placeholder={unit}
                className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
              <span className="font-mono">{unit}</span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {cd != null ? cd.toFixed(2) : '—'}
        </span>
        {cd != null && descentRate != null && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            at {fmtSpeed(descentRate, sys)} down · in the thinner air aloft
          </span>
        )}
      </div>

      {descentRate == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          No distinct drogue descent was read from this log (a single-deploy flight has none), so there&apos;s no drogue
          Cd to read.
        </p>
      ) : massKg == null || drogueM == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {massKg == null ? 'Set the descending mass (in Landing energy) ' : 'Enter '}
          {massKg == null ? 'and ' : ''}the drogue&apos;s diameter to read the drag coefficient it flew at, in the
          thinner air aloft.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Same force balance as the main (C<sub>d</sub> = 2·m·g / ρ·v²·A), on the drogue-phase descent rate. Approximate
          — a small drogue may not be fully at terminal velocity, so read it as a guide.
        </p>
      )}
    </section>
  );
}
