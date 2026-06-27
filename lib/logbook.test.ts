import { describe, it, expect } from 'vitest';
import { sortRecents, personalBests } from './logbook';
import type { RecentMeta } from './recents';

const rec = (id: string, addedAt: number, apogeeM: number | null, maxVelocityMs: number | null): RecentMeta => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Test',
  addedAt,
  apogeeM,
  maxVelocityMs,
});

const flights = [
  rec('a', 300, 500, 80),
  rec('b', 100, 1200, 60),
  rec('c', 200, 800, 150),
];

describe('sortRecents', () => {
  it('orders by most recent, highest apogee, or fastest', () => {
    expect(sortRecents(flights, 'recent').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortRecents(flights, 'apogee').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortRecents(flights, 'speed').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('sinks missing values to the bottom and does not mutate the input', () => {
    const withGap = [rec('x', 1, null, null), rec('y', 2, 300, 40)];
    expect(sortRecents(withGap, 'apogee').map((r) => r.id)).toEqual(['y', 'x']);
    expect(withGap[0].id).toBe('x'); // original order untouched
  });
});

describe('personalBests', () => {
  it('crowns the single highest apogee and top speed', () => {
    expect(personalBests(flights)).toEqual({ apogeeId: 'b', speedId: 'c' });
  });

  it('crowns nobody with fewer than two finite values or a tie', () => {
    expect(personalBests([rec('only', 1, 1000, 90)])).toEqual({ apogeeId: null, speedId: null });
    const tied = [rec('a', 1, 500, 70), rec('b', 2, 500, 60)];
    expect(personalBests(tied).apogeeId).toBeNull(); // tie for top apogee
    expect(personalBests(tied).speedId).toBe('a'); // speed still unique
  });
});
