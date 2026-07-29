// Recent flights, remembered on this device only (IndexedDB). We keep the
// original file text plus a little metadata so a flight can be reopened without
// finding the file again. Nothing is uploaded; this is the same privacy posture
// as the rest of the app, and it can be cleared in one tap. All calls fail soft —
// private-mode or storage-blocked browsers just won't remember anything.

import type { FlownAt } from './flight/flownAt';

export interface RecentMeta {
  id: string;
  name: string;
  formatLabel: string;
  addedAt: number;
  apogeeM: number | null;
  /** Max velocity (m/s) for the logbook; null when the flight didn't yield one. */
  maxVelocityMs: number | null;
  /** When the flight flew, where its file states it (see lib/flight/flownAt.ts). Absent on
   *  entries saved before this was read, and on files that carry no date — the logbook shows
   *  when it was opened in that case rather than inventing a launch day. */
  flownAt?: FlownAt;
  /** A free-text logbook note (motor, conditions, cert…). A noted flight is kept
   *  rather than pruned — it's a logbook entry, not just a recent. */
  note: string;
}

export interface RecentFlight extends RecentMeta {
  text: string;
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

export async function saveRecent(rec: Omit<RecentFlight, 'id' | 'addedAt' | 'note'>): Promise<SaveResult> {
  let savedId: string | null = null;
  const forgotten: string[] = [];
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    const isDup = (r: RecentFlight) => r.name === rec.name && r.formatLabel === rec.formatLabel;
    const store = tx(db, 'readwrite');
    // Swallow a quota/abort failure (e.g. a very large file text) instead of
    // letting it surface as an uncaught transaction error.
    store.transaction.onerror = (e) => e.preventDefault();
    store.transaction.onabort = (e) => e.preventDefault();

    // Replace any earlier copy of the same file, but carry its note forward so a
    // re-open doesn't wipe the logbook entry.
    const inheritedNote = all.find((r) => isDup(r) && r.note)?.note ?? '';
    // …and the same for the device summary it was paired with. Re-opening a flight saves it
    // again, and this replace-in-place is what a save IS, so anything the flyer's earlier
    // drop established has to survive it or reopening a paired flight would silently
    // un-pair it — the second time, not the first, which is the worst way to lose a thing.
    const inheritedSummary = rec.summaryText ?? all.find((r) => isDup(r) && r.summaryText)?.summaryText;
    // …and the label and notes the flyer typed onto the report, for exactly the reason above.
    // A save is a replace in place, and REOPENING a flight is a save — so without this, coming
    // back to a flight wiped the two things on that screen the flyer had written themselves,
    // the second time rather than the first.
    const inheritedCaption = all.find((r) => isDup(r) && r.caption)?.caption;
    // KEEP the id when this file is already in the logbook. A logbook id is an ADDRESS —
    // `/?open=<id>` is the report's, and `/compare?ids=a,b,c` names a comparison's flights —
    // and minting a fresh one on every save quietly broke both. Measured: two flights
    // dropped, a comparison permalink taken, then flight one reopened (which is all a click
    // on its logbook row does) — its id changed, and the permalink fell back to the empty
    // picker without a word about the flights it could no longer find. A save is a replace
    // in place, so the address it replaces is the address it should keep.
    const existing = all.find(isDup);
    const id = existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    for (const r of all) if (isDup(r) && r.id !== id) store.delete(r.id);
    store.put({
      ...rec,
      note: inheritedNote,
      ...(inheritedSummary ? { summaryText: inheritedSummary } : {}),
      ...(inheritedCaption ? { caption: inheritedCaption } : {}),
      id,
      addedAt: Date.now(),
    });
    savedId = id;

    // Prune: keep every noted flight (a logbook entry, capped to bound storage),
    // and the most recent un-noted ones — the new flight fills one of those slots.
    const others = all.filter((r) => !isDup(r)).sort((a, b) => b.addedAt - a.addedAt);
    const noted = others.filter((r) => r.note);
    const unnoted = others.filter((r) => !r.note);
    for (const r of unnoted.slice(MAX - 1)) {
      store.delete(r.id);
      forgotten.push(r.name);
    }
    for (const r of noted.slice(NOTED_MAX)) {
      store.delete(r.id);
      forgotten.push(r.name);
    }
  } catch {
    /* storage unavailable — just don't remember */
  }
  return { id: savedId, forgotten };
}

/** Remember the device-summary file a flight was paired with, so the pairing survives a
 *  reload. Written after the fact because the pairing can only be decided once every file in
 *  a drop has been read, and the flight is saved as it is read. */
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

export async function listRecents(): Promise<RecentMeta[]> {
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    return all
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(({ id, name, formatLabel, addedAt, apogeeM, maxVelocityMs, note, flownAt }) => ({
        id,
        name,
        formatLabel,
        addedAt,
        apogeeM,
        // Older records predate these fields — treat them as "unknown"/empty.
        maxVelocityMs: maxVelocityMs ?? null,
        note: note ?? '',
        // Only where the file stated it; entries saved before this was read have none.
        ...(flownAt ? { flownAt } : {}),
      }));
  } catch {
    return [];
  }
}

export async function getRecent(id: string): Promise<RecentFlight | null> {
  try {
    const db = await idb();
    return (await reqToPromise(tx(db, 'readonly').get(id) as IDBRequest<RecentFlight>)) ?? null;
  } catch {
    return null;
  }
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
  return JSON.stringify({ kind: EXPORT_KIND, version: 1, exportedAt: Date.now(), flights }, null, 0);
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
    note: typeof r.note === 'string' ? r.note : '',
    // A restored backup keeps the launch day, so the logbook doesn't come back dateless.
    // Validated rather than trusted: a hand-edited file shouldn't inject a shape.
    ...(flownAtOf(r.flownAt) ? { flownAt: flownAtOf(r.flownAt)! } : {}),
    // …and keeps a hand-made column mapping, or a restored logbook would ask the flyer to
    // map every custom file again.
    ...(mappingOf(r.mapping) ? { mapping: mappingOf(r.mapping)! } : {}),
  };
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
 * Merge an exported logbook back into the store, keyed by id so re-importing the
 * same file is idempotent. Storage caps aren't applied — a restore is the user's
 * own data, deliberately brought back. Returns how many flights were merged in
 * (0 on a malformed file).
 */
export async function importLogbook(json: string): Promise<number> {
  const flights = parseLogbookFlights(json);
  if (flights.length === 0) return 0;
  try {
    const db = await idb();
    const store = tx(db, 'readwrite');
    store.transaction.onerror = (e) => e.preventDefault();
    store.transaction.onabort = (e) => e.preventDefault();
    for (const f of flights) store.put(f);
    await new Promise<void>((resolve) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onabort = () => resolve();
    });
    return flights.length;
  } catch {
    return 0;
  }
}
