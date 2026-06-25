import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// Build a PerfectFlite-format flight in its native units: a text preamble, then
// headerless rows of time, altitude(ft), velocity(ft/s), temperature(F), voltage.
function perfectFliteFile(): string {
  const G = 9.80665;
  const dt = 0.05; // 20 Hz
  const padT = 1.5;
  const aBoost = 110; // m/s²
  const tBurn = 1.2;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const apogee = hB + (vB * vB) / (2 * G);
  const total = padT + tBurn + coastT + 95; // enough descent + rest at touchdown
  const lines = [
    'PerfectFlite StratoLoggerCF',
    'Flight 3',
    'Max altitude 2998 ft',
    '',
  ];
  let mainFired = false;
  let prevH = 0;
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else {
      // descent: drogue ~23 m/s, main ~5.5 m/s below 150 m
      if (!mainFired && prevH <= 150) mainFired = true;
      const rate = mainFired ? 5.5 : 23;
      h = Math.max(0, prevH - rate * dt);
    }
    const vel = (h - prevH) / dt; // m/s
    prevH = h;
    const ftAlt = h / 0.3048;
    const ftVel = vel / 0.3048;
    lines.push(`${t.toFixed(2)},${ftAlt.toFixed(1)},${ftVel.toFixed(1)},71.0,9.31`);
  }
  return lines.join('\n');
}

describe('PerfectFlite (StratoLogger) parser', () => {
  const text = perfectFliteFile();

  it('auto-detects a .pf2 file by name', () => {
    const result = importFlight({ name: 'flight.pf2', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('perfectflite');
  });

  it('auto-detects by preamble marker even with a .csv name', () => {
    const result = importFlight({ name: 'export.csv', text });
    expect(result.kind === 'flight' && result.parser.id === 'perfectflite').toBe(true);
  });

  it('reads the columns into the canonical model and analyses sanely', () => {
    const result = importFlight({ name: 'flight.pf2', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    const flight = result.flight;
    expect(getChannel(flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(flight, 'velocity')).toBeTruthy();
    expect(getChannel(flight, 'voltage')).toBeTruthy();

    const a = analyzeFlight(flight);
    // ~2998 ft apogee; allow generous tolerance for smoothing.
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(2700);
    expect(apogeeFt).toBeLessThan(3300);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });
});

describe('StratoLogger DataCap-style CSV with a header row above the data', () => {
  it('skips the header row and reads the columns positionally', () => {
    const text = [
      'PerfectFlite StratoLoggerCF',
      'Time,Altitude,Velocity,Temperature,Voltage',
      '0.00,0,0,71,9.3',
      '0.05,2,40,71,9.3',
      '0.10,9,120,71,9.3',
      '0.15,25,200,71,9.3',
      '0.20,48,260,71,9.3',
      '0.25,80,300,71,9.3',
    ].join('\r\n'); // CRLF, as a Windows export would use
    const result = importFlight({ name: 'flight.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('perfectflite');
    // Altitude is feet -> metres; first real data row is 0.
    expect(getChannel(result.flight, 'altitude')!.values[0]).toBeCloseTo(0, 5);
  });
});

describe('headerless numeric file falls back to a usable mapping', () => {
  it('synthesises column names so the mapper can be used', () => {
    const text = ['0,0,0', '0.1,5,12', '0.2,20,30', '0.3,44,40'].join('\n');
    const result = importFlight({ name: 'mystery.csv', text });
    expect(result.kind).toBe('mapping');
    if (result.kind !== 'mapping') return;
    expect(result.table.headers).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(result.table.dataRows.length).toBe(4);
  });
});
