'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtSpeed, systemOf } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { parachuteCd, chuteDiameterToM, CHUTE_LEN_TO_M, MAX_REASONABLE_CHUTE_M } from '@/lib/parachute';
import { Card, NumberField, Readout } from './ui';

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
 *
 * **`wholeDescent` is the basis, and this panel is the last surface that was publishing
 * without it.** `landingRate` falls back to the apogee-to-ground average when no
 * deployment change is in the record, and on the corpus that fallback carries **23 of the
 * 38 flights that land in their own record** — 61%. `LandingEnergy` one card up has
 * branched on `landingRateIsWholeDescent` since it was written, and the saved `.txt`/`.md`/
 * `.html` row says it too; this card said "from its terminal descent" and "at X terminal"
 * over the same figure, which is the caveat-here-confident-claim-there shape `MAINTAINING.md`
 * calls worse than either alone. It matters more here than next door, because energy goes as
 * v² and a Cd goes as 1/v²: an average inflated by an unresolved drogue leg pushes the Cd
 * DOWN, so the number reads low and the direction is known even where the size is not.
 */
export default function ParachuteCd({
  descentRate,
  wholeDescent,
  airDensity,
  sys,
  massKg,
}: {
  descentRate: number | null;
  /** True when `descentRate` is the whole descent averaged rather than a resolved main leg.
   *  Decided by `landingRateIsWholeDescent` at the call site, never re-derived here — the
   *  rule lives in one place so two panels cannot answer it differently. */
  wholeDescent: boolean;
  airDensity: number;
  sys: UnitChoice;
  /** Descending mass (kg), owned by the report and shared with landing energy. */
  massKg: number | null;
}) {
  const [chuteM, setChuteM] = useState<number | null>(null);

  useEffect(() => {
    setChuteM(readNum(CHUTE_KEY, MAX_REASONABLE_CHUTE_M));
  }, []);

  const chuteUnit = systemOf(sys) === 'imperial' ? 'in' : 'cm';
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
    <Card
      as="section"
      aria-labelledby="parachute-cd-heading"
      className={cd == null ? 'print:hidden' : ''}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="parachute-cd-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Parachute Cd (measured)
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {wholeDescent
              ? 'How the recovery system actually performed, from the descent this record holds. Enter the descending mass and canopy diameter.'
              : 'How your main actually performed, from its terminal descent. Enter the descending mass and canopy diameter.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NumberField
            label="Canopy diameter"
            unit={chuteUnit}
            ariaLabel={`Canopy diameter (${chuteUnit === 'in' ? 'inches' : 'centimetres'})`}
            value={chuteField}
            onChange={onChute}
            min={0}
            max={MAX_REASONABLE_CHUTE_M / CHUTE_LEN_TO_M[chuteUnit]}
            step={1}
            placeholder={chuteUnit}
          />
        </div>
      </div>

      <Readout
        size="hero"
        layout="inline"
        className="mt-3"
        value={cd != null ? cd.toFixed(2) : '—'}
        sub={
          cd != null &&
          descentRate != null && (
            <>
              at {fmtSpeed(descentRate, sys)} {wholeDescent ? 'over the whole descent' : 'terminal'} · rule of thumb
              ~0.75 flat sheet, ~1.5 domed
            </>
          )
        }
      />

      {/* The basis, stated where the number is read rather than left to the card above.
          Only the DIRECTION is claimed: a whole-descent average that includes an unresolved
          drogue leg is faster than the main leg alone, and Cd goes as 1/v², so the figure is
          a floor. The SIZE is not claimable — the record resolved no main leg, so there is no
          counterfactual rate in it to measure the gap against, and naming one would be the
          false precision this panel is being fixed for. */}
      {cd != null && wholeDescent && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Averaged over the whole descent — no deployment change is in this record, so this is not a terminal main rate.
          If the flight flew a drogue Debrief could not resolve, the rate is the faster of the two legs and this C
          <sub>d</sub> reads <span className="font-medium">low</span>.
        </p>
      )}

      {descentRate == null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No steady main descent was read from this log, so there&apos;s no terminal velocity to read a Cd from.
        </p>
      ) : massKg == null || chuteM == null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
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
    </Card>
  );
}
