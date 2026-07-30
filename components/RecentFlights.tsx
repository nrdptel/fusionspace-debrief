'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecentMeta } from '@/lib/recents';
import { fmtLength, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { CROSS_CHECK_WIDE, MAX_COMPARE } from '@/lib/compare';
import { UNNOTED_MAX } from '@/lib/recents';
import { sortRecents, filterRecents, personalBests, logbookRowNames, type LogbookSort } from '@/lib/logbook';
import { groupRecordings, planGrouping, planJoin, planSeparation, recordingSpread, type FlightGroup } from '@/lib/flightGroups';
import { copyTable } from '@/lib/copyTable';
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
  onGroup,
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
  onExport: () => void | Promise<number>;
  onImport: (file: File) => Promise<number>;
  /** Say which flight some rows are recordings of — the flyer's own statement that two files
   *  are one flight flown on two altimeters, or (with `flightId: null`) that they are not. */
  onGroup: (changes: { id: string; flightId: string | null }[]) => void | Promise<void>;
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
  const [copyMsg, setCopyMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  /** Which flights have their recordings showing. A flight recorded once has nothing to show,
   *  so this is empty for nearly every logbook. */
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

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

  // Drop a selected id once its FLIGHT leaves the list, so the cap math (which counts the raw
  // set) can't drift out of step with what's actually selectable. Keyed on the flights the list
  // shows rather than on the rows the logbook holds: a tick outlives its row when the flyer
  // nominates a different recording — the row moves to that recording's id and the old one
  // becomes a hidden recording — and the header went on counting a tick nobody could see or
  // untick.
  const presentKey = groupRecordings(recents)
    .map((g) => g.id)
    .join(',');
  useEffect(() => {
    const ids = new Set(presentKey ? presentKey.split(',') : []);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [presentKey]);

  // Disarm the clear-confirm whenever the list it is about changes. Two things went wrong
  // without this, and the `onBlur` the old same-button confirm carried had covered both by
  // accident. The panel states a COUNT and calls out the noted flights, so removing a row with
  // ✕ rewrote the sentence under the flyer mid-read. And emptying the list took the panel off
  // screen without unmounting the component, so `confirming` stayed true — and a restore, which
  // is the opposite of deleting, brought the armed red panel straight back with it.
  useEffect(() => {
    setConfirming(false);
    setExportMsg('');
  }, [presentKey]);

  // Focus the panel's SAFE control when it opens, so a keyboard or screen-reader flyer lands
  // inside the thing that just appeared rather than being left on the trigger — and lands on
  // "Keep them", never on the destructive one.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

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

  // The list shows FLIGHTS, not files. A flyer with a primary and a backup altimeter brings
  // home two recordings of one flight, and once they have said so this is one row with its
  // recordings underneath — counted once, sorted once, crowned once.
  const flights = groupRecordings(recents);
  const flightById = new Map(flights.map((g) => [g.id, g]));
  /** Which flight each row belongs to, so a search that matches a SECONDARY recording still
   *  finds the flight. Searching "1785" for the backup altimeter's file should not come back
   *  empty because the flight is reported by 1784. */
  const flightOfRow = new Map<string, string>();
  for (const g of flights) for (const r of g.recordings) flightOfRow.set(r.id, g.id);

  const matched = filterRecents(recents, query);
  const matchedFlights = new Set(matched.map((r) => flightOfRow.get(r.id)!));
  /** Flights the search found only through a recording that is not the one on the row. Their
   *  recordings are shown open, because a result whose visible row contains nothing the flyer
   *  typed reads as a broken search. */
  const matchedInside = new Set(
    matched.filter((r) => flightOfRow.get(r.id) !== r.id).map((r) => flightOfRow.get(r.id)!),
  );
  const ordered = sortRecents(
    flights.filter((g) => matchedFlights.has(g.id)).map((g) => g.primary),
    sort,
  );
  const groupOfRow = (r: RecentMeta): FlightGroup => flightById.get(r.id) ?? { id: r.id, primary: r, recordings: [r] };
  // Crowned against the whole logbook, not the filtered view: a personal best is a best
  // whether or not the search happens to be showing the flight it beat.
  const bests = personalBests(recents);
  /** The ticked FLIGHTS. Only a flight row carries a tick, but a tick can outlive its row —
   *  nominating a different recording moves the row to another id — so this is filtered to
   *  what is actually on screen rather than to what is merely still in the logbook. */
  const chosenFlights = chosen.filter((id) => flightById.has(id));
  const canJoin = chosenFlights.length >= 2;
  const searchable = flights.length >= SEARCH_FROM;
  const filtering = searchable && query.trim().length > 0;

  // Two flights CAN now share a file name — plenty of loggers write every export under one
  // fixed name, and the logbook keeps them apart by their contents rather than collapsing
  // them. The row already paints what tells them apart; its three controls named the flight
  // by file name alone, which left a screen reader three pairs of identically-named buttons
  // that do different things. Only the repeated names pay for the longer label.
  // Named over the flights the list SHOWS, not over every row the logbook holds. Four
  // identically-named AltimeterCloud files that are one flight paint one row; disambiguating
  // against all four qualified that row with an apogee from a recording that is not on screen,
  // and numbered it "1 of 2" against a second row nobody could see.
  const rowNames = logbookRowNames(flights.map((g) => g.primary), (m) => fmtLength(m, sys), relativeTime);
  const rowName = (r: RecentMeta) => rowNames.get(r.id) ?? r.name;

  /** A note belongs to the FLIGHT, and the flyer writes it on the row. Nominating a different
   *  recording moves the row, so a note written before that would simply vanish from the screen
   *  with nothing saying where it went — and the prune, which keeps a noted flight, would still
   *  be reading it. So the row shows whichever recording carries one, preferring the one that
   *  reports the flight, and ✎ edits THAT recording rather than always the primary. */
  const noteOf = (g: FlightGroup): { id: string; note: string } => {
    const holder = g.recordings.find((r) => r.note) ?? g.primary;
    return { id: holder.id, note: holder.note };
  };
  /** A flight is un-noted only when none of its recordings carries a note — the same rule the
   *  prune keeps a flight by. Counting rows charged a two-altimeter flight two slots of a
   *  window the heading states as twelve FLIGHTS. */
  const flightNotes = flights.map((g) => noteOf(g).note);

  // The logbook as a table, on the clipboard. Everything here could already be DOWNLOADED as a
  // backup, and for a while that was the whole answer — but a backup is a restore file, not a
  // season a flyer can read. The alternative these flights come from is a spreadsheet, and a
  // spreadsheet's answer to "I want these numbers over there" is select, copy, paste. The
  // report's readings, the sample table and the comparison have each shared `copyTable` for
  // exactly this; the logbook was the one table you could not get out.
  //
  // What is copied is what is ON SCREEN — the current sort, and the current search — because
  // that is the selection the flyer just made, and copying a different set than the one they
  // are looking at is its own small betrayal.
  const copyLogbook = async () => {
    // A flight recorded twice is one row here, like it is on screen. The Flight column already
    // names the recording the figures are read from — that is what the row IS — so the extra
    // columns say what a cert document cannot get from it: how many instruments recorded this
    // flight, and which ones are not the one quoted. They only appear when a flight on screen
    // actually has more than one recording; nobody else pays for them.
    const anyGrouped = ordered.some((r) => groupOfRow(r).recordings.length > 1);
    const header = [
      'Flight',
      'Logger',
      'When',
      `Apogee (${sys === 'metric' ? 'm' : 'ft'})`,
      `Max speed (${sys === 'metric' ? 'm/s' : 'ft/s'})`,
      ...(anyGrouped ? ['Recordings', 'Also recorded by'] : []),
      'Note',
    ];
    const rows = ordered.map((r) => [
      r.name,
      r.formatLabel,
      r.flownAt ? formatFlownAt(r.flownAt) : `opened ${relativeTime(r.addedAt)}`,
      r.apogeeM != null ? fmtLength(r.apogeeM, sys) : '—',
      r.maxVelocityMs != null ? fmtSpeed(r.maxVelocityMs, sys) : '—',
      ...(anyGrouped ? [String(groupOfRow(r).recordings.length), groupOfRow(r).recordings.slice(1).map((x) => x.name).join('; ')] : []),
      r.note,
    ]);
    const ok = await copyTable(header, rows);
    setCopyMsg(
      ok
        ? `Copied ${rows.length === 1 ? '1 flight' : `${rows.length} flights`} — paste them into a spreadsheet, an email or a cert document.`
        : 'This browser wouldn’t let the page write to the clipboard. Export saves the whole logbook as a file instead.',
    );
  };

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
  const unnoted = flightNotes.filter((n) => !n).length;
  // The ones a flyer deliberately kept. Counted so the Clear confirm can say they go too —
  // "kept for good" is a rule about the PRUNE, and an explicit Clear takes them anyway.
  const noted = flights.length - unnoted;
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
            // The light/dark pair was inverted here — zinc-400 on white is 2.6:1 and amber-600
            // is 3.2:1, both under the 4.5:1 floor, while the dark side used the DARKER token on
            // a near-black page. No audit had ever reached this line: `/` is audited with an
            // empty logbook, so the whole list is off the page. zinc-500 is 4.8:1 and amber-700
            // is 5.0:1 on white, and the dark side takes the lighter token, as it does everywhere
            // else in this file.
            className={`ml-2 font-normal ${nearlyFull ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}
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
          {/* Two files, one flight. The alternative a redundant-altimeter flyer has today is
              two logbook entries for a flight they flew once — sorted apart, crowned apart,
              and counted twice by anything that counts flights. Only offered where the ticked
              rows are separate flights, so it never appears as a no-op. The order they are in
              on screen decides which reports the flight, and the row says so and can change
              it — Debrief does not pick a winner between two instruments. */}
          {canJoin && (
            <button
              type="button"
              onClick={async () => {
                // The whole rule lives in `planJoin`, so it is a unit test rather than a
                // click-path: every recording of every ticked flight moves, and the flight is
                // reported by the one opened first rather than the one that read highest.
                const plan = planJoin(chosenFlights.map((id) => flightById.get(id)!));
                await onGroup(plan);
                setSelected(new Set());
                if (plan.length) setOpened((prev) => new Set([...prev, plan[0].flightId]));
              }}
              title="Two altimeters, one flight — keep them as one logbook entry, each recording still read on its own"
              className="rounded-md border border-indigo-500 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              These {chosenFlights.length} are one flight
            </button>
          )}
          <button
            type="button"
            onClick={copyLogbook}
            title="Copy these flights to the clipboard — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Copy table
          </button>
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
            ref={clearRef}
            type="button"
            onClick={() => setConfirming((v) => !v)}
            aria-expanded={confirming}
            aria-controls="logbook-clear-confirm"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* The only irreversible control in the app, and the confirm used to be a SECOND CLICK ON
          THE SAME BUTTON in the same place — so a double-click on "Clear" destroyed a season of
          launch days, every note, every report label and every hand-made column mapping, with no
          undo. It also said nothing about what it was about to take: `clearRecents` empties the
          store outright, including the noted flights the heading two lines up calls kept.

          So the confirm is a different control in a different place (a double-click cannot reach
          it), it counts what will go and calls out the noted ones, and it offers the backup as the
          way out rather than leaving the flyer to know Export exists.

          It is a live region rather than a dialog. An `alertdialog` that nothing focuses is
          announced to nobody — the role carries no live behaviour of its own — so a blind flyer
          pressed Clear and heard "expanded" and not one word of the warning. `role="alert"` is
          announced when it appears, which is the actual requirement here, and it does not promise
          the modality (focus trap, aria-modal) that an inline panel does not have. Escape closes
          it and focus goes back to the trigger, because a Cancel button that unmounts itself
          drops focus to the body and costs a keyboard flyer twenty tab stops. */}
      {confirming && (
        <div
          id="logbook-clear-confirm"
          role="alert"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setConfirming(false);
              clearRef.current?.focus();
            }
          }}
          className="mt-3 rounded-md border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200"
        >
          <p>
            <strong className="font-medium">
              Delete {flights.length === 1 ? 'the one flight' : `all ${flights.length} flights`} on this
              device?
            </strong>{' '}
            {noted > 0 && (
              <>
                {noted === flights.length
                  ? flights.length === 1
                    ? 'It has a note, and a note does not save it here.'
                    : 'All of them have notes, and a note does not save them here.'
                  : `${noted === 1 ? 'One of them has a note' : `${noted} of them have notes`}, and a note does not save ${noted === 1 ? 'it' : 'them'} here.`}{' '}
              </>
            )}
            {flights.length === 1 ? 'Its' : 'Their'} file text, notes, report labels and any column
            mappings you made go too, and this cannot be undone.
          </p>
          {exportMsg && <p className="mt-1 font-medium">{exportMsg}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => {
                setConfirming(false);
                clearRef.current?.focus();
              }}
              className="min-h-11 rounded-md border border-red-300 bg-white px-2.5 py-1 font-medium text-red-800 transition hover:bg-red-100 sm:min-h-0 dark:border-red-500/40 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-950/60"
            >
              Keep them
            </button>
            <button
              type="button"
              onClick={async () => {
                setExportMsg('Saving a backup…');
                // What the file actually holds, not that a download fired. `exportLogbook`
                // swallows a storage failure and still writes a well-formed envelope with an
                // empty flights array, so the sanctioned way out could hand over a file with
                // nothing in it right before the flyer pressed Delete.
                const n = (await onExport()) ?? 0;
                setExportMsg(
                  n > 0
                    ? `Saved debrief-logbook.json — ${n === 1 ? '1 flight' : `${n} flights`} in it.`
                    : 'That backup came back empty — this browser would not let Debrief read the logbook, so do not delete it yet.',
                );
              }}
              className="min-h-11 rounded-md border border-red-300 bg-white px-2.5 py-1 font-medium text-red-800 transition hover:bg-red-100 sm:min-h-0 dark:border-red-500/40 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-950/60"
            >
              Save a backup first
            </button>
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
              className="min-h-11 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white transition hover:bg-red-500 sm:min-h-0"
            >
              Delete {flights.length === 1 ? 'it' : `all ${flights.length}`}
            </button>
          </div>
        </div>
      )}

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
              {ordered.length} of {flights.length}
            </span>
          )}
        </div>
      )}

      {flights.length > 1 && (
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
          const group = groupOfRow(r);
          const others = group.recordings.slice(1);
          // Open when the flyer opened it, and open when the SEARCH found this flight only
          // through one of the recordings underneath — a result whose visible row contains
          // nothing they typed reads as a broken search.
          const showing = opened.has(group.id) || matchedInside.has(group.id);
          const note = noteOf(group);
          return (
            <li
              key={r.id}
              className={`group rounded-lg border bg-white transition hover:border-indigo-400 dark:bg-zinc-900/40 dark:hover:border-indigo-500/60 ${
                note.note
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
                  onClick={() => startEdit(note.id, note.note)}
                  aria-label={`${note.note ? 'Edit' : 'Add'} note for ${rowName(r)}`}
                  title={note.note ? 'Edit note' : 'Add a note (keeps this flight in your logbook)'}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition hover:bg-zinc-100 sm:h-7 sm:w-7 dark:hover:bg-zinc-800 ${
                    note.note ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  ✎
                </button>
                {/* Removes the FLIGHT — every recording of it. Taking only the recording that
                    reports the flight deleted one file for good and left the flight on screen
                    under the surviving instrument's name, so the flyer aimed at a flight, lost a
                    file, and saw the row stay. */}
                <button
                  type="button"
                  onClick={() => group.recordings.forEach((rec) => onRemove(rec.id))}
                  aria-label={
                    others.length > 0
                      ? `Remove ${rowName(r)} and its ${others.length === 1 ? 'other recording' : `${others.length} other recordings`} from recent flights`
                      : `Remove ${rowName(r)} from recent flights`
                  }
                  title={others.length > 0 ? `Remove this flight — all ${group.recordings.length} recordings` : 'Remove'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>

              {editingId === note.id ? (
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
                    aria-label={`Note for ${rowName(r)}`}
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
                note.note && (
                  <button
                    type="button"
                    onClick={() => startEdit(note.id, note.note)}
                    className="block w-full px-3 pb-2 text-left text-xs italic text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    {note.note}
                  </button>
                )
              )}

              {/* The other recordings of this flight. Nothing at all on a flight recorded once,
                  which is nearly every row — the whole feature is invisible until a flyer says
                  two files are one flight.

                  Each is still a recording in its own right: openable, with its own reading and
                  its own caveats. Two altimeters that measured one flight are two independent
                  measurements that can disagree, so the row shows what each one read rather
                  than a number Debrief made up out of both. */}
              {others.length > 0 && (
                <div className="border-t border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setOpened((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })}
                    aria-expanded={showing}
                    aria-controls={`recordings-${group.id}`}
                    className="flex min-h-11 w-full items-center gap-1.5 text-left text-xs font-medium text-zinc-500 transition hover:text-zinc-800 sm:min-h-0 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <span aria-hidden="true" className={`transition-transform ${showing ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                    Recorded {group.recordings.length} times — reported by{' '}
                    <span className="font-mono break-all">{r.name}</span>
                    {/* How closely they agree on APOGEE, which is what a flyer flew two
                        altimeters FOR and the figure they otherwise work out by hand from two
                        rows. Apogee alone, and that is a measurement rather than a
                        simplification — see `recordingSpread`, where the corpus says why a top
                        speed here would flag correct groupings as wrong. Never a consensus: the
                        flight is still reported by the one recording the flyer nominated. */}
                    {recordingSpread(group).map((sp) => {
                      // Rounded first, then compared — so the threshold the flyer can SEE is the
                      // threshold the code applies, and two rows both painted "10.0%" cannot
                      // come out one amber and one grey.
                      const shown = sp.pct < 0.05 ? '0.05' : sp.pct.toFixed(sp.pct < 1 ? 2 : 1);
                      const wide = parseFloat(shown) > CROSS_CHECK_WIDE;
                      return (
                        <span
                          key={sp.label}
                          className={`shrink-0 font-normal ${wide ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}
                          title={
                            `The full range between ${sp.count === group.recordings.length ? 'all' : sp.count} of this flight's ${group.recordings.length} recordings, ` +
                            `as a share of what they read on average — a measure of how far apart the instruments are, not a reading of its own. ` +
                            `Each one's own apogee is listed when you open this.` +
                            (wide
                              ? ' A gap this wide is worth chasing: across every same-flight group in the validation corpus the apogees agree to within 2.3%, so check these really are one flight.'
                              : '')
                          }
                        >
                          · {sp.label}{sp.count < group.recordings.length ? ` (${sp.count} of ${group.recordings.length})` : ''} within {shown}%
                        </span>
                      );
                    })}
                  </button>
                  {showing && (
                    <ul
                      id={`recordings-${group.id}`}
                      aria-label={`Recordings of ${rowName(r)}`}
                      className="mb-1 space-y-1"
                    >
                      {group.recordings.map((rec) => {
                        const isPrimary = rec.id === group.id;
                        return (
                          <li key={rec.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 pl-4 text-xs">
                            <button
                              type="button"
                              onClick={() => onOpen(rec.id)}
                              className="min-h-11 min-w-0 flex-1 text-left font-mono break-all text-zinc-700 hover:text-indigo-600 sm:min-h-0 dark:text-zinc-300 dark:hover:text-indigo-400"
                            >
                              {rec.name}
                            </button>
                            <span className="shrink-0 font-mono text-zinc-500 dark:text-zinc-400" title="What this recording read">
                              {rec.apogeeM != null ? fmtLength(rec.apogeeM, sys) : '—'}
                              {' · '}
                              {rec.maxVelocityMs != null ? fmtSpeed(rec.maxVelocityMs, sys) : '—'}
                            </span>
                            {isPrimary ? (
                              <span className="shrink-0 rounded border border-indigo-400 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-500/60 dark:text-indigo-300">
                                reports this flight
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onGroup(planGrouping(group.recordings.map((x) => x.id), rec.id));
                                  // The flight's id IS its reporting recording's, so nominating
                                  // another moves it — and the panel the flyer is standing in
                                  // would collapse under them on their own click.
                                  setOpened((prev) => {
                                    const next = new Set(prev);
                                    next.delete(group.id);
                                    next.add(rec.id);
                                    return next;
                                  });
                                }}
                                title="Report this flight by this recording — which altimeter's reading a cert document quotes is the flyer's call, not Debrief's"
                                className="min-h-11 shrink-0 text-[11px] font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500 sm:min-h-0 dark:text-indigo-400"
                              >
                                report by this one
                              </button>
                            )}
                          </li>
                        );
                      })}
                      {/* The way back out. Joining the wrong two files must not need the flyer
                          to delete them and drop them again. */}
                      <li className="pl-4 pt-0.5">
                        <button
                          type="button"
                          onClick={() => onGroup(planSeparation(group))}
                          className="min-h-11 text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 sm:min-h-0 dark:text-zinc-400 dark:hover:text-zinc-200"
                        >
                          Separate these into {group.recordings.length} flights
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
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
            Show all {flights.length}
          </button>
          .
        </p>
      )}
      {importMsg && <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">{importMsg}</p>}
      {copyMsg && (
        <p role="status" className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
          {copyMsg}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Remembered on this device only — never uploaded. <span className="text-amber-500">★</span> marks
        your best; tick two or more to compare them — or, if they are two altimeters&apos; recordings of
        the <em>same</em> flight, to keep them as one flight. Each recording is still read on its own;
        you choose which one the flight is reported by. Add a <span aria-hidden="true">✎</span> note
        (motor, conditions, cert…) to keep a flight as a logbook entry that won&apos;t be pruned.{' '}
        <strong className="font-medium text-zinc-600 dark:text-zinc-300">Export</strong> backs the whole
        logbook up to a file you keep; <strong className="font-medium text-zinc-600 dark:text-zinc-300">Import</strong>{' '}
        restores it on another machine.
      </p>
    </div>
  );
}
