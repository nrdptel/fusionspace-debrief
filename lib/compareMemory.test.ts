import { describe, it, expect, beforeEach } from 'vitest';
import {
  captionKey,
  clearCaptions,
  forgetShown,
  loadMemory,
  memoryCarriedForward,
  rememberCompare,
  rememberShown,
  EMPTY,
  MAX_KEPT,
  type CompareMemory,
} from './compareMemory';

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
 *  `read()` drops an empty entry on the way out, which made an earlier version of the
 *  clearing test pass whether or not anything was ever deleted. */
const raw = (): Record<string, Record<string, unknown>> =>
  JSON.parse(store.get('debrief.compare.captions') ?? '{}');

const cap = (label: string, notes = ''): CompareMemory => ({ ...EMPTY, label, notes });

describe('a comparison keeps what its flyer arranged', () => {
  it('comes back for the same set of flights', () => {
    rememberCompare(['a', 'b'], { label: 'L3 cert — two altimeters', notes: 'Both bays, one airframe.' });
    expect(loadMemory(['a', 'b'])).toEqual(cap('L3 cert — two altimeters', 'Both bays, one airframe.'));
  });

  it('does not care what order the columns are in', () => {
    // Dragging the columns into the order a document wants is a presentation choice; it does
    // not make the write-up a different one. (The order itself is stored INSIDE the entry.)
    rememberCompare(['a', 'b', 'c'], { label: 'Launch day' });
    expect(loadMemory(['c', 'a', 'b'])).toEqual(cap('Launch day'));
    expect(captionKey(['c', 'a', 'b'])).toBe(captionKey(['a', 'b', 'c']));
  });

  it('belongs to EXACTLY its own set, and never attaches itself to another', () => {
    // The first version matched any stored subset, so a season overview opened titled after an
    // unrelated cert flight that happened to share two of its flights.
    rememberCompare(['a', 'b'], { label: 'L3 cert attempt' });
    rememberCompare(['c', 'd'], { label: 'Sunday sport flights' });
    expect(loadMemory(['a', 'b', 'c', 'd'])).toBeNull();
    expect(loadMemory(['a', 'b', 'x', 'y', 'z'])).toBeNull();
    expect(loadMemory(['a']), 'a set that lost a flight is a different comparison').toBeNull();
  });

  it('can actually be DELETED, and stays deleted', () => {
    // The one that mattered: clearing removed the exact key while a subset copy survived, and
    // the next load carried it straight back. A title the flyer removed, painted over the
    // table and embedded in the export, with no way out but deleting flights.
    rememberCompare(['a', 'b'], { label: 'Nimbus IV' });
    rememberCompare(['a', 'b', 'c'], { label: 'Nimbus IV' });
    rememberCompare(['a', 'b', 'c'], { label: '', notes: '' });
    expect(raw()[captionKey(['a', 'b', 'c'])], 'removed from the store, not merely unreadable').toBeUndefined();
    expect(loadMemory(['a', 'b', 'c'])).toBeNull();
  });

  it('clears rather than storing a caption that is only whitespace', () => {
    rememberCompare(['a', 'b'], { label: 'Something' });
    expect(raw()[captionKey(['a', 'b'])]).toBeTruthy();
    rememberCompare(['a', 'b'], { label: '   ', notes: '\n' });
    expect(raw()[captionKey(['a', 'b'])], 'whitespace is not a caption').toBeUndefined();
  });

  it('survives a store that has been hand-edited into nonsense', () => {
    store.set('debrief.compare.captions', '{"a,b":{"label":42},"c,d":"nope"}');
    expect(loadMemory(['a', 'b'])).toBeNull();
    expect(loadMemory(['c', 'd'])).toBeNull();
    store.set('debrief.compare.captions', 'not json at all');
    expect(loadMemory(['a', 'b'])).toBeNull();
    // …and is still writable afterwards, rather than wedged.
    rememberCompare(['a', 'b'], { label: 'fresh' });
    expect(loadMemory(['a', 'b'])).toEqual(cap('fresh'));
  });

  it('evicts the OLDEST entry, not the one being edited', () => {
    // Position is not age: re-writing a key keeps its original slot, so slicing from the front
    // dropped whatever was written first — which is exactly the comparison a flyer returns to
    // and edits — while untouched newer ones survived.
    for (let i = 0; i < MAX_KEPT; i++) rememberCompare([`f${i}`], { label: `caption ${i}` }, 1000 + i);
    rememberCompare(['f0'], { label: 'caption 0, edited' }, 9_000); // the oldest slot, freshly touched
    rememberCompare(['brand-new'], { label: 'one more' }, 9_001);

    expect(Object.keys(raw()).length).toBe(MAX_KEPT);
    expect(loadMemory(['f0']), 'the one just edited is kept').toEqual(cap('caption 0, edited'));
    expect(loadMemory(['brand-new'])).toEqual(cap('one more'));
    expect(loadMemory(['f1']), 'the genuinely oldest is the one that goes').toBeNull();
  });

  it('carries an arrangement onto a set that GREW, from what was just on screen', () => {
    // A drop appends, so titling three flights and adding the fourth is the ordinary way a
    // comparison gets built — the arrangement should come with it.
    rememberShown(['a', 'b', 'c'], { ...cap('Nimbus IV — launch day'), order: ['c', 'a', 'b'] });
    expect(memoryCarriedForward(['a', 'b', 'c', 'd'])).toEqual({
      ...cap('Nimbus IV — launch day'),
      order: ['c', 'a', 'b'],
    });
  });

  it('carries it nowhere else', () => {
    rememberShown(['a', 'b'], cap('L3 cert attempt'));
    expect(memoryCarriedForward(['a', 'b']), 'the same set is not a set that grew').toBeNull();
    expect(memoryCarriedForward(['a']), 'a set that shrank is a different comparison').toBeNull();
    expect(memoryCarriedForward(['a', 'x', 'y']), 'these are not the flights it was written about').toBeNull();
    expect(memoryCarriedForward(['x', 'y', 'z'])).toBeNull();
  });

  it('never carries an arrangement the flyer cleared', () => {
    // The defect this whole mechanism was rebuilt around: a removed title coming back.
    rememberShown(['a', 'b'], EMPTY);
    expect(memoryCarriedForward(['a', 'b', 'c'])).toBeNull();
    rememberShown(['a', 'b'], cap('   ', '\n'));
    expect(memoryCarriedForward(['a', 'b', 'c'])).toBeNull();
  });

  it('is forgotten when the logbook is cleared', () => {
    // Clear's confirm promises the report labels go with the flights. These live in
    // localStorage rather than IndexedDB, so nothing was taking them.
    rememberCompare(['a', 'b'], { label: 'Launch day' });
    clearCaptions();
    expect(raw()).toEqual({});
    expect(loadMemory(['a', 'b'])).toBeNull();
  });
});

describe('the column order is kept the same way the caption is', () => {
  it('comes back on its own, with no caption anywhere near it', () => {
    // Arranging the columns is work even when nothing is typed: booster then sustainer, flight 1
    // to 6, the cert flight last. It rides into the Markdown, the CSV, the clipboard copy and the
    // figures, all of which read the same ordered array.
    rememberCompare(['a', 'b', 'c'], { order: ['c', 'a', 'b'] });
    expect(loadMemory(['a', 'b', 'c'])).toEqual({ ...EMPTY, order: ['c', 'a', 'b'] });
  });

  it('keeps the caption when the order changes, and the order when the caption does', () => {
    // The two are set by different controls at different moments, so each write is a PATCH.
    // A whole-record write would have made typing a title throw away the arrangement.
    rememberCompare(['a', 'b'], { label: 'Nimbus IV' });
    rememberCompare(['a', 'b'], { order: ['b', 'a'] });
    expect(loadMemory(['a', 'b'])).toEqual({ ...cap('Nimbus IV'), order: ['b', 'a'] });
    rememberCompare(['a', 'b'], { notes: 'Both bays.' });
    expect(loadMemory(['a', 'b'])?.order, 'the arrangement survived a caption edit').toEqual(['b', 'a']);
  });

  it('keeps the hand order UNDERNEATH a metric sort, so clearing the sort returns to it', () => {
    // The one that mattered here. A metric sort wins on screen while it is set, but it must not
    // erase what is underneath: clicking a row to see which went highest used to throw away a
    // six-flight arrangement with no way back, and once the order was stored that loss was
    // permanent rather than a re-drag away.
    rememberCompare(['a', 'b'], { order: ['b', 'a'] });
    rememberCompare(['a', 'b'], { sort: { label: 'Apogee', dir: 'desc' } });
    expect(loadMemory(['a', 'b'])?.sort).toEqual({ label: 'Apogee', dir: 'desc' });
    expect(loadMemory(['a', 'b'])?.order, 'the arrangement survived the ranking').toEqual(['b', 'a']);
    // …and moving a column IS the flyer taking over from the ranking, so that one does clear it.
    rememberCompare(['a', 'b'], { sort: null, order: ['a', 'b'] });
    expect(loadMemory(['a', 'b'])?.sort).toBeNull();
    expect(loadMemory(['a', 'b'])?.order).toEqual(['a', 'b']);
  });

  it('survives on an entry with nothing typed, and is removed when cleared', () => {
    // "clear order" on a comparison with no caption must genuinely delete the record — an entry
    // holding only a null order is a husk that costs a slot and reads back as nothing.
    rememberCompare(['a', 'b'], { order: ['b', 'a'] });
    expect(raw()[captionKey(['a', 'b'])], 'an order alone is worth storing').toBeTruthy();
    rememberCompare(['a', 'b'], { order: null });
    expect(raw()[captionKey(['a', 'b'])], 'and nothing left means nothing stored').toBeUndefined();
  });

  it('refuses an order that is not entirely flight ids', () => {
    // Half an order would put the columns somewhere the flyer never chose, which is worse than
    // falling back to the order they loaded in.
    store.set(
      'debrief.compare.captions',
      JSON.stringify({ 'a,b,c': { label: 'x', notes: '', order: ['a', 7, 'c'], at: 1 } }),
    );
    expect(loadMemory(['a', 'b', 'c'])?.order, 'a half-read order is no order').toBeNull();
    expect(loadMemory(['a', 'b', 'c'])?.label, 'the caption beside it still reads').toBe('x');
  });

  it('refuses an order that names the same flight twice', () => {
    // A repeated id draws one flight in two columns: the heading counts them, the cross-check
    // reads one recording as two that agree, and React gets a duplicate key.
    store.set(
      'debrief.compare.captions',
      JSON.stringify({ 'a,b': { label: 'x', notes: '', order: ['a', 'a', 'b'], at: 1 } }),
    );
    expect(loadMemory(['a', 'b'])?.order).toBeNull();
  });

  it('reads back what the caption-only version wrote, without dropping it', () => {
    // The store shipped one increment earlier holding only {label, notes, at}. A flyer who titled
    // a comparison and then updated must not find it gone, and must not find it un-editable.
    // The `at`-less entry is the defensive case rather than a real one — nothing ever wrote it —
    // but `read()` claims to tolerate it, so that claim is held to.
    store.set(
      'debrief.compare.captions',
      JSON.stringify({
        'a,b': { label: 'L3 cert', notes: 'Both bays.', at: 5 },
        'c,d': { label: 'No timestamp', notes: '' },
      }),
    );
    expect(loadMemory(['a', 'b'])).toEqual({ ...cap('L3 cert', 'Both bays.'), order: null, sort: null });
    expect(loadMemory(['c', 'd'])?.label, 'an entry with no `at` still reads').toBe('No timestamp');
    // …and an arrangement added to it keeps the title that was already there.
    rememberCompare(['a', 'b'], { order: ['b', 'a'] });
    expect(loadMemory(['a', 'b'])).toEqual({ ...cap('L3 cert', 'Both bays.'), order: ['b', 'a'], sort: null });
  });

  it('refuses a sort direction it does not recognise', () => {
    store.set(
      'debrief.compare.captions',
      JSON.stringify({ 'a,b': { label: 'x', notes: '', sort: { label: 'Apogee', dir: 'sideways' }, at: 1 } }),
    );
    expect(loadMemory(['a', 'b'])?.sort).toBeNull();
  });
});
