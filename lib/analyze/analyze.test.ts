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

  it('reads the largest-swing axis when a multi-axis logger gives several', () => {
    // A body-axis logger maps accel_x/y/z all to accelAxial. The first is a quiet
    // lateral axis (~0.1 g); the real thrust axis is another. The analysis must
    // read the active axis, not the first column, so max acceleration isn't ~0.
    const base = accelFlight(null);
    const real = base.channels.find((c) => c.kind === 'accelAxial')!.values;
    const lateral = new Float64Array(real.length).fill(0.1 * G0); // quiet off-axis
    // Put the quiet lateral axis first, the real one second.
    base.channels = [
      base.channels.find((c) => c.kind === 'altitude')!,
      { kind: 'accelAxial', label: 'accel_x', unit: 'm/s²', values: lateral },
      { kind: 'accelAxial', label: 'accel_z', unit: 'm/s²', values: real },
    ];
    const a = analyzeFlight(base);
    expect(a.metrics.accelerationSource).toBe('device');
    expect(a.metrics.maxAcceleration / G0).toBeGreaterThan(5); // the real peak, not ~0.1 g
  });

  it('reports the resultant magnitude across a multi-axis logger, not one axis', () => {
    // Two body axes that both see the boost: a thrust axis and a second at 0.75x
    // it (a canted mount). The honest peak is the resultant √(1²+0.75²)=1.25x the
    // thrust axis alone — a single axis would under-report it.
    const single = analyzeFlight(accelFlight(null));
    const two = accelFlight(null);
    const real = two.channels.find((c) => c.kind === 'accelAxial')!.values;
    const canted = Float64Array.from(real, (v) => v * 0.75);
    two.channels = [
      two.channels.find((c) => c.kind === 'altitude')!,
      { kind: 'accelAxial', label: 'accel_x', unit: 'm/s²', values: real },
      { kind: 'accelAxial', label: 'accel_y', unit: 'm/s²', values: canted },
    ];
    const a = analyzeFlight(two);
    expect(a.series.accelerationResultant).toBe(true);
    // Resultant peak ≈ 1.25x the single-axis peak, and the chart series is ≥ 0.
    expect(a.metrics.maxAcceleration / single.metrics.maxAcceleration).toBeCloseTo(1.25, 1);
    expect(Math.min(...a.series.acceleration)).toBeGreaterThanOrEqual(0);
  });

  it('normalizes a single-axis logger that reads boost as negative (aft-mounted axis)', () => {
    // Same flight, but the accelerometer is mounted pointing aft, so it logs the boost
    // as a large NEGATIVE specific force (as some hobby "Acc (g)" exports do). Max
    // acceleration must come out the same positive peak, not a small positive bump, and
    // the deceleration must read as the coast, not the (flipped) boost.
    const up = analyzeFlight(accelFlight(null));
    const flipped = accelFlight(null);
    const acc = flipped.channels.find((c) => c.kind === 'accelAxial')!.values;
    for (let i = 0; i < acc.length; i++) acc[i] = -acc[i];
    const a = analyzeFlight(flipped);
    expect(a.metrics.accelerationSource).toBe('device');
    // The boost peak is recovered with its magnitude and a positive sign.
    expect(a.metrics.maxAcceleration).toBeCloseTo(up.metrics.maxAcceleration, 5);
    // Deceleration stays a deceleration (≤ 0), not the boost re-signed.
    expect(a.metrics.maxDeceleration).toBeLessThanOrEqual(0);
  });

  it('does not cry saturation over a flat, near-zero (off-axis) channel', () => {
    // A multi-axis logger's lateral component: quiet through the whole flight,
    // so it sits flat near 0 g. That is not a railed sensor — clamping the flat
    // top to a ~0 g "peak" must not raise a false saturation warning.
    const flight = accelFlight(null);
    const acc = flight.channels.find((c) => c.kind === 'accelAxial')!.values;
    for (let i = 0; i < acc.length; i++) acc[i] = 0.05 * 9.80665; // ~0.05 g, dead flat
    const a = analyzeFlight(flight);
    expect(a.metrics.accelerationSource).toBe('device');
    expect(a.metrics.accelClipped).toBe(false);
    expect(a.warnings.some((w) => /saturat|full-scale|flat top/i.test(w))).toBe(false);
  });
});

describe('time-base gap warning', () => {
  it('does not warn on a uniformly sampled flight', () => {
    const { flight } = syntheticBaroFlight();
    expect(analyzeFlight(flight).warnings.some((w) => /time base has gaps/.test(w))).toBe(false);
  });

  it('warns when the clock jumps a large gap (a dropout)', () => {
    const { flight } = syntheticBaroFlight();
    // Push every timestamp past a point forward by 3 s, opening one dropout-sized
    // hole in the time base while keeping the samples aligned.
    const t = Float64Array.from(flight.time);
    const gi = Math.floor(t.length * 0.7);
    for (let i = gi; i < t.length; i++) t[i] += 3;
    const gapped: RawFlight = { ...flight, time: t };
    expect(analyzeFlight(gapped).warnings.some((w) => /time base has gaps.*3\.\d s/.test(w))).toBe(true);
  });
});

describe('ascent-gap peak suppression', () => {
  // Open one dropout-sized hole in the time base, either before or after apogee,
  // keeping every altitude sample so only the clock changes.
  function baroWithGap(where: 'ascent' | 'descent', seconds = 4): RawFlight {
    const { flight } = syntheticBaroFlight();
    const t = Float64Array.from(flight.time);
    const alt = flight.channels[0].values;
    let apIdx = 0;
    for (let i = 1; i < alt.length; i++) if (alt[i] > alt[apIdx]) apIdx = i;
    const gi = where === 'ascent' ? Math.max(1, Math.floor(apIdx * 0.5)) : apIdx + Math.floor((t.length - apIdx) * 0.3);
    for (let i = gi; i < t.length; i++) t[i] += seconds;
    return { ...flight, time: t };
  }

  it('withholds max velocity / Mach / max-Q when a gap breaks the sampled ascent', () => {
    const a = analyzeFlight(baroWithGap('ascent'));
    expect(a.metrics.maxVelocitySource).toBe('baro');
    // The derived peak spans the gap, so it is withheld rather than a spurious spike.
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.mach).toBeNull();
    expect(a.metrics.maxDynamicPressure).toBeNull();
    expect(a.metrics.transonicTime).toBeNull();
    expect(a.warnings.some((w) => /gap in the sampled ascent/.test(w))).toBe(true);
    // Apogee is read from the altitude peak directly, so it survives the gap.
    expect(Number.isFinite(a.metrics.apogeeAltitude)).toBe(true);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
  });

  it('leaves the ascent read intact when the gap falls in the descent', () => {
    const a = analyzeFlight(baroWithGap('descent'));
    // A descent gap can't touch the ascent peak, so max velocity stands.
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(true);
    expect(a.warnings.some((w) => /gap in the sampled ascent/.test(w))).toBe(false);
  });
});

describe('implausible velocity guard', () => {
  // A device velocity channel whose ascent peak is `peak` m/s (a triangle that peaks
  // mid-ascent, so max velocity reads `peak`).
  function withDeviceVelocity(peak: number): RawFlight {
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    let apIdx = 0;
    for (let i = 1; i < alt.length; i++) if (alt[i] > alt[apIdx]) apIdx = i;
    const at = Math.max(1, Math.floor(apIdx * 0.5)); // safely within the ascent
    const vel = new Float64Array(flight.time.length);
    for (let i = 0; i < vel.length; i++) vel[i] = peak * Math.max(0, 1 - Math.abs(i - at) / at);
    return { ...flight, channels: [...flight.channels, { kind: 'velocity', label: 'v', unit: 'm/s', values: vel }] };
  }

  it('withholds a velocity beyond any rocket, with the figures derived from it, and says why', () => {
    const a = analyzeFlight(withDeviceVelocity(50000)); // a raw sensor count read as a speed
    expect(a.metrics.maxVelocitySource).toBe('device');
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.mach).toBeNull();
    expect(a.metrics.maxDynamicPressure).toBeNull();
    expect(a.metrics.transonicTime).toBeNull();
    expect(a.warnings.some((w) => /implausibly fast/.test(w))).toBe(true);
    // Apogee, read from the altitude, is unaffected.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
    // The judgement rides on the series so the explorer/overlay withhold the derived
    // Mach and dynamic-pressure curves too.
    expect(a.series.velocityImplausible).toBe(true);
  });

  it('keeps a fast but physically-plausible flight (a ~Mach-5 space shot)', () => {
    const a = analyzeFlight(withDeviceVelocity(1800));
    expect(a.metrics.maxVelocity).toBeGreaterThan(1000);
    expect(a.warnings.some((w) => /implausibly fast/.test(w))).toBe(false);
  });

  it('also withholds the velocity-derived figures when burnout is pinned off the accelerometer', () => {
    // A real accelerometer finds burnout from its own sign change, so burnout velocity
    // and coast efficiency read the (garbage) velocity trace directly — they must be
    // withheld with the peak, not leaked as an impossible number.
    const base = accelFlight(null);
    const alt = base.channels.find((c) => c.kind === 'altitude')!.values;
    let apIdx = 0;
    for (let i = 1; i < alt.length; i++) if (alt[i] > alt[apIdx]) apIdx = i;
    const at = Math.max(1, Math.floor(apIdx * 0.5));
    const vel = new Float64Array(base.time.length);
    for (let i = 0; i < vel.length; i++) vel[i] = 50000 * Math.max(0, 1 - Math.abs(i - at) / at);
    base.channels = [...base.channels, { kind: 'velocity', label: 'v', unit: 'm/s', values: vel }];

    const a = analyzeFlight(base);
    expect(a.metrics.maxVelocitySource).toBe('device');
    // Burnout itself is still found (off the accelerometer)…
    expect(a.metrics.burnTime).not.toBeNull();
    // …but nothing read from the impossible velocity survives.
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.burnoutVelocity).toBeNull();
    expect(a.metrics.coastEfficiency).toBeNull();
    expect(a.metrics.dragLossAltitude).toBeNull();
    expect(a.warnings.some((w) => /implausibly fast/.test(w))).toBe(true);
    // Acceleration, measured independently, is untouched.
    expect(a.metrics.maxAcceleration).toBeGreaterThan(0);
  });
});

describe('derived-kinematics provenance warnings', () => {
  it('flags both when velocity and acceleration both come from altitude', () => {
    const { flight } = syntheticBaroFlight();
    const a = analyzeFlight(flight);
    expect(a.metrics.maxVelocitySource).toBe('baro');
    expect(a.metrics.accelerationSource).toBe('baro');
    expect(a.warnings.some((w) => /Velocity and acceleration were derived from altitude/.test(w))).toBe(true);
  });

  it('flags acceleration alone when the logger measured velocity but not acceleration', () => {
    // A Blue Raven low-rate logs velocity_up but no accelerometer, so acceleration is
    // baro-derived even though velocity is measured — it must still be flagged.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) vel[i] = (alt[i] - alt[i - 1]) / (flight.time[i] - flight.time[i - 1]);
    flight.channels.push({ kind: 'velocity', label: 'v', unit: 'm/s', values: vel });
    const a = analyzeFlight(flight);
    expect(a.metrics.maxVelocitySource).toBe('device');
    expect(a.metrics.accelerationSource).toBe('baro');
    expect(a.warnings.some((w) => /Acceleration was derived from altitude/.test(w))).toBe(true);
    expect(a.warnings.some((w) => /Velocity and acceleration were derived/.test(w))).toBe(false);
  });

  it('does not claim acceleration was derived on a GPS flight (it is omitted)', () => {
    const { flight } = syntheticBaroFlight();
    flight.meta = { altitudeSource: 'gps' };
    const a = analyzeFlight(flight);
    expect(a.series.altitudeSource).toBe('gps');
    expect(a.warnings.some((w) => /from GPS/.test(w))).toBe(true);
    expect(a.warnings.some((w) => /derived from altitude/.test(w))).toBe(false);
  });
});

describe('max deceleration honesty', () => {
  it('reports the coast deceleration as a negative value on a normal flight', () => {
    const a = analyzeFlight(accelFlight(null));
    // accelFlight coasts at −9.8 m/s² before apogee, so a real deceleration exists.
    expect(Number.isFinite(a.metrics.maxDeceleration)).toBe(true);
    expect(a.metrics.maxDeceleration).toBeLessThan(0);
  });

  it('reports no deceleration for a boost-only capture that ends under thrust', () => {
    // The log ends while still accelerating (peak altitude at the last sample), so
    // the axial trace never goes negative — there is no deceleration to report.
    const dt = 0.02;
    const n = 300;
    const time = new Float64Array(n);
    const alt = new Float64Array(n);
    const acc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      time[i] = t;
      if (t < 0.4) {
        acc[i] = 0; // quiet pad
        alt[i] = 0;
      } else {
        acc[i] = 120; // ~12 g, sustained thrust to the end of the capture
        alt[i] = 30 * (t - 0.4) * (t - 0.4); // a monotonic climb, peak at the last sample
      }
    }
    const flight: RawFlight = {
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
    const a = analyzeFlight(flight);
    // The ascent was analyzed (a peak acceleration is read)…
    expect(Number.isFinite(a.metrics.maxAcceleration)).toBe(true);
    // …but there is no negative axial reading, so no deceleration is claimed —
    // never a positive number dressed up as a "deceleration".
    expect(Number.isNaN(a.metrics.maxDeceleration)).toBe(true);
  });
});

describe('tilt at burnout', () => {
  it('reads the logger tilt at burnout when an attitude channel is present', () => {
    const f = accelFlight(null); // has a device axial channel → a real burnout
    const tilt = new Float64Array(f.time.length).fill(5); // 5° off vertical throughout
    f.channels.push({ kind: 'tilt', label: 'Tilt', unit: '°', values: tilt });
    const a = analyzeFlight(f);
    expect(a.events.some((e) => e.type === 'burnout')).toBe(true);
    expect(a.metrics.tiltAtBurnout).toBeCloseTo(5, 5);
  });

  it('is null without an attitude channel', () => {
    expect(analyzeFlight(accelFlight(null)).metrics.tiltAtBurnout).toBeNull();
  });
});

// A flight that climbs to a peak and back, carrying a constant roll-rate channel.
function rollFlight(rateDps: number): RawFlight {
  const dt = 0.1;
  const n = 51; // 0 … 5.0 s
  const time = new Float64Array(n);
  const alt = new Float64Array(n);
  const roll = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    time[i] = i * dt;
    alt[i] = i < 25 ? i * 4 : Math.max(0, 100 - (i - 25) * 4);
    roll[i] = rateDps;
  }
  return {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time,
    channels: [
      { kind: 'altitude', label: 'alt', unit: 'm', values: alt },
      { kind: 'rollRate', label: 'roll', unit: 'deg/s', values: roll },
    ],
    meta: {},
    notes: [],
  };
}

// A flight with a device velocity channel: it peaks at burnout (100 m/s) then
// coasts to a chosen apogee, so the coast-efficiency arithmetic has known inputs.
function coastFlight(): RawFlight {
  const dt = 0.05;
  const n = 220;
  const time = new Float64Array(n);
  const alt = new Float64Array(n);
  const vel = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    time[i] = i * dt;
    if (i <= 20) {
      vel[i] = (i / 20) * 100; // boost: → 100 m/s at burnout
      alt[i] = (i / 20) * 100; // → 100 m at burnout
    } else if (i <= 120) {
      const c = (i - 20) / 100;
      vel[i] = 100 * (1 - c); // coast: 100 → 0
      alt[i] = 100 + 300 * c * (2 - c); // → 400 m apogee
    } else {
      vel[i] = -15;
      alt[i] = Math.max(0, 400 - (i - 120) * 5);
    }
  }
  return {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time,
    channels: [
      { kind: 'altitude', label: 'alt', unit: 'm', values: alt },
      { kind: 'velocity', label: 'vel', unit: 'm/s', values: vel },
    ],
    meta: {},
    notes: [],
  };
}

describe('thrust-to-weight off the pad', () => {
  it('reads a thrust-to-weight from a clean accelerometer boost', () => {
    // accelFlight has a rounded (un-clipped) boost, so the liftoff window is a
    // trustworthy specific-force reading → a real T/W, between 1 and the peak g.
    const a = analyzeFlight(accelFlight(null));
    expect(a.metrics.liftoffTWR).not.toBeNull();
    expect(a.metrics.liftoffTWR!).toBeGreaterThan(2);
    expect(a.metrics.liftoffTWR!).toBeLessThan(a.metrics.maxAcceleration / G0);
  });

  it('omits it without a measured accelerometer', () => {
    expect(analyzeFlight(syntheticBaroFlight().flight).metrics.liftoffTWR).toBeNull();
  });
});

describe('burnout on a multi-axis logger', () => {
  it('uses the velocity peak, not a noisy body-axis crossing at ejection', () => {
    // A multi-axis logger whose primary body axis stays positive through the
    // coast and only dips negative at ejection near apogee — the signed
    // zero-crossing would place "burnout" at ejection. With the resultant in
    // play, burnout should track the velocity peak (~1 s) instead.
    const base = coastFlight();
    const n = base.time.length;
    const axA = new Float64Array(n);
    const axB = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      axA[i] = i <= 20 ? 40 : i >= 110 && i <= 116 ? -30 : 4; // boost, ejection dip, else small +
      axB[i] = i <= 20 ? 20 : 2;
    }
    base.channels = [
      ...base.channels,
      { kind: 'accelAxial', label: 'accel_x', unit: 'm/s²', values: axA },
      { kind: 'accelAxial', label: 'accel_y', unit: 'm/s²', values: axB },
    ];
    const a = analyzeFlight(base);
    expect(a.series.accelerationResultant).toBe(true);
    expect(a.metrics.burnTime).not.toBeNull();
    expect(a.metrics.burnTime!).toBeLessThan(2); // ~1 s (velocity peak), not ~5.5 s (ejection)
    expect(a.metrics.burnoutVelocity!).toBeGreaterThan(80); // near the 100 m/s peak, not ~0 at apogee
  });
});

describe('coast efficiency (drag loss)', () => {
  it('matches the kinematic definition from the flown numbers', () => {
    const a = analyzeFlight(coastFlight());
    const vacuumGain = (a.metrics.burnoutVelocity! * a.metrics.burnoutVelocity!) / (2 * G0);
    const actualGain = a.metrics.apogeeAltitude - a.metrics.burnoutAltitude!;
    expect(a.metrics.coastEfficiency).toBeCloseTo(Math.min(1, actualGain / vacuumGain), 2);
    expect(a.metrics.dragLossAltitude).toBeCloseTo(Math.max(0, vacuumGain - actualGain), 0);
    // This flight is draggy (apogee gain < vacuum coast), so it's under 100%.
    expect(a.metrics.coastEfficiency!).toBeGreaterThan(0.3);
    expect(a.metrics.coastEfficiency!).toBeLessThan(1);
  });

  it('omits it without a detected burnout', () => {
    // A descent-only / no-ascent log has no burnout to coast from.
    const flat = analyzeFlight({
      source: 's',
      format: 't',
      formatLabel: 'T',
      time: Float64Array.from([0, 1, 2, 3, 4]),
      channels: [{ kind: 'altitude', label: 'a', unit: 'm', values: Float64Array.from([100, 80, 60, 40, 20]) }],
      meta: {},
      notes: [],
    });
    expect(flat.metrics.coastEfficiency).toBeNull();
  });
});

describe('roll / spin', () => {
  it('reads peak roll rate and total revolutions from a roll-rate channel', () => {
    const a = analyzeFlight(rollFlight(720));
    expect(a.metrics.peakRollRate).toBeCloseTo(720, 0);
    // A constant 720 °/s over the 5.0 s flight is 3600° = 10 revolutions.
    expect(a.metrics.rollRevolutions).toBeCloseTo(10, 1);
  });

  it('omits the roll metrics when no roll-rate channel is present', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.metrics.peakRollRate).toBeNull();
    expect(a.metrics.rollRevolutions).toBeNull();
  });
});

describe('speed of sound varies with altitude (Mach against local air)', () => {
  it('falls with height on the lapse rate and caps at the tropopause', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    const sos = a.series.speedOfSoundProfile;
    const ground = a.series.speedOfSound;
    // Ground sample matches the scalar ground speed of sound.
    expect(sos[0]).toBeCloseTo(ground, 3);
    // The apogee sample sits higher and colder, so its speed of sound is lower.
    let apIdx = 0;
    for (let i = 1; i < a.series.altitude.length; i++) if (a.series.altitude[i] > a.series.altitude[apIdx]) apIdx = i;
    expect(sos[apIdx]).toBeLessThan(ground);

    // Physics check against √(γ·R·T), and the tropopause cap: no further drop above 11 km.
    const R = 287.05;
    const t0 = (ground * ground) / (1.4 * R);
    const sosAt = (h: number) => Math.sqrt(1.4 * R * (t0 - 0.0065 * Math.min(h, 11000)));
    expect(sosAt(11000)).toBeCloseTo(sosAt(20000), 6); // isothermal above the tropopause
    expect(sosAt(11000)).toBeLessThan(ground);
  });

  it('reads max Mach against the speed of sound at the peak-velocity altitude, not the ground', () => {
    // A device-velocity flight climbing to a real apogee: max velocity is reached aloft,
    // where the air is colder, so Mach is a touch higher than a ground-temperature divisor.
    const a = analyzeFlight(accelFlight(null));
    if (a.metrics.mach == null || !Number.isFinite(a.metrics.maxVelocity)) return;
    const groundMach = a.metrics.maxVelocity / a.series.speedOfSound;
    expect(a.metrics.mach).toBeGreaterThan(groundMach); // local (colder) air ⇒ higher Mach
    expect(a.metrics.mach / groundMach).toBeLessThan(1.1); // but only slightly, in the troposphere
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

  it('flags a barometric apogee above the troposphere as an approximate lower bound', () => {
    // A high-altitude baro flight — apogee ~15 km, above the 11 km tropopause where
    // the standard-atmosphere model behind a pressure altitude stops holding.
    const dt = 0.1;
    const n = 700;
    const time = new Float64Array(n);
    const alt = new Float64Array(n);
    const apIdx = 200;
    for (let i = 0; i < n; i++) {
      time[i] = i * dt;
      alt[i] = i <= apIdx ? (15000 * i) / apIdx : Math.max(0, 15000 - 40 * (i - apIdx));
    }
    const flight: RawFlight = {
      source: 'synthetic',
      format: 'test',
      formatLabel: 'Test',
      time,
      channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: alt }],
      meta: {},
      notes: [],
    };
    const a = analyzeFlight(flight);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(11000);
    expect(a.warnings.some((w) => /top of the troposphere/.test(w))).toBe(true);
  });

  it('does not flag a normal-altitude baro flight (apogee well below the tropopause)', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight); // apogee ~2 km
    expect(a.metrics.apogeeAltitude).toBeLessThan(11000);
    expect(a.warnings.some((w) => /troposphere/.test(w))).toBe(false);
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
