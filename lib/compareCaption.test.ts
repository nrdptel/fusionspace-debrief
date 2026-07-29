import { describe, it, expect, beforeEach } from 'vitest';
import { captionCarriedForward, captionKey, clearCaptions, forgetShown, loadCaption, rememberShown, saveCaption, MAX_KEPT } from './compareCaption';

// A Map-backed localStorage, since these tests run without a DOM — the same stub
// reportProfile.test.ts uses, for the same reason.
const store = new Map<string, string>();
function stubStorage(): void {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  };
}
beforeEach(() => {
  stubStorage();
  forgetShown();
});

/** The RAW store, so a test can tell "reads back as nothing" from "was actually removed" —
 *  `read()` drops a blank entry on the way out, which made an earlier version of the
 *  clearing test pass whether or not anything was ever deleted. */
const raw = (): Record<string, { label: string; notes: string; at: number }> =>
  JSON.parse(store.get('debrief.compare.captions') ?? '{}');

const cap = (label: string, notes = '') => ({ label, notes });

describe('a comparison keeps the caption its flyer typed', () => {
  it('comes back for the same set of flights', () => {
    saveCaption(['a', 'b'], cap('L3 cert — two altimeters', 'Both bays, one airframe.'));
    expect(loadCaption(['a', 'b'])).toEqual(cap('L3 cert — two altimeters', 'Both bays, one airframe.'));
  });

  it('does not care what order the columns are in', () => {
    // Dragging the columns into the order a document wants is a presentation choice; it does
    // not make the write-up a different one.
    saveCaption(['a', 'b', 'c'], cap('Launch day'));
    expect(loadCaption(['c', 'a', 'b'])).toEqual(cap('Launch day'));
    expect(captionKey(['c', 'a', 'b'])).toBe(captionKey(['a', 'b', 'c']));
  });

  it('belongs to EXACTLY its own set, and never attaches itself to another', () => {
    // The first version matched any stored subset, so a season overview opened titled after an
    // unrelated cert flight that happened to share two of its flights.
    saveCaption(['a', 'b'], cap('L3 cert attempt'));
    saveCaption(['c', 'd'], cap('Sunday sport flights'));
    expect(loadCaption(['a', 'b', 'c', 'd'])).toBeNull();
    expect(loadCaption(['a', 'b', 'x', 'y', 'z'])).toBeNull();
    expect(loadCaption(['a']), 'a set that lost a flight is a different comparison').toBeNull();
  });

  it('can actually be DELETED, and stays deleted', () => {
    // The one that mattered: clearing removed the exact key while a subset copy survived, and
    // the next load carried it straight back. A title the flyer removed, painted over the
    // table and embedded in the export, with no way out but deleting flights.
    saveCaption(['a', 'b'], cap('Nimbus IV'));
    saveCaption(['a', 'b', 'c'], cap('Nimbus IV'));
    saveCaption(['a', 'b', 'c'], cap('', ''));
    expect(raw()[captionKey(['a', 'b', 'c'])], 'removed from the store, not merely unreadable').toBeUndefined();
    expect(loadCaption(['a', 'b', 'c'])).toBeNull();
  });

  it('clears rather than storing a caption that is only whitespace', () => {
    saveCaption(['a', 'b'], cap('Something'));
    expect(raw()[captionKey(['a', 'b'])]).toBeTruthy();
    saveCaption(['a', 'b'], cap('   ', '\n'));
    expect(raw()[captionKey(['a', 'b'])], 'whitespace is not a caption').toBeUndefined();
  });

  it('survives a store that has been hand-edited into nonsense', () => {
    store.set('debrief.compare.captions', '{"a,b":{"label":42},"c,d":"nope"}');
    expect(loadCaption(['a', 'b'])).toBeNull();
    expect(loadCaption(['c', 'd'])).toBeNull();
    store.set('debrief.compare.captions', 'not json at all');
    expect(loadCaption(['a', 'b'])).toBeNull();
    // …and is still writable afterwards, rather than wedged.
    saveCaption(['a', 'b'], cap('fresh'));
    expect(loadCaption(['a', 'b'])).toEqual(cap('fresh'));
  });

  it('evicts the OLDEST caption, not the one being edited', () => {
    // Position is not age: re-writing a key keeps its original slot, so slicing from the front
    // dropped whatever was written first — which is exactly the caption a flyer returns to and
    // edits — while untouched newer ones survived.
    for (let i = 0; i < MAX_KEPT; i++) saveCaption([`f${i}`], cap(`caption ${i}`), 1000 + i);
    saveCaption(['f0'], cap('caption 0, edited'), 9_000); // the oldest slot, freshly touched
    saveCaption(['brand-new'], cap('one more'), 9_001);

    expect(Object.keys(raw()).length).toBe(MAX_KEPT);
    expect(loadCaption(['f0']), 'the one just edited is kept').toEqual(cap('caption 0, edited'));
    expect(loadCaption(['brand-new'])).toEqual(cap('one more'));
    expect(loadCaption(['f1']), 'the genuinely oldest is the one that goes').toBeNull();
  });

  it('carries a title onto a set that GREW, from what was just on screen', () => {
    // A drop appends, so titling three flights and adding the fourth is the ordinary way a
    // comparison gets built — the title should come with it.
    rememberShown(['a', 'b', 'c'], cap('Nimbus IV — launch day'));
    expect(captionCarriedForward(['a', 'b', 'c', 'd'])).toEqual(cap('Nimbus IV — launch day'));
  });

  it('carries it nowhere else', () => {
    rememberShown(['a', 'b'], cap('L3 cert attempt'));
    expect(captionCarriedForward(['a', 'b']), 'the same set is not a set that grew').toBeNull();
    expect(captionCarriedForward(['a']), 'a set that shrank is a different comparison').toBeNull();
    expect(captionCarriedForward(['a', 'x', 'y']), 'these are not the flights it was written about').toBeNull();
    expect(captionCarriedForward(['x', 'y', 'z'])).toBeNull();
  });

  it('never carries a caption the flyer cleared', () => {
    // The defect this whole mechanism was rebuilt around: a removed title coming back.
    rememberShown(['a', 'b'], cap('', ''));
    expect(captionCarriedForward(['a', 'b', 'c'])).toBeNull();
    rememberShown(['a', 'b'], cap('   ', '\n'));
    expect(captionCarriedForward(['a', 'b', 'c'])).toBeNull();
  });

  it('is forgotten when the logbook is cleared', () => {
    // Clear's confirm promises the report labels go with the flights. These live in
    // localStorage rather than IndexedDB, so nothing was taking them.
    saveCaption(['a', 'b'], cap('Launch day'));
    clearCaptions();
    expect(raw()).toEqual({});
    expect(loadCaption(['a', 'b'])).toBeNull();
  });
});
