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
