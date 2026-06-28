'use client';

import { useEffect, useState } from 'react';
import type { RecentMeta } from '@/lib/recents';
import type { UnitSystem } from '@/lib/display';
import { fmtLength, fmtSpeed } from '@/lib/display';
import { MAX_COMPARE } from '@/lib/compare';
import { sortRecents, personalBests, type LogbookSort } from '@/lib/logbook';

const SORTS: { key: LogbookSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'apogee', label: 'Apogee' },
  { key: 'speed', label: 'Speed' },
];

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
  onCompare,
  onNote,
}: {
  recents: RecentMeta[];
  sys: UnitSystem;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: (ids: string[]) => void;
  onNote: (id: string, note: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<LogbookSort>('recent');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setDraft(current);
  };
  const saveEdit = () => {
    if (editingId) onNote(editingId, draft.trim());
    setEditingId(null);
  };

  // Drop a selected id once its flight leaves the list, so the cap math (which
  // counts the raw set) can't drift out of step with what's actually selectable.
  const presentKey = recents.map((r) => r.id).join(',');
  useEffect(() => {
    const ids = new Set(presentKey ? presentKey.split(',') : []);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [presentKey]);

  if (recents.length === 0) return null;

  const present = new Set(recents.map((r) => r.id));
  const chosen = [...selected].filter((id) => present.has(id));
  const atCap = chosen.length >= MAX_COMPARE;

  const ordered = sortRecents(recents, sort);
  const bests = personalBests(recents);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => present.has(k)));
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          Recent flights
        </h2>
        <div className="flex items-center gap-3">
          {chosen.length >= 2 && (
            <button
              type="button"
              onClick={() => onCompare(chosen)}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500"
            >
              Compare {chosen.length} flights
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirming) {
                onClear();
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
            onBlur={() => setConfirming(false)}
            className={`text-xs font-medium ${
              confirming
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {confirming ? 'Clear all — tap to confirm' : 'Clear'}
          </button>
        </div>
      </div>

      {recents.length > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sort by</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={s.key === sort}
              className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                s.key === sort
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {ordered.map((r) => {
          const isSel = selected.has(r.id);
          const isApogeeBest = r.id === bests.apogeeId;
          const isSpeedBest = r.id === bests.speedId;
          return (
            <li
              key={r.id}
              className={`group rounded-lg border bg-white transition hover:border-indigo-400 dark:bg-zinc-900/40 dark:hover:border-indigo-500/60 ${
                r.note
                  ? 'border-zinc-200 border-l-2 border-l-indigo-400 dark:border-zinc-800 dark:border-l-indigo-500/60'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={!isSel && atCap}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.name} to compare`}
                  className="h-4 w-4 shrink-0 accent-indigo-600 disabled:opacity-40"
                />
                <button type="button" onClick={() => onOpen(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">{r.name}</span>
                  <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    {r.formatLabel}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400" title="Max velocity">
                    {isSpeedBest && (
                      <span className="mr-0.5 text-amber-500" title="Fastest of your remembered flights">
                        ★<span className="sr-only">fastest, </span>
                      </span>
                    )}
                    {r.maxVelocityMs != null ? fmtSpeed(r.maxVelocityMs, sys) : '—'}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400" title="Apogee">
                    {isApogeeBest && (
                      <span className="mr-0.5 text-amber-500" title="Highest of your remembered flights">
                        ★<span className="sr-only">highest, </span>
                      </span>
                    )}
                    {r.apogeeM != null ? fmtLength(r.apogeeM, sys) : '—'}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(r.addedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(r.id, r.note)}
                  aria-label={`${r.note ? 'Edit' : 'Add'} note for ${r.name}`}
                  title={r.note ? 'Edit note' : 'Add a note (keeps this flight in your logbook)'}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    r.note ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(r.id)}
                  aria-label={`Remove ${r.name} from recent flights`}
                  title="Remove"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>

              {editingId === r.id ? (
                <div className="flex items-center gap-2 px-3 pb-2">
                  <input
                    type="text"
                    autoFocus
                    value={draft}
                    maxLength={140}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      else if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={`Note for ${r.name}`}
                    placeholder="Motor, conditions, cert… (kept as a logbook entry)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-indigo-500"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-1.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                r.note && (
                  <button
                    type="button"
                    onClick={() => startEdit(r.id, r.note)}
                    className="block w-full px-3 pb-2 text-left text-xs italic text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    {r.note}
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Remembered on this device only — never uploaded. <span className="text-amber-500">★</span> marks
        your best; tick two or more to compare. Add a <span aria-hidden="true">✎</span> note (motor,
        conditions, cert…) to keep a flight as a logbook entry that won&apos;t be pruned.
      </p>
    </div>
  );
}
