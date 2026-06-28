// Recent flights, remembered on this device only (IndexedDB). We keep the
// original file text plus a little metadata so a flight can be reopened without
// finding the file again. Nothing is uploaded; this is the same privacy posture
// as the rest of the app, and it can be cleared in one tap. All calls fail soft —
// private-mode or storage-blocked browsers just won't remember anything.

export interface RecentMeta {
  id: string;
  name: string;
  formatLabel: string;
  addedAt: number;
  apogeeM: number | null;
  /** Max velocity (m/s) for the logbook; null when the flight didn't yield one. */
  maxVelocityMs: number | null;
  /** A free-text logbook note (motor, conditions, cert…). A noted flight is kept
   *  rather than pruned — it's a logbook entry, not just a recent. */
  note: string;
}

export interface RecentFlight extends RecentMeta {
  text: string;
}

const DB_NAME = 'debrief';
const STORE = 'recents';
const MAX = 12; // most-recent un-noted flights to remember
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

export async function saveRecent(rec: Omit<RecentFlight, 'id' | 'addedAt' | 'note'>): Promise<void> {
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
    for (const r of all) if (isDup(r)) store.delete(r.id);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    store.put({ ...rec, note: inheritedNote, id, addedAt: Date.now() });

    // Prune: keep every noted flight (a logbook entry, capped to bound storage),
    // and the most recent un-noted ones — the new flight fills one of those slots.
    const others = all.filter((r) => !isDup(r)).sort((a, b) => b.addedAt - a.addedAt);
    const noted = others.filter((r) => r.note);
    const unnoted = others.filter((r) => !r.note);
    for (const r of unnoted.slice(MAX - 1)) store.delete(r.id);
    for (const r of noted.slice(NOTED_MAX)) store.delete(r.id);
  } catch {
    /* storage unavailable — just don't remember */
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

export async function listRecents(): Promise<RecentMeta[]> {
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    return all
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(({ id, name, formatLabel, addedAt, apogeeM, maxVelocityMs, note }) => ({
        id,
        name,
        formatLabel,
        addedAt,
        apogeeM,
        // Older records predate these fields — treat them as "unknown"/empty.
        maxVelocityMs: maxVelocityMs ?? null,
        note: note ?? '',
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
