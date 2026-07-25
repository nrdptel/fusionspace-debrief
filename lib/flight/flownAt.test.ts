import { describe, it, expect } from 'vitest';
import { flownAtFromParts, flownAtFromText, flownAtFromColumns, formatFlownAt } from './flownAt';

describe('flownAtFromParts', () => {
  it('builds a stamp from calendar parts, keeping the stated clock', () => {
    expect(flownAtFromParts({ year: 2021, month: 10, day: 30, hour: 20, minute: 7, second: 12 }, 'UTC')).toEqual({
      stamp: '2021-10-30T20:07:12',
      zone: 'UTC',
    });
    expect(flownAtFromParts({ year: 2024, month: 5, day: 11 }, 'logger')).toEqual({
      stamp: '2024-05-11',
      zone: 'logger',
    });
  });

  it('rejects the placeholders a logger writes when its clock never got set', () => {
    // A GPS with no lock, and an altimeter with a dead backup cell.
    expect(flownAtFromParts({ year: 0, month: 0, day: 0 }, 'UTC')).toBeNull();
    expect(flownAtFromParts({ year: 1970, month: 1, day: 1 }, 'UTC')).toBeNull();
    expect(flownAtFromParts({ year: 2200, month: 6, day: 1 }, 'UTC')).toBeNull();
  });

  it('rejects a date that isn’t on the calendar', () => {
    expect(flownAtFromParts({ year: 2024, month: 2, day: 31 }, 'UTC')).toBeNull();
    expect(flownAtFromParts({ year: 2024, month: 13, day: 1 }, 'UTC')).toBeNull();
  });

  it('drops an impossible time of day but keeps the date', () => {
    expect(flownAtFromParts({ year: 2024, month: 5, day: 11, hour: 99, minute: 7 }, 'logger')?.stamp).toBe('2024-05-11');
  });
});

describe('flownAtFromText', () => {
  it('reads the shapes real loggers write', () => {
    // Featherweight GPS.
    expect(flownAtFromText('Apr 17 2021 19:06:45.800 UTC', 'UTC')).toEqual({
      stamp: '2021-04-17T19:06:45',
      zone: 'UTC',
    });
    // ISO-like, with and without a time.
    expect(flownAtFromText('2024-05-11 14:09:44', 'logger')?.stamp).toBe('2024-05-11T14:09:44');
    expect(flownAtFromText('2024-05-11', 'logger')?.stamp).toBe('2024-05-11');
  });

  it('refuses an ambiguous order rather than guessing a day', () => {
    // 03/04/2024 is two different days depending on who wrote it, so it isn't read at all.
    expect(flownAtFromText('03/04/2024 10:00', 'logger')).toBeNull();
    expect(flownAtFromText('', 'logger')).toBeNull();
    expect(flownAtFromText('not a date', 'logger')).toBeNull();
  });
});

describe('flownAtFromColumns', () => {
  it('scans past the rows a logger writes before its GPS locks', () => {
    const rows = [
      ['0', '0', '0'],
      ['0', '0', '0'],
      ['2021', '10', '30'],
      ['2021', '10', '30'],
    ];
    expect(flownAtFromColumns(rows, { year: 0, month: 1, day: 2 }, 'UTC')?.stamp).toBe('2021-10-30');
  });

  it('is null when no row states a date', () => {
    expect(flownAtFromColumns([['', '', '']], { year: 0, month: 1, day: 2 }, 'UTC')).toBeNull();
    expect(flownAtFromColumns([], { year: 0, month: 1, day: 2 }, 'UTC')).toBeNull();
  });
});

describe('formatFlownAt', () => {
  it('reads the stamp back without moving it into another zone', () => {
    // A UTC instant formatted through toLocaleString would land on a different hour — and
    // possibly a different day — for every reader. These must not.
    expect(formatFlownAt({ stamp: '2021-10-30T20:07:12', zone: 'UTC' })).toBe('30 Oct 2021, 20:07 UTC');
    expect(formatFlownAt({ stamp: '2024-05-11T14:09:44', zone: 'logger' })).toBe('11 May 2024, 14:09 (logger clock)');
    expect(formatFlownAt({ stamp: '2024-05-11', zone: 'logger' })).toBe('11 May 2024');
  });

  it('is empty for nothing at all', () => {
    expect(formatFlownAt(null)).toBe('');
    expect(formatFlownAt(undefined)).toBe('');
    expect(formatFlownAt({ stamp: 'garbage', zone: 'UTC' })).toBe('');
  });
});
