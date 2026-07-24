import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// Eggtimer flight-detail CSV: header T,Alt,VRaw,VFilt with T in ms, Alt in feet,
// velocities in ft/s, and a mixed sample rate (10 Hz up, 2 Hz after nose-over).
function eggtimerCsv(): string {
  const G = 9.80665;
  const aBoost = 90;
  const tBurn = 0.9;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const apogee = hB + (vB * vB) / (2 * G);
  const lines = ['T,Alt,VRaw,VFilt'];

  let t = 0;
  let prevH = 0;
  const padT = 1;
  const descentEnd = padT + tBurn + coastT + 90; // enough to land + rest
  while (t <= descentEnd) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else {
      h = Math.max(0, prevH - 5 * (t > 0 ? dt() : 0));
    }
    const v = (h - prevH) / dt();
    prevH = h;
    const ms = Math.round(t * 1000);
    const altFt = (h / 0.3048).toFixed(0);
    const vFt = (v / 0.3048).toFixed(0);
    lines.push(`${ms},${altFt},${vFt},${vFt}`);
    t += dt();

    function dt(): number {
      // 10 Hz through apogee, 2 Hz afterwards
      return ft > tBurn + coastT ? 0.5 : 0.1;
    }
  }
  return lines.join('\n');
}

// Quantum-style detail CSV: T (seconds), Alt (ft), Veloc (ft/s) + event columns.
function quantumCsv(): string {
  const G = 9.80665;
  const aBoost = 90;
  const tBurn = 0.9;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const lines = ['T,Alt,Veloc,Apogee,Drogue,Main,N-O'];
  let t = 0;
  let prev = 0;
  const padT = 1;
  const end = padT + tBurn + coastT + 90;
  const dt = 0.1; // 10 Hz, in seconds
  while (t <= end) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 5 * dt);
    const v = (h - prev) / dt;
    prev = h;
    lines.push(`${t.toFixed(2)},${(h / 0.3048).toFixed(0)},${(v / 0.3048).toFixed(0)},0,0,0,0`);
    t += dt;
  }
  return lines.join('\n');
}

describe('Eggtimer Quantum format (Veloc + event columns, seconds)', () => {
  const text = quantumCsv();

  it('auto-detects the Quantum variant', () => {
    const result = importFlight({ name: 'quantum.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('eggtimer');
  });

  it('maps Veloc to velocity, reads seconds, and analyses sanely', () => {
    const result = importFlight({ name: 'quantum.csv', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    const a = analyzeFlight(result.flight);
    // Time must be read as seconds (apogee a few seconds in, not thousands).
    expect(a.metrics.timeToApogee).toBeGreaterThan(2);
    expect(a.metrics.timeToApogee).toBeLessThan(20);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(1000);
    expect(apogeeFt).toBeLessThan(1500);
  });
});

// The same Quantum flight exported in the European locale: semicolon-delimited with
// comma decimals, the way a metric-region Eggtimer writes it. Altitude is still in
// feet (Eggtimer's default), so the read must match the comma export — not fall to
// the generic mapper, which would default the unlabelled altitude to metres.
function europeanQuantumCsv(): string {
  return quantumCsv()
    .split('\n')
    .map((line) => line.split(',').map((c) => c.replace('.', ',')).join(';'))
    .join('\n');
}

describe('Eggtimer European (semicolon) export', () => {
  it('auto-detects a semicolon-delimited export and reads feet, not metres', () => {
    const result = importFlight({ name: 'euro-flight.csv', text: europeanQuantumCsv() });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('eggtimer');
    const a = analyzeFlight(result.flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    // ~1000–1500 ft read as feet; the generic-mapper metres default would put it ~3.3× high.
    expect(apogeeFt).toBeGreaterThan(1000);
    expect(apogeeFt).toBeLessThan(1500);
  });
});

describe('Eggtimer parser', () => {
  const text = eggtimerCsv();

  it('auto-detects by the VRaw/VFilt signature', () => {
    const result = importFlight({ name: 'flight.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('eggtimer');
  });

  it('reads feet/ms into the canonical model and analyses sanely', () => {
    const result = importFlight({ name: 'flight.csv', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const flight = result.flight;
    expect(getChannel(flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(flight, 'velocity')).toBeTruthy();

    const a = analyzeFlight(flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(1000);
    expect(apogeeFt).toBeLessThan(1500);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });
});
