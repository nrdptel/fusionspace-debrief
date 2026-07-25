import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
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
