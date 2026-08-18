'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecentMeta } from '@/lib/recents';
import { fmtLength, fmtSpeed } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { CROSS_CHECK_WIDE, MAX_COMPARE } from '@/lib/compare';
import { UNNOTED_MAX, STORAGE_WRITE_REFUSED } from '@/lib/recents';
import { APOGEE_TAG_UNPROVEN, APOGEE_TAG_FLOOR } from '@/lib/readings';
import { sortRecents, filterRecents, personalBests, logbookRowNames, type LogbookSort } from '@/lib/logbook';
import { groupRecordings, planGrouping, planJoin, planSeparation, recordingSpread, type FlightGroup } from '@/lib/flightGroups';
import GroupProposalBanner from './GroupProposalBanner';
import ForgottenBanner from './ForgottenBanner';
import { copyTable } from '@/lib/copyTable';
import { formatFlownAt } from '@/lib/flight/flownAt';
import { Button, Card, Chip, EmptyState, Loading, Notice, Segmented, useReturnFocus } from './ui';
import { PROVENANCE_COLUMN, provenanceCell, SYNTHETIC_SHORT, SYNTHETIC_TAG } from '@/lib/synthetic';

/** Below this the list is short enough to read at a glance, so a search box would be
 *  chrome earning nothing. Above it, finding one flight by eye starts to cost. */
const SEARCH_FROM = 4;

const SORTS: { key: LogbookSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'flown', label: 'Flown' },
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


/** The short tag a logbook apogee wears where Debrief has qualified it — the same two words the
 *  comparison cell uses, from the same place, so the two surfaces that rank flights cannot drift
 *  into two accounts of one caveat. A row is narrow, so it is the tag rather than the sentence;
 *  the report is where the sentence lives. */
function apogeeTag(r: { apogeeCaveats?: { floor?: boolean; unproven?: boolean } }): string {
  if (!r.apogeeCaveats) return '';
  return `${r.apogeeCaveats.unproven ? APOGEE_TAG_UNPROVEN : ''}${r.apogeeCaveats.floor ? APOGEE_TAG_FLOOR : ''}`;
}

export default function RecentFlights({
  recents,
  status,
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
  arrived = [],
  onDismissProposal,
}: {
  recents: RecentMeta[];
  /** Which of the list's four empty-looking states this is — see the block below. `write-blocked`
   *  is reads-fine-writes-refused, which is what a full quota actually looks like.
   *
   *  **Required, and it defaulted to `'ready'` for exactly one commit.** That default is the
   *  DEFECT value: a third call site that forgot the prop would silently reprint the prerendered
   *  "flights you open are remembered here" to a flyer who has some, and nothing — not the type
   *  check, not a test — would have failed. A prop whose default reintroduces the bug it was added
   *  to fix has to be required. */
  status: 'loading' | 'ready' | 'blocked' | 'write-blocked';
  sys: UnitChoice;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: (ids: string[]) => void;
  onNote: (id: string, note: string) => void;
  onExport: () => void | Promise<number>;
  /** Merge a backup back in. `blocked` is the browser refusing to WRITE — distinct from a file
   *  with nothing in it, which is the flyer's file and says so. */
  onImport: (file: File) => Promise<{ restored: number; blocked: boolean }>;
  /** Say which flight some rows are recordings of — the flyer's own statement that two files
   *  are one flight flown on two altimeters, or (with `flightId: null`) that they are not. */
  onGroup: (changes: { id: string; flightId: string | null }[]) => void | Promise<void>;
  /** Flights the last drop pushed out to make room. Named rather than left to be noticed by
   *  counting — a launch day's folder is most of the un-noted window, so the third day used
   *  to quietly eat the first. */
  forgotten?: string[];
  onDismissForgotten?: () => void;
  /** Logbook ids the drop that just happened produced. A grouping is only ever OFFERED over
   *  these — never over the whole logbook — so the offer is about the files the flyer just
   *  dropped, and saying no to it is final without anything having to be stored. */
  arrived?: string[];
  onDismissProposal?: () => void;
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

  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again
    if (!file) return;
    setImportMsg('Restoring…');
    const { restored, blocked } = await onImport(file);
    // **Three outcomes, because two of them used to be one and the wrong one got the blame.**
    // `importLogbook` resolved on the transaction's `onabort` and returned the flight count
    // regardless, so a restore the browser refused reported "Restored 12 flights." while the
    // logbook stayed empty — and the obvious next thing a flyer does is delete the file it came
    // from. Its sibling failure blamed them too: the catch returned 0, which rendered "is it a
    // Debrief logbook export?" over a perfectly good backup.
    setImportMsg(
      restored > 0
        ? `Restored ${restored} flight${restored === 1 ? '' : 's'}.`
        : blocked
          ? 'That backup could not be written — this browser won’t let Debrief keep a logbook on this device, so nothing was restored. Keep the file; a normal window, or allowing site storage, will restore it.'
          : 'No flights found in that file — is it a Debrief logbook export?',
    );
  };

  // A hidden picker, shared by the header Import button and the empty-state
  // "Restore a logbook backup" action, so a backup can be brought back even on a fresh device.
  const filePicker = (
    <input
      ref={fileRef}
      type="file"
      accept=".json,application/json"
      onChange={onImportChange}
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
      // Named, because `accept*="json"` stopped identifying it: since 2026-08-08 the FLIGHT
      // picker accepts `.json` too (Debrief's own flight record), so the attribute selector
      // the logbook tests used resolved to two inputs. A hidden input has no accessible name
      // to target instead, so it carries one.
      data-testid="logbook-restore"
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

  // Opening, dismissing and Escape all live in `useReturnFocus` now — `DESIGN.md` §5's own hook.
  // This surface and the privacy page's Forget-these-settings confirm are the same control written
  // twice, and each carried its own copy of all three behaviours.
  const { triggerRef: clearRef, safeRef: cancelRef, dismiss, onKeyDown } = useReturnFocus(
    confirming,
    () => setConfirming(false),
  );

  // **Three of `DESIGN.md` §5's five states were one `if`.** `recents.length === 0` is true while
  // the read is still in flight, true when the browser refuses storage, and true when the logbook
  // is genuinely empty — and only the third of those is what the copy below says. The first is not
  // a rare race: every route here is a STATIC EXPORT, so this block is prerendered into
  // `out/index.html`, and a flyer with fifty flights read "flights you open are remembered here on
  // this device" with an offer to restore a backup on every cold load until the bundle hydrated.
  if (status === 'loading') {
    // §5's `Loading`, which exists and which this surface hand-rolled past. Two other surfaces
    // (`Analyzer`, `StitchSurface`) already use it, so the logbook was the third treatment of one
    // of the five required states.
    //
    // **What this conversion does and does not do, stated exactly, because the first draft of
    // this comment credited it with a fix it did not make.** It gains the explicit `aria-live`,
    // the pulse that marks the wait as moving rather than hung, and body-size type in place of
    // caption size. It does NOT change the transition away: `Loading` unmounts at the same moment
    // the bare paragraph did. What announces the resolution is the empty state's own message
    // below, which is a separate thing and was already there.
    return (
      <div className="mt-8">
        {filePicker}
        <Loading>Looking for flights remembered on this device…</Loading>
      </div>
    );
  }
  if (status === 'blocked') {
    return (
      <div className="mt-8">
        {filePicker}
        {/* Says what is true and what to do, not what Debrief would like to be true. The promise
            in the empty state below — "flights you open are remembered here" — is exactly the
            sentence a flyer must not be given when the browser has just refused to store one.
            §2's `warn`, and NOT §5's `ErrorState`, decided rather than defaulted: `ErrorState` is a
            `Card tone="danger"` with `role="alert"`, which is right for an operation the flyer just
            attempted and that failed — a file that would not parse. Nothing here failed on their
            command and the analysis still works; what changed is that one capability is
            unavailable for this session, which is §2's "a caveat" rather than its "a refusal, a
            value that cannot be computed, destructive". `role="status"` for the same reason: this
            is polite information on arrival, not an interruption.

            **And it is `Notice` rather than a hand-rolled amber `<p>`, which this comment argued
            for and the markup did not do.** The write-blocked twin thirty lines below took the
            primitive when `Notice` shipped; this one — the harder failure, reads refused as well
            as writes — was left as the treatment `Notice` was extracted FROM. One file, one
            meaning, two renderings. Also off `text-xs`: §3 makes `text-sm` the floor for anything
            a flyer reads to make a decision, and this is four sentences of what to do next. */}
        <Notice as="p" tone="warn" role="status">
          This browser won&apos;t let Debrief read or keep a logbook on this device, so flights you
          open here won&apos;t be remembered between visits. A private window or blocked site storage
          usually does it. Analysing a file still works, and every report has its own export — save
          anything you want to keep from the report itself, because this list cannot hold it.
        </Notice>
        {/* **And the surface the notice is ABOVE**, which §5 requires of a notice in as many
            words: "a sentence about the content, above the content, never instead of it". The
            first cut rendered the notice alone, so this state had a caveat and no surface at all —
            which is the one thing §5 says a notice may not be. It carries NO action, and that is
            the decision rather than an omission: `idb()` itself failed here, so a restore is a
            write that cannot land, and a control that is always enabled and fails only when
            pressed is a named tell in `MAINTAINING.md`. The write-blocked twin below DOES offer
            one, because there the read works and a 200 KB backup can commit where an 11 MB flight
            text aborted. */}
        <EmptyState
          className="mt-2"
          title="No logbook on this device"
          what="Nothing can be kept here until this browser allows site storage — a normal window usually does it."
        />
      </div>
    );
  }
  // Reads working, writes refused — a full quota or an eviction, which is the COMMON refusal.
  // NOT an early return like `blocked` above: the rows already in the logbook are real and still
  // readable, so they are still shown; what changes is that nothing here may promise to remember
  // the next one. Found by walking the built export, where the honest `/compare` drop note
  // ("could not be kept") sat directly above this list's promise that flights ARE remembered —
  // the same two-sentences-one-viewport contradiction, one layer down and pointing the other way.
  const writeCaveat =
    status === 'write-blocked' ? (
      // Says it in the app's ONE sentence for this condition rather than a sixth wording of it.
      // Embedded mid-sentence so the shared constant needs no re-casing, which is also what keeps
      // its typography identical to the `/compare` note a flyer may be reading in the same
      // viewport — the first draft hand-wrote the same words with `&apos;`, and a straight quote
      // against the constant's curly one is exactly the drift a shared string exists to prevent.
      // **This is THE degraded surface, and §5 names `Notice` for exactly it** — reads working,
      // writes refused, which is none of the five states because the surface is not empty, not
      // loading, not errored and not offline; it is working with one thing qualified. It was a
      // bare amber `<p>` and the primitive shipped without it, so §5 named a case that had no
      // adopter. Found by the pre-push review, and it could not have been found by the
      // hand-rolled-notice census: that predicate keys on the primitive's own `-300/70` + `-50`
      // ramp, so it can only ever see hand-rolls that already LOOK like a notice. A census
      // scoped to the form the drift was first noticed in, again.
      <Notice as="p" tone="warn" role="status">
        Nothing more will be kept here: {STORAGE_WRITE_REFUSED} — a full quota or blocked site
        storage usually does it. Analysing a file still works, and every report has its own export,
        so save anything you want to keep from the report itself.
      </Notice>
    ) : null;

  if (recents.length === 0) {
    return (
      <div className="mt-8">
        {filePicker}
        {/* **The announcement is a MESSAGE, not a region wrapped round the card.** The loading
            line above unmounts at the transition — a screen reader heard "Looking for flights
            remembered on this device…" and then, on the state it was waiting for, nothing at all —
            so this state has to speak. The first cut of the conversion put `role="status"` on a
            `<div>` around the `EmptyState`, which is a live region containing a heading, a
            paragraph AND a button: `role="status"` implies `aria-atomic`, so every mutation
            re-reads the whole card including the control's label. `lib/design-system.test.ts`
            records this file being fixed for that exact shape once already, on the
            forgotten-flights banner. A visually-hidden line carries the announcement instead, and
            the card is just a card. */}
        <p className="sr-only" role="status">
          No flights are remembered on this device yet.
        </p>
        {writeCaveat ? (
          // **The PROMISE goes; the restore offer stays.** A first version replaced the whole
          // paragraph, on the reasoning that a restore is a write and so cannot succeed either.
          // Review refuted it and the refutation is worth keeping: a quota abort is
          // per-transaction and size-dependent, so a 200 KB backup can commit on the same device
          // where an 11 MB flight text aborted — unlike `blocked` above, where `idb()` itself
          // failed and nothing can run. And this control is the ONLY way to open the file picker
          // in the empty state (the header Import button lives in the populated branch), so
          // removing it removed importing from this state entirely and left `importMsg` below as
          // markup nothing could reach.
          // **The same `EmptyState` as the branch below, with the caveat ABOVE it**, which is
          // exactly what §5 says a `Notice` is for: a sentence about content that is otherwise
          // fine and still there. These two branches were one state rendered two ways — one
          // primitive and one caption-size paragraph with the action buried mid-sentence — and
          // the control they share had two different accessible names, which is how a NEGATIVE
          // assertion in `e2e/logbook.spec.ts` could have gone quietly green.
          <>
            {writeCaveat}
            <EmptyState
              className="mt-2"
              title="No flights remembered yet"
              // What would fill it, in the flyer's terms — which is the prop's contract, and the
              // first cut answered a different question here (why a backup is worth trying). A
              // restore is the only thing that can fill this list on a device that has just
              // refused to keep the next flight, so that is what it says.
              what="A backup from another machine can still land here — it is far smaller than a launch day of flight logs, so it may well be kept even where a flight was not."
              action={
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  Restore a logbook backup
                </Button>
              }
            />
          </>
        ) : (
          // §5's `EmptyState`: what would fill this surface, and the one control that gets them
          // there. It was a caption-size paragraph with the action buried mid-sentence — the state
          // a flyer sees FIRST, hand-rolled, on the surface `EmptyState` was written for.
          <EmptyState
            title="No flights remembered yet"
            what="Flights you open are remembered here on this device — never uploaded."
            action={
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Restore a logbook backup
              </Button>
            }
          />
        )}
        {importMsg && (
          <p role="status" className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
            {importMsg}
          </p>
        )}
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
    // A made-up flight in this selection buys the whole table a column, on the same
    // conditional-column rule the grouping pair follows: nobody who has only flown real flights
    // pays for it. **A COLUMN and not a caption row**, because this table's destination is a
    // spreadsheet — a caption above the header is a cell a sort moves away from the rows it was
    // about, where a per-row value stays attached to its own numbers through any sort, filter or
    // partial paste. The word is `SYNTHETIC_TAG` rather than a tick so a cell that travels alone
    // still says what it means.
    const anySynthetic = ordered.some((r) => r.synthetic);
    const header = [
      'Flight',
      'Logger',
      'When',
      `Apogee (${sys === 'metric' ? 'm' : 'ft'})`,
      `Max speed (${sys === 'metric' ? 'm/s' : 'ft/s'})`,
      ...(anyGrouped ? ['Recordings', 'Also recorded by'] : []),
      ...(anySynthetic ? [PROVENANCE_COLUMN] : []),
      'Note',
    ];
    const rows = ordered.map((r) => [
      r.name,
      r.formatLabel,
      r.flownAt ? formatFlownAt(r.flownAt) : `opened ${relativeTime(r.addedAt)}`,
      r.apogeeM != null ? fmtLength(r.apogeeM, sys) + apogeeTag(r) : '—',
      r.maxVelocityMs != null ? fmtSpeed(r.maxVelocityMs, sys) : '—',
      ...(anyGrouped ? [String(groupOfRow(r).recordings.length), groupOfRow(r).recordings.slice(1).map((x) => x.name).join('; ')] : []),
      ...(anySynthetic ? [provenanceCell(r.synthetic)] : []),
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
      {/* Above the list, not instead of it: these rows are real. It is the NEXT flight that
          won't be kept, which is the thing the list would otherwise let a flyer assume. The
          margin matches the two banners beside it — without it this sits flush against the
          `border-b` header row, which is the branch no test renders. */}
      {writeCaveat && <div className="mb-3">{writeCaveat}</div>}
      <GroupProposalBanner
        recents={recents}
        arrived={arrived}
        onGroup={onGroup}
        onDismiss={onDismissProposal}
      />
      {/* What the last drop cost, named — hoisted into its own component 2026-08-13 because this
          is the one surface a flyer is NOT on after a drop. See `ForgottenBanner`. */}
      <ForgottenBanner forgotten={forgotten} onDismiss={onDismissForgotten} />
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
          {/* Secondary, not primary — §5 allows one primary per SURFACE, and this component is not
              one. It is embedded in both flight routes, and each of those already has its own
              primary for the thing it exists to do: "Choose files" on the analyze route and
              "Choose flight logs" on the comparison. Ticking two rows used to put a second indigo
              fill on screen beside that one, and two primaries on a screen means neither is.
              The logbook reading as a surface in its own right is what made this look right; a
              flyer sees one page. */}
          {chosen.length >= 2 && (
            <Button size="sm" onClick={() => onCompare(chosen)}>
              Compare {chosen.length} flights
            </Button>
          )}
          {/* Two files, one flight. The alternative a redundant-altimeter flyer has today is
              two logbook entries for a flight they flew once — sorted apart, crowned apart,
              and counted twice by anything that counts flights. Only offered where the ticked
              rows are separate flights, so it never appears as a no-op. The order they are in
              on screen decides which reports the flight, and the row says so and can change
              it — Debrief does not pick a winner between two instruments. */}
          {canJoin && (
            <Button
              size="sm"
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
            >
              These {chosenFlights.length} are one flight
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLogbook}
            title="Copy these flights to the clipboard — as a table for a spreadsheet or document, and as tab-separated text everywhere else"
          >
            Copy table
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            title="Download your logbook (flights + notes) as a backup file"
          >
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            title="Restore flights from a logbook backup file"
          >
            Import
          </Button>
          <Button
            ref={clearRef}
            variant="ghost"
            size="sm"
            onClick={() => setConfirming((v) => !v)}
            aria-expanded={confirming}
            aria-controls="logbook-clear-confirm"
          >
            Clear
          </Button>
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
        // On `Card tone="danger"`, which is `DESIGN.md` §2's refusal container and what the
        // privacy page's identical confirm was already using. This one hand-rolled its own: the
        // CONTROL radius where §2 gives a container the larger one, and its whole body at caption
        // size where §3 makes the body default the floor for anything a flyer reads to make a
        // decision. The decision here is whether to delete every flight on the device, which is
        // the only irreversible one in the app.
        //
        // The class names are named by ROLE and not written out, because §9's greps read this
        // file as source: a comment that quotes the size it is removing puts the count straight
        // back and reports a fix that did land as a fix that did not.
        <Card
          id="logbook-clear-confirm"
          tone="danger"
          role="alert"
          onKeyDown={onKeyDown}
          className="mt-3 text-sm"
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
            <Button ref={cancelRef} onClick={dismiss}>
              Keep them
            </Button>
            <Button
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
            >
              Save a backup first
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
            >
              Delete {flights.length === 1 ? 'it' : `all ${flights.length}`}
            </Button>
          </div>
        </Card>
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
            className="min-h-[2.25rem] w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
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
          <Segmented
            value={sort}
            onChange={setSort}
            options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
            ariaLabel="Sort by"
            size="sm"
          />
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
          // A card that is also a list item and also a click target. `Card`'s default tone IS this
          // row's treatment — `border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900`,
          // written out by hand here — so what stays in `className` is only what is genuinely this
          // row's: the hover, and the indigo left edge that marks a flight the flyer annotated.
          return (
            <Card
              as="li"
              key={r.id}
              pad={false}
              className={`group transition hover:border-indigo-400 dark:hover:border-indigo-500/60 ${
                note.note ? 'border-l-2 border-l-indigo-400 dark:border-l-indigo-500/60' : ''
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
                  {/* A flight Debrief made up wears the tag beside the logger that "recorded" it.
                      The row is 188 px of name at 390 px, so it is the tag and not the sentence —
                      the report is where the sentence lives, exactly as with the apogee caveats
                      two cells along.

                      **§2's `warn` deliberately, and this is NOT the amber the previous session
                      took OFF this row.** That one coloured a NUMBER by whether it was large — a
                      superlative wearing the caveat hue, which §2 forbids outright. This is amber
                      used for what §2 says amber means: a caveat, on a token whose entire content
                      is the caveat. It IS about the readings to its right, and saying so is the
                      point rather than a problem — below `sm` the wrapper wraps and the numbers
                      sit beside it, which is the layout this claim most needs.

                      **The sentence is `sr-only`, not a `title`.** A `title` on a `<span>` that
                      has its own text is not used in name-from-content, so the row's accessible
                      name would have been "… Generic CSV SYNTHETIC 173 m/s …" — a shouted word
                      with no claim attached, and §8 forbids hover-only state besides. Same
                      treatment the personal-best stars ten lines below already use, for the same
                      reason. */}
                  {r.synthetic && (
                    <Chip
                      tone="warn"
                      mono={false}
                      className="shrink-0"
                      value={
                        <>
                          {SYNTHETIC_TAG}
                          <span className="sr-only">: {SYNTHETIC_SHORT}</span>
                        </>
                      }
                    />
                  )}
                  {/* The two numbers this surface exists to be scanned down. `DESIGN.md` §3:
                      `text-sm` is the floor for anything a flyer reads to make a decision, and any
                      number compared against another number is `font-mono tabular-nums` so the
                      digits line up column to column. These were `text-xs` in the TERTIARY colour
                      (§2's disabled/placeholder/timestamp role) with proportional digits, on the
                      one surface built for comparing flights against each other. */}
                  <span
                    className="shrink-0 font-mono text-sm tabular-nums text-zinc-700 sm:ml-auto dark:text-zinc-300"
                    title="Max velocity"
                  >
                    {/* Which number this is, in words. Below `sm` the row is a wrapped block and
                        these two figures sit side by side with nothing naming them — no header
                        row exists at any width, so a flyer at the pad read two bare numbers and
                        the only thing that said which was which was a `title`, i.e. a hover, i.e.
                        nothing on a touch screen. `sm:sr-only` rather than `sm:hidden`: above `sm`
                        the dense row keeps its `title` for a pointer, but the name stays in the
                        accessibility tree at every width instead of being deleted from it, which
                        is the half the explorer's `Stat` can leave to a `<th>` and this list
                        cannot — it has no header cells to inherit a name from.

                        §3's caption size and §2's tertiary role, the same treatment the
                        explorer's block-form cells take, so the two labelled layouts read as one
                        decision. */}
                    <span className="mr-1 font-sans text-xs font-normal uppercase tracking-wide text-zinc-500 sm:sr-only dark:text-zinc-400">
                      Max velocity
                    </span>
                    {/* The mark is a GLYPH, not a colour. §2 gives amber one meaning — "an estimate
                        outside its envelope, an extrapolation, a caveat" — and this star was wearing
                        it to say the opposite: that a reading is the best of the set. On a logbook
                        scanned down a column, amber beside an apogee reads as a warning about that
                        apogee. §2 also forbids colouring a number by whether it is large, outright.
                        The basis is real and stays (the title and the screen-reader text both name
                        it); what goes is the claim the hue was making. */}
                    {isSpeedBest && (
                      <span
                        className="mr-0.5 text-zinc-900 dark:text-zinc-100"
                        title="Fastest of your remembered flights"
                      >
                        ★<span className="sr-only">fastest, </span>
                      </span>
                    )}
                    {r.maxVelocityMs != null ? fmtSpeed(r.maxVelocityMs, sys) : '—'}
                  </span>
                  <span
                    className="shrink-0 font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300"
                    title="Apogee"
                  >
                    <span className="mr-1 font-sans text-xs font-normal uppercase tracking-wide text-zinc-500 sm:sr-only dark:text-zinc-400">
                      Apogee
                    </span>
                    {isApogeeBest && (
                      <span
                        className="mr-0.5 text-zinc-900 dark:text-zinc-100"
                        title="Highest of your remembered flights"
                      >
                        ★<span className="sr-only">highest, </span>
                      </span>
                    )}
                    {r.apogeeM != null ? fmtLength(r.apogeeM, sys) + apogeeTag(r) : '—'}
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
                    note.note ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
                  <Button size="sm" onClick={saveEdit}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
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
                          className={`shrink-0 font-normal ${wide ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}
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
                              {rec.apogeeM != null ? fmtLength(rec.apogeeM, sys) + apogeeTag(rec) : '—'}
                              {' · '}
                              {rec.maxVelocityMs != null ? fmtSpeed(rec.maxVelocityMs, sys) : '—'}
                            </span>
                            {isPrimary ? (
                              <span className="shrink-0 rounded-md border border-indigo-400 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-500/60 dark:text-indigo-300">
                                reports this flight
                              </span>
                            ) : (
                              <Button
                                variant="link"
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
                                // Keeps its RESTING underline. `link`'s underline is `hover:`
                                // only, which is right in prose — the sentence around it supplies
                                // the context — and wrong here: this is 11 px, in a recordings
                                // row, beside a bordered indigo chip, on a device with no hover.
                                // Without it the only thing marking it as a control is the title.
                                className="shrink-0 text-[11px] underline underline-offset-2"
                              >
                                report by this one
                              </Button>
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
            </Card>
          );
        })}
      </ul>
      {filtering && ordered.length === 0 && (
        // The second empty state on this surface, and the second hand-roll of it. It also wore the
        // CONTROL radius (`rounded-md`) on a container, which §2 gives `rounded-xl`, and `text-xs`
        // on a message. `EmptyState` is a `Card tone="muted"`, so all three go at once.
        <EmptyState
          className="mt-3"
          title={`No flight here matches “${query.trim()}”`}
          what="Names, the logger a flight came off, and your own notes are searched."
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Show all {flights.length} flights
            </Button>
          }
        />
      )}
      {/* Announced: this line now carries a storage REFUSAL, not just a count, and a flyer
          using a screen reader has to hear that their backup did not land. */}
      {importMsg && (
        <p role="status" className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
          {importMsg}
        </p>
      )}
      {copyMsg && (
        <p role="status" className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
          {copyMsg}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Remembered on this device only — never uploaded.{' '}
        <span className="text-zinc-900 dark:text-zinc-100">★</span> marks
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
