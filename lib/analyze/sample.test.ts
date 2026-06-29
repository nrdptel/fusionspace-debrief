import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from '../parsers';
import { analyzeFlight } from './index';

const samplePath = fileURLToPath(new URL('../../public/samples/sample-altusmetrum.csv', import.meta.url));

describe('end-to-end on the bundled Altus Metrum sample', () => {
  const text = readFileSync(samplePath, 'utf8');
  const result = importFlight({ name: 'sample-altusmetrum.csv', text });

  it('auto-detects the Altus Metrum format', () => {
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
  });

  it('produces sane headline numbers and the full event set', () => {
    if (result.kind !== 'flight') return;
    const a = analyzeFlight(result.flight);

    // The generator's apogee is ~2445 m AGL; spikes must not inflate it.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(2350);
    expect(a.metrics.apogeeAltitude).toBeLessThan(2520);

    // Burnout velocity ~271 m/s; max velocity uses the device's accel_speed.
    expect(a.metrics.maxVelocity).toBeGreaterThan(230);
    expect(a.metrics.maxVelocity).toBeLessThan(310);
    expect(a.metrics.maxVelocitySource).toBe('device');

    // Dual deploy: a fast drogue then a slow main.
    expect(a.metrics.drogueDescentRate).not.toBeNull();
    expect(a.metrics.mainDescentRate).not.toBeNull();
    expect(a.metrics.mainDescentRate!).toBeLessThan(a.metrics.drogueDescentRate!);

    const types = a.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['liftoff', 'burnout', 'apogee', 'main', 'landing']));
  });

  it('reads a deployment shock at main from the accelerometer', () => {
    if (result.kind !== 'flight') return;
    const a = analyzeFlight(result.flight);
    const main = a.events.find((e) => e.type === 'main');
    // The logger recorded acceleration, so the main snatch is measured (~6.9 g here).
    expect(main?.peakAccel).toBeDefined();
    expect(main!.peakAccel! / 9.80665).toBeGreaterThan(2);
  });

  it('reads the battery voltage when the logger recorded it', () => {
    if (result.kind !== 'flight') return;
    const a = analyzeFlight(result.flight);
    expect(a.metrics.batteryStartV).not.toBeNull();
    expect(a.metrics.batteryMinV).not.toBeNull();
    // A sane rocketry-battery range, and the low never above the resting voltage.
    expect(a.metrics.batteryStartV!).toBeGreaterThan(2);
    expect(a.metrics.batteryMinV!).toBeLessThanOrEqual(a.metrics.batteryStartV!);
  });
});
