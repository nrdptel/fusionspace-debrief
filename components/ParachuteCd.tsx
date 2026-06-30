'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UnitSystem } from '@/lib/display';
import { fmtSpeed } from '@/lib/display';
import { parachuteCd, chuteDiameterToM, CHUTE_LEN_TO_M, MAX_REASONABLE_CHUTE_M } from '@/lib/parachute';

const CHUTE_KEY = 'debrief.chute.m';

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
 * Parachute drag coefficient, measured — under a steady main the rocket is at
 * terminal velocity, so drag balances weight and the canopy's Cd falls out of the
 * flown descent rate (Cd = 2·m·g / ρv²A). A reading of how the chute performed,
 * not a prediction; the flier supplies the descending mass (shared with landing
 * energy) and the canopy diameter, the rest is from the recording.
 */
export default function ParachuteCd({
  descentRate,
  airDensity,
  sys,
  massKg,
}: {
  descentRate: number | null;
  airDensity: number;
  sys: UnitSystem;
  /** Descending mass (kg), owned by the report and shared with landing energy. */
  massKg: number | null;
}) {
  const [chuteM, setChuteM] = useState<number | null>(null);

  useEffect(() => {
    setChuteM(readNum(CHUTE_KEY, MAX_REASONABLE_CHUTE_M));
  }, []);

  const chuteUnit = sys === 'imperial' ? 'in' : 'cm';
  const chuteField = chuteM == null ? '' : plain(chuteM / CHUTE_LEN_TO_M[chuteUnit], 0);

  const onChute = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setChuteM(null);
      store(CHUTE_KEY, null);
      return;
    }
    const m = Math.min(chuteDiameterToM(n, chuteUnit), MAX_REASONABLE_CHUTE_M);
    setChuteM(m);
    store(CHUTE_KEY, m);
  };

  const cd = useMemo(
    () => (massKg != null && chuteM != null ? parachuteCd(massKg, chuteM, descentRate, airDensity) : null),
    [massKg, chuteM, descentRate, airDensity],
  );

  return (
    <section
      aria-labelledby="parachute-cd-heading"
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${
        cd == null ? 'print:hidden' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="parachute-cd-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Parachute Cd (measured)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            How your main actually performed, from its terminal descent. Enter the descending mass and canopy diameter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Canopy diameter</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={chuteField}
                onChange={(e) => onChute(e.target.value)}
                aria-label={`Canopy diameter (${chuteUnit === 'in' ? 'inches' : 'centimetres'})`}
                placeholder={chuteUnit}
                className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
              <span className="font-mono">{chuteUnit}</span>
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
            at {fmtSpeed(descentRate, sys)} terminal · rule of thumb ~0.75 flat sheet, ~1.5 domed
          </span>
        )}
      </div>

      {descentRate == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          No steady main descent was read from this log, so there&apos;s no terminal velocity to read a Cd from.
        </p>
      ) : massKg == null || chuteM == null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {massKg == null ? 'Set the descending mass (in Landing energy) ' : 'Enter '}
          {massKg == null ? 'and ' : ''}the main canopy&apos;s diameter to read the drag coefficient it actually flew
          at. Check it against the C<sub>d</sub> your sizing assumed.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          From the force balance at terminal velocity (drag = weight): C<sub>d</sub> = 2·m·g / (ρ·v²·A), with A the
          canopy area. Assumes the main reached a steady rate.
        </p>
      )}
    </section>
  );
}
