import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';
import { convert } from '../units';

// Regression tests against real, downloaded flight files (see __fixtures__/README.md
// for sources). Big logs are downsampled but keep their original headers. Where a
// manufacturer summary exists, we assert against its ground-truth numbers.
const dir = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const read = (f: string) => readFileSync(dir + f, 'utf8');
const apogeeFt = (text: string, name: string) => {
  const r = importFlight({ name, text });
  if (r.kind !== 'flight') throw new Error(`${name} did not auto-detect`);
  return { r, a: analyzeFlight(r.flight) };
};

describe('real files — Altus Metrum TeleMetrum', () => {
  it('detects and analyses (real AltOS export with a single "speed" column + GPS)', () => {
    const { r, a } = apogeeFt(read('altusmetrum-telemetrum.csv'), 'TeleMetrum.csv');
    expect(r.parser.id).toBe('altusmetrum');
    expect(getChannel(r.flight, 'velocity')).toBeTruthy();
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(9000);
    expect(ft).toBeLessThan(9600);
  });
});

describe('real files — PerfectFlite Pnut .pf2', () => {
  it('matches the file’s stated 1009 ft apogee', () => {
    const { r, a } = apogeeFt(read('perfectflite-pnut.pf2'), 'flight.pf2');
    expect(r.parser.id).toBe('perfectflite');
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(960);
    expect(ft).toBeLessThan(1080);
  });
});

describe('real files — Featherweight Raven (FIP)', () => {
  it('resamples the per-channel clocks and matches the Pnut on the same flight', () => {
    const { r, a } = apogeeFt(read('featherweight-raven-fip.csv'), 'TopShot_FIPa.csv');
    expect(r.parser.id).toBe('featherweight-fip');
    expect(getChannel(r.flight, 'pressure')).toBeTruthy();
    expect(getChannel(r.flight, 'accelAxial')).toBeTruthy();
    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(960);
    expect(ft).toBeLessThan(1100);
  });
});

describe('real files — PerfectFlite StratoLogger CSV', () => {
  it('falls back to a usable mapping with the right roles/units', () => {
    const r = importFlight({ name: 'StratoLogger.csv', text: read('perfectflite-stratologger.csv') });
    expect(r.kind).toBe('mapping');
    if (r.kind !== 'mapping') return;
    const byRole = Object.fromEntries(r.table.columns.map((c) => [c.role, c]));
    expect(byRole.time).toBeTruthy();
    expect(byRole.altitude?.unit).toBe('ft');
  });
});

describe('real files — Blue Raven phone-app low-rate, vs its summary', () => {
  // Ground truth from the bundled BlRv summary CSV.
  const summary = read('blueraven-app.summary.csv');
  const truth = (re: RegExp) => Number(summary.match(re)![1]);
  const truthApogee = truth(/Max Altitude,([\d.]+)/);
  const truthMaxV = truth(/Max velocity,([\d.]+)/);

  it('matches the summary apogee and max velocity, with drogue faster than main', () => {
    const { r, a } = apogeeFt(read('blueraven-app-lr.csv'), 'BlRv-LR.csv');
    expect(r.parser.id).toBe('blueraven');

    const ft = convert(a.metrics.apogeeAltitude, 'm', 'ft');
    expect(ft).toBeGreaterThan(truthApogee * 0.98);
    expect(ft).toBeLessThan(truthApogee * 1.02);

    const maxV = convert(a.metrics.maxVelocity, 'm/s', 'ft/s');
    expect(maxV).toBeGreaterThan(truthMaxV * 0.92);
    expect(maxV).toBeLessThan(truthMaxV * 1.08);

    // Dual deploy: drogue (fast) then main (slow).
    expect(a.metrics.drogueDescentRate).not.toBeNull();
    expect(a.metrics.mainDescentRate).not.toBeNull();
    expect(a.metrics.drogueDescentRate!).toBeGreaterThan(a.metrics.mainDescentRate!);
  });
});
