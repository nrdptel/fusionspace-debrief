import { describe, it, expect, beforeEach } from 'vitest';
import { FIRST_STAGE_KEY, readFirstStage, stageKey, writeFirstStage } from './firstStage';

/**
 * The composite's first-stage statement is the one thing a flyer knows that the files do not, so
 * losing it costs them the only irreplaceable input on that surface. It was keyed on the order the
 * ids happened to arrive in, and the two routes to a composite produce different orders for the
 * same pair — a drop uses the folder's order, a tick uses the flyer's.
 */

/** A minimal localStorage, because these run in a node environment. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get raw() {
      return map;
    },
  };
}

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  store = fakeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
});

describe('the composite remembers which recording flew first', () => {
  it('answers for the same set reached in a different order — the defect this fixes', () => {
    // Assembled from a DROP (folder order), then reached again by TICKING the two rows the other
    // way round. Before this, the second read returned undefined and the flyer was asked again.
    writeFirstStage(['booster-id', 'sustainer-id'], 'booster.csv');
    expect(readFirstStage(['sustainer-id', 'booster-id'])).toBe('booster.csv');
    expect(readFirstStage(['booster-id', 'sustainer-id'])).toBe('booster.csv');
  });

  it('keeps a statement made before the key was sorted', () => {
    // The migration, and it is read-side only. A statement written last month sits under the
    // arrival-order key; a flyer must not lose it because the key improved.
    store.raw.set(FIRST_STAGE_KEY, JSON.stringify({ 'z-id,a-id': 'legacy.csv' }));
    expect(readFirstStage(['z-id', 'a-id'])).toBe('legacy.csv');
    expect(readFirstStage(['a-id', 'z-id']), 'and in the other order too').toBe('legacy.csv');
  });

  it('withdraws a legacy statement rather than letting the fallback answer for ever', () => {
    // The trap in a read-side migration: clearing only the new key leaves the old one answering.
    store.raw.set(FIRST_STAGE_KEY, JSON.stringify({ 'z-id,a-id': 'legacy.csv' }));
    writeFirstStage(['z-id', 'a-id'], undefined);
    expect(readFirstStage(['z-id', 'a-id'])).toBeUndefined();
  });

  it('supersedes a legacy statement when the flyer says something new', () => {
    store.raw.set(FIRST_STAGE_KEY, JSON.stringify({ 'z-id,a-id': 'legacy.csv' }));
    writeFirstStage(['a-id', 'z-id'], 'chosen.csv');
    expect(readFirstStage(['z-id', 'a-id'])).toBe('chosen.csv');
    const raw = JSON.parse(store.getItem(FIRST_STAGE_KEY) as string);
    expect(Object.keys(raw), 'and the old key is gone rather than shadowed').toEqual(['a-id,z-id']);
  });

  it('keeps two different sets apart', () => {
    // A key that is merely order-insensitive could still collide. Two sets sharing a member must
    // not answer for each other.
    writeFirstStage(['a', 'b'], 'first-of-ab.csv');
    writeFirstStage(['b', 'c'], 'first-of-bc.csv');
    expect(readFirstStage(['b', 'a'])).toBe('first-of-ab.csv');
    expect(readFirstStage(['c', 'b'])).toBe('first-of-bc.csv');
    expect(readFirstStage(['a', 'c'])).toBeUndefined();
  });

  it('says nothing for a set nobody has spoken about', () => {
    expect(readFirstStage(['never', 'seen'])).toBeUndefined();
  });

  it('survives a storage that throws, and a store that is not an object', () => {
    // `DESIGN.md`'s five states and this repo's standing rule: a device that refuses storage still
    // gets a composite, it just forgets.
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    };
    expect(() => writeFirstStage(['a', 'b'], 'x.csv')).not.toThrow();
    expect(readFirstStage(['a', 'b'])).toBeUndefined();

    store = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: store };
    store.raw.set(FIRST_STAGE_KEY, '"not an object"');
    expect(readFirstStage(['a', 'b'])).toBeUndefined();
  });

  it('builds a key that does not depend on arrival order', () => {
    expect(stageKey(['b', 'a'])).toBe(stageKey(['a', 'b']));
    expect(stageKey(['a', 'b'])).toBe('a,b');
  });
});
