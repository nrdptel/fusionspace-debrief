'use client';

import { useState } from 'react';
import { ALWAYS_SHOWN } from '@/lib/reportProfile';
import { TOUCH_TARGET } from '@/lib/ui-tokens';
import { Card, Chip, IconButton } from './ui';

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
  onMove,
  where,
  noun,
}: {
  /** Every reading this flight (or comparison) can show, in the order it shows them. */
  labels: string[];
  hidden: string[];
  onToggle: (label: string) => void;
  /** Move one reading one place earlier or later. */
  onMove?: (label: string, delta: -1 | 1) => void;
  /** What the choice applies to here, named in the flyer's terms. */
  where: string;
  /** What this surface calls the thing being chosen for — a report, or a comparison. */
  noun: 'report' | 'comparison';
}) {
  const [open, setOpen] = useState(false);
  const off = labels.filter((l) => hidden.includes(l) && !ALWAYS_SHOWN.includes(l)).length;

  return (
    <details className="print:hidden" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        Choose what&apos;s in this {noun}
        {off > 0 && <Chip tone="accent" mono={false} value={`${off} off`} />}
      </summary>
      {open && (
        <Card className="mt-2">
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            {where} The choice is one choice — it applies to the flight report and the comparison
            alike, and is remembered on this device. The data exports (.csv, .json) always carry
            everything: a report is a document, a data file is a record.
          </p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {labels.map((label, i) => {
              const locked = ALWAYS_SHOWN.includes(label);
              const on = locked || !hidden.includes(label);
              return (
                <li key={label} className="flex items-center gap-1">
                  <label
                    className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${TOUCH_TARGET} ${
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
                  {/* Order is the other half of "this report is mine" — a certification
                      package leads with what the certification asks for. */}
                  {onMove && (
                    <span className="flex shrink-0 items-center">
                      <IconButton
                        onClick={() => onMove(label, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${label} earlier`}
                        title="Move earlier"
                        className="text-xs"
                      >
                        ▲
                      </IconButton>
                      <IconButton
                        onClick={() => onMove(label, 1)}
                        disabled={i === labels.length - 1}
                        aria-label={`Move ${label} later`}
                        title="Move later"
                        className="text-xs"
                      >
                        ▼
                      </IconButton>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </details>
  );
}
