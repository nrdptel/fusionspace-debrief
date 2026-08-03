// Recent flights, remembered on this device only (IndexedDB). We keep the
// original file text plus a little metadata so a flight can be reopened without
// finding the file again. Nothing is uploaded; this is the same privacy posture
// as the rest of the app, and it can be cleared in one tap. All calls fail soft —
// private-mode or storage-blocked browsers just won't remember anything.

import type { FlownAt } from './flight/flownAt';
import { groupRecordings } from './flightGroups';

export interface RecentMeta {
  id: string;
  name: string;
  formatLabel: string;
  addedAt: number;
  apogeeM: number | null;
  /** Max velocity (m/s) for the logbook; null when the flight didn't yield one. */
  maxVelocityMs: number | null;
  /** Why this flight's apogee cannot be crowned "highest", where it cannot.
   *
   *  **The logbook could not qualify an apogee at all until this existed**, and that was the last
   *  surface still ranking on a number every other surface had already qualified: the report
   *  prints *"(at least)"* or *"unproven"*, the comparison refuses the crown outright, and the
   *  logbook went on awarding a ★ *"Highest of your remembered flights"* off a bare `apogeeM`.
   *  `ROADMAP.md`'s P1 item names this as what its own last increment did not close, and says why —
   *  it wants a field on the persisted store, which is this one.
   *
   *  Absent on every row written before 2026-08-03 and on every flight whose apogee carries no
   *  caveat, which is nearly all of them. **Absent means qualified**: an old row keeps exactly the
   *  behaviour it had, and a re-save re-reads the file and fills it in. Storing the REASONS rather
   *  than a bare boolean so the row can say which one, the way every other surface does. */
  apogeeCaveats?: { floor?: boolean; unproven?: boolean };
  /** When the flight flew, where its file states it (see lib/flight/flownAt.ts). Absent on
   *  entries saved before this was read, and on files that carry no date — the logbook shows
   *  when it was opened in that case rather than inventing a launch day. */
  flownAt?: FlownAt;
  /** A free-text logbook note (motor, conditions, cert…). A noted flight is kept
   *  rather than pruned — it's a logbook entry, not just a recent. */
  note: string;
  /** The stretch of this file the flyer chose to read, when they chose one — the same window
   *  `RecentFlight.read` stores, projected so a LIST can see it.
   *
   *  The list needs it because a cropped recording's stored apogee is the CROP's apogee, and a
   *  surface that compares one recording's reading with another's has to know it is comparing
   *  two stretches rather than two instruments. Absent on almost every row. */
  read?: { fromS: number; toS: number };
  /** Which FLIGHT this recording belongs to, where the flyer has said that two files are one
   *  flight flown on two altimeters.
   *
   *  A row is a FILE — that is what holds the text and the parser that read it — so a flight
   *  recorded twice is two rows, and without this it is two flights in the list and two
   *  flights to everything that counts them. Absent on nearly every row, which is the point:
   *  a flight recorded once costs one missing optional member and no code path at all.
   *
   *  Equal to this row's own id means this recording is the one the flight is REPORTED by;
   *  any other id names the recording that is. `lib/flightGroups.ts` is the only thing that
   *  reads it, and it is what stops "which flight" and "which recording speaks for it" from
   *  ever being two facts that can disagree. */
  flightId?: string;
}

export interface RecentFlight extends RecentMeta {
  text: string;
  /** The file's own bytes, kept only for the files whose text is NOT the file — a raw
   *  binary download off a card, an .xlsx workbook. Everything else round-trips through
   *  `text` and storing a second copy would only shrink how many flights fit in the
   *  browser's quota. `lib/fileText.ts#textIsTheFile` is the test; `importRecent` reads
   *  this in preference to the text whenever it is here. Absent on nearly every row,
   *  including every row written before the logbook kept bytes at all. */
  bytes?: Uint8Array;
  /** The text of the device-summary file that was dropped alongside this log, when one was.
   *  The SOURCE, not the figures read out of it — the same reason the mapping below is kept
   *  as data: a stored answer is frozen at the version that wrote it, while a stored source
   *  gets every later improvement to how it is read. (The reading of these files changed
   *  once already, to pick up both descent rates and to say what it could not use.)
   *
   *  Without it the logbook held the log and not the summary, so reopening a paired flight —
   *  or building a comparison from ids — dropped the device's own figures and the whole
   *  cross-check panel with them. Absent on every flight dropped without a summary. */
  summaryText?: string;
  /** The text of the HIGH-RATE half of this flight's download, when one was dropped with it.
   *
   *  The SOURCE, for the same reason as `summaryText` above: a stored reduction is frozen at the
   *  version that wrote it, while a stored source gets every later improvement to how it is read —
   *  and the reduction here is the part most likely to change, since D8 has two more slices to go.
   *
   *  Without it the logbook held one half of a two-file flight. The traces were on the report until
   *  the page was reloaded and then silently were not, and a comparison built from ids — which
   *  re-reads every flight through `importRecent` — never had them at all, while the drop's own
   *  note said they were there. Absent on every flight dropped without its high-rate half. */
  highRateText?: string;
  /** The label and notes a flyer typed onto this flight's report.
   *
   *  Kept with the flight rather than with the view. The report has an address now, so a link
   *  out and a Back come back to the flight — and these two, the only things on that screen a
   *  flyer actually TYPED, were the two that didn't. They ride into every text, Markdown, HTML
   *  and JSON export and the printed card, which is exactly why losing them costs a cert
   *  write-up its title.
   *
   *  Keyed by the logbook id, which is stable across a reopen. */
  caption?: { label: string; notes: string };
  /** The stretch of this file the flyer chose to read, in SECONDS on the file's own clock.
   *
   *  Seconds rather than sample indices, deliberately: the file is stored as text and re-parsed
   *  on every reopen, so an index is a promise about a parse rather than about the flight. A
   *  parser fix that drops one duplicate timestamp would move a stored index onto a different
   *  sample and the crop would quietly shift; the seconds still name the same moment of the
   *  same flight. `indexAtOrAfter` in `components/CropControl.tsx` is the search back.
   *
   *  Absent on every flight read whole, which is almost all of them — so its presence IS the
   *  question "did the flyer overrule the segmentation on this one?". */
  read?: { fromS: number; toS: number };
  /** The column mapping a flyer made by hand, for a file Debrief doesn't auto-detect.
   *  Without it the logbook holds the text and not the answer: reopening the flight asks
   *  for the mapping again, and a comparison built by id drops it entirely. Absent on every
   *  auto-detected flight, which re-reads itself from its own format. */
  mapping?: StoredMapping[];
}

/** One mapped column, in the shape `buildFlight` takes. Stored as data rather than as a
 *  `ColumnMapping` import so the logbook module stays independent of the parsers. */
export interface StoredMapping {
  index: number;
  role: string;
  unit: string | null;
}

const DB_NAME = 'debrief';
const STORE = 'recents';
/** How many un-noted flights the logbook remembers. Exported because the surface has to
 *  state the number — copy that says "a few" while the code says 12 is copy that will drift,
 *  and the whole point of stating it is that a flyer can plan around it. Every entry holds
 *  the file's full text, which is what bounds this: a season of 11 MB logs is not something
 *  IndexedDB should be asked to hold on a phone. */
export const UNNOTED_MAX = 12;
const MAX = UNNOTED_MAX;
const NOTED_MAX = 50; // hard cap on kept noted flights, to bound storage

/** The parts of a stored flight that decide whether two entries are the same flight. */
type FlightIdentity = Pick<RecentFlight, 'name' | 'formatLabel' | 'text'>;

/**
 * Two logbook entries are the same flight when they are the same FILE: the same name, read by
 * the same parser, with the same bytes behind it.
 *
 * The name alone is not identity, and treating it as identity lost flights. Plenty of loggers
 * write every export under one fixed name, so a launch day arrives as six files all called
 * `data.csv` — and keying on the name meant the second one REPLACED the first: the earlier
 * entry deleted outright, its id handed to the newer flight (so `/?open=<id>` and every
 * `/compare?ids=…` naming it now resolved to different numbers), and its note and report label
 * transplanted onto a flight that was never theirs. A drop of six returned six flights on
 * screen and one row in the logbook, and nothing anywhere said which five had gone.
 *
 * Reopening a flight must stay a replace-in-place — that is what keeps its address stable —
 * and it does: a reopen saves the text it was stored with, so it matches itself exactly.
 */
export function isSameStoredFlight(a: FlightIdentity, b: FlightIdentity): boolean {
  return a.name === b.name && a.formatLabel === b.formatLabel && a.text === b.text;
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remember a flight. Resolves with the id it was stored under — which is what makes a
 * comparison built from a drop addressable, since `/compare?ids=…` names logbook keys —
 * or null when storage is unavailable (a private window), where the caller simply has
 * nothing to link to.
 *
 * `forgotten` names the flights this save pushed out of the un-noted window, in the order
 * they left. The prune below has always run; what it has never done is SAY anything. A
 * launch day is six files, so two of them fill the window and the third silently eats the
 * first: dropping 15 flights leaves 12, and nowhere on the page did the three that went get
 * named. Storage is genuinely bounded — every entry carries the whole file text — so the
 * answer is not a bigger number, it is telling the flyer the rule and what it just cost
 * them, while they can still do something about it.
 */
export interface SaveResult {
  id: string | null;
  /** File names dropped from the logbook to make room for this one. */
  forgotten: string[];
}

/** What a save takes: everything but the two the store owns and the note, which is only ever
 *  the flyer's and is carried forward rather than passed. */
export type IncomingFlight = Omit<RecentFlight, 'id' | 'addedAt' | 'note'>;

/**
 * The members of a stored flight that are the FILE'S. A save re-reads them, so the incoming
 * value wins — a parser that has learned something since gives a better apogee, and a flight
 * saved months ago should get it.
 */
type FromTheFile = 'id' | 'addedAt' | 'name' | 'formatLabel' | 'apogeeM' | 'maxVelocityMs' | 'apogeeCaveats' | 'flownAt' | 'text' | 'bytes' | 'mapping';

/**
 * The members that are the FLYER'S — things they decided ABOUT the file rather than things the
 * file says. A save is a replace in place and REOPENING a flight is a save, so every one of
 * these has to survive it or coming back to a flight throws away what the flyer wrote on it
 * the second time rather than the first, which is the worst way to lose a thing.
 */
const FLYER_OWNED = ['note', 'summaryText', 'highRateText', 'caption', 'read', 'flightId'] as const;
type FlyerOwned = (typeof FLYER_OWNED)[number];

/**
 * Every member of `RecentFlight` is one or the other, and this stops compiling when a new one
 * is neither.
 *
 * The list-it-twice failure has now cost this file four members — the report caption, the
 * chosen stretch, the file's own bytes, and the stretch AGAIN on the reopen path, where it
 * survived one reload and vanished on the second because `saveRecent` carried three named
 * members forward and `read` was not one of them. `serializeLogbook`'s round-trip is pinned by
 * a `Required<RecentFlight>` fixture for the same reason; this is that guard for the other
 * rebuild, and neither can be satisfied by remembering.
 */
type Unclassified = Exclude<keyof RecentFlight, FromTheFile | FlyerOwned>;
const _everyMemberIsClassified: Unclassified extends never ? true : ['unclassified member of RecentFlight', Unclassified] = true;
void _everyMemberIsClassified;

/**
 * What to store when this file is already in the logbook: the fresh read of the file, plus
 * everything the flyer decided about it.
 *
 * Pure, and exported, so the rule is a unit test rather than a hope — `saveRecent` itself can
 * only be exercised through a browser, which is exactly how the crop came to be lost with a
 * green suite. `dups` is every stored row that is this same file (a save replaces in place and
 * deletes any extras); the flyer's members come from the NEWEST of them, as a set — see below
 * for why not "from whichever copy has it".
 */
export function replaceInPlace(rec: IncomingFlight, dups: RecentFlight[]): Omit<RecentFlight, 'id' | 'addedAt'> {
  // The NEWEST stored copy of this file, and only that one. There is normally exactly one — a
  // save deletes the extras — but a restored backup can bring an older row for the same file
  // back alongside a newer one, and then reading each member from "whichever copy has it" mixes
  // two moments into a state that never existed: a crop the flyer cancelled and a caption they
  // deleted come back on the next reopen, carried by the copy that predates the decision. That
  // is the exact inverse of the loss this function exists to prevent, so the flyer's members are
  // taken as a SET from the last state they left the file in.
  const latest = dups.length ? dups.reduce((a, b) => (b.addedAt > a.addedAt ? b : a)) : undefined;
  const inherited = <K extends FlyerOwned>(key: K): RecentFlight[K] | undefined => {
    const incoming = (rec as Partial<RecentFlight>)[key];
    if (incoming !== undefined && incoming !== '') return incoming as RecentFlight[K];
    return latest?.[key];
  };
  return {
    ...rec,
    // Always a string: a flight with no note has '' rather than a missing member, and the
    // logbook's prune reads it to decide what is kept.
    note: inherited('note') ?? '',
    ...(inherited('summaryText') ? { summaryText: inherited('summaryText')! } : {}),
    ...(inherited('highRateText') ? { highRateText: inherited('highRateText')! } : {}),
    ...(inherited('caption') ? { caption: inherited('caption')! } : {}),
    ...(inherited('read') ? { read: inherited('read')! } : {}),
    ...(inherited('flightId') ? { flightId: inherited('flightId')! } : {}),
  };
}

/**
 * Which stored rows this save pushes out — every noted flight kept (a logbook entry, capped to
 * bound storage) and the most recent un-noted ones, with the incoming flight filling one slot.
 *
 * **Prunes by FLIGHT, not by row.** A flight flown on two altimeters occupies two rows, and
 * pruning rows took them one at a time: the flight silently changed which recording reported it
 * and the "N flights were forgotten" note named a file the flyer had never thought of as a
 * flight. Worse, a note can only be written on the row the logbook SHOWS — the one that reports
 * the flight — so a noted cert flight's backup recording counted as un-noted and was deleted
 * for good while the flight itself was kept. A note keeps the flight, which means all of it.
 *
 * Pure and exported so this is a unit test rather than a browser-only path; `others` is every
 * stored row except the ones the save is replacing. Returns the rows to delete, in the order
 * they leave.
 */
export function planPrune(others: RecentFlight[]): RecentFlight[] {
  const byFlight = new Map<string, RecentFlight[]>();
  for (const r of others) {
    const key = r.flightId || r.id;
    const at = byFlight.get(key);
    if (at) at.push(r);
    else byFlight.set(key, [r]);
  }
  // A flight is as recent as its most recent recording, and noted if ANY recording is noted.
  const flights = [...byFlight.values()]
    .map((recordings) => ({ recordings, addedAt: Math.max(...recordings.map((r) => r.addedAt)), noted: recordings.some((r) => r.note) }))
    .sort((a, b) => b.addedAt - a.addedAt);
  const drop = [
    ...flights.filter((f) => !f.noted).slice(MAX - 1),
    ...flights.filter((f) => f.noted).slice(NOTED_MAX),
  ];
  return drop.flatMap((f) => f.recordings);
}

export async function saveRecent(rec: IncomingFlight): Promise<SaveResult> {
  let savedId: string | null = null;
  const forgotten: string[] = [];
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    const isDup = (r: RecentFlight) => isSameStoredFlight(r, rec);
    const store = tx(db, 'readwrite');

    // Replace any earlier copy of the same file, carrying everything the FLYER decided about
    // it forward — the note, the summary it was paired with, the report caption, the stretch
    // they chose, and which flight it is a recording of. The rule lives in `replaceInPlace`
    // above rather than as a list here, because a list here is what lost the crop.
    const dups = all.filter(isDup);
    // KEEP the id when this file is already in the logbook. A logbook id is an ADDRESS —
    // `/?open=<id>` is the report's, and `/compare?ids=a,b,c` names a comparison's flights —
    // and minting a fresh one on every save quietly broke both. Measured: two flights
    // dropped, a comparison permalink taken, then flight one reopened (which is all a click
    // on its logbook row does) — its id changed, and the permalink fell back to the empty
    // picker without a word about the flights it could no longer find. A save is a replace
    // in place, so the address it replaces is the address it should keep.
    const existing = all.find(isDup);
    const id = existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    store.put({
      ...replaceInPlace(rec, dups),
      id,
      addedAt: Date.now(),
    });
    // AFTER the put, and that ordering is the whole point. Within one transaction the order of
    // operations on different keys does not matter to IndexedDB — but it matters to what is
    // already QUEUED if `put` throws synchronously (a value that will not structured-clone).
    // Queued first, these deletes would ride a transaction that then commits with nothing put:
    // the older copy of the flight gone and the new one never stored. Queued second, a throw
    // from `put` leaves the transaction empty.
    for (const r of all) if (isDup(r) && r.id !== id) store.delete(r.id);
    // Deleted by recording; NAMED by flight. A two-altimeter flight leaving the window is one
    // flight forgotten, and saying "2 flights were forgotten" while naming two files is the
    // same conflation `planPrune` exists to end, one layer up. The flight is named by the
    // recording that reports it, which is the name the logbook was showing.
    const dropped = planPrune(all.filter((r) => !isDup(r)));
    const droppedIds = new Set(dropped.map((r) => r.id));
    for (const r of dropped) store.delete(r.id);

    // **The transaction's OUTCOME decides what this reports, and it used to be its intent.**
    // `savedId` was assigned the moment the `put` was QUEUED, and an error or abort was
    // `preventDefault()`ed away — so a QuotaExceeded abort (a very large file text, a full
    // origin, Safari's ITP eviction) returned a perfectly good-looking id with nothing stored.
    // Everything downstream believed it: `/compare` announced the files were "added to your
    // logbook — tick them", the analyze page kept no signal that the flight was not saved, and a
    // reload lost it. A save that cannot report failure makes every surface above it a liar.
    //
    // The error is deliberately not prevented, for the same reason `importLogbook` stopped
    // preventing it: preventing the default is exactly what stops the transaction aborting, so
    // keeping it would let a partial write commit while this reported nothing saved. Atomic —
    // the flight and the prune it triggered land together or neither does — is the only version
    // where `forgotten` is also true, since nothing was pruned if nothing committed.
    const complete = await new Promise<boolean>((resolve) => {
      store.transaction.oncomplete = () => resolve(true);
      store.transaction.onabort = () => resolve(false);
    });
    // **An abort does not mean there is no flight here — it means this WRITE did not land.** An
    // aborted transaction rolls back, so where this save was a replace-in-place the earlier copy
    // survives at exactly this id, and that id is still the flight's address: `/?open=<id>` opens
    // it, a comparison can name it, the caption editor has a row to write to. Returning null for
    // it would have been a second lie in the opposite direction — and a live one, because
    // `Analyzer` passes this straight to `rememberOpenId`, which DELETES `?open=` when it is
    // null. Re-opening a logbook flight on a quota-full device would have read fine and then
    // silently dropped its own address out of the URL, so Back and reload landed on the empty
    // drop zone. Null is right only for a flight that was never in the logbook to begin with.
    if (!complete) return { id: existing ? id : null, forgotten: [] };
    savedId = id;
    for (const g of groupRecordings(dropped)) if (droppedIds.has(g.primary.id)) forgotten.push(g.primary.name);
  } catch {
    /* storage unavailable — just don't remember */
  }
  return { id: savedId, forgotten };
}

/** Remember the device-summary file a flight was paired with, so the pairing survives a
 *  reload. Written after the fact because the pairing can only be decided once every file in
 *  a drop has been read, and the flight is saved as it is read. */
export async function attachHighRateText(id: string, highRateText: string): Promise<void> {
  try {
    const db = await idb();
    const rec = await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>);
    if (!rec) return;
    tx(db, 'readwrite').put({ ...rec, highRateText });
  } catch {
    /* ignore */
  }
}

export async function attachSummaryText(id: string, summaryText: string): Promise<void> {
  try {
    const db = await idb();
    const rec = await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>);
    if (!rec) return;
    tx(db, 'readwrite').put({ ...rec, summaryText });
  } catch {
    /* ignore */
  }
}

/** Set (or clear) a flight's logbook note. A note makes the flight sticky. */
export async function updateNote(id: string, note: string): Promise<void> {
  try {
    const db = await idb();
    const rec = await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>);
    if (!rec) return;
    tx(db, 'readwrite').put({ ...rec, note });
  } catch {
    /* ignore */
  }
}

/** Keep the label and notes a flyer typed onto a report. Mirrors `updateNote`: read, merge,
 *  put — so it can't clobber a field written by a concurrent save. */
/**
 * Keep (or forget) the stretch a flyer chose to read.
 *
 * Written the moment they choose it rather than on the way out, for the same reason the caption
 * is: the way out of a flight report is a link, a Back, or closing the tab, and none of those is
 * a save. Passing null forgets it, which is what "Read the whole file" means.
 */
export async function saveReadWindow(id: string, read: { fromS: number; toS: number } | null): Promise<void> {
  try {
    const db = await idb();
    const rec = await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>);
    if (!rec) return;
    const next = { ...rec };
    if (read) next.read = read;
    else delete next.read;
    tx(db, 'readwrite').put(next);
  } catch {
    /* storage unavailable — the crop still applies to this view */
  }
}

export async function saveCaption(id: string, caption: { label: string; notes: string }): Promise<void> {
  try {
    const db = await idb();
    const rec = await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>);
    if (!rec) return;
    const empty = !caption.label.trim() && !caption.notes.trim();
    const next = { ...rec };
    if (empty) delete next.caption;
    else next.caption = caption;
    tx(db, 'readwrite').put(next);
  } catch {
    /* storage unavailable — the caption still applies to this view */
  }
}

/**
 * Say which flight each of these rows is a recording of — or, with `flightId: null`, that each
 * is a flight of its own again.
 *
 * One pass over the store for the whole set, because a grouping is a single statement about
 * several rows: writing them one at a time would leave a half-joined flight on screen if the
 * tab closed in between.
 *
 * Each row is read and written back INSIDE the one read-write transaction, from its `get`
 * callback rather than across an `await`. Two reasons, and both have teeth: an IndexedDB
 * transaction goes inactive the moment control returns to the event loop, so a read-await-write
 * loop commits early and drops the rest of the set; and reading in a separate, already-committed
 * transaction means writing the WHOLE record back from a stale snapshot, which silently reverts
 * any note, caption or crop that landed in between — and every one of those writers is
 * fire-and-forget from a click.
 */
export async function setFlightIds(changes: { id: string; flightId: string | null }[]): Promise<void> {
  if (changes.length === 0) return;
  try {
    const db = await idb();
    const store = tx(db, 'readwrite');
    store.transaction.onerror = (e) => e.preventDefault();
    for (const { id, flightId } of changes) {
      const req = store.get(id) as IDBRequest<RecentFlight>;
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec) return;
        const next = { ...rec };
        if (flightId) next.flightId = flightId;
        else delete next.flightId;
        // Same transaction, issued from the read's own callback, so it stays active.
        store.put(next);
      };
    }
    // Resolve when the transaction has COMMITTED, not when the puts have been issued. Every
    // other writer here is fire-and-forget from a click, but this one is followed by a reload
    // in the one journey that matters — the flyer says which recording reports the flight and
    // comes back to check — and an uncommitted transaction is discarded when the page goes
    // away. Measured: the grouping was on screen, survived a refresh of the list, and was back
    // to its previous state after a reload.
    await new Promise<void>((resolve) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onabort = (e) => {
        e.preventDefault();
        resolve();
      };
    });
  } catch {
    /* storage unavailable — the logbook simply doesn't remember the grouping */
  }
}

/**
 * A stored flight reduced to what the LIST needs — everything but the file itself.
 *
 * The THIRD place every member of a row has to be named, after `serializeLogbook`'s round-trip
 * and `replaceInPlace`'s from-the-file / flyer-owned split. Forgetting a member here is the
 * quietest of the three failures: the value is stored, survives a backup, and is simply
 * invisible to every surface — nothing throws and no test fails, because this only ever runs
 * against a browser's IndexedDB. Pure and exported so it doesn't.
 */
export function toMeta(rec: RecentFlight): RecentMeta {
  const { id, name, formatLabel, addedAt, apogeeM, maxVelocityMs, apogeeCaveats, note, flownAt, flightId, read } = rec;
  return {
    id,
    name,
    formatLabel,
    addedAt,
    apogeeM,
    // Older records predate these fields — treat them as "unknown"/empty.
    maxVelocityMs: maxVelocityMs ?? null,
    note: note ?? '',
    // Only where the apogee carries one — the list needs it to decide whether a flight can wear
    // the "highest" star at all, which is the whole reason it is on the projection.
    ...(apogeeCaveats ? { apogeeCaveats } : {}),
    // Only where the file stated it; entries saved before this was read have none.
    ...(flownAt ? { flownAt } : {}),
    // Only where the flyer has said this file is one recording of a flight that has several.
    ...(flightId ? { flightId } : {}),
    // …and only where they chose a stretch of it, which is almost never.
    ...(read ? { read } : {}),
  };
}

/**
 * What Debrief says when the browser refuses it storage.
 *
 * **Two surfaces say it today, and this is NOT yet the app's single voice — measured, not assumed.**
 * The condition reaches at least seven places. `compareFromLogbook` used to report each id as
 * *"no longer in this logbook"* and the `?open=<id>` deep link said *"That saved flight could no
 * longer be read"*; both accused the flyer's device of deleting a flight nobody had asked for, and
 * both say this instead. The logbook list has its own wording of the same fact
 * (`RecentFlights.tsx`), which is deliberately longer because it is a whole state rather than one
 * line in a note.
 *
 * **The IMPORT path was the worst of the family and is fixed** (2026-08-03): `importLogbook`
 * reports its transaction's outcome, so a refused restore says the backup could not be written and
 * to keep the file, instead of *"Restored N flights"* over an empty logbook. It carries its own
 * sentence rather than this constant because it has something extra and specific to say — keep the
 * file — and a shared string that has to be true everywhere cannot say that.
 *
 * **This one says READ OR KEEP, so only say it where reads really are refused.** That is the
 * `indexedDB`-is-absent shape — a locked-down browser, some private windows — where `idb()` throws
 * and nothing can be answered. It is NOT the shape a full quota or an eviction takes: there the
 * reads work perfectly and only the write rolls back, so this sentence would be half false, and it
 * would sit directly under a logbook list happily showing the flights it claims cannot be read.
 * Use `STORAGE_WRITE_REFUSED` for that. One condition with two genuinely different truths is two
 * strings, not one; the mistake to avoid is the *third* wording, not the second.
 *
 * A storage refusal is not a deletion and must never be reported as one.
 */
export const STORAGE_REFUSED =
  'this browser won’t let Debrief read or keep a logbook on this device';

/**
 * What Debrief says when the browser reads fine and refuses to WRITE.
 *
 * A full origin quota and Safari's ITP eviction both take this shape, and between them they are
 * the common refusal in the wild — `indexedDB` missing entirely is the rare one. `saveRecent` and
 * `importLogbook` both report their transaction's outcome (2026-08-03), so a caller can finally
 * tell this apart from a read failure and say the half that is true.
 *
 * The import path still carries its own longer sentence rather than this constant, because it has
 * something extra and specific to say — *keep the file* — and a shared string that has to be true
 * everywhere cannot say that.
 */
export const STORAGE_WRITE_REFUSED = 'this browser won’t let Debrief keep a logbook on this device';

/**
 * The logbook, and whether it could be read at all.
 *
 * **`listRecents()` cannot answer the second question, and that is the defect this exists for.**
 * It returns `[]` for a flyer who has never opened a flight AND for one whose browser refuses
 * storage — a private window, a locked-down profile, an origin the user has blocked. Measured:
 * `indexedDB` being undefined and `open()` throwing both land in the same `catch` and yield the
 * same empty array. So the surface said "flights you open are remembered here on this device" to
 * someone for whom that had just stopped being true, which is a promise rather than a state.
 *
 * `blocked` is the storage layer REFUSING, not an empty logbook. Callers that only want the rows
 * can keep using `listRecents`; a surface that renders one of `DESIGN.md` §5's five states needs
 * to tell an empty answer from no answer.
 */
export async function readRecents(): Promise<{ recents: RecentMeta[]; blocked: boolean }> {
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    return { recents: all.sort((a, b) => b.addedAt - a.addedAt).map(toMeta), blocked: false };
  } catch {
    return { recents: [], blocked: true };
  }
}

export async function listRecents(): Promise<RecentMeta[]> {
  return (await readRecents()).recents;
}

/** One saved flight, and whether the logbook could be read at all — see `readRecents` for why the
 *  second half has to be separate. `null` with `blocked: false` means the id is genuinely gone;
 *  `blocked: true` means nothing was asked, so nothing is known about that id. */
export async function readRecent(id: string): Promise<{ rec: RecentFlight | null; blocked: boolean }> {
  try {
    const db = await idb();
    const rec = (await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>)) ?? null;
    return { rec, blocked: false };
  } catch {
    return { rec: null, blocked: true };
  }
}

export async function getRecent(id: string): Promise<RecentFlight | null> {
  return (await readRecent(id)).rec;
}

export async function removeRecent(id: string): Promise<void> {
  try {
    const db = await idb();
    tx(db, 'readwrite').delete(id);
  } catch {
    /* ignore */
  }
}

export async function clearRecents(): Promise<void> {
  try {
    const db = await idb();
    tx(db, 'readwrite').clear();
  } catch {
    /* ignore */
  }
}

// --- Backup / restore ------------------------------------------------------
// The logbook lives only in this browser, so clearing it or moving devices loses
// it. Export bundles every kept flight (the file text plus its note and numbers)
// into a JSON file; import merges one back in. Still entirely on-device — the file
// is yours to keep, and nothing is uploaded.

const EXPORT_KIND = 'debrief-logbook';

/** Serialize the whole logbook (full flights, including the file text) to JSON. */
export async function exportLogbook(): Promise<string> {
  let flights: RecentFlight[] = [];
  try {
    const db = await idb();
    flights = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    flights.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    /* nothing stored / storage unavailable */
  }
  return serializeLogbook(flights, Date.now());
}

/**
 * The backup file's contents, as a pure function of the flights — so the round-trip against
 * `parseLogbookFlights` is a unit test rather than a hope.
 *
 * A `Uint8Array` is not a JSON type. `JSON.stringify` turns it into `{"0":80,"1":75,…}` —
 * a dozen characters per byte of file — and the field-by-field rebuild on the way back in
 * would reject that anyway. So a raw download's bytes travel as base64 under their own key,
 * and the array itself is dropped. This is the THIRD member that rebuild has silently lost
 * (the report caption, then the chosen stretch, now the file itself), which is why the
 * round-trip is asserted rather than reasoned about.
 */
export function serializeLogbook(flights: RecentFlight[], exportedAt: number): string {
  const out = flights.map(({ bytes, ...rest }) => (bytes?.length ? { ...rest, bytesB64: bytesToBase64(bytes) } : rest));
  return JSON.stringify({ kind: EXPORT_KIND, version: 1, exportedAt, flights: out }, null, 0);
}

/** Bytes → base64, in chunks so a multi-megabyte file can't blow the argument limit. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** A restored raw download's bytes, or null when the member isn't one. Rejected rather than
 *  coerced, like every other restored member: a hand-edited backup must not be able to hand a
 *  binary parser something that isn't the file. */
function bytesOf(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const bin = atob(v);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Coerce an unknown record to a RecentFlight, or null if it isn't one. */
function normalizeFlight(f: unknown): RecentFlight | null {
  if (!f || typeof f !== 'object') return null;
  const r = f as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.text !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    text: r.text,
    formatLabel: typeof r.formatLabel === 'string' ? r.formatLabel : 'Flight',
    addedAt: typeof r.addedAt === 'number' ? r.addedAt : Date.now(),
    apogeeM: typeof r.apogeeM === 'number' ? r.apogeeM : null,
    maxVelocityMs: typeof r.maxVelocityMs === 'number' ? r.maxVelocityMs : null,
    // Validated rather than trusted, like everything else rebuilt here: a hand-edited backup
    // must not be able to inject a shape, and an absent one means "no caveat" which is the
    // behaviour every row written before this field had.
    ...(apogeeCaveatsOf(r.apogeeCaveats) ? { apogeeCaveats: apogeeCaveatsOf(r.apogeeCaveats)! } : {}),
    note: typeof r.note === 'string' ? r.note : '',
    // A restored backup keeps the launch day, so the logbook doesn't come back dateless.
    // Validated rather than trusted: a hand-edited file shouldn't inject a shape.
    ...(flownAtOf(r.flownAt) ? { flownAt: flownAtOf(r.flownAt)! } : {}),
    // …and keeps a hand-made column mapping, or a restored logbook would ask the flyer to
    // map every custom file again.
    ...(mappingOf(r.mapping) ? { mapping: mappingOf(r.mapping)! } : {}),
    // …and the label and notes the flyer TYPED onto the report. `exportLogbook` writes the
    // whole record, so these were in every backup file already; rebuilding the record field
    // by field here is what dropped them on the way back in. They ride into every text,
    // Markdown, HTML and JSON export and the printed card, so a restore that loses them costs
    // a cert write-up its title — and says "Restored N flights" while doing it.
    ...(captionOf(r.caption) ? { caption: captionOf(r.caption)! } : {}),
    // …and the device-summary file this flight was paired with, which is the other half of
    // every cross-check panel. Without it a restored flight comes back with Debrief's read and
    // not the altimeter's own stated figures, which is the comparison a flyer restored the
    // logbook to keep.
    ...(typeof r.summaryText === 'string' && r.summaryText ? { summaryText: r.summaryText } : {}),
    // …and the high-rate half, for exactly the same reason: a restored flight without it comes
    // back with half of what was dropped, and no note anywhere saying so.
    ...(typeof r.highRateText === 'string' && r.highRateText ? { highRateText: r.highRateText } : {}),
    // …and the stretch of the file the flyer said was their flight. Export writes the whole
    // record, so a backup carries it; rebuilding field by field here is exactly what dropped
    // the caption once, and this is the same class of thing — something the flyer decided.
    ...(readWindowOf(r.read) ? { read: readWindowOf(r.read)! } : {}),
    // …and the FILE, for the raw downloads whose text is only a lossy view of it. Without
    // this a restored .rff comes back as the mojibake its text always was, and the flyer is
    // told their flight log is not a flight log — on the one path that exists to move a
    // logbook to another machine.
    ...(bytesOf(r.bytesB64) ? { bytes: bytesOf(r.bytesB64)! } : {}),
    // …and which flight this file is a recording OF. A backup that drops it restores a
    // two-altimeter flight as two flights, silently — the same class of loss as the caption
    // and the chosen stretch, and the reason the fixture above is `Required<RecentFlight>`.
    ...(typeof r.flightId === 'string' && r.flightId ? { flightId: r.flightId } : {}),
  };
}

/** A stored/imported read window, or null when it isn't one. Validated rather than coerced,
 *  like every other restored member: a hand-edited backup must not be able to hand the
 *  analyzer a crop that runs backwards or off the end of the file, and half a window is not a
 *  window — a restore that applied `from` and dropped `to` would read a different flight and
 *  say nothing. */
function readWindowOf(v: unknown): { fromS: number; toS: number } | null {
  if (!v || typeof v !== 'object') return null;
  const w = v as Record<string, unknown>;
  const from = w.fromS;
  const to = w.toS;
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return null;
  return { fromS: from, toS: to };
}

/** A stored/imported report caption, or null when it isn't one. Same rule as `flownAtOf` and
 *  `mappingOf`: REJECTED rather than coerced. A member of the wrong type fails the whole
 *  caption, because blanking it instead would restore half of what the flyer typed and still
 *  report "Restored N flights" — the precise failure this is here to end. An absent member is
 *  a different thing from a wrong one and is allowed: a flyer who typed only a title typed
 *  something.
 *
 *  Blank is judged the way `saveCaption` judges it — on the trimmed strings — so import cannot
 *  resurrect a whitespace-only caption that the writer would have deleted, which would then
 *  ride back out through `saveRecent`'s inheritance on every reopen. */
function captionOf(v: unknown): { label: string; notes: string } | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (c.label !== undefined && typeof c.label !== 'string') return null;
  if (c.notes !== undefined && typeof c.notes !== 'string') return null;
  const label = typeof c.label === 'string' ? c.label : '';
  const notes = typeof c.notes === 'string' ? c.notes : '';
  return label.trim() || notes.trim() ? { label, notes } : null;
}

/** A stored/imported column mapping, or null when it isn't one. Same rule as `flownAtOf`:
 *  a hand-edited backup file must not be able to inject a shape the app then trusts. */
function mappingOf(v: unknown): StoredMapping[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: StoredMapping[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') return null;
    const m = item as Record<string, unknown>;
    if (typeof m.index !== 'number' || !Number.isInteger(m.index) || m.index < 0) return null;
    if (typeof m.role !== 'string') return null;
    if (m.unit != null && typeof m.unit !== 'string') return null;
    out.push({ index: m.index, role: m.role, unit: typeof m.unit === 'string' ? m.unit : null });
  }
  return out;
}

/** A stored/imported `flownAt`, or null when it isn't one. */
function flownAtOf(v: unknown): FlownAt | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Record<string, unknown>;
  if (typeof f.stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(f.stamp)) return null;
  if (f.zone !== 'UTC' && f.zone !== 'logger') return null;
  return { stamp: f.stamp, zone: f.zone };
}

/** Parse an exported logbook (the envelope, or a bare array of flights) into
 *  valid flight records — pure, so the file handling is testable without storage.
 *  Returns [] for anything malformed. */
export function parseLogbookFlights(json: string): RecentFlight[] {
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return [];
  }
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { flights?: unknown }).flights)
      ? (payload as { flights: unknown[] }).flights
      : null;
  if (!raw) return [];
  return raw.map(normalizeFlight).filter((f): f is RecentFlight => f !== null);
}

/**
 * Merge an exported logbook back into the store, keyed by id so re-importing the same file is
 * idempotent. Storage caps aren't applied — a restore is the user's own data, deliberately brought
 * back.
 *
 * Reports the transaction's OUTCOME, not its intent: `{ restored: 0, blocked: false }` is a file
 * with no flights in it, and `{ restored: 0, blocked: true }` is a browser that refused to write
 * them. A caller that cannot tell those apart has to blame one of them, and the old signature —
 * a bare count — made it blame the flyer's file.
 */
export async function importLogbook(json: string): Promise<{ restored: number; blocked: boolean }> {
  const flights = parseLogbookFlights(json);
  // A file with no flights in it is a file problem, not a storage one. `blocked: false` is the
  // load-bearing half of that: it is what lets the surface say "is this a Debrief export?" here and
  // NOT say it when the browser refused a perfectly good backup.
  if (flights.length === 0) return { restored: 0, blocked: false };
  try {
    const db = await idb();
    const store = tx(db, 'readwrite');
    for (const f of flights) store.put(f);
    // **The restore is ATOMIC, and reporting its outcome is the whole point.** This used to resolve
    // on `onabort` and then `return flights.length` regardless, so a restore the browser refused —
    // a full quota, a private window, Safari's ITP eviction — reported "Restored 12 flights." over
    // an empty logbook. That is the worst direction this family of defects runs in, because the
    // obvious next thing a flyer does after a successful restore is delete the file it came from.
    //
    // **The error is deliberately NOT `preventDefault()`ed, and the first attempt at this fix got
    // that backwards.** Preventing the default on an IDB error event is exactly what stops the
    // transaction aborting — so keeping it while reporting `blocked` meant one oversized record
    // could resolve "nothing was restored, keep the file" while the transaction went on to commit
    // every other flight, which are then invisible until a reload. Letting it abort is what makes
    // `blocked` true when it says so: either the whole backup landed or none of it did, and the
    // sentence a flyer reads is true either way. This is the shape `setFlightIds` already uses.
    const complete = await new Promise<boolean>((resolve) => {
      store.transaction.oncomplete = () => resolve(true);
      store.transaction.onabort = () => resolve(false);
    });
    return complete ? { restored: flights.length, blocked: false } : { restored: 0, blocked: true };
  } catch {
    return { restored: 0, blocked: true };
  }
}


/** A stored apogee-caveat set, validated. Anything that is not one of the two known booleans is
 *  dropped rather than carried, and an empty result is `undefined` so it round-trips as absent. */
function apogeeCaveatsOf(v: unknown): { floor?: boolean; unproven?: boolean } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as { floor?: unknown; unproven?: unknown };
  const out = {
    ...(c.floor === true ? { floor: true } : {}),
    ...(c.unproven === true ? { unproven: true } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
