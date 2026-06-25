'use client';

import type { RecentMeta } from '@/lib/recents';
import type { UnitSystem } from '@/lib/display';
import { fmtLength } from '@/lib/display';

function relativeTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function RecentFlights({
  recents,
  sys,
  onOpen,
  onRemove,
  onClear,
}: {
  recents: RecentMeta[];
  sys: UnitSystem;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (recents.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          Recent flights
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Clear
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {recents.map((r) => (
          <li
            key={r.id}
            className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-indigo-500/60"
          >
            <button type="button" onClick={() => onOpen(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">{r.name}</span>
              <span className="hidden shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 sm:inline">
                {r.formatLabel}
              </span>
              <span className="ml-auto shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {r.apogeeM != null ? fmtLength(r.apogeeM, sys) : '—'}
              </span>
              <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{relativeTime(r.addedAt)}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(r.id)}
              aria-label={`Remove ${r.name} from recent flights`}
              title="Remove"
              className="shrink-0 rounded-md px-1.5 text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Remembered on this device only — never uploaded.
      </p>
    </div>
  );
}
