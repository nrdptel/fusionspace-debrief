import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

const ATM_PA = 101325;

// Build a Blue Raven low-rate (@ LOG_LOW) capture to the documented token format:
// "[sync] Bo: [temp] [pressure atm×50000] V: [batt mV] … Vel: … Pos: … ang: … FER: … CRC: …"
// at 50 Hz, with pressure synthesized from a barometric altitude profile.
function blueRavenLow(): string {
  const G = 9.80665;
  const dt = 0.02; // 50 Hz
  const padT = 1;
  const aBoost = 100;
  const tBurn = 0.7;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const apogee = hB + (vB * vB) / (2 * G);
  const total = padT + tBurn + coastT + 60;
  const lines = ['@ LOG_LOW 4096 2026 6 25 10 0 0'];
  let prev = 0;
  let sync = 0;
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 5 * dt);
    prev = h;
    const pa = ATM_PA * Math.pow(1 - h / 44330, 5.255); // pad at sea level
    const rawPressure = Math.round((pa / ATM_PA) * 50000);
    const up = (h - prev) / dt; // unused by parser, included for realism
    sync = (sync + 20) % 250;
    lines.push(
      `${sync} Bo: 7100 ${rawPressure} V: 9310 0 0 0 0 12 Vel: ${up.toFixed(0)} 0 0 ` +
        `Pos: ${(h / 0.3048).toFixed(0)} 0 0 ang: 0 0 0 FER: 0 0 0 0 0 CRC: 0`,
    );
  }
  return lines.join('\n');
}

describe('Featherweight Blue Raven parser', () => {
  const text = blueRavenLow();

  it('auto-detects the low-rate LOG_LOW file', () => {
    const result = importFlight({ name: 'BLR_flight.txt', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('blueraven');
  });

  it('reads barometric pressure and analyses a sane apogee', () => {
    const result = importFlight({ name: 'BLR_flight.txt', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const flight = result.flight;
    expect(getChannel(flight, 'pressure')!.unit).toBe('Pa');
    expect(getChannel(flight, 'pressure')!.values[0]).toBeCloseTo(ATM_PA, -3);

    const a = analyzeFlight(flight);
    // ~900 ft apogee; altitude is derived from pressure.
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(750);
    expect(apogeeFt).toBeLessThan(1100);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });

  it('gives a helpful error for the high-rate file', () => {
    const hir = ['@ LOG_HIR 4096 2026 6 25 10 0 0', '0 100 200 300 100 100 9800 0 0 0 30000'].join('\n');
    expect(() => importFlight({ name: 'BLR_hir.txt', text: hir })).toThrow(/high-rate/i);
  });
});
