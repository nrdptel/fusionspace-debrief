import { describe, it, expect } from 'vitest';
import { sortRecents, filterRecents, personalBests, logbookRowNames } from './logbook';
import type { RecentMeta } from './recents';

const rec = (id: string, addedAt: number, apogeeM: number | null, maxVelocityMs: number | null): RecentMeta => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Test',
  addedAt,
  apogeeM,
  maxVelocityMs,
  note: '',
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

describe('filterRecents', () => {
  const mk = (over: Partial<RecentMeta>): RecentMeta => ({
    id: 'x',
    name: 'x.csv',
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM: null,
    maxVelocityMs: null,
    note: '',
    ...over,
  });
  const list = [
    mk({ id: 'a', name: 'Nike-Smoke-Oct.csv', formatLabel: 'Altus Metrum (AltOS)', note: 'H135 white, calm' }),
    mk({ id: 'b', name: 'raven-flight3.csv', formatLabel: 'Featherweight Raven (FIP)', note: 'L3 attempt' }),
    mk({ id: 'c', name: 'aim-xtra.csv', formatLabel: 'Entacore AIM', note: '' }),
  ];

  it('matches the name, the logger and the flyer’s own note', () => {
    expect(filterRecents(list, 'nike').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, 'featherweight').map((r) => r.id)).toEqual(['b']);
    expect(filterRecents(list, 'h135').map((r) => r.id)).toEqual(['a']);
  });

  it('requires every term but ignores their order', () => {
    // What a flyer actually types: an airframe and a motor, or a logger and a level.
    expect(filterRecents(list, 'h135 nike').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, 'raven l3').map((r) => r.id)).toEqual(['b']);
    expect(filterRecents(list, 'raven h135')).toEqual([]);
  });

  it('is case- and accent-insensitive', () => {
    expect(filterRecents(list, 'ENTACORE').map((r) => r.id)).toEqual(['c']);
    expect(filterRecents([mk({ id: 'd', name: 'Zéphyr.csv' })], 'zephyr').map((r) => r.id)).toEqual(['d']);
  });

  it('an empty query shows the whole logbook', () => {
    expect(filterRecents(list, '')).toHaveLength(3);
    expect(filterRecents(list, '   ')).toHaveLength(3);
  });
});

describe('sorting and searching by the launch day', () => {
  const at = (id: string, stamp?: string): RecentMeta => ({
    id,
    name: `${id}.csv`,
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM: null,
    maxVelocityMs: null,
    note: '',
    ...(stamp ? { flownAt: { stamp, zone: 'UTC' as const } } : {}),
  });

  it('orders by the launch day, newest first, and sinks the undated', () => {
    const list = [at('old', '2021-10-30T20:07'), at('undated'), at('new', '2024-05-11T14:09')];
    expect(sortRecents(list, 'flown').map((r) => r.id)).toEqual(['new', 'old', 'undated']);
  });

  it('finds a launch by its month and year, the way the row shows it', () => {
    const list = [at('a', '2021-10-30T20:07'), at('b', '2024-05-11T14:09')];
    expect(filterRecents(list, 'oct 2021').map((r) => r.id)).toEqual(['a']);
    expect(filterRecents(list, '2024-05').map((r) => r.id)).toEqual(['b']);
  });
});

// A flight's file name stopped being unique the moment the logbook started keeping two files
// that share one. These names are what a screen reader reads off the three controls on a row,
// so "unique" is the requirement, not a nicety.
describe('logbookRowNames', () => {
  const ft = (m: number) => `${Math.round(m * 3.28084).toLocaleString()} ft`;
  const opened = () => 'just now';
  const row = (id: string, name: string, apogeeM: number | null, stamp?: string): RecentMeta => ({
    id,
    name,
    formatLabel: 'Test',
    addedAt: 0,
    apogeeM,
    maxVelocityMs: null,
    note: '',
    ...(stamp ? { flownAt: { stamp, zone: 'UTC' as const } } : {}),
  });

  it('leaves a name that is already unique alone', () => {
    const names = logbookRowNames([row('a', 'one.csv', 300), row('b', 'two.csv', 900)], ft, opened);
    expect([...names.values()]).toEqual(['one.csv', 'two.csv']);
  });

  it('describes a repeated name by what the row already shows', () => {
    const names = logbookRowNames([row('a', 'data.csv', 300), row('b', 'data.csv', 900)], ft, opened);
    expect(names.get('a')).toBe('data.csv, opened just now, apogee 984 ft');
    expect(names.get('b')).toBe('data.csv, opened just now, apogee 2,953 ft');
  });

  it('still tells apart two flights that agree on every fact the row shows', () => {
    // The case the description alone cannot reach, and the likeliest one: a batch drop of one
    // rocket's files all read "just now", carry no launch date, and can round to one figure.
    const names = logbookRowNames([row('a', 'data.csv', 300), row('b', 'data.csv', 300)], ft, opened);
    expect(names.get('a')).toBe('data.csv, opened just now, apogee 984 ft (1 of 2)');
    expect(names.get('b')).toBe('data.csv, opened just now, apogee 984 ft (2 of 2)');
  });

  it('never gives two flights the same name, whatever they have in common', () => {
    const same = ['a', 'b', 'c', 'd'].map((id) => row(id, 'data.csv', null));
    const names = logbookRowNames(same, ft, opened);
    expect(new Set(names.values()).size, `collided: ${[...names.values()].join(' / ')}`).toBe(4);
    expect(names.size).toBe(4);
  });
});
