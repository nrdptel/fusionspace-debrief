'use client';

import { useEffect, useMemo, useState } from 'react';
import { delayCheck, MAX_REASONABLE_DELAY_S, APOGEE_SLOP_S } from '@/lib/ejection';
import { fmtTime } from '@/lib/display';

const DELAY_KEY = 'debrief.delay.s';

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
 * Ejection-delay check — for a motor-ejection flight, the ideal motor delay is
 * the coast time (burnout → apogee), the interval the rocket spends slowing to a
 * stop. Debrief already measures that; this frames it as the delay to load and
 * lets you check the printed delay you actually flew against it. A reading of the
 * flown flight, not a prediction: "was my delay right, and by how much."
 */
export default function EjectionDelay({ coastTimeS }: { coastTimeS: number }) {
  const [delayS, setDelayS] = useState<number | null>(null);

  useEffect(() => {
    setDelayS(readNum(DELAY_KEY, MAX_REASONABLE_DELAY_S));
  }, []);

  const delayField = delayS == null ? '' : String(delayS);

  const onDelay = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setDelayS(null);
      store(DELAY_KEY, null);
      return;
    }
    const s = Math.min(n, MAX_REASONABLE_DELAY_S);
    setDelayS(s);
    store(DELAY_KEY, s);
  };

  const check = useMemo(() => (delayS != null ? delayCheck(delayS, coastTimeS) : null), [delayS, coastTimeS]);

  return (
    <section
      aria-labelledby="ejection-delay-heading"
      // Nothing to print until a delay is entered; the ideal delay alone is in the
      // metrics already. Once it computes the offset, it prints with the report.
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${
        check == null ? 'print:hidden' : ''
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="ejection-delay-heading" className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Ejection delay
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            The ideal motor delay for this flight is the coast time — the time it spent slowing to apogee. Enter the
            delay you flew to see how close it landed to apogee.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Delay flown</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={delayField}
              onChange={(e) => onDelay(e.target.value)}
              aria-label="Motor delay flown (seconds)"
              placeholder="s"
              className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            />
            <span className="font-mono">s</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {fmtTime(coastTimeS)}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">ideal delay (coast to apogee)</span>
      </div>

      {check != null ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {check.when === 'at' ? (
            <>
              A {delayField}s delay would have fired within {APOGEE_SLOP_S}s of apogee — right on the mark.
            </>
          ) : check.when === 'after' ? (
            <>
              A {delayField}s delay fires about {fmtTime(check.offsetS)} <strong>after</strong> apogee — by then the
              rocket has tipped over and is falling, deploying nose-down. A shorter delay would be gentler.
            </>
          ) : (
            <>
              A {delayField}s delay fires about {fmtTime(-check.offsetS)} <strong>before</strong> apogee — still
              climbing fast, the riskiest case for the recovery gear. A longer delay would let it slow further.
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          For a motor-ejection flight, enter the printed motor delay you flew (e.g. the 6 in a C6-<strong>6</strong>) to
          see how far before or after apogee its charge fired. Kept on this device.
        </p>
      )}
    </section>
  );
}
