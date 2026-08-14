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

    // **This one-phase shape is what `components/FlightTimeline.tsx` renders its empty state
    // for**, and it is not hypothetical: measured 2026-08-14 over every real recording the repo
    // can reach — 52 committed fixtures, served samples and private-corpus files that analyse end
    // to end — **3 produce exactly this**, two Eggtimer logs and a Blue Raven sustainer, one of
    // them the early-deploy anomaly file. Until then the component returned `null` and took its
    // own `<h3>` with it, so the section vanished with nothing saying why.
    //
    // The component's own branch is NOT pinned by a walk, and saying so is the point of this
    // note: all three files that reach it are in the private corpus, so an e2e would need a
    // synthesized log shaped to resolve a liftoff and neither a burnout nor a landing — which is
    // D10's machinery and a slice of its own. What is pinned here is the CONDITION.
    expect(phases.length, 'fewer than two phases is what the empty state exists for').toBeLessThan(2);
  });

  it('returns nothing useful when only an apogee is known', () => {
    expect(flightPhases([ev('apogee', 5)])).toEqual([]);
  });
});
