import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadHidden,
  saveHidden,
  toggleHidden,
  visibleRows,
  orderRows,
  moveReading,
  loadOrder,
  saveOrder,
  ALWAYS_SHOWN,
  MAX_HIDDEN,
} from './reportProfile';

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

describe('orderRows', () => {
  const rows = ['Apogee', 'Max velocity', 'Max Q', 'Flight time'];
  const id = (s: string) => s;

  it('leaves Debrief’s own order alone when nothing has been moved', () => {
    expect(orderRows(rows, id, [])).toEqual(rows);
    expect(orderRows(rows, id, undefined)).toEqual(rows);
  });

  it('applies the order it was given', () => {
    // A stored order always names every reading of the list it was made on (a move
    // rewrites that whole list), so this is the ordinary case.
    expect(orderRows(rows, id, ['Flight time', 'Apogee', 'Max velocity', 'Max Q'])).toEqual([
      'Flight time',
      'Apogee',
      'Max velocity',
      'Max Q',
    ]);
  });

  it('ignores a stored label this flight does not have', () => {
    // A saved order carries readings from other flights; those must not leave gaps.
    expect(orderRows(rows, id, ['Peak roll rate', 'Apogee', 'Max velocity', 'Max Q', 'Flight time'])).toEqual(
      rows,
    );
  });

  it('keeps a row the order does not name behind the ones it does', () => {
    // A comparison can gain a row between one flight set and the next (a tilt channel on
    // one logger and not another); it appears rather than being silently ordered away.
    expect(orderRows([...rows, 'Tilt at burnout'], id, ['Flight time', 'Apogee', 'Max velocity', 'Max Q'])).toEqual([
      'Flight time',
      'Apogee',
      'Max velocity',
      'Max Q',
      'Tilt at burnout',
    ]);
  });
});

describe('moveReading', () => {
  const all = ['Apogee', 'Max velocity', 'Max Q', 'Flight time'];

  it('moves one place at a time, from where the list actually reads', () => {
    const once = moveReading([], all, 'Max Q', -1);
    expect(orderRows(all, (s) => s, once)).toEqual(['Apogee', 'Max Q', 'Max velocity', 'Flight time']);
    const twice = moveReading(once, all, 'Max Q', -1);
    expect(orderRows(all, (s) => s, twice)).toEqual(['Max Q', 'Apogee', 'Max velocity', 'Flight time']);
  });

  it('does nothing at the ends', () => {
    expect(orderRows(all, (s) => s, moveReading([], all, 'Apogee', -1))).toEqual(all);
    expect(orderRows(all, (s) => s, moveReading([], all, 'Flight time', 1))).toEqual(all);
  });

  it('round-trips through storage', () => {
    const moved = moveReading([], all, 'Flight time', -1);
    saveOrder(moved);
    expect(orderRows(all, (s) => s, loadOrder())).toEqual(orderRows(all, (s) => s, moved));
  });
});
