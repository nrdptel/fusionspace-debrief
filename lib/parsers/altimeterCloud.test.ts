import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight, PARSERS, suggestMapping } from './index';
import { analyzeFlight } from '../analyze';
import { buildFlight } from '../flight/build';
import { getChannel } from '../flight/types';

// A real AltimeterCloud export (public flight page 1866, downsampled, original header kept —
// see __fixtures__/README.md). Ground truth is the device's own flight page: 784.2 ft.
const text = readFileSync(fileURLToPath(new URL('./__fixtures__/altimetercloud-mercury.csv', import.meta.url)), 'utf8');
const FT = 1 / 0.3048;

describe('Rocketry Ltd Mercury / AltimeterCloud', () => {
  it('auto-detects, so the columns need no mapping by hand', () => {
    const r = importFlight({ name: '1866.csv', text });
    expect(r.kind).toBe('flight');
    if (r.kind !== 'flight') return;
    expect(r.parser.id).toBe('altimetercloud');
  });

  it('reads the apogee the device itself reports', () => {
    const r = importFlight({ name: '1866.csv', text });
    if (r.kind !== 'flight') throw new Error('not detected');
    const a = analyzeFlight(r.flight);
    // 784.2 ft on altimetercloud.com's own flight page.
    expect(a.metrics.apogeeAltitude! * FT).toBeGreaterThan(784.2 * 0.97);
    expect(a.metrics.apogeeAltitude! * FT).toBeLessThan(784.2 * 1.03);
  });

  it('reads the centi-degree temperature column as degrees', () => {
    // `bmp_temp(x100)` holds 3501 for 35.01 °C. Through the generic mapper that is a
    // 3,501 °C ground temperature, which the analysis then throws away as impossible — so
    // the flight lost its temperature and the speed of sound computed from it entirely.
    const r = importFlight({ name: '1866.csv', text });
    if (r.kind !== 'flight') throw new Error('not detected');
    const a = analyzeFlight(r.flight);
    expect(a.metrics.groundTemperature).toBeGreaterThan(15);
    expect(a.metrics.groundTemperature).toBeLessThan(50);

    // …and the same file through everything EXCEPT this parser has no temperature at all.
    const without = PARSERS.filter((p) => p.id !== 'altimetercloud');
    const g = importFlight({ name: '1866.csv', text }, without);
    if (g.kind !== 'mapping') throw new Error('expected the mapper fallback');
    const flight = buildFlight({
      source: 'x', format: 'generic', formatLabel: 'Generic CSV',
      headers: g.table.headers, dataRows: g.table.dataRows, mappings: suggestMapping(g.table),
    });
    expect(analyzeFlight(flight).metrics.groundTemperature).toBeNull();
  });

  it('leaves the attitude angles and the unstated gyro axes out', () => {
    // pitch/roll/yaw are Euler angles; the rates are gyro_x/y/z and which is the roll axis
    // is not stated. Neither is a roll rate, and a peak roll rate off either would be wrong.
    const r = importFlight({ name: '1866.csv', text });
    if (r.kind !== 'flight') throw new Error('not detected');
    expect(getChannel(r.flight, 'rollRate')).toBeFalsy();
    expect(getChannel(r.flight, 'tilt')).toBeTruthy(); // the attitude it does read
    expect(analyzeFlight(r.flight).metrics.peakRollRate).toBeNull();
  });

  it('does not claim a file that merely has a time and an altitude', () => {
    const plain = 'Time (s),Alt (ft)\n0,0\n1,100\n2,180\n3,120\n4,0\n';
    expect(importFlight({ name: 'plain.csv', text: plain }).kind).toBe('mapping');
  });
});
