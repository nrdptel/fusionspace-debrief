'use client';

import { useState } from 'react';
import { ALWAYS_SHOWN } from '@/lib/reportProfile';

/**
 * Which readings a report carries — the one control, used by every surface that lists
 * them. A flyer's answer to "what do I care about?" is about the flyer, not about which
 * page they happen to be on, so the flight report and the comparison share both this
 * component and the stored choice behind it.
 *
 * Mounted only while open: it repeats every reading's label, and a closed one would
 * otherwise leave a second copy of each in the page for anything reading it.
 */
export default function ReadingChooser({
  labels,
  hidden,
  onToggle,
  where,
}: {
  /** Every reading this flight (or comparison) can show, in the order it shows them. */
  labels: string[];
  hidden: string[];
  onToggle: (label: string) => void;
  /** What the choice applies to here, named in the flyer's terms. */
  where: string;
}) {
  const [open, setOpen] = useState(false);
  const off = labels.filter((l) => hidden.includes(l) && !ALWAYS_SHOWN.includes(l)).length;

  return (
    <details className="print:hidden" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="inline-flex cursor-pointer select-none items-center rounded-md px-1 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        Choose what&apos;s in this report
        {off > 0 && (
          <span className="ml-1.5 rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">
            {off} off
          </span>
        )}
      </summary>
      {open && (
        <div className="mt-2 rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <p className="mb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
            {where} The choice is one choice — it applies to the flight report and the comparison
            alike, and is remembered on this device. The data exports (.csv, .json) always carry
            everything: a report is a document, a data file is a record.
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {labels.map((label) => {
              const locked = ALWAYS_SHOWN.includes(label);
              const on = locked || !hidden.includes(label);
              return (
                <li key={label}>
                  <label
                    className={`flex min-h-11 items-center gap-2 text-xs sm:min-h-0 ${
                      locked ? 'text-zinc-400 dark:text-zinc-500' : 'cursor-pointer text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked}
                      onChange={() => onToggle(label)}
                      className="h-4 w-4 shrink-0 accent-indigo-600 disabled:opacity-40"
                    />
                    <span className="truncate" title={locked ? 'Every flight report has an apogee' : label}>
                      {label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </details>
  );
}
