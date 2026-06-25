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
}

export interface RecentFlight extends RecentMeta {
  text: string;
}

const DB_NAME = 'debrief';
const STORE = 'recents';
const MAX = 12;

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

export async function saveRecent(rec: Omit<RecentFlight, 'id' | 'addedAt'>): Promise<void> {
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    // De-dup by name + format: replace an earlier copy of the same file.
    const store = tx(db, 'readwrite');
    // Swallow a quota/abort failure (e.g. a very large file text) instead of
    // letting it surface as an uncaught transaction error.
    store.transaction.onerror = (e) => e.preventDefault();
    store.transaction.onabort = (e) => e.preventDefault();
    for (const r of all) {
      if (r.name === rec.name && r.formatLabel === rec.formatLabel) store.delete(r.id);
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    store.put({ ...rec, id, addedAt: Date.now() });
    // Prune to the most recent MAX.
    const kept = all
      .filter((r) => !(r.name === rec.name && r.formatLabel === rec.formatLabel))
      .sort((a, b) => b.addedAt - a.addedAt);
    for (const r of kept.slice(MAX - 1)) store.delete(r.id);
  } catch {
    /* storage unavailable — just don't remember */
  }
}

export async function listRecents(): Promise<RecentMeta[]> {
  try {
    const db = await idb();
    const all = await reqToPromise(tx(db, 'readonly').getAll() as IDBRequest<RecentFlight[]>);
    return all
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(({ id, name, formatLabel, addedAt, apogeeM }) => ({ id, name, formatLabel, addedAt, apogeeM }));
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
