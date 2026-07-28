import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importRecent } from './reopen';

const fx = (f: string) => readFileSync(fileURLToPath(new URL(`./parsers/__fixtures__/${f}`, import.meta.url)), 'utf8');

// A flight goes into the logbook as it is read, one file at a time. The device summary that
// belongs to it is a SECOND file, and which log it belongs to can only be decided once the
// whole drop has been read — so the pairing happened after the save, and was lost with it.
// Reopening a paired flight, or building a comparison from ids, dropped the device's own
// figures and the entire cross-check panel with them.
describe('reopening a flight that was dropped with its device summary', () => {
  const rec = { name: 'BlRv_SN0829_LR_05-11-2024.csv', text: fx('blueraven-app-lr.csv') };
  const summary = fx('blueraven-app.summary.csv');

  it('reads the summary again and puts its figures back beside Debrief’s read', () => {
    const result = importRecent({ ...rec, summaryText: summary });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    const by = Object.fromEntries((result.flight.reported ?? []).map((r) => [r.metric, r.value]));
    // What the device stated for itself: 4,035 ft and 700.36 ft/s.
    expect(by.apogeeAltitude).toBeCloseTo(1229.85, 1);
    expect(by.maxVelocity).toBeCloseTo(213.47, 1);
    expect(result.flight.reported?.every((r) => r.source === 'device')).toBe(true);
  });

  it('carries the summary’s notes back too, so a withheld figure still says why', () => {
    const result = importRecent({ ...rec, summaryText: summary });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    // This summary states a main descent rate whose unit is a length — the device's own
    // defect. The sentence that explains the omission is part of the pairing, not a
    // decoration on it, so it has to come back with the figures.
    expect(result.flight.notes.some((n) => /Main chute descent rate/.test(n))).toBe(true);
  });

  it('is unchanged when the flight was dropped on its own', () => {
    const result = importRecent(rec);
    if (result.kind !== 'flight') throw new Error('expected a flight');
    expect(result.flight.reported ?? []).toEqual([]);
    expect(result.flight.notes.some((n) => /device summary states/.test(n))).toBe(false);
  });

  it('re-READS the summary rather than restoring stored figures', () => {
    // The source is kept, not the answer. A stored answer is frozen at the version that
    // wrote it; a stored source is read by today's rules. That is not theoretical — the
    // reading of these files changed once already, to take both descent rates and to say
    // what it could not use, and every flight already in a logbook picked that up without
    // the flyer re-dropping anything. Proven by feeding a summary the ORIGINAL drop could
    // not have contained: whatever it says now is what comes back.
    const invented = [
      'Rocket Name,SN0829',
      'Firmware,x 01/01/2024',
      'Max Altitude,1234.0 feet',
      'Pad altitude ASL,100.0 feet',
    ].join('\n');
    const result = importRecent({ ...rec, summaryText: invented });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const by = Object.fromEntries((result.flight.reported ?? []).map((r) => [r.metric, r.value]));
    expect(by.apogeeAltitude).toBeCloseTo(376.12, 1); // 1234 ft, not the real summary's 4,035
  });

  it('fails soft on a stored summary that no longer reads as one', () => {
    const result = importRecent({ ...rec, summaryText: 'Time (s),Altitude (ft)\n0,0\n0.1,5\n' });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    expect(result.flight.reported ?? []).toEqual([]);
  });
});
