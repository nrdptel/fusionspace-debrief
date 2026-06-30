import { describe, it, expect } from 'vitest';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';
import { G0 } from '../units';

// Build a clean vertical flight from first principles: 2 s on the pad, a constant
// boost, an unpowered coast to apogee, then a steady parachute descent. We know
// the right answers analytically, so the pipeline has to recover them.
function syntheticBaroFlight(opts?: { ejectionSpike?: boolean }): {
  flight: RawFlight;
  truth: { apogee: number; vBurnout: number; tToApogee: number };
} {
  const dt = 0.05;
  const padT = 2;
  const aBoost = 100; // m/s²
  const tBurn = 2; // s
  const vBurnout = aBoost * tBurn; // 200 m/s
  const altBurnout = 0.5 * aBoost * tBurn * tBurn; // 200 m
  const coastT = vBurnout / G0;
  const apogee = altBurnout + (vBurnout * vBurnout) / (2 * G0);
  const descentRate = 15;
  const descentT = apogee / descentRate;
  const restT = 5; // loggers keep recording at rest after touchdown
  const total = padT + tBurn + coastT + descentT + restT;

  const time: number[] = [];
  const alt: number[] = [];
  for (let t = 0; t <= total; t += dt) {
    time.push(t);
    const ft = t - padT; // time since liftoff
    let a: number;
    if (ft <= 0) {
      a = 0; // on the pad
    } else if (ft <= tBurn) {
      a = 0.5 * aBoost * ft * ft; // powered boost
    } else if (ft <= tBurn + coastT) {
      const ct = ft - tBurn; // unpowered coast to apogee
      a = altBurnout + vBurnout * ct - 0.5 * G0 * ct * ct;
    } else {
      const dtt = ft - tBurn - coastT; // steady parachute descent
      a = Math.max(0, apogee - descentRate * dtt);
    }
    alt.push(a);
  }

  if (opts?.ejectionSpike) {
    // One-sample +60 m spike at apogee, exactly the artefact a deployment pressure
    // pop produces in a baro trace.
    const apIdx = alt.indexOf(Math.max(...alt));
    alt[apIdx] += 60;
  }

  const flight: RawFlight = {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [
      { kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) },
    ],
    meta: {},
    notes: [],
  };
  return { flight, truth: { apogee, vBurnout, tToApogee: tBurn + coastT } };
}

// A flight that logs a device accelerometer with a triangular (rounded-peak)
// boost pulse, climbing to a clear apogee and descending. Pass `clipAt` to rail
// the trace at a full-scale limit, flat-topping the peak the way a saturated
// sensor does.
function accelFlight(clipAt: number | null): RawFlight {
  const dt = 0.02;
  const n = 600; // ~12 s at 50 Hz
  const time = new Float64Array(n);
  const alt = new Float64Array(n);
  const acc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time[i] = t;
    // Altitude: a clean concave climb to ~1000 m at t=4 s, then a steady descent.
    alt[i] = t < 4 ? 1000 * (t / 4) * (2 - t / 4) : Math.max(0, 1000 * (1 - (t - 4) / 6));
    // Acceleration (specific force, + up): quiet pad, a triangular boost pulse
    // peaking at 250 m/s² around t=1 s, then a mild negative coast to apogee.
    if (t < 0.5) acc[i] = 0;
    else if (t < 1.6) acc[i] = 250 * (1 - Math.abs((2 * (t - 0.5)) / 1.1 - 1));
    else if (t < 4) acc[i] = -9.8;
    else acc[i] = 0;
  }
  if (clipAt != null) for (let i = 0; i < n; i++) if (acc[i] > clipAt) acc[i] = clipAt;
  return {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time,
    channels: [
      { kind: 'altitude', label: 'alt', unit: 'm', values: alt },
      { kind: 'accelAxial', label: 'acc', unit: 'm/s2', values: acc },
    ],
    meta: {},
    notes: [],
  };
}

describe('accelerometer saturation', () => {
  it('flags a flat-topped (clipped) accelerometer peak as possibly saturated', () => {
    const a = analyzeFlight(accelFlight(160));
    expect(a.metrics.accelerationSource).toBe('device');
    expect(a.metrics.accelClipped).toBe(true);
    expect(a.warnings.some((w) => /saturat|full-scale|flat top/i.test(w))).toBe(true);
  });

  it('does not flag a normally rounded accelerometer peak', () => {
    const a = analyzeFlight(accelFlight(null));
    expect(a.metrics.accelerationSource).toBe('device');
    expect(a.metrics.accelClipped).toBe(false);
  });
});

describe('analyzeFlight (barometric)', () => {
  it('recovers apogee, max velocity and time-to-apogee', () => {
    const { flight, truth } = syntheticBaroFlight();
    const a = analyzeFlight(flight);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(truth.apogee * 0.97);
    expect(a.metrics.apogeeAltitude).toBeLessThan(truth.apogee * 1.03);
    expect(a.metrics.maxVelocity).toBeGreaterThan(truth.vBurnout * 0.9);
    expect(a.metrics.maxVelocity).toBeLessThan(truth.vBurnout * 1.1);
    expect(a.metrics.timeToApogee).toBeGreaterThan(truth.tToApogee * 0.95);
    expect(a.metrics.timeToApogee).toBeLessThan(truth.tToApogee * 1.05);
  });

  it('is not fooled by an ejection spike at apogee', () => {
    const clean = analyzeFlight(syntheticBaroFlight().flight);
    const spiked = analyzeFlight(syntheticBaroFlight({ ejectionSpike: true }).flight);
    // The 60 m spike must not inflate the reported apogee by more than a few metres.
    expect(Math.abs(spiked.metrics.apogeeAltitude - clean.metrics.apogeeAltitude)).toBeLessThan(10);
  });

  it('finds liftoff, apogee and landing events in order', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    const types = a.events.map((e) => e.type);
    expect(types).toContain('liftoff');
    expect(types).toContain('apogee');
    expect(types).toContain('landing');
    const t = (k: string) => a.events.find((e) => e.type === k)!.time;
    expect(t('liftoff')).toBeLessThan(t('apogee'));
    expect(t('apogee')).toBeLessThan(t('landing'));
  });

  it('reports an average boost acceleration below the peak', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    // Constant ~100 m/s² boost → the mean over the boost sits near it, and never
    // above the peak.
    expect(a.metrics.avgBoostAcceleration).not.toBeNull();
    expect(a.metrics.avgBoostAcceleration!).toBeGreaterThan(60);
    expect(a.metrics.avgBoostAcceleration!).toBeLessThanOrEqual(a.metrics.maxAcceleration);
  });

  it('reports a sensible descent rate', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.metrics.mainDescentRate).toBeGreaterThan(10);
    expect(a.metrics.mainDescentRate).toBeLessThan(20);
  });

  it('locates the design points: max-velocity & max-Q altitudes', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    // Peak speed is at burnout (~200 m up); max-Q is in the lower, faster air, so
    // both land in the boost band, well below apogee and above the pad.
    expect(a.metrics.maxVelocityAltitude).toBeGreaterThan(100);
    expect(a.metrics.maxVelocityAltitude).toBeLessThan(a.metrics.apogeeAltitude);
    expect(a.metrics.maxDynamicPressureAltitude).not.toBeNull();
    expect(a.metrics.maxDynamicPressureAltitude!).toBeGreaterThan(0);
  });

  it('flags a transonic crossing only when the flight actually goes supersonic', () => {
    // The default synthetic flight tops out near ~200 m/s (subsonic, < ~340 m/s).
    expect(analyzeFlight(syntheticBaroFlight().flight).metrics.transonicTime).toBeNull();
  });

  it('builds an atmosphere for the Mach & dynamic-pressure channels', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    // No temperature channel → a standard 15 °C day → ~340 m/s.
    expect(a.series.speedOfSound).toBeGreaterThan(335);
    expect(a.series.speedOfSound).toBeLessThan(345);
    // Density starts near the standard sea-level value and thins with altitude.
    expect(a.series.airDensity[0]).toBeGreaterThan(1.1);
    expect(a.series.airDensity[0]).toBeLessThan(1.3);
    const apIdx = a.series.altitude.indexOf(Math.max(...a.series.altitude));
    expect(a.series.airDensity[apIdx]).toBeLessThan(a.series.airDensity[0]);
  });
});
