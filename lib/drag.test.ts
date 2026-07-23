import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dragCoefficient, canMeasureDrag, diameterToM } from './drag';
import { G0 } from './units';
import type { FlightSeries, FlightEvent } from './analyze/types';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';

// Build a coast with a KNOWN drag coefficient and check the back-calculation
// recovers it. The acceleration is written the way each source actually reads:
// a device accelerometer senses specific force (drag only), a baro-derived
// acceleration is kinematic and carries gravity — so the two differ by g, and
// the recovery must still land on the same Cd.
function coastFlight(opts: {
  cd: number;
  massKg: number;
  diameterM: number;
  rho: number;
  device: boolean;
}): { series: FlightSeries; events: FlightEvent[] } {
  const { cd, massKg, diameterM, rho, device } = opts;
  const area = Math.PI * (diameterM / 2) ** 2;
  const n = 40;
  const time = new Float64Array(n);
  const velocity = new Float64Array(n);
  const acceleration = new Float64Array(n);
  const airDensity = new Float64Array(n).fill(rho);
  for (let i = 0; i < n; i++) {
    time[i] = i * 0.05;
    const v = 250 - 240 * (i / (n - 1)); // 250 → 10 m/s
    velocity[i] = v;
    const dragPerMass = (0.5 * rho * v * v * cd * area) / massKg;
    acceleration[i] = device ? -dragPerMass : -(G0 + dragPerMass);
  }
  const zeros = new Float64Array(n);
  const series: FlightSeries = {
    time,
    altitude: zeros,
    altitudeRaw: zeros,
    velocity,
    acceleration,
    axialAccel: acceleration, // single signed axial: magnitude and axial coincide
    velocitySource: device ? 'device' : 'baro',
    accelerationSource: device ? 'device' : 'baro',
    altitudeSource: 'baro',
    speedOfSound: 340,
    speedOfSoundProfile: new Float64Array(n).fill(340),
    airDensity,
  };
  const events: FlightEvent[] = [
    { type: 'burnout', label: 'Burnout', time: time[2], index: 2, altitude: 0, provenance: 'measured' },
    { type: 'apogee', label: 'Apogee', time: time[n - 1], index: n - 1, altitude: 0, provenance: 'derived' },
  ];
  return { series, events };
}

describe('dragCoefficient', () => {
  const m = 1.2;
  const d = 0.054; // 54 mm

  it('recovers a known Cd from a device-accelerometer coast', () => {
    const { series, events } = coastFlight({ cd: 0.5, massKg: m, diameterM: d, rho: 1.2, device: true });
    const r = dragCoefficient(series, events, m, d)!;
    expect(r).not.toBeNull();
    expect(r.cd).toBeCloseTo(0.5, 3);
    expect(r.approximate).toBe(false);
    expect(r.cdA).toBeCloseTo(0.5 * Math.PI * (d / 2) ** 2, 6);
  });

  it('recovers the same Cd from a baro-derived (kinematic) coast, gravity and all', () => {
    const { series, events } = coastFlight({ cd: 0.45, massKg: m, diameterM: d, rho: 1.1, device: false });
    const r = dragCoefficient(series, events, m, d)!;
    expect(r.cd).toBeCloseTo(0.45, 3);
    expect(r.approximate).toBe(true); // baro velocity/accel are softer
  });

  it('would be wrong by a g if the gravity branch were ignored (guards the physics)', () => {
    // Sanity: a device coast fed through the baro formula (subtracting g) must NOT
    // recover the true Cd — proving the source branch matters.
    const { series, events } = coastFlight({ cd: 0.5, massKg: m, diameterM: d, rho: 1.2, device: true });
    const baroView = { ...series, accelerationSource: 'baro' as const };
    const r = dragCoefficient(baroView, events, m, d)!;
    expect(Math.abs(r.cd - 0.5)).toBeGreaterThan(0.02);
  });

  it('measures drag on a multi-axis logger from the signed axial, not the resultant', () => {
    const { series, events } = coastFlight({ cd: 0.55, massKg: m, diameterM: d, rho: 1.2, device: true });
    // A multi-axis logger reports `acceleration` as the always-positive resultant
    // magnitude; the signed axial (negative while decelerating) lives in `axialAccel`.
    const resultant = Float64Array.from(series.axialAccel, (x) => Math.abs(x));
    const multi: FlightSeries = { ...series, acceleration: resultant, accelerationResultant: true };
    const r = dragCoefficient(multi, events, m, d)!;
    expect(r).not.toBeNull();
    expect(r.cd).toBeCloseTo(0.55, 3);
    // Guard: reading the resultant magnitude (all positive) instead would fail the
    // "decelerating" sign check on every coast sample and return null.
    expect(dragCoefficient({ ...multi, axialAccel: resultant }, events, m, d)).toBeNull();
  });

  it('returns null without a coast, bad inputs, or GPS altitude', () => {
    const { series, events } = coastFlight({ cd: 0.5, massKg: m, diameterM: d, rho: 1.2, device: true });
    expect(dragCoefficient(series, events, 0, d)).toBeNull();
    expect(dragCoefficient(series, events, m, 0)).toBeNull();
    expect(dragCoefficient(series, [], m, d)).toBeNull(); // no burnout/apogee
    expect(dragCoefficient({ ...series, altitudeSource: 'gps' }, events, m, d)).toBeNull();
    expect(canMeasureDrag({ ...series, altitudeSource: 'gps' }, events)).toBe(false);
  });

  it('diameterToM converts mm and inches', () => {
    expect(diameterToM(54, 'mm')).toBeCloseTo(0.054, 6);
    expect(diameterToM(2, 'in')).toBeCloseTo(0.0508, 6);
  });
});

describe('dragCoefficient on the bundled sample (integration)', () => {
  const samplePath = fileURLToPath(new URL('../public/samples/sample-altusmetrum.csv', import.meta.url));
  const text = readFileSync(samplePath, 'utf8');

  it('reads a physically plausible Cd from the real coast', () => {
    const r = importFlight({ name: 'sample-altusmetrum.csv', text });
    expect(r.kind).toBe('flight');
    if (r.kind !== 'flight') return;
    const a = analyzeFlight(r.flight);
    const drag = dragCoefficient(a.series, a.events, 1.5, 0.054);
    expect(drag).not.toBeNull();
    // A real airframe's drag coefficient sits in a sane band (and this flight is
    // transonic, so it's a blend) — just guard it's physical, not a wild number.
    expect(drag!.cd).toBeGreaterThan(0.1);
    expect(drag!.cd).toBeLessThan(2);
    expect(drag!.samples).toBeGreaterThanOrEqual(5);
  });
});
