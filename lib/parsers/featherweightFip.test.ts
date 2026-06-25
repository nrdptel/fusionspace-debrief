import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// Featherweight FIP export: per-channel "Time@<chan>,<chan>,bILBA" triples, with
// channels at different rates (accel dense, baro/velocity sparse) padded with
// blanks. Build a small one from a barometric flight.
function fipCsv(): string {
  const G = 9.80665;
  const dt = 0.01; // 100 Hz master (accel)
  const padT = 1;
  const aBoost = 100;
  const tBurn = 0.8;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const total = padT + tBurn + coastT + 85; // long enough to land and rest

  const header =
    'Time@Axial Accel (Gs),Axial Accel (Gs),bILBA,' +
    'Time@Baro (Atm),Baro (Atm),bILBA,' +
    'Time@Velocity (Accel-Ft/Sec),Velocity (Accel-Ft/Sec),bILBA,' +
    'Time@Temperature (F),Temperature (F),bILBA';
  const lines = [header];

  let prev = 0;
  let prevV = 0;
  let i = 0;
  for (let t = 0; t <= total; t += dt, i++) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 5 * dt);
    const v = (h - prev) / dt;
    const a = (v - prevV) / dt / G; // g
    prev = h;
    prevV = v;
    const tf = t.toFixed(3);
    // accel every sample; baro/velocity/temperature every 5th (≈20 Hz), else blank.
    const accel = `${tf},${a.toFixed(2)},b0000`;
    let baro = ',,';
    let vel = ',,';
    let temp = ',,';
    if (i % 5 === 0) {
      const atm = Math.pow(1 - h / 44330, 5.255); // pad at sea level → ~1 atm
      baro = `${tf},${atm.toFixed(5)},b0000`;
      vel = `${tf},${(v / 0.3048).toFixed(1)},b0000`;
      temp = `${tf},70.0,b0000`;
    }
    lines.push(`${accel},${baro},${vel},${temp}`);
  }
  return lines.join('\n');
}

describe('Featherweight Raven FIP parser', () => {
  const text = fipCsv();

  it('auto-detects the FIP format by its bILBA / Time@ columns', () => {
    const result = importFlight({ name: 'flight_FIPa.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('featherweight-fip');
  });

  it('resamples the channels and analyses a sane apogee', () => {
    const result = importFlight({ name: 'flight_FIPa.csv', text });
    if (result.kind !== 'flight') throw new Error('expected a flight');
    expect(getChannel(result.flight, 'pressure')).toBeTruthy();
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    expect(getChannel(result.flight, 'accelAxial')).toBeTruthy();
    const a = analyzeFlight(result.flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(900);
    expect(apogeeFt).toBeLessThan(1500);
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });
});
