import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { summaryFigures } from './deviceSummary';
import { ParseGuidanceError } from './types';

// A Featherweight app summary export, trimmed: key,value rows and no time series,
// including the per-axis vector rows a Blue Raven writes for its pad attitude.
const BLUE_RAVEN_SUMMARY = [
  'Rocket Name,BlRv_159F1cm',
  'Firmware,25a237f 10/12/2025 15:57:13',
  'Serial number,SN159 BlRv_159F1cm',
  'Max Altitude,6295.75 feet',
  'Max velocity,1247.79 feet/sec',
  'Pad altitude ASL,4488.93 feet',
  'Launch date,18-Jan-26',
  'Tilt angle at burnout,21.2 deg',
  'Gravity direction on pad,0.0084,-0.0102,-0.9999',
  'Max motor burn acceleration,72.9 Gs',
].join('\n');

describe('a device summary file', () => {
  it('is recognised and explained rather than dropped into the column mapper', () => {
    let err: unknown;
    try {
      importFlight({ name: 'BlRv_159F1cm_summary.csv', text: BLUE_RAVEN_SUMMARY });
    } catch (e) {
      err = e;
    }
    // Guidance, not a crash and not a mapper with nothing to map.
    expect(err).toBeInstanceOf(ParseGuidanceError);
    const msg = (err as Error).message;
    expect(msg).toContain('BlRv_159F1cm');
    // Reads the figures back, so the flyer can see the file was understood…
    expect(msg).toContain('6295.75 feet');
    expect(msg).toContain('72.9 Gs');
    // …and points at the file that actually holds the flight.
    expect(msg).toMatch(/low-rate/i);
  });

  it('leaves a real flight file alone', () => {
    // Two columns, but the rows lead with a timestamp — a flight, not a summary.
    const flight = ['Time (s),Altitude (ft)', ...Array.from({ length: 40 }, (_, i) => `${i * 0.1},${i * 12}`)].join('\n');
    const res = importFlight({ name: 'flight.csv', text: flight });
    expect(res.kind).toBe('mapping');
  });

  it('leaves a two-column key/value file that isn’t a flight summary alone', () => {
    // No rocket name, no headline figure — nothing to claim.
    const settings = ['Setting,Value', 'Main altitude,700', 'Drogue delay,2', 'Beeper,on', 'Units,feet'].join('\n');
    expect(() => importFlight({ name: 'settings.csv', text: settings })).not.toThrow();
  });
});

// The figures a summary contributes to the flight it belongs to, for the side-by-side
// cross-check. Read as SI, with the unit taken from the value the file states rather than
// assumed — the same app can be set to metric.
describe('summaryFigures', () => {
  it('reads a Featherweight (Blue Raven) summary’s headline figures', () => {
    const s = summaryFigures(
      [
        'Rocket Name,BlRv_SN0829',
        'Firmware,fd31408 02/03/2024 11:34:33',
        'Max Altitude,4034.98 feet',
        'Max velocity,700.36 feet/sec',
        'Pad altitude ASL,230.55 feet',
        'Max motor burn acceleration,24.1 Gs',
        'Tilt angle at burnout,2.6 deg',
      ].join('\n'),
    )!;
    expect(s.rocket).toBe('BlRv_SN0829');
    const by = Object.fromEntries(s.reported.map((r) => [r.metric, r.value]));
    expect(by.apogeeAltitude).toBeCloseTo(1229.86, 1); // 4034.98 ft
    expect(by.maxVelocity).toBeCloseTo(213.47, 1); // 700.36 ft/s
    expect(by.maxAcceleration).toBeCloseTo(236.34, 1); // 24.1 g
    expect(s.reported.every((r) => r.source === 'device')).toBe(true);
  });

  it('reads a GPS summary’s velocity and the UTC launch time it states', () => {
    const s = summaryFigures(
      [
        'Rocket Name,GPSTrk05305',
        'Launch time UTC,Apr 12 2025 16:46:14.200 UTC',
        'Launch time local time zone,Apr 12 2025 12:46:14',
        'Max vertical velocity,1340 ft/sec',
        'Pad altitude,25.0 ft',
        'Distance at apogee,5480.90 ft',
      ].join('\n'),
    )!;
    expect(s.flownAt).toEqual({ stamp: '2025-04-12T16:46:14', zone: 'UTC' });
    const by = Object.fromEntries(s.reported.map((r) => [r.metric, r.value]));
    expect(by.maxVelocity).toBeCloseTo(408.43, 1); // 1340 ft/s
    // "Distance at apogee" is downrange, not altitude: mapping it would invent a
    // cross-check that contradicts a sound read.
    expect(by.apogeeAltitude).toBeUndefined();
  });

  it('drops a figure whose unit it can’t resolve rather than assuming feet', () => {
    const s = summaryFigures(
      [
        'Rocket Name,Mystery',
        'Firmware,abc 01/01/2024',
        'Max Altitude,4034.98 cubits',
        'Max velocity,700.36 feet/sec',
        'Pad altitude ASL,230.55 feet',
      ].join('\n'),
    )!;
    expect(s.reported.map((r) => r.metric)).toEqual(['maxVelocity']);
  });

  it('reads both descent rates, as downward speeds, from the signed figures the device writes', () => {
    // These are the numbers a flyer sizes a canopy against and shows an RSO, and neither was
    // being taken. The device states them downward-negative; Debrief's own rates are downward
    // SPEEDS, so they are compared as magnitudes — the same convention the AltimeterCloud key
    // has always used (lib/flight/reported.ts).
    const s = summaryFigures(
      [
        'Rocket Name,Descender',
        'Firmware,abc 01/01/2024',
        'Max Altitude,6295.75 feet',
        'Drogue descent rate,-55.9 feet/sec',
        'Main chute descent rate,-29.0 feet/sec',
      ].join('\n'),
    )!;
    const by = Object.fromEntries(s.reported.map((r) => [r.metric, r.value]));
    expect(by.drogueDescentRate).toBeCloseTo(17.04, 2); // 55.9 ft/s, downward, positive
    expect(by.mainDescentRate).toBeCloseTo(8.84, 2); // 29.0 ft/s
    expect(s.notes).toEqual([]);
  });

  it('says which figure it left out when the device wrote the wrong unit for it', () => {
    // Not hypothetical: the corpus Blue Raven `jan18` writes `Main chute descent rate,-29.0
    // feet` — a RATE with a length for a unit. Debrief will not decide the device meant feet
    // per second. Withholding it is right; withholding it SILENTLY left the flyer with no
    // main descent figure at all on a flight whose record stops above the main deployment,
    // and no way to know their own file held one.
    const s = summaryFigures(
      [
        'Rocket Name,BlRv_159F1cm',
        'Firmware,abc 01/01/2024',
        'Max Altitude,6295.75 feet',
        'Main chute descent rate,-29.0 feet',
      ].join('\n'),
    )!;
    expect(s.reported.map((r) => r.metric)).toEqual(['apogeeAltitude']);
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0]).toContain('Main chute descent rate: -29.0 feet');
    expect(s.notes[0]).toContain('is not a speed');
  });

  it('treats a stated zero as no measurement, and says nothing about its unit', () => {
    // A device fills a row it has nothing for with 0.0 — the corpus Blue Raven `lemiv-l3`
    // writes `Drogue descent rate,0.0 feet/sec` and `Main chute descent rate,0.0 feet`.
    // "Your main came down at 0 ft/s" under a device label is a wrong claim, not a missing
    // one. And the zero is judged BEFORE the unit: a row with no measurement in it has
    // nothing worth telling the flyer about the unit it was written in.
    const s = summaryFigures(
      [
        'Rocket Name,BlRv_SN1537',
        'Firmware,abc 01/01/2024',
        'Max Altitude,11765.5 feet',
        'Drogue descent rate,0.0 feet/sec',
        'Main chute descent rate,0.0 feet',
      ].join('\n'),
    )!;
    expect(s.reported.map((r) => r.metric)).toEqual(['apogeeAltitude']);
    expect(s.notes).toEqual([]);
  });

  it('is null for anything that isn’t a summary', () => {
    expect(summaryFigures('Time (s),Altitude (ft)\n0,0\n0.1,5\n')).toBeNull();
  });
});
