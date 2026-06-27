import { describe, it, expect } from 'vitest';
import { flightPhases } from './phases';
import type { FlightEvent } from './analyze/types';

const ev = (type: FlightEvent['type'], time: number): FlightEvent => ({
  type,
  label: type,
  time,
  index: 0,
  altitude: 0,
  provenance: 'derived',
});

describe('flightPhases', () => {
  it('builds boost, coast and two descent legs from a full event set', () => {
    const phases = flightPhases([
      ev('liftoff', 0),
      ev('burnout', 2),
      ev('apogee', 12),
      ev('main', 40),
      ev('landing', 80),
    ]);
    expect(phases.map((p) => [p.key, p.duration])).toEqual([
      ['boost', 2],
      ['coast', 10],
      ['drogue', 28],
      ['main', 40],
    ]);
  });

  it('uses a single descent leg when no main deploy was detected', () => {
    const phases = flightPhases([ev('liftoff', 0), ev('burnout', 2), ev('apogee', 12), ev('landing', 60)]);
    expect(phases.map((p) => p.key)).toEqual(['boost', 'coast', 'descent']);
    expect(phases.find((p) => p.key === 'descent')!.duration).toBe(48);
  });

  it('coasts from liftoff when there is no burnout, and skips zero-length legs', () => {
    const phases = flightPhases([ev('liftoff', 0), ev('apogee', 10), ev('landing', 10)]);
    // No burnout → no boost leg; coast is liftoff→apogee; landing == apogee → no descent.
    expect(phases.map((p) => p.key)).toEqual(['coast']);
    expect(phases[0].duration).toBe(10);
  });

  it('returns nothing useful when only an apogee is known', () => {
    expect(flightPhases([ev('apogee', 5)])).toEqual([]);
  });
});
