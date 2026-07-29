// What a flyer ARRANGED about a comparison, kept on this device.
//
// Two things, and they are the same kind of thing: the label and notes they typed, and the order
// they put the columns in. Both are work. Both ride into the exported Markdown, HTML, JSON, CSV,
// the clipboard copy and the SVG figures — every one of those reads the same ordered array — and
// the panel's own copy says the caption is kept. All of it was bare `useState`.
//
// Losing it took two gestures, not one. A reload of an address built to be reloadable came back
// blank; so did a DROP, because `CompareSurface` renders `CompareView` only in its `ready` state
// and a drop puts it into "Reading the flights…", which unmounts the view and takes its state
// with it. Dropping the rest of a launch day onto a comparison you had just arranged is the
// ordinary way one gets built, and it threw the arrangement away.
//
// A comparison has no id of its own — it IS its set of flights — so that set is the key, sorted,
// because dragging the columns into the order a document wants must not make the write-up a
// different one. (The ORDER is stored inside the entry; only the key is sorted.)
//
// The key is EXACT, and that is a deliberate second attempt. The first version also matched any
// stored subset, so that adding a flight to a comparison kept its title. Three things fell out of
// that one rule, all found by reading it back rather than by using it:
//
//   * a caption could not be DELETED. Clearing the fields removed the exact key while the subset
//     copy survived, and the next load carried it straight back — a title the flyer had removed,
//     painted over the table and embedded in the export, with no way out but deleting flights;
//   * "grew out of" was really "any subset", so a season overview opened titled after an
//     unrelated cert flight that happened to share two of its flights;
//   * every intermediate set got its own stored copy, so one launch day burned six slots.
//
// Carrying an arrangement onto a set that grew is still worth having, and `CompareView` does it
// from the set it was JUST showing rather than by searching storage — session-local, exact, and
// unable to resurrect anything.

/** The storage key still says "captions" because that is what flyers already have under it: it
 *  shipped holding the label and notes, and renaming it would silently drop every title stored
 *  before this. The entry grew; the key it lives at did not need to. */
const KEY = 'debrief.compare.captions';

/** How many comparisons keep an arrangement. A season is a few dozen write-ups at most, and each
 *  entry holds only what the flyer typed and the order they chose. */
export const MAX_KEPT = 40;

/** Ordering the columns by one of the metric rows. `null` when the flyer has not asked for one. */
export interface CompareSort {
  label: string;
  dir: 'desc' | 'asc';
}

/** Everything this remembers about one comparison. `order` is the hand-made column order and
 *  `sort` the metric one; they are mutually exclusive on screen — taking one clears the other —
 *  but both are stored, so whichever is live comes back. */
export interface CompareMemory {
  label: string;
  notes: string;
  order: string[] | null;
  sort: CompareSort | null;
}

/** Stored form: the memory plus when it was last written, so eviction can drop the OLDEST rather
 *  than whatever happens to sit first in the object. Re-writing a key keeps its original insertion
 *  position, so position is not age — and evicting by position dropped the entry the flyer was
 *  editing while untouched older ones survived. */
interface StoredMemory extends CompareMemory {
  at: number;
}

export const EMPTY: CompareMemory = { label: '', notes: '', order: null, sort: null };

/** The storage key for a set of flights, independent of the order they are shown in. */
export function captionKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

/** Whether there is anything here worth a slot. An entry with nothing in it is removed rather
 *  than stored, so that clearing the last thing a flyer set genuinely deletes the record — and so
 *  that a blank entry cannot resurrect an empty panel. */
export function isEmptyMemory(m: CompareMemory): boolean {
  return !m.label.trim() && !m.notes.trim() && !m.order?.length && !m.sort;
}

type Store = Record<string, StoredMemory>;

function readSort(v: unknown): CompareSort | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.label !== 'string' || !s.label) return null;
  if (s.dir !== 'desc' && s.dir !== 'asc') return null;
  return { label: s.label, dir: s.dir };
}

function readOrder(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  // Every member, or none. A half-read order would put the columns somewhere the flyer never
  // chose, which is worse than falling back to the order they loaded in.
  if (!v.every((id) => typeof id === 'string' && id)) return null;
  // …and each flight at most once. A repeated id draws the same flight in two columns — the
  // heading counts them, the cross-check reads one recording as two agreeing ones, and React
  // gets a duplicate key. Nothing this app writes can produce one; a hand-edited store can.
  if (new Set(v as string[]).size !== v.length) return null;
  return v.length > 0 ? (v as string[]) : null;
}

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const c = v as Record<string, unknown>;
      // Validated rather than trusted, like every other thing this app reads back: a
      // hand-edited store must not be able to put a shape on screen.
      if (typeof c.label !== 'string' || typeof c.notes !== 'string') continue;
      const m: StoredMemory = {
        label: c.label,
        notes: c.notes,
        order: readOrder(c.order),
        sort: readSort(c.sort),
        at: typeof c.at === 'number' ? c.at : 0,
      };
      if (isEmptyMemory(m)) continue;
      out[k] = m;
    }
    return out;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    // Oldest out first, by when it was written. Never by position: the entry being edited
    // right now keeps its original slot, and evicting from the front killed exactly that one.
    const entries = Object.entries(store).sort((a, b) => a[1].at - b[1].at);
    const kept = entries.slice(Math.max(0, entries.length - MAX_KEPT));
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* storage unavailable — the arrangement still applies to this view */
  }
}

/** What is stored for exactly this set, or null. */
export function loadMemory(ids: string[]): CompareMemory | null {
  if (ids.length === 0) return null;
  const found = read()[captionKey(ids)];
  return found ? { label: found.label, notes: found.notes, order: found.order, sort: found.sort } : null;
}

/** Merge a change into what is stored for this set.
 *
 *  A PATCH rather than a whole record, because the caption and the column order are set by
 *  different controls at different moments: typing a title must not drop the order the flyer
 *  arranged, and moving a column must not drop their title. An explicit `null` clears a field —
 *  that is what "clear order" does — and once nothing is left the entry is removed rather than
 *  kept as an empty husk. */
export function rememberCompare(ids: string[], patch: Partial<CompareMemory>, now: number = Date.now()): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const store = read();
  const key = captionKey(ids);
  const merged: StoredMemory = { ...EMPTY, ...store[key], ...patch, at: now };
  if (isEmptyMemory(merged)) delete store[key];
  else store[key] = merged;
  write(store);
}

/** Forget everything stored about every comparison. Clearing the logbook promises that the report
 *  labels go with the flights; these live in localStorage rather than IndexedDB, so they do not go
 *  unless something takes them — and a comparison's title outliving "delete all N flights on this
 *  device" makes that promise false. The stored orders name flights that no longer exist. */
export function clearCaptions(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing was stored either */
  }
}

/** What this page last had on screen. Page-lifetime, never written to storage.
 *
 *  Carrying an arrangement onto a set that GREW is worth having — a drop appends, so titling and
 *  ordering five flights and then adding the sixth is the ordinary way a comparison gets built —
 *  but doing it by searching storage for a subset is what made a cleared caption come back and let
 *  an unrelated one attach itself. This remembers only the set just shown, so it is exact, and it
 *  dies with the page, so it can resurrect nothing.
 *
 *  A module variable rather than a ref because the view UNMOUNTS between the two states: a drop
 *  puts the surface into "Reading the flights…", which takes `CompareView` off the tree and takes
 *  any ref inside it with it. That unmount is the whole reason the ORDER needed storing at all —
 *  a reload was never the only way to lose it. */
let lastShown: { ids: string[]; memory: CompareMemory } | null = null;

export function rememberShown(ids: string[], memory: CompareMemory): void {
  lastShown = { ids: [...ids], memory: { ...memory } };
}

/** What to carry onto this set, when it grew out of the one just shown — else null.
 *
 *  The order comes with it as-is: `CompareView` puts anything the remembered order does not name
 *  at the end, in the place it loaded in, so the flight just added lands after the ones already
 *  arranged rather than vanishing. */
export function memoryCarriedForward(ids: string[]): CompareMemory | null {
  const prev = lastShown;
  if (!prev || prev.ids.length >= ids.length) return null;
  if (!prev.ids.every((id) => ids.includes(id))) return null;
  // An arrangement the flyer cleared is not carried anywhere. That is the whole point.
  if (isEmptyMemory(prev.memory)) return null;
  return prev.memory;
}

/** Test seam: forget what was on screen. */
export function forgetShown(): void {
  lastShown = null;
}
