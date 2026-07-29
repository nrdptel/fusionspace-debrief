'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecentMeta } from '@/lib/recents';
import { fmtLength, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { MAX_COMPARE } from '@/lib/compare';
import { UNNOTED_MAX } from '@/lib/recents';
import { sortRecents, filterRecents, personalBests, logbookRowNames, type LogbookSort } from '@/lib/logbook';
import { formatFlownAt } from '@/lib/flight/flownAt';

/** Below this the list is short enough to read at a glance, so a search box would be
 *  chrome earning nothing. Above it, finding one flight by eye starts to cost. */
const SEARCH_FROM = 4;

const SORTS: { key: LogbookSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'flown', label: 'Flown' },
  { key: 'apogee', label: 'Apogee' },
  { key: 'speed', label: 'Speed' },
];

/** The pruned flights, by name, with repeats counted rather than repeated. Two flights can
 *  share a file name now, so a launch day of `data.csv` files used to read "3 flights were
 *  forgotten: data.csv, data.csv, data.csv" — a list whose whole job is telling the flyer
 *  WHAT they lost while they can still do something about it. */
function namesWithCounts(names: string[]): string {
  const counts = names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>());
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

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
  onExport,
  onImport,
  forgotten = [],
  onDismissForgotten,
}: {
  recents: RecentMeta[];
  sys: UnitChoice;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: (ids: string[]) => void;
  onNote: (id: string, note: string) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<number>;
  /** Flights the last drop pushed out to make room. Named rather than left to be noticed by
   *  counting — a launch day's folder is most of the un-noted window, so the third day used
   *  to quietly eat the first. */
  forgotten?: string[];
  onDismissForgotten?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<LogbookSort>('recent');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again
    if (!file) return;
    setImportMsg('Restoring…');
    const n = await onImport(file);
    setImportMsg(
      n > 0
        ? `Restored ${n} flight${n === 1 ? '' : 's'}.`
        : 'No flights found in that file — is it a Debrief logbook export?',
    );
  };

  // A hidden picker, shared by the header Import button and the empty-state
  // "Restore it" link, so a backup can be brought back even on a fresh device.
  const filePicker = (
    <input
      ref={fileRef}
      type="file"
      accept=".json,application/json"
      onChange={onImportChange}
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
    />
  );

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

  if (recents.length === 0) {
    return (
      <div className="mt-8">
        {filePicker}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Flights you open are remembered here on this device — never uploaded. Got a logbook backup
          from another machine?{' '}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Restore it
          </button>
          .
        </p>
        {importMsg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{importMsg}</p>}
      </div>
    );
  }

  const present = new Set(recents.map((r) => r.id));
  const chosen = [...selected].filter((id) => present.has(id));
  const atCap = chosen.length >= MAX_COMPARE;

  const ordered = sortRecents(filterRecents(recents, query), sort);
  // Crowned against the whole logbook, not the filtered view: a personal best is a best
  // whether or not the search happens to be showing the flight it beat.
  const bests = personalBests(recents);
  const searchable = recents.length >= SEARCH_FROM;
  const filtering = searchable && query.trim().length > 0;

  // Two flights CAN now share a file name — plenty of loggers write every export under one
  // fixed name, and the logbook keeps them apart by their contents rather than collapsing
  // them. The row already paints what tells them apart; its three controls named the flight
  // by file name alone, which left a screen reader three pairs of identically-named buttons
  // that do different things. Only the repeated names pay for the longer label.
  const rowNames = logbookRowNames(recents, (m) => fmtLength(m, sys), relativeTime);
  const rowName = (r: RecentMeta) => rowNames.get(r.id) ?? r.name;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => present.has(k)));
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  };

  // How much of the un-noted window is spoken for. A noted flight is a logbook entry and is
  // kept, so it doesn't count against this — which is exactly the thing worth knowing before
  // the next launch day fills the rest.
  const unnoted = recents.filter((r) => !r.note).length;
  const nearlyFull = unnoted >= UNNOTED_MAX - 2;

  return (
    <div className="mt-8">
      {filePicker}
      {/* What the last drop cost, named. The prune has always run; saying nothing about it
          meant a flyer found out by counting, days later, with nothing to do about it. */}
      {forgotten.length > 0 && (
        <div
          role="status"
          className="mb-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p>
            <strong className="font-medium">
              {forgotten.length === 1 ? 'One flight was' : `${forgotten.length} flights were`} forgotten
            </strong>{' '}
            to make room: <span className="font-mono">{namesWithCounts(forgotten)}</span>. The logbook keeps the
            last {UNNOTED_MAX} un-noted flights on this device — add a{' '}
            <span aria-hidden="true">✎</span> note to a flight and it stays for good.
          </p>
          {onDismissForgotten && (
            <button
              type="button"
              onClick={onDismissForgotten}
              className="mt-1.5 font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
            >
              Got it
            </button>
          )}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          Recent flights
          {/* How full the un-noted window is, stated where the flyer decides what to keep —
              rather than only in a sentence under the list, and only ever in the past tense.
              Quiet until it is nearly full, loud enough to act on when it is: a launch day's
              folder is six files, half the window. */}
          <span
            className={`ml-2 font-normal ${nearlyFull ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}
            title={`The logbook keeps the last ${UNNOTED_MAX} flights you haven't noted. A noted flight is kept for good and doesn't use a slot.`}
          >
            {unnoted}/{UNNOTED_MAX} un-noted
          </span>
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
            onClick={onExport}
            title="Download your logbook (flights + notes) as a backup file"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Restore flights from a logbook backup file"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Import
          </button>
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

      {searchable && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="logbook-search" className="sr-only">
            Search your flights
          </label>
          <input
            id="logbook-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, logger or note…"
            className="min-h-[2.25rem] w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {filtering && (
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400" role="status">
              {ordered.length} of {recents.length}
            </span>
          )}
        </div>
      )}

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

      {/* Named, so assistive tech (and a test) can tell the logbook from the page's other lists. */}
      <ul aria-label="Your flights" className="mt-3 space-y-2">
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
                {/* The tick is the control the whole comparison journey starts with, and a
                    bare 20 px checkbox is the one interactive element the global touch floor
                    cannot reach: `@media (pointer: coarse)` in globals.css exempts
                    input[type=checkbox] on purpose, because stretching the BOX to 44 px would
                    draw a giant square. So the label carries the tap area instead — 44 px of
                    it, pulled back by an equal negative margin so the row lays out exactly as
                    before and the tick still draws at 20 px. Above sm: a pointer device needs
                    none of it and the wrapper dissolves. */}
                <label className="-m-3 flex shrink-0 cursor-pointer items-center justify-center p-3 sm:m-0 sm:cursor-auto sm:p-0">
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={!isSel && atCap}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${rowName(r)} to compare`}
                    className="h-5 w-5 shrink-0 accent-indigo-600 disabled:opacity-40 sm:h-4 sm:w-4"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 py-1 text-left sm:min-h-0 sm:flex-row sm:items-center sm:gap-3 sm:py-0"
                >
                  {/* Below sm: the name gets the line to itself — telling one flight from
                      another is what the row is for — and everything that describes it
                      wraps underneath. Above sm: both wrappers dissolve (`contents`) back
                      into the one dense row. */}
                  <span className="flex min-w-0 sm:contents">
                  {/* Wrapped rather than truncated: at 390 px this cell is 188 px, and four
                      recordings of one flight painted the identical "mercury__altimetercloud"
                      — one distinct name out of four, on the surface you tick a flight from.
                      The line above says telling one flight from another is what the row is
                      for; a single clipped line is what stopped it doing that. */}
                  <span className="line-clamp-2 font-mono text-sm break-all text-zinc-700 dark:text-zinc-300 sm:line-clamp-none sm:truncate">
                    {r.name}
                  </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:contents">
                  <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    {r.formatLabel}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-zinc-500 sm:ml-auto dark:text-zinc-400" title="Max velocity">
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
                  {/* The launch day where the file states it — that's what a logbook entry
                      is about. Only when the file says nothing does the row fall back to
                      when it was opened here, which is a fact about this device. */}
                  <span
                    className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
                    title={r.flownAt ? `Flew ${formatFlownAt(r.flownAt)}` : `Opened ${relativeTime(r.addedAt)}`}
                  >
                    {r.flownAt ? formatFlownAt(r.flownAt).replace(/,.*$/, '') : relativeTime(r.addedAt)}
                  </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(r.id, r.note)}
                  aria-label={`${r.note ? 'Edit' : 'Add'} note for ${rowName(r)}`}
                  title={r.note ? 'Edit note' : 'Add a note (keeps this flight in your logbook)'}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition hover:bg-zinc-100 sm:h-7 sm:w-7 dark:hover:bg-zinc-800 ${
                    r.note ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(r.id)}
                  aria-label={`Remove ${rowName(r)} from recent flights`}
                  title="Remove"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
      {filtering && ordered.length === 0 && (
        <p className="mt-3 rounded-md border border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          No flight here matches “{query.trim()}”. Names, the logger a flight came off, and your own
          notes are searched.{' '}
          <button
            type="button"
            onClick={() => setQuery('')}
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Show all {recents.length}
          </button>
          .
        </p>
      )}
      {importMsg && <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">{importMsg}</p>}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Remembered on this device only — never uploaded. <span className="text-amber-500">★</span> marks
        your best; tick two or more to compare. Add a <span aria-hidden="true">✎</span> note (motor,
        conditions, cert…) to keep a flight as a logbook entry that won&apos;t be pruned.{' '}
        <strong className="font-medium text-zinc-600 dark:text-zinc-300">Export</strong> backs the whole
        logbook up to a file you keep; <strong className="font-medium text-zinc-600 dark:text-zinc-300">Import</strong>{' '}
        restores it on another machine.
      </p>
    </div>
  );
}
