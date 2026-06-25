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

// Phone-app export: a normal headered CSV with Blue Raven's column names.
function blueRavenAppLow(): string {
  const G = 9.80665;
  const dt = 0.02; // 50 Hz
  const padT = 1;
  const aBoost = 100;
  const tBurn = 0.7;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const total = padT + tBurn + coastT + 60;
  const header =
    'Year,Month,Day,Time,Flight_Time_(s),Sync,Velocity_Up,Velocity_DR,Velocity_CR,' +
    'Inertial_Altitude,Inertial_DR_Position,Inertial_CR_position,Tilt_Angle_(deg),Roll_Angle_(deg)';
  const lines = [header];
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
    const v = (h - prev) / dt;
    prev = h;
    sync = (sync + 20) % 250;
    lines.push(
      `2025,5,24,08:29:54,${t.toFixed(2)},${sync},${(v / 0.3048).toFixed(1)},0,0,${(h / 0.3048).toFixed(1)},0,0,0,0`,
    );
  }
  return lines.join('\n');
}

describe('Blue Raven phone-app export', () => {
  it('auto-detects and analyses the low-rate app CSV', () => {
    const result = importFlight({ name: 'tcf_TTV_018 LR.csv', text: blueRavenAppLow() });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('blueraven');
    expect(getChannel(result.flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    const a = analyzeFlight(result.flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(apogeeFt).toBeGreaterThan(750);
    expect(apogeeFt).toBeLessThan(1100);
  });

  it('points the user to the low-rate file for a high-rate app CSV', () => {
    const hr = [
      'Year,Month,Day,Time,Flight_Time_(s),Sync,Gyro_X,Gyro_Y,Gyro_Z,Accel_X,Accel_Y,Accel_Z,Quat_1,Quat_2,Quat_3,Quat_4,Aux_Volts,Current',
      '2025,5,24,08:29:54.433,6.318,101,169.6,64.8,-280.4,0.60,1.25,0.00,-0.55,0.17,-0.81,0.09,0.07,0.126',
      '2025,5,24,08:29:54.435,6.320,107,206.2,70.1,-300.2,0.58,1.27,0.04,-0.55,0.18,-0.81,0.10,0.07,0.129',
    ].join('\n');
    expect(() => importFlight({ name: 'tcf_TTV_018 HR.csv', text: hr })).toThrow(/low-rate/i);
  });
});
