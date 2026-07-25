import { describe, it, expect, beforeEach } from 'vitest';
import { loadHidden, saveHidden, toggleHidden, visibleRows, ALWAYS_SHOWN, MAX_HIDDEN } from './reportProfile';

// A Map-backed localStorage, since these tests run without a DOM.
function stubStorage(): void {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: ls };
}

beforeEach(stubStorage);

describe('visibleRows', () => {
  const rows = [['Apogee', '9,322 ft'], ['Battery low', '3.7 V'], ['Flight time', '3:12']] as [string, string][];
  const label = (r: [string, string]) => r[0];

  it('keeps everything when nothing is turned off', () => {
    expect(visibleRows(rows, label, [])).toHaveLength(3);
    expect(visibleRows(rows, label, undefined)).toHaveLength(3);
  });

  it('drops what the flyer turned off', () => {
    expect(visibleRows(rows, label, ['Battery low']).map(label)).toEqual(['Apogee', 'Flight time']);
  });

  it('never drops apogee, however the stored list got that way', () => {
    expect(visibleRows(rows, label, ALWAYS_SHOWN).map(label)).toContain('Apogee');
  });

  it('ignores a label this flight does not have', () => {
    expect(visibleRows(rows, label, ['Peak roll rate'])).toHaveLength(3);
  });
});

describe('toggleHidden', () => {
  it('turns a reading off and back on', () => {
    const off = toggleHidden([], 'Max Q');
    expect(off).toEqual(['Max Q']);
    expect(toggleHidden(off, 'Max Q')).toEqual([]);
  });

  it('refuses to turn apogee off', () => {
    expect(toggleHidden([], 'Apogee')).toEqual([]);
  });
});

describe('storage', () => {
  it('round-trips', () => {
    saveHidden(['Max Q', 'Battery low']);
    expect(loadHidden()).toEqual(['Max Q', 'Battery low']);
  });

  it('clears the key rather than storing an empty list', () => {
    saveHidden(['Max Q']);
    saveHidden([]);
    expect(loadHidden()).toEqual([]);
    expect(window.localStorage.getItem('debrief.report.hidden')).toBeNull();
  });

  it('de-duplicates and caps what it stores', () => {
    saveHidden(['A', 'A', 'B']);
    expect(loadHidden()).toEqual(['A', 'B']);
    saveHidden(Array.from({ length: MAX_HIDDEN + 20 }, (_, i) => `m${i}`));
    expect(loadHidden()).toHaveLength(MAX_HIDDEN);
  });

  it('survives junk in storage rather than throwing', () => {
    window.localStorage.setItem('debrief.report.hidden', '{"not":"an array"}');
    expect(loadHidden()).toEqual([]);
    window.localStorage.setItem('debrief.report.hidden', 'not json at all');
    expect(loadHidden()).toEqual([]);
    window.localStorage.setItem('debrief.report.hidden', '["ok", 7, null]');
    expect(loadHidden()).toEqual(['ok']);
  });
});
