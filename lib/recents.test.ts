import { describe, it, expect } from 'vitest';
import { parseLogbookFlights, type RecentFlight } from './recents';

// parseLogbookFlights is the pure half of the backup/restore feature — it turns
// the bytes of an export file into valid flight records, so it can be exercised
// without IndexedDB. The IndexedDB merge itself is covered by the e2e round-trip.

const flight = (over: Partial<RecentFlight> = {}): RecentFlight => ({
  id: 'a1',
  name: 'flight.csv',
  formatLabel: 'Generic CSV',
  addedAt: 1_700_000_000_000,
  apogeeM: 1234,
  maxVelocityMs: 210,
  note: 'H128, clear day',
  text: 'T,Alt\n0,0\n',
  ...over,
});

describe('parseLogbookFlights', () => {
  it('round-trips the export envelope', () => {
    const f = flight();
    const json = JSON.stringify({ kind: 'debrief-logbook', version: 1, exportedAt: 1, flights: [f] });
    expect(parseLogbookFlights(json)).toEqual([f]);
  });

  it('accepts a bare array of flights too', () => {
    const f = flight();
    expect(parseLogbookFlights(JSON.stringify([f]))).toEqual([f]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseLogbookFlights('not json')).toEqual([]);
    expect(parseLogbookFlights('')).toEqual([]);
  });

  it('returns [] for the wrong shape', () => {
    expect(parseLogbookFlights(JSON.stringify({ kind: 'something-else' }))).toEqual([]);
    expect(parseLogbookFlights(JSON.stringify({ flights: 'nope' }))).toEqual([]);
    expect(parseLogbookFlights(JSON.stringify(42))).toEqual([]);
  });

  it('drops records missing the fields needed to reopen a flight', () => {
    const json = JSON.stringify({
      flights: [
        { id: 'ok', name: 'good.csv', text: 'T,Alt\n0,0\n' },
        { id: 'no-text', name: 'bad.csv' }, // no file text → can't reopen
        { name: 'no-id.csv', text: 'x' }, // no id → can't key it
        null,
        'garbage',
      ],
    });
    const out = parseLogbookFlights(json);
    expect(out.map((f) => f.id)).toEqual(['ok']);
  });

  it('fills sane defaults for optional/older fields', () => {
    const json = JSON.stringify({ flights: [{ id: 'x', name: 'f.csv', text: 'data' }] });
    const [f] = parseLogbookFlights(json);
    expect(f.formatLabel).toBe('Flight');
    expect(f.apogeeM).toBeNull();
    expect(f.maxVelocityMs).toBeNull();
    expect(f.note).toBe('');
    expect(typeof f.addedAt).toBe('number');
  });
});
