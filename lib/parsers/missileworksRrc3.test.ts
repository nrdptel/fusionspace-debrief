import { describe, it, expect } from 'vitest';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// A synthetic MissileWorks RRC3 mDACS export. The same flight (apogee ~1787 m /
// ~5863 ft) is written two ways: the US flavour (tab-delimited, decimal point,
// feet + °F) and the European flavour (semicolon-delimited, decimal comma, metric).
// The barometric Pressure column is physically consistent with the altitude in
// both, so the parser can settle feet-vs-metres from the pressure alone.
const P0_HPA = 1013.25; // sea-level pad pressure

/** Pressure (hPa) at an AGL altitude, inverse of the analyzer's hypsometric read. */
function pressureHpa(hMeters: number): number {
  return P0_HPA * Math.pow(1 - hMeters / 44330, 5.255);
}

function rrc3(opts: { metric: boolean }): string {
  const G = 9.80665;
  const aBoost = 120;
  const tBurn = 1.5;
  const vB = aBoost * tBurn;
  const hB = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vB / G;
  const delim = opts.metric ? ';' : '\t';
  const num = (x: number, d = 2) => {
    const s = x.toFixed(d);
    return opts.metric ? s.replace('.', ',') : s;
  };
  const header = ['Time', 'Altitude', 'Pressure', 'Velocity', 'Temperature', 'Events', 'Voltages'].join(delim);
  const lines = [header];
  let t = 0;
  let prev = 0;
  const padT = 1;
  const end = padT + tBurn + coastT + 60;
  const dt = 0.05; // 20 Hz
  const tempF = 72; // °F on the pad
  while (t <= end) {
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
    else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hB + vB * c - 0.5 * G * c * c;
    } else h = Math.max(0, prev - 6 * dt);
    const v = (h - prev) / dt;
    prev = h;
    const altOut = opts.metric ? h : h / 0.3048;
    const velOut = opts.metric ? v : v / 0.3048;
    const tempOut = opts.metric ? ((tempF - 32) * 5) / 9 : tempF;
    lines.push([num(t), num(altOut, 1), num(pressureHpa(h), 2), num(velOut, 1), num(tempOut, 1), '-', num(9.1, 3)].join(delim));
    t += dt;
  }
  return lines.join('\n');
}

describe('MissileWorks RRC3 mDACS parser', () => {
  it('auto-detects the US (tab, feet) export and reads the units right', () => {
    const result = importFlight({ name: 'XPRS_Flight_Data.txt', text: rrc3({ metric: false }) });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('missileworks-rrc3');
    expect(getChannel(result.flight, 'pressure')).toBeTruthy();
    const a = analyzeFlight(result.flight);
    const apogeeFt = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    // True apogee ~5863 ft. Read as feet it lands near there; had it been read as
    // metres (the generic-mapper default) it would be ~3.3× high (~19,200 ft).
    expect(apogeeFt).toBeGreaterThan(5500);
    expect(apogeeFt).toBeLessThan(6200);
  });

  it('auto-detects the European (semicolon, comma-decimal, metric) export', () => {
    const result = importFlight({ name: 'rrc3.csv', text: rrc3({ metric: true }) });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('missileworks-rrc3');
    const a = analyzeFlight(result.flight);
    const apogeeM = a.metrics.apogeeAltitude;
    // Same true flight, ~1787 m. Read as metres it lands near there; the pressure
    // anchor keeps it from being mistaken for feet and read ~3.3× low.
    expect(apogeeM).toBeGreaterThan(1650);
    expect(apogeeM).toBeLessThan(1950);
  });

  it('reads the same physical apogee from both flavours of the one flight', () => {
    const us = importFlight({ name: 'a.txt', text: rrc3({ metric: false }) });
    const eu = importFlight({ name: 'b.csv', text: rrc3({ metric: true }) });
    if (us.kind !== 'flight' || eu.kind !== 'flight') throw new Error('expected flights');
    const usM = analyzeFlight(us.flight).metrics.apogeeAltitude;
    const euM = analyzeFlight(eu.flight).metrics.apogeeAltitude;
    // The two independent recordings of the same flight must agree to a few percent.
    expect(Math.abs(usM - euM) / euM).toBeLessThan(0.05);
  });
});
