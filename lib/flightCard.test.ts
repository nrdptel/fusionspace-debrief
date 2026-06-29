import { describe, it, expect } from 'vitest';
import { flightCardStats } from './flightCard';
import type { FlightMetrics } from './analyze/types';

const base: FlightMetrics = {
  apogeeAltitude: 1000,
  timeToApogee: 8,
  maxVelocity: 200,
  maxVelocitySource: 'device',
  maxVelocityAltitude: 400,
  mach: 0.6,
  maxDynamicPressure: 50000,
  maxDynamicPressureAltitude: 300,
  transonicTime: null,
  transonicAltitude: null,
  maxAcceleration: 120,
  maxDeceleration: -20,
  accelerationSource: 'device',
  burnTime: 1.6,
  burnoutAltitude: 200,
  burnoutVelocity: 190,
  coastTime: 6,
  drogueDescentRate: 20,
  mainDescentRate: 6,
  descentTime: 40,
  flightTime: 48,
  groundTemperature: 15,
  batteryStartV: 9.2,
  batteryMinV: 8.9,
};

describe('flightCardStats', () => {
  it('leads with apogee and includes the available headline numbers', () => {
    const stats = flightCardStats(base, 'metric');
    expect(stats.map((s) => s.label)).toEqual(['Apogee', 'Max velocity', 'Max accel', 'Flight time']);
    expect(stats[0].value).toBe('1,000 m');
    // Mach rides along as a sub-line on max velocity when it's known.
    expect(stats[1].sub).toMatch(/Mach/);
  });

  it('drops acceleration when the log has none (e.g. a GPS-only flight)', () => {
    const gps: FlightMetrics = { ...base, maxAcceleration: NaN, mach: null };
    const labels = flightCardStats(gps, 'imperial').map((s) => s.label);
    expect(labels).toEqual(['Apogee', 'Max velocity', 'Flight time']);
    expect(flightCardStats(gps, 'imperial')[1].sub).toBeUndefined(); // no Mach sub when mach is null
  });

  it('drops flight time when the log ends at apogee', () => {
    const truncated: FlightMetrics = { ...base, flightTime: null };
    expect(flightCardStats(truncated, 'metric').some((s) => s.label === 'Flight time')).toBe(false);
  });
});
