import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// A real Featherweight GPS **ground-station** export — the packets the receiver logged,
// so every row carries the receiver's position beside the rocket's. Trimmed to the flight
// window; see __fixtures__/README.md for the source and the ground truth.
const text = readFileSync(
  fileURLToPath(new URL('./__fixtures__/featherweight-gps-groundstation.csv', import.meta.url)),
  'utf8',
);

describe('Featherweight GPS ground-station parser', () => {
  it('auto-detects the ground-station export by its tracker/receiver column pair', () => {
    const result = importFlight({ name: 'GPS_GS03748_01-18-2026_10_32_45.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('featherweight-gps-gs');
    // The tracker's own log is a different export of the same logger; each must keep
    // its own file rather than one out-detecting the other.
    expect(result.flight.format).toBe('featherweight-gps-gs');
  });

  it('reads the rocket, not the receiver sitting in the field', () => {
    const result = importFlight({ name: 'gs.csv', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const a = analyzeFlight(result.flight);
    // Ground truth: a Blue Raven flew the same flight and its summary states 6,295.75 ft.
    // Two instruments, one barometric and one GPS, 0.2% apart. Reading the ground
    // station's own columns instead would put the whole flight inside a 38 ft band.
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(6200);
    expect(apogeeFt).toBeLessThan(6380);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);

    // The ground track is the point of a tracker log: the rocket drifted, the receiver
    // did not follow it up. Both must be the TRACKER columns.
    const lat = getChannel(result.flight, 'latitude')!;
    const lon = getChannel(result.flight, 'longitude')!;
    const drift = Math.hypot(
      (lat.values[lat.values.length - 1] - lat.values[0]) * 111_320,
      (lon.values[lon.values.length - 1] - lon.values[0]) * 111_320 * Math.cos((39.28 * Math.PI) / 180),
    );
    expect(drift).toBeGreaterThan(150); // metres — a real drift, not receiver jitter
  });

  it('builds a time base out of the wall clock, because the file states no elapsed time', () => {
    const result = importFlight({ name: 'gs.csv', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const time = result.flight.time;
    expect(time[0]).toBe(0);
    for (let i = 1; i < time.length; i++) expect(time[i]).toBeGreaterThan(time[i - 1]);
    // ~1 Hz reception over the trimmed window, and the clock's fractional seconds are
    // kept — rounding to whole seconds would collapse samples into duplicates.
    expect(time[time.length - 1]).toBeGreaterThan(300);
    expect(time.some((t) => !Number.isInteger(t))).toBe(true);
    // DATE + TIME carry no zone, so the day is read as the ground station's own clock.
    expect(result.flight.flownAt?.stamp.slice(0, 10)).toBe('2026-01-18');
    expect(result.flight.flownAt?.zone).toBe('logger');
  });

  it('runs the clock forward past midnight when the file states no date', () => {
    // Strip the DATE column: the clock alone still has to count upwards, and the only
    // thing a step backwards of most of a day can be is the next day starting.
    const header = 'TRACKER,TIME,GS Lat,GS Lon,GS Alt asl,TRACKER Lat,TRACKER Lon,TRACKER Alt asl,FIX,Alt AGL (ft)';
    const rows = [
      ['23:59:58.0', 0],
      ['23:59:59.0', 100],
      ['00:00:00.0', 400],
      ['00:00:01.0', 300],
      ['00:00:02.0', 100],
    ].map(([clock, agl]) => `T1,${clock},39.0,-109.0,4900,39.0,-109.0,${4900 + (agl as number)},3,${agl}`);
    const result = importFlight({ name: 'gs.csv', text: [header, ...rows].join('\n') });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    const time = result.flight.time;
    expect(Array.from(time)).toEqual([0, 1, 2, 3, 4]);
  });

  it('reads the altitude in the unit the export labels its ranges with', () => {
    // The altitude columns state no unit; the AGL column beside them does, and it is the
    // same app writing both. A metric export must not be read as 3.28x its real height.
    const mk = (aglLabel: string) =>
      [
        `TRACKER,TIME,GS Lat,GS Lon,GS Alt asl,TRACKER Lat,TRACKER Lon,TRACKER Alt asl,FIX,${aglLabel}`,
        ...[0, 100, 300, 400, 300, 100, 0].map(
          (agl, i) => `T1,10:00:0${i}.0,39.0,-109.0,1000,39.0,-109.0,${1000 + agl},3,${agl}`,
        ),
      ].join('\n');
    const peak = (aglLabel: string) => {
      const r = importFlight({ name: 'gs.csv', text: mk(aglLabel) });
      if (r.kind !== 'flight') throw new Error('expected a flight');
      const alt = getChannel(r.flight, 'altitude')!;
      return Math.max(...Array.from(alt.values)) - alt.values[0];
    };
    expect(peak('Alt AGL (ft)')).toBeCloseTo(400 * 0.3048, 3);
    expect(peak('Alt AGL (m)')).toBeCloseTo(400, 3);
  });

  it('drops a position the tracker had no 3D fix for', () => {
    const header = 'TRACKER,TIME,GS Lat,GS Lon,GS Alt asl,TRACKER Lat,TRACKER Lon,TRACKER Alt asl,FIX,Alt AGL (ft)';
    const rows = [
      'T1,10:00:00.0,39.0,-109.0,4900,39.0,-109.0,4900,0,0',
      'T1,10:00:01.0,39.0,-109.0,4900,39.0,-109.0,5000,3,100',
      'T1,10:00:02.0,39.0,-109.0,4900,39.0,-109.0,5100,3,200',
      'T1,10:00:03.0,39.0,-109.0,4900,39.0,-109.0,5000,3,100',
    ];
    const result = importFlight({ name: 'gs.csv', text: [header, ...rows].join('\n') });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const alt = getChannel(result.flight, 'altitude')!;
    // The row is kept — it is a real instant on the clock — but its position is not a
    // measurement, so it reads as missing rather than as a height.
    expect(alt.values.length).toBe(4);
    expect(Number.isNaN(alt.values[0])).toBe(true);
    expect(Number.isNaN(alt.values[1])).toBe(false);
  });
});
