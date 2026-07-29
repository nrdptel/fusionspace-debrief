// The label and notes a flyer types onto a COMPARISON, kept on this device.
//
// The flight report's caption already survives — it lives on the logbook entry, keyed by the
// flight's id, because losing the two things on that screen a flyer actually typed costs a
// cert write-up its title. A comparison has the same two fields, riding into the same exported
// Markdown, HTML and JSON, and they were bare `useState` cleared on every change of the set: a
// reload of an address built to be reloadable came back without them.
//
// A comparison has no id of its own — it IS its set of flights — so that set is the key, sorted
// so that dragging the columns into the order a document wants does not make the write-up a
// different one.
//
// The key is EXACT, and that is a deliberate second attempt. The first version also matched any
// stored subset, so that adding a flight to a comparison kept its title. Three things fell out
// of that one rule, all found by reading it back rather than by using it:
//
//   * a caption could not be DELETED. Clearing the fields removed the exact key while the
//     subset copy survived, and the next load carried it straight back — a title the flyer had
//     removed, painted over the table and embedded in the export, with no way out but deleting
//     flights;
//   * "grew out of" was really "any subset", so a season overview opened titled after an
//     unrelated cert flight that happened to share two of its flights;
//   * every intermediate set got its own stored copy, so one launch day burned six slots.
//
// Carrying a title onto a set that grew is still worth having, and `CompareView` does it from
// the set it was JUST showing rather than by searching storage — session-local, exact, and
// unable to resurrect anything.

const KEY = 'debrief.compare.captions';
/** How many comparisons keep a caption. A season is a few dozen write-ups at most, and each
 *  entry holds only what the flyer typed. */
export const MAX_KEPT = 40;

export interface CompareCaption {
  label: string;
  notes: string;
}

/** Stored form: the caption plus when it was last written, so eviction can drop the OLDEST
 *  rather than whatever happens to sit first in the object. Re-writing a key keeps its
 *  original insertion position, so position is not age — and evicting by position dropped the
 *  entry the flyer was editing while untouched older ones survived. */
interface StoredCaption extends CompareCaption {
  at: number;
}

/** The storage key for a set of flights, independent of the order they are shown in. */
export function captionKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

type Store = Record<string, StoredCaption>;

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
      if (!c.label.trim() && !c.notes.trim()) continue;
      out[k] = { label: c.label, notes: c.notes, at: typeof c.at === 'number' ? c.at : 0 };
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
    /* storage unavailable — the caption still applies to this view */
  }
}

/** The caption stored for exactly this set, or null. */
export function loadCaption(ids: string[]): CompareCaption | null {
  if (ids.length === 0) return null;
  const found = read()[captionKey(ids)];
  return found ? { label: found.label, notes: found.notes } : null;
}

/** Keep (or clear) the caption for this set. Blank clears, the way the report's does — an
 *  empty label is not a caption, and storing one would resurrect an empty panel. */
export function saveCaption(ids: string[], caption: CompareCaption, now: number = Date.now()): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const store = read();
  const key = captionKey(ids);
  if (caption.label.trim() || caption.notes.trim()) store[key] = { ...caption, at: now };
  else delete store[key];
  write(store);
}

/** Forget every stored caption. Clearing the logbook promises that the report labels go with
 *  the flights; these live in localStorage rather than IndexedDB, so they do not go unless
 *  something takes them — and a comparison's title outliving "delete all N flights on this
 *  device" makes that promise false. */
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
 *  Carrying a title onto a set that GREW is worth having — a drop appends, so titling three
 *  flights and then adding the fourth is the ordinary way a comparison gets built — but doing
 *  it by searching storage for a subset is what made a cleared caption come back and let an
 *  unrelated one attach itself. This remembers only the set just shown, so it is exact, and it
 *  dies with the page, so it can resurrect nothing.
 *
 *  A module variable rather than a ref because the view UNMOUNTS between the two states: a
 *  drop puts the surface into "Reading the flights…", which takes `CompareView` off the tree
 *  and takes any ref inside it with it. */
let lastShown: { ids: string[]; caption: CompareCaption } | null = null;

export function rememberShown(ids: string[], caption: CompareCaption): void {
  lastShown = { ids: [...ids], caption: { ...caption } };
}

/** The caption to carry onto this set, when it grew out of the one just shown — else null. */
export function captionCarriedForward(ids: string[]): CompareCaption | null {
  const prev = lastShown;
  if (!prev || prev.ids.length >= ids.length) return null;
  if (!prev.ids.every((id) => ids.includes(id))) return null;
  // A caption the flyer cleared is not carried anywhere. That is the whole point.
  if (!prev.caption.label.trim() && !prev.caption.notes.trim()) return null;
  return prev.caption;
}

/** Test seam: forget what was on screen. */
export function forgetShown(): void {
  lastShown = null;
}
