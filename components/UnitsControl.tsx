'use client';

import {
  SYSTEM_UNITS,
  isSystem,
  systemOf,
  unitsOf,
  type AccelUnit,
  type LengthUnit,
  type PressureUnit,
  type SpeedUnit,
  type TempUnit,
  type UnitChoice,
  type Units,
} from '@/lib/display';

// Units, the way the mature tools do it: one click for the system a flyer works in,
// and a choice per quantity underneath for the cases the two systems don't cover — a US
// club quotes altitude in feet and speed in mph, a cert document may want metres with
// m/s, a school project °C, a drag write-up m/s² instead of g. The button stays the fast
// path (and stays a plain feet/metres toggle); the panel refines it.

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800';

const CHOICES: {
  key: keyof Units;
  label: string;
  options: readonly string[];
}[] = [
  { key: 'length', label: 'Altitude', options: ['ft', 'm'] satisfies readonly LengthUnit[] },
  { key: 'speed', label: 'Speed', options: ['ft/s', 'mph', 'm/s', 'km/h', 'kt'] satisfies readonly SpeedUnit[] },
  { key: 'accel', label: 'Acceleration', options: ['g', 'm/s²', 'ft/s²'] satisfies readonly AccelUnit[] },
  { key: 'temp', label: 'Temperature', options: ['°F', '°C'] satisfies readonly TempUnit[] },
  { key: 'pressure', label: 'Pressure', options: ['psi', 'kPa'] satisfies readonly PressureUnit[] },
];

/** What the toggle button says: the named system, or "custom" once any one quantity
 *  has been set away from it. */
export function unitsLabel(sys: UnitChoice): string {
  if (isSystem(sys, 'imperial')) return 'feet';
  if (isSystem(sys, 'metric')) return 'meters';
  return 'custom';
}

export default function UnitsControl({
  sys,
  onToggleUnits,
  onSetUnits,
}: {
  sys: UnitChoice;
  /** The fast path: switch the whole set between feet and metres. */
  onToggleUnits: () => void;
  onSetUnits: (units: Units) => void;
}) {
  const current = unitsOf(sys);
  const label = unitsLabel(sys);
  const other = systemOf(sys) === 'imperial' ? 'meters' : 'feet';

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleUnits}
        aria-label={`Units: ${label}. Switch to ${other}.`}
        className={ACTION_BTN}
      >
        Units: {label}
      </button>
      <details className="group relative print:hidden">
        <summary
          className="cursor-pointer select-none rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Choose the unit for each quantity — altitude, speed, acceleration, temperature and pressure"
        >
          per quantity
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="space-y-2">
            {CHOICES.map((c) => (
              <label key={c.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-600 dark:text-zinc-400">{c.label}</span>
                <select
                  value={current[c.key]}
                  onChange={(e) => onSetUnits({ ...current, [c.key]: e.target.value } as Units)}
                  className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {c.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => onSetUnits(SYSTEM_UNITS.imperial)}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              All feet
            </button>
            <button
              type="button"
              onClick={() => onSetUnits(SYSTEM_UNITS.metric)}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              All metric
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Applies to every number, chart and export, and is remembered on this device.
          </p>
        </div>
      </details>
    </span>
  );
}
