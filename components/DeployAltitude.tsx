'use client';

import { useMemo } from 'react';
import { convert } from '@/lib/units';
import { UNIT_LABEL, lengthIn, fmtLength } from '@/lib/display';
import type { UnitSystem } from '@/lib/display';
import { deployCheck, DEPLOY_SLOP_M, MAX_REASONABLE_DEPLOY_M } from '@/lib/deploy';

function plain(v: number, places: number): string {
  const f = Math.pow(10, places);
  return String(Math.round(v * f) / f);
}

/**
 * Main-deploy altitude check — on a dual-deploy flight the altimeter fires the
 * main at a set altitude. Debrief measured the altitude it actually fired at, so
 * it shows that and, given the altitude you set, reads off how close the two were
 * (and how far the rocket fell under drogue first). A reading of the flown flight,
 * the answer to "did my main fire where I told it to." The set altitude is owned by
 * the report (so it can ride into the exports); this component is controlled.
 */
export default function DeployAltitude({
  mainAltitudeM,
  apogeeAltitudeM,
  sys,
  setM,
  onSetM,
}: {
  mainAltitudeM: number;
  apogeeAltitudeM: number;
  sys: UnitSystem;
  setM: number | null;
  onSetM: (m: number | null) => void;
}) {
  const unit = UNIT_LABEL[sys].length;
  const setField = setM == null ? '' : plain(lengthIn(setM, sys), 0);

  const onSet = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      onSetM(null);
      return;
    }
    onSetM(Math.min(convert(n, unit, 'm'), MAX_REASONABLE_DEPLOY_M));
  };

  const check = useMemo(() => (setM != null ? deployCheck(mainAltitudeM, setM) : null), [setM, mainAltitudeM]);
  // How far the rocket fell under drogue (or unreefed) before the main — apogee to
  // the main-deploy altitude, a measured fact worth seeing on its own.
  const drogueFallM = Math.max(0, apogeeAltitudeM - mainAltitudeM);
  const slopDisp = Math.round(lengthIn(DEPLOY_SLOP_M, sys));

  return (
    <section
      aria-labelledby="deploy-altitude-heading"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="deploy-altitude-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Main deploy altitude
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Where the main actually fired, read from the flight. Enter the altitude you set on the altimeter to check it.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Set altitude</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={sys === 'imperial' ? 50 : 10}
              value={setField}
              onChange={(e) => onSet(e.target.value)}
              aria-label={`Set main deploy altitude (${unit})`}
              placeholder={unit}
              className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            />
            <span className="font-mono">{unit}</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {fmtLength(mainAltitudeM, sys)}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          main fired · {fmtLength(drogueFallM, sys)} of drogue descent first
        </span>
      </div>

      {check != null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {check.when === 'on' ? (
            <>
              That&apos;s within {slopDisp} {unit} of the {setField} {unit} you set — fired right on the mark.
            </>
          ) : check.when === 'high' ? (
            <>
              The main fired about {fmtLength(check.offsetM, sys)} <strong>higher</strong> than the {setField} {unit} you
              set — earlier than asked, so a longer, softer descent but more drift.
            </>
          ) : (
            <>
              The main fired about {fmtLength(-check.offsetM, sys)} <strong>lower</strong> than the {setField} {unit} you
              set — later than asked, so less time to slow before landing; worth a look if it was well under.
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Enter the main-deploy altitude you set on the altimeter to check the firing against it. Kept on this device.
        </p>
      )}
    </section>
  );
}
