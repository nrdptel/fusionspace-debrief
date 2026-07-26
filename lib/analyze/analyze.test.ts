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
    // Plus the inertial altitude a device like this writes. A logged velocity only counts
    // as measured where the file shows the device had a non-barometric sensor at all — a
    // pressure sensor alone can't measure a speed, however the firmware filters it.
    return {
      ...flight,
      channels: [
        ...flight.channels,
        { kind: 'velocity', label: 'v', unit: 'm/s', values: vel },
        { kind: 'altitudeInertial', label: 'Inertial_Altitude', unit: 'm', values: alt.slice() },
      ],
    };
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

  it('withholds the velocity when the trace swings negative on the way up', () => {
    // What a barometer records on an airframe that is tumbling or venting — a spent
    // booster after separation: the pressure at the port stops tracking altitude, so the
    // derived velocity swings hard both ways. A climbing, accelerating rocket has no
    // negative vertical velocity, so the peak beside those dips isn't a reading either.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    // Two-sample-wide excursions, as the real trace shows (447 → 230 → 241 → 579 ft):
    // a single-sample wobble is what the median filter is there to remove.
    const boostFrom = Math.round(2 / 0.05);
    for (let i = boostFrom; i < boostFrom + 40; i++) alt[i] += (Math.floor(i / 2) % 2 ? 30 : -30);

    const a = analyzeFlight(flight);
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.mach).toBeNull();
    expect(a.metrics.maxDynamicPressure).toBeNull();
    expect(a.metrics.burnoutVelocity).toBeNull();
    expect(a.metrics.coastEfficiency).toBeNull();
    expect(a.warnings.some((w) => /swings well below zero/.test(w))).toBe(true);
    // Says what it is, not that the column is misidentified — a different fault.
    expect(a.warnings.some((w) => /implausibly fast/.test(w))).toBe(false);
    // The judgement rides on the series, so the explorer withholds the derived curves.
    expect(a.series.velocityImplausible).toBe(true);
    // Apogee, timings and the descent still read off the altitude.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
    expect(a.metrics.wholeDescentRate).toBeGreaterThan(0);
  });

  it('leaves a clean ascent alone (no negative dip to find)', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.metrics.maxVelocity).toBeGreaterThan(0);
    expect(a.warnings.some((w) => /swings well below zero/.test(w))).toBe(false);
  });

  it('keeps a fast but physically-plausible flight (a ~Mach-5 space shot)', () => {
    const a = analyzeFlight(withDeviceVelocity(1800));
    expect(a.metrics.maxVelocity).toBeGreaterThan(1000);
    expect(a.warnings.some((w) => /implausibly fast/.test(w))).toBe(false);
  });

  // A log carrying BOTH a barometric altitude and an accelerometer, where the two
  // disagree about how fast the rocket went. `boostAccel` is what the accelerometer
  // measured (specific force, m/s², for `tBurn` seconds from liftoff); `baroClimb` is how
  // high the barometric trace claims the rocket got by burnout. Raising `baroClimb` alone
  // steepens the baro trace — and so the speed derived from it — while leaving apogee and
  // the accelerometer where they were: exactly the shape of a pressure port under shock.
  function withBaroAndAccel(boostAccel: number, baroClimb: number): RawFlight {
    const dt = 0.05;
    const padT = 1;
    const tBurn = 2;
    const coastT = 4;
    // A trace that is internally consistent: the climb the barometer shows over the boost
    // sets the speed at burnout (2·h/t for a constant-acceleration climb), and the coast
    // decelerates linearly from it to zero at apogee. So a steeper boost carries a higher
    // apogee with it, and nothing in the altitude record contradicts itself.
    const vBurnout = (2 * baroClimb) / tBurn;
    const apogee = baroClimb + (vBurnout * coastT) / 2;
    const descentRate = 15;
    const n = Math.round((padT + tBurn + coastT + apogee / descentRate + 3) / dt);
    const time = new Float64Array(n);
    const alt = new Float64Array(n);
    const acc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      time[i] = t;
      const ft = t - padT; // since liftoff
      if (ft <= 0) {
        alt[i] = 0;
        acc[i] = 0;
      } else if (ft <= tBurn) {
        alt[i] = baroClimb * (ft / tBurn) ** 2;
        // Thrust tapering through the burn, averaging `boostAccel` — a real boost never
        // holds a dead-flat peak, and a synthetic one that did would trip the saturation
        // guard instead of this one.
        acc[i] = boostAccel * (1.25 - (0.5 * ft) / tBurn);
      } else if (ft <= tBurn + coastT) {
        const c = ft - tBurn; // coast: v falls linearly from vBurnout to 0 at apogee
        alt[i] = baroClimb + vBurnout * c - (vBurnout / (2 * coastT)) * c * c;
        acc[i] = -G0;
      } else {
        alt[i] = Math.max(0, apogee - descentRate * (ft - tBurn - coastT));
        acc[i] = 0;
      }
    }
    return {
      source: 'synthetic',
      format: 'test',
      formatLabel: 'Test',
      time,
      channels: [
        { kind: 'altitude', label: 'alt', unit: 'm', values: alt },
        { kind: 'accelAxial', label: 'acc', unit: 'm/s²', values: acc },
      ],
      meta: {},
      notes: [],
    };
  }

  it('withholds a barometric speed the flight’s own accelerometer cannot account for', () => {
    // 100 m/s² measured for 2 s caps the climb at ∫(a−g)dt ≈ 180 m/s even with every g
    // pointing straight up and no drag — but the baro trace climbs 600 m in that time, so
    // the speed derived from it peaks near 600 m/s. Two channels of one flight, and only
    // one of them can be right.
    const a = analyzeFlight(withBaroAndAccel(100, 600));
    expect(a.metrics.maxVelocitySource).toBe('baro');
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.mach).toBeNull();
    expect(a.metrics.maxDynamicPressure).toBeNull();
    expect(a.metrics.burnoutVelocity).toBeNull();
    expect(a.series.velocityImplausible).toBe(true);
    // Names the contradiction and the bracket the record does support — not the wrong
    // fault (a misidentified column) and not a bare refusal.
    const w = a.warnings.find((x) => /own accelerometer allows/.test(x));
    expect(w).toBeDefined();
    expect(w).toMatch(/about \d\.\d× faster/);
    expect(w).toMatch(/cannot have passed about Mach 0\.5/);
    expect(a.warnings.some((x) => /implausibly fast/.test(x))).toBe(false);
    // Apogee and the descent are read off the altitude and are untouched.
    expect(a.metrics.apogeeAltitude).toBeCloseTo(1800, 0);
    expect(a.metrics.wholeDescentRate).toBeGreaterThan(0);
  });

  it('leaves a barometric speed the accelerometer supports alone', () => {
    // The same 100 m/s² boost, with a baro trace that agrees with it: 180 m of climb by
    // burnout, so the derived peak sits just under the ceiling.
    const a = analyzeFlight(withBaroAndAccel(100, 180));
    expect(a.metrics.maxVelocity).toBeGreaterThan(0);
    expect(a.metrics.mach).not.toBeNull();
    expect(a.warnings.some((x) => /own accelerometer allows/.test(x))).toBe(false);
  });

  it('says nothing when the accelerometer channel can’t account for the flight either', () => {
    // A channel Debrief is reading on the wrong convention or far too coarsely: 12 m/s²
    // through the boost caps the climb at ~4 m/s, which cannot have produced the 360 m
    // unpowered coast this record also holds. That's a broken bound, not a broken
    // barometer — the guard has to stay quiet rather than accuse the wrong channel.
    const a = analyzeFlight(withBaroAndAccel(12, 180));
    expect(a.metrics.maxVelocity).toBeGreaterThan(0);
    expect(a.warnings.some((x) => /own accelerometer allows/.test(x))).toBe(false);
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

describe('a file holding more than one flight', () => {
  /** Two flights end to end in one record, as a logger downloaded twice produces. */
  function twoFlights(): RawFlight {
    const a = syntheticBaroFlight().flight;
    const n = a.time.length;
    const dt = a.time[1] - a.time[0];
    const time = new Float64Array(n * 2);
    const alt = new Float64Array(n * 2);
    const src = a.channels[0].values;
    for (let i = 0; i < n; i++) {
      time[i] = a.time[i];
      alt[i] = src[i];
      time[n + i] = a.time[n - 1] + dt * (i + 1);
      alt[n + i] = src[i];
    }
    return { ...a, time, channels: [{ ...a.channels[0], values: alt }] };
  }

  it('analyzes the first copy and names it as a copy, not a second flight', () => {
    const one = analyzeFlight(syntheticBaroFlight().flight);
    const a = analyzeFlight(twoFlights());
    // The same numbers as the single flight — not a timeline spanning both.
    expect(a.metrics.apogeeAltitude).toBeCloseTo(one.metrics.apogeeAltitude, 5);
    expect(a.metrics.timeToApogee).toBeCloseTo(one.metrics.timeToApogee, 5);
    // This synthetic writes the SAME flight twice, which is what both corpus Blue Ravens
    // do — so "read the others by splitting the file" would hand the flyer the same flight
    // again, and "this file holds more than one flight" is simply false about it.
    expect(a.warnings.some((w) => /holds the same flight written twice/.test(w))).toBe(true);
    expect(a.warnings.some((w) => /holds more than one flight/.test(w))).toBe(false);
    // The warning names how much of the file was read, so the flyer can check it.
    expect(a.warnings.find((w) => /written twice/.test(w))).toMatch(/opening \d/);
  });

  /** The same two copies, but the second climbs to a different height. */
  function twoDifferentFlights(secondScale: number): RawFlight {
    const f = twoFlights();
    const alt = f.channels[0].values;
    const half = alt.length / 2;
    for (let i = half; i < alt.length; i++) alt[i] *= secondScale;
    return f;
  }

  it('tells one flight written twice from two different flights, by the apogee', () => {
    // Measured over every multi-segment corpus file, against the file's own pad baseline:
    // the two genuine "written twice" Blue Ravens agree to 0.21% and 0.00%, while the
    // Eggtimer file whose second segment is a documented baro artefact disagrees by 92%.
    // The bound is 1% — five times the widest genuine agreement, ninety times inside the
    // pair that must be refused.
    const twice = analyzeFlight(twoDifferentFlights(1.005)); // half a percent taller
    expect(twice.warnings.some((w) => /written twice/.test(w))).toBe(true);

    const apart = analyzeFlight(twoDifferentFlights(1.6)); // a different, higher flight
    expect(apart.warnings.some((w) => /written twice/.test(w))).toBe(false);
    expect(apart.warnings.some((w) => /holds more than one flight/.test(w))).toBe(true);
  });

  it('will not call a file a double copy when it has no pad window to measure against', () => {
    // The comparison only means anything on ONE datum, and the file's datum comes from its
    // quiet pre-launch window. Without one there is nothing to share — which is the corpus
    // Eggtimer's first disqualification, before its peaks are even compared. Refusing falls
    // back to the older, weaker sentence, which is never a wrong number.
    const f = twoFlights();
    const alt = f.channels[0].values;
    // Start the record already well into the climb: no quiet stretch at the front. The two
    // copies still hold identical altitudes, so the peaks agree exactly — the missing datum
    // is the only thing refusing this, which is what the test is for.
    const cut = Math.round(2.5 / (f.time[1] - f.time[0]));
    const time = f.time.slice(cut);
    const t0 = time[0];
    for (let i = 0; i < time.length; i++) time[i] -= t0;
    const a = analyzeFlight({ ...f, time, channels: [{ ...f.channels[0], values: alt.slice(cut) }] });
    expect(a.warnings.some((w) => /written twice/.test(w))).toBe(false);
    expect(a.warnings.some((w) => /holds more than one flight/.test(w))).toBe(true);
  });

  it('leaves a single flight alone', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.warnings.some((w) => /holds more than one flight/.test(w))).toBe(false);
  });

  /** A launch day: three flights in one download, the middle one the highest. */
  function launchDay(apogees: number[]): RawFlight {
    const time: number[] = [];
    const alt: number[] = [];
    let t = 0;
    for (const apogee of apogees) {
      for (let i = 0; i < 20; i++) {
        time.push(t);
        alt.push(0);
        t += 0.1;
      }
      for (let i = 0; i <= 60; i++) {
        time.push(t);
        alt.push(apogee * Math.sin((Math.PI / 2) * (i / 60)));
        t += 0.1;
      }
      for (let i = 1; i <= 120; i++) {
        time.push(t);
        alt.push(Math.max(0, apogee * (1 - i / 120)));
        t += 0.1;
      }
      for (let i = 0; i < 20; i++) {
        time.push(t);
        alt.push(0);
        t += 0.1;
      }
    }
    const { flight } = syntheticBaroFlight();
    return {
      ...flight,
      time: Float64Array.from(time),
      channels: [{ ...flight.channels[0], values: Float64Array.from(alt) }],
    };
  }

  it('reads the first flight all the way to the ground', () => {
    // The boundary between two flights used to be taken where the record first crossed a
    // "back on the deck" band — but that band is a fraction of the file's own HIGHEST
    // flight, so on a lower one it sits well up the descent. The first flight was cut
    // before it landed, and the next segment would begin 20 m in the air, taking its pad
    // baseline from a rocket still coming down. The cut is the trough between them now.
    const a = analyzeFlight(launchDay([300, 500, 250]));
    const alt = a.series.altitude;
    expect(a.warnings.some((w) => /holds more than one flight/.test(w))).toBe(true);
    // The segment ends on the ground, not part-way down.
    expect(Math.abs(alt[alt.length - 1])).toBeLessThan(3);
    // …and it is the first flight, not a timeline spanning two of them.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(250);
    expect(a.metrics.apogeeAltitude).toBeLessThan(320);
  });

  it('does not split on a dropout that reads zero before the rocket ever climbed', () => {
    // A GPS that loses lock through the boost reads ~0 until it reacquires — that is not
    // a landing, and it happens before any climb, so the file is one flight.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const from = Math.round(2 / 0.05);
    for (let i = from; i < from + 20; i++) alt[i] = 0;
    const a = analyzeFlight(flight);
    expect(a.warnings.some((w) => /holds more than one flight/.test(w))).toBe(false);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
  });
});

describe('an ascent altitude the record contradicts', () => {
  /** The transonic artefact: a barometric port reads the rocket *descending* through the
   *  Mach-1 push, so the trace drops below the pad and below heights it already passed —
   *  exactly where burnout, the speed peak and max-Q are read. */
  function transonicDip(): RawFlight {
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    // An inertial velocity channel, as the Blue Raven has: the speed is measured, so the
    // bad barometer costs only the altitude it happened at.
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) vel[i] = (alt[i] - alt[i - 1]) / (flight.time[i] - flight.time[i - 1]);
    for (let i = 0; i < alt.length; i++) vel[i] *= 1 + 0.03 * Math.sin(i);
    // The dip straddles burnout, where the speed peaks — as the real artefact does.
    const from = Math.round(3.4 / 0.05);
    for (let i = from; i < from + 24; i++) alt[i] -= 260;
    flight.channels.push({ kind: 'velocity', label: 'v', unit: 'm/s', values: vel });
    return flight;
  }

  it('withholds the altitude rather than reporting one the trace contradicts', () => {
    const a = analyzeFlight(transonicDip());
    // Apogee, read from the peak, is unaffected — the dip is far below it.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
    // The readings that land in the dip report no altitude…
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(false);
    // …and say why.
    expect(a.warnings.some((w) => /contradicts itself on the way up/.test(w))).toBe(true);
    // The speed itself is still reported — only the altitude it happened at is unknown.
    expect(a.metrics.maxVelocity).toBeGreaterThan(0);
  });

  it('reads it from the logger\'s inertial recording when the file has one', () => {
    // A Blue Raven solves an inertial altitude beside the barometric one. It doesn't use
    // the static port, so it is unaffected by the shock that ruins the baro — and the
    // drift that keeps the analysis on the baro is a whole-flight effect, negligible here.
    const flight = transonicDip();
    const truth = syntheticBaroFlight().flight.channels[0].values; // the undipped profile
    flight.channels.push({ kind: 'altitudeInertial', label: 'Inertial_Altitude', unit: 'm', values: truth });

    const a = analyzeFlight(flight);
    // The figure comes back, and it is the inertial one, not the distorted baro sample.
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(true);
    expect(a.metrics.maxVelocityAltitude).toBeGreaterThan(0);
    expect(a.warnings.some((w) => /inertial solution instead/.test(w))).toBe(true);
    expect(a.warnings.some((w) => /is withheld/.test(w))).toBe(false);
  });

  it('still withholds when the second recording disagrees with the first', () => {
    // An inertial channel that reads *below* what the barometer had already established
    // is no better than the dip — it can't settle the altitude either.
    const flight = transonicDip();
    const zeros = new Float64Array(flight.time.length);
    flight.channels.push({ kind: 'altitudeInertial', label: 'Inertial_Altitude', unit: 'm', values: zeros });
    const a = analyzeFlight(flight);
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(false);
    expect(a.warnings.some((w) => /is withheld/.test(w))).toBe(true);
  });

  it('leaves a sound trace alone', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(true);
    expect(a.metrics.maxVelocityAltitude).toBeGreaterThan(0);
    expect(a.warnings.some((w) => /contradicts itself on the way up/.test(w))).toBe(false);
  });

  /** The same artefact the other way round: the shock drives the sensed pressure DOWN, so
   *  the trace climbs faster than the rocket did. The running maximum can't see this — the
   *  altitude never goes backwards — but the flight's own measured speed can: over any
   *  stretch the mean climb rate cannot exceed the fastest the rocket was going in it. */
  function transonicOverRead(): RawFlight {
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const t = flight.time;
    // The speed is measured, and taken from the sound profile BEFORE the trace is
    // distorted — that is what makes it an independent record rather than the same
    // reading twice. A little wobble so it isn't recognisable as this trace differenced.
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++)
      vel[i] = Math.max(0, ((alt[i] - alt[i - 1]) / (t[i] - t[i - 1])) * (1 + 0.03 * Math.sin(i)));
    // The accelerometer that makes the speed a measurement, consistent with it by
    // construction (a = dv/dt + g), so no other guard has anything to say about it.
    const acc = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) acc[i] = (vel[i] - vel[i - 1]) / (t[i] - t[i - 1]) + 9.80665;
    // A step the port invents through the push, and then holds: 400 m in a third of a
    // second, which nothing in this flight's speed record can account for. Placed on the
    // speed peak, where the real artefact strikes and where the read-offs are.
    let peak = 1;
    for (let i = 1; i < vel.length; i++) if (vel[i] > vel[peak]) peak = i;
    const from = Math.max(1, peak - 6);
    for (let i = from; i < alt.length; i++) alt[i] += Math.min(400, (i - from) * 66.7);
    flight.channels.push({ kind: 'velocity', label: 'v', unit: 'm/s', values: vel });
    flight.channels.push({ kind: 'accelTotal', label: 'a', unit: 'm/s²', values: acc });
    return flight;
  }

  it('withholds an altitude the flight’s own speed record cannot account for', () => {
    const a = analyzeFlight(transonicOverRead());
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(false);
    expect(a.warnings.some((w) => /contradicts itself on the way up/.test(w))).toBe(true);
    // The warning names what actually happened — not the opposite fault.
    expect(a.warnings.some((w) => /measured top speed over that stretch can account for/.test(w))).toBe(
      true,
    );
    // The speed and the apogee are unaffected: only the altitude at that instant is unknown.
    expect(a.metrics.maxVelocity).toBeGreaterThan(0);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
  });

  it('takes the inertial recording when it satisfies the bound the barometer failed', () => {
    const flight = transonicOverRead();
    const truth = syntheticBaroFlight().flight.channels[0].values; // the undistorted profile
    flight.channels.push({ kind: 'altitudeInertial', label: 'Inertial_Altitude', unit: 'm', values: truth });
    const a = analyzeFlight(flight);
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(true);
    expect(a.warnings.some((w) => /inertial solution instead/.test(w))).toBe(true);
  });

  it('rejects an inertial recording that breaks the same bound', () => {
    // A second recording is only worth having if it satisfies what the first one failed;
    // one that is just as impossible settles nothing.
    const flight = transonicOverRead();
    const alt = flight.channels[0].values;
    flight.channels.push({
      kind: 'altitudeInertial',
      label: 'Inertial_Altitude',
      unit: 'm',
      values: Float64Array.from(alt, (h) => h + 50),
    });
    const a = analyzeFlight(flight);
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(false);
    expect(a.warnings.some((w) => /is withheld/.test(w))).toBe(true);
  });

  it('never applies the speed cap to a baro-derived velocity', () => {
    // With no speed sensor the "velocity" is this very altitude trace differenced, so the
    // cap would be testing the trace against itself — it must not fire at all.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const from = Math.round(3.4 / 0.05);
    for (let i = from; i < alt.length; i++) alt[i] += Math.min(400, (i - from) * 60 * 0.05);
    const a = analyzeFlight(flight);
    expect(a.series.velocitySource).toBe('baro');
    expect(a.warnings.some((w) => /can account for/.test(w))).toBe(false);
  });

  it('does not withhold over ordinary barometric wander', () => {
    // A few metres of jitter on the way up is a barometer being a barometer.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    for (let i = 0; i < alt.length; i++) alt[i] += (i % 3) - 1;
    const a = analyzeFlight(flight);
    expect(Number.isFinite(a.metrics.maxVelocityAltitude)).toBe(true);
    expect(a.warnings.some((w) => /contradicts itself on the way up/.test(w))).toBe(false);
  });
});

describe('a log that stops at apogee', () => {
  it('reports no descent rate rather than averaging noise at the peak', () => {
    // A truncated download (or the first flight of a file holding two) can end within a
    // sample or two of apogee. Averaging that wobble yields a "descent" of a few ft/s —
    // sometimes a negative one, which is not a descent at all.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    let apIdx = 0;
    for (let i = 1; i < alt.length; i++) if (alt[i] > alt[apIdx]) apIdx = i;
    const cut = apIdx + 3;
    const trimmed: RawFlight = {
      ...flight,
      time: flight.time.slice(0, cut),
      channels: flight.channels.map((c) => ({ ...c, values: c.values.slice(0, cut) })),
    };
    const a = analyzeFlight(trimmed);
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
    expect(a.metrics.mainDescentRate).toBeNull();
    expect(a.metrics.wholeDescentRate).toBeNull();
    expect(a.metrics.drogueDescentRate).toBeNull();
  });

  it('still reads the descent on a log that has one', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.metrics.wholeDescentRate).toBeGreaterThan(0);
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
    // A Blue Raven low-rate logs its inertial velocity_up but no accelerometer, so
    // acceleration is baro-derived even though velocity is measured — it must still be
    // flagged. The velocity channel is taken from the true profile and the altitude is
    // then rounded to the whole metres a real baro logs, so the channel is a genuine
    // second reading rather than that altitude differenced (see the next test).
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) vel[i] = (alt[i] - alt[i - 1]) / (flight.time[i] - flight.time[i - 1]);
    const inertial = Float64Array.from(alt);
    for (let i = 0; i < alt.length; i++) alt[i] = Math.round(alt[i]);
    flight.channels.push({ kind: 'velocity', label: 'v', unit: 'm/s', values: vel });
    // The inertial altitude such a file also carries — the evidence that this device has a
    // sensor other than its barometer, without which a logged velocity isn't a measurement.
    flight.channels.push({ kind: 'altitudeInertial', label: 'Inertial_Altitude', unit: 'm', values: inertial });
    const a = analyzeFlight(flight);
    expect(a.metrics.maxVelocitySource).toBe('device');
    expect(a.metrics.accelerationSource).toBe('baro');
    expect(a.warnings.some((w) => /Acceleration was derived from altitude/.test(w))).toBe(true);
    expect(a.warnings.some((w) => /Velocity and acceleration were derived/.test(w))).toBe(false);
  });

  it('treats a velocity column that is the file’s own altitude difference as derived', () => {
    // What a baro-only logger writes into a "velocity" column: its altitude, quantized
    // to whole metres, differenced sample to sample. That is not a second reading — it
    // carries the barometer's quantization as speed, and its peak is that noise. A real
    // Eggtimer export of a Mach 1.3 flight states 4880 ft/s this way.
    const { flight, truth } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    for (let i = 0; i < alt.length; i++) alt[i] = Math.round(alt[i]);
    // One coarse baro step mid-boost — the artefact that makes such a column's peak
    // meaningless: a real Eggtimer trace jumps ~200 ft between two 20 Hz samples.
    alt[Math.round((2 + 1.5) / 0.05)] += 8;
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) vel[i] = (alt[i] - alt[i - 1]) / (flight.time[i] - flight.time[i - 1]);
    let rawPeak = 0;
    for (const v of vel) if (v > rawPeak) rawPeak = v;
    flight.channels.push({ kind: 'velocity', label: 'v', unit: 'm/s', values: vel });

    const a = analyzeFlight(flight);
    // Read as derived, not as the logger's measurement, so every baro-velocity caveat
    // downstream applies — and the noise-inflated raw peak is not the headline.
    expect(a.metrics.maxVelocitySource).toBe('baro');
    expect(rawPeak).toBeGreaterThan(truth.vBurnout * 1.02);
    expect(a.metrics.maxVelocity).toBeLessThan(rawPeak);
    expect(a.metrics.maxVelocity).toBeGreaterThan(truth.vBurnout * 0.9);
    expect(a.warnings.some((w) => /logger wrote a velocity column/.test(w))).toBe(true);
    // …and it doesn't also claim the logger never recorded one.
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

  it('reports an average boost acceleration below the measured peak', () => {
    const a = analyzeFlight(accelFlight(null));
    expect(a.metrics.avgBoostAcceleration).not.toBeNull();
    expect(a.metrics.avgBoostAcceleration!).toBeGreaterThan(0);
    expect(a.metrics.avgBoostAcceleration!).toBeLessThanOrEqual(a.metrics.maxAcceleration);
  });

  it('omits it without a measured accelerometer', () => {
    expect(analyzeFlight(syntheticBaroFlight().flight).metrics.liftoffTWR).toBeNull();
  });

  it('is the same number whether or not the channel has gravity removed', () => {
    // The bug this pins: loggers disagree about what an accelerometer channel means.
    // A true specific-force channel reads +1 g at rest; AltusMetrum's `acceleration`
    // has that 1 g already taken out and rests at ~0. Read as if it were specific
    // force, a gravity-removed channel yields exactly T/W − 1 — a full point low on
    // the figure Debrief quotes against the 5:1 rail-departure rule.
    //
    // Same motion, two conventions: shifting the whole trace by g is precisely the
    // difference between them, and T/W cannot depend on which one the logger wrote.
    //
    // The boost is a STEP rather than a ramp so that both traces cross the liftoff
    // threshold on the same sample. That threshold is itself convention-blind — a
    // fixed `acceleration > 2 g`, which on a gravity-removed channel is really 3 g of
    // specific force — so on a ramp the two would be timed differently and this test
    // would be measuring that instead. See BACKLOG; it is the same bug one layer up.
    const build = (rest: number): RawFlight => {
      const dt = 0.05;
      const n = 600; // 30 s
      const time = new Float64Array(n);
      const alt = new Float64Array(n);
      const acc = new Float64Array(n);
      // Net upward acceleration during the burn, tapering so the trace is not a flat
      // top — a perfectly constant boost reads as a saturated sensor and is withheld.
      const A0 = 110;
      const k = 20;
      const tOff = 1;
      const tBurn = 2.2;
      const burn = tBurn - tOff;
      const vBurn = A0 * burn - (k * burn * burn) / 2;
      const hBurn = (A0 * burn * burn) / 2 - (k * burn ** 3) / 6;
      const tApogee = tBurn + vBurn / G0;
      const hApogee = hBurn + (vBurn * vBurn) / (2 * G0);
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        time[i] = t;
        if (t < tOff) {
          alt[i] = 0;
          acc[i] = rest;
        } else if (t < tBurn) {
          const u = t - tOff;
          alt[i] = (A0 * u * u) / 2 - (k * u ** 3) / 6;
          acc[i] = rest + A0 - k * u;
        } else if (t < tApogee) {
          const u = t - tBurn;
          alt[i] = hBurn + vBurn * u - 0.5 * G0 * u * u;
          acc[i] = rest - G0;
        } else {
          alt[i] = Math.max(0, hApogee - 20 * (t - tApogee));
          acc[i] = rest;
        }
      }
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
    };

    const twrKinematic = analyzeFlight(build(0)).metrics.liftoffTWR; // rests at 0
    const twrSpecific = analyzeFlight(build(G0)).metrics.liftoffTWR; // rests at +1 g
    expect(twrKinematic).not.toBeNull();
    expect(twrSpecific).not.toBeNull();
    expect(twrKinematic!).toBeCloseTo(twrSpecific!, 6);

    // Net thrust over the 0.2 s window averages ~108.5 m/s²; on top of supporting its
    // own weight that is (108.5/g)+1 ≈ 12.1:1 — the real ratio, not the ratio minus one.
    expect(twrSpecific!).toBeGreaterThan(11.5);
    expect(twrSpecific!).toBeLessThan(12.6);
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

  it('is not fooled by a deployment transient that lands after the descent began', () => {
    // The wide version of the ejection artefact: a charge vents the airframe and a fast
    // logger records a burst of swings rather than a one- or two-sample spike, so the
    // median filter can't remove it and the highest sample lands well after apogee. A
    // corpus Blue Raven log reads 12,060 ft nearly 4 s after its own velocity went
    // negative, where three sibling recordings of the same flight agree it had peaked.
    const { flight, truth } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const t = flight.time;
    let apIdx = 0;
    for (let i = 1; i < alt.length; i++) if (alt[i] > alt[apIdx]) apIdx = i;
    // 0.6 s of ±150 m swings, 4 s into the descent — bigger than the peak, in pairs of
    // samples so a median filter keeps them.
    const from = apIdx + Math.round(4 / 0.05);
    for (let i = from; i < from + 12; i++) alt[i] += Math.floor((i - from) / 2) % 2 ? 150 : -60;

    const a = analyzeFlight(flight);
    // The apogee is where the climb ended, not on the transient.
    expect(a.metrics.apogeeAltitude).toBeCloseTo(truth.apogee, -1);
    expect(a.metrics.timeToApogee).toBeCloseTo(truth.tToApogee, 0);
    const apo = a.events.find((e) => e.type === 'apogee')!;
    expect(apo.time).toBeLessThan(t[from]);
    // The transient is still in the record — nothing is edited away, it just isn't apogee.
    expect(Math.max(...a.series.altitudeRaw)).toBeGreaterThan(a.metrics.apogeeAltitude);
  });

  it('leaves a peak that is genuinely the last of the climb alone', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    const { truth } = syntheticBaroFlight();
    expect(a.metrics.apogeeAltitude).toBeCloseTo(truth.apogee, -1);
    expect(a.metrics.timeToApogee).toBeCloseTo(truth.tToApogee, 0);
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

  it('withholds acceleration peaks on a baro-only flight — a barometer can’t resolve them', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.series.accelerationSource).toBe('baro');
    // The second derivative of a coarse, quantised baro altitude is dominated by
    // differentiation noise (real baro flights spike to hundreds of g), so the peak,
    // the deceleration and the boost average are all withheld rather than reported.
    expect(Number.isFinite(a.metrics.maxAcceleration)).toBe(false);
    expect(Number.isFinite(a.metrics.maxDeceleration)).toBe(false);
    expect(a.metrics.avgBoostAcceleration).toBeNull();
    // …and a warning explains why the acceleration is only a curve, not a peak.
    expect(a.warnings.some((w) => /acceleration/i.test(w) && /resolve|derived/i.test(w))).toBe(true);
  });

  it('reports a sensible descent rate', () => {
    const a = analyzeFlight(syntheticBaroFlight().flight);
    expect(a.metrics.wholeDescentRate).toBeGreaterThan(10);
    expect(a.metrics.wholeDescentRate).toBeLessThan(20);
  });

  it('withholds a descent rate that beats a vacuum fall from apogee', () => {
    // A discontinuity in the altitude record — a segment boundary, a pressure glitch,
    // a logger that resumes on another baseline — puts an enormous excursion into the
    // derived velocity, and the mean over the leg inherits it. Three real corpus files
    // reported exactly this as a "main descent": 16,495, 8,303 and 749 ft/s, printed as a
    // rate a flyer might size a chute against. The rocket is at rest at apogee, so nothing
    // after it can exceed √(2·g·h) — an exact ceiling with nothing to tune.
    const { flight } = syntheticBaroFlight();
    const alt = Float64Array.from(flight.channels[0].values);
    const dt = 0.05;
    const apIdx = alt.indexOf(Math.max(...alt));
    const apogee = alt[apIdx];
    // A sustained ramp, not a single spike — the spike filter removes one bad sample, and
    // rightly: that is not the shape this artefact has. The record comes down from apogee
    // to the ground in two seconds, which is a mean of ~800 m/s against a ceiling of
    // √(2·g·h) ≈ 177 m/s. Nothing in the physics allows it, whatever the sensor says.
    const fallSamples = Math.round(2 / dt);
    for (let i = apIdx + 1; i < alt.length; i++) {
      const k = i - apIdx;
      alt[i] = k <= fallSamples ? apogee * (1 - k / fallSamples) : 0;
    }
    const broken: RawFlight = { ...flight, channels: [{ ...flight.channels[0], values: alt }] };
    const a = analyzeFlight(broken);
    const ceiling = Math.sqrt(2 * 9.80665 * (a.metrics.apogeeAltitude ?? 0));
    expect(a.metrics.mainDescentRate).toBeNull();
    expect(a.metrics.wholeDescentRate).toBeNull();
    if (a.metrics.drogueDescentRate != null) expect(a.metrics.drogueDescentRate).toBeLessThanOrEqual(ceiling);
    // …and it says why, rather than leaving a bare dash.
    expect(a.warnings.some((w) => /vacuum/.test(w))).toBe(true);
  });

  it('withholds a barometric speed that contradicts the flight’s own climb', () => {
    // A jump in the altitude trace puts an enormous slope into the speed derived from it.
    // Two corpus files read Mach 4.08 over a 4,661 ft apogee and 2,671 ft/s over 958 ft —
    // speeds whose drag-free coast would have carried the rocket a hundred times higher
    // than it went. Measured across 33 corpus flights, what a flight actually gains from
    // its peak-speed point spans 6.3%–81.7% of that vacuum coast; those two sit at 0.1%.
    const { flight } = syntheticBaroFlight();
    const alt = Float64Array.from(flight.channels[0].values);
    const apIdx = alt.indexOf(Math.max(...alt));
    // A one-sample-wide spike is filtered; a short sustained step is what a trace that
    // jumps looks like, and it makes the derived speed enormous without moving apogee.
    const at = Math.round(apIdx * 0.4);
    for (let i = at; i < at + 6; i++) alt[i] += 4000;
    const a = analyzeFlight({ ...flight, channels: [{ ...flight.channels[0], values: alt }] });
    expect(Number.isFinite(a.metrics.maxVelocity)).toBe(false);
    expect(a.metrics.mach).toBeNull();
    expect(a.metrics.burnoutVelocity).toBeNull();
    expect(a.warnings.some((w) => /contradicts this flight's own climb/.test(w))).toBe(true);
    // The climb itself is still read.
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0);
  });

  it('withholds the clock when the record stops before the rocket came down', () => {
    // A logger that writes the same flight twice can cut one copy short. The segmenter sees
    // "climbed, came back to the ground, climbed again" either way, so the first copy's
    // "landing" is the record restarting — on a corpus Blue Raven, 0.08 s after the peak of
    // a 10,245 ft flight, which was reported as an 18.3 s flight time. A body cannot fall
    // from h in less than √(2h/g), so a record that ends sooner than that after apogee did
    // not hold a descent, whatever the trace does at the cut.
    const { flight } = syntheticBaroFlight();
    const alt = Float64Array.from(flight.channels[0].values);
    const apIdx = alt.indexOf(Math.max(...alt));
    const cut = apIdx + 4;
    // Everything after apogee drops straight to the ground and stays there — the shape of a
    // record restarting, not of a rocket descending.
    for (let i = cut; i < alt.length; i++) alt[i] = 0;
    const a = analyzeFlight({ ...flight, channels: [{ ...flight.channels[0], values: alt }] });
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(0); // the climb is still read
    expect(a.metrics.flightTime).toBeNull();
    expect(a.metrics.descentTime).toBeNull();
    expect(a.metrics.mainDescentRate).toBeNull();
    expect(a.metrics.wholeDescentRate).toBeNull();
    expect(a.events.some((e) => e.type === 'landing')).toBe(false);
    expect(a.warnings.some((w) => /holds the climb but not the descent/.test(w))).toBe(true);
  });

  it('withholds a descent leg the record only holds a sliver of', () => {
    // A log that loses power in mid-air moments after the main fires: the samples left
    // average to almost nothing, which is the end of the record rather than a descent.
    // The drogue leg above it is a long, real descent and must still read.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    const dt = 0.05;
    const apIdx = alt.indexOf(Math.max(...alt));
    // Drogue at 30 m/s from apogee, then a "main" that slows it hard 4 s before the log
    // ends — long enough to be detected as a deployment, far too little of the leg (12 m
    // of a 1,600 m descent still to run) to average a rate over.
    const mainAt = apIdx + Math.round(20 / dt);
    const end = mainAt + Math.round(4 / dt);
    for (let i = apIdx + 1; i < alt.length; i++) {
      alt[i] = i <= mainAt ? alt[apIdx] - 30 * (i - apIdx) * dt : alt[mainAt] - 4 * (i - mainAt) * dt;
    }
    const cut: RawFlight = {
      ...flight,
      time: flight.time.slice(0, end),
      channels: [{ ...flight.channels[0], values: alt.slice(0, end) }],
    };
    const a = analyzeFlight(cut);
    expect(a.metrics.drogueDescentRate).toBeGreaterThan(20); // the long leg still reads
    expect(a.metrics.mainDescentRate).toBeNull(); // the sliver does not
    expect(a.metrics.wholeDescentRate).toBeNull(); // the sliver does not
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

  it('caveats a barometric speed that peaks in the transonic band, but not a measured one', () => {
    // A fast flight whose speed peaks near Mach 1 (~360 m/s at burnout) — the region a
    // barometer can't read reliably. Build it once, then analyse it two ways.
    const dt = 0.05;
    const padT = 2;
    const aBoost = 180; // m/s² → ~360 m/s burnout, ~Mach 1.06
    const tBurn = 2;
    const vB = aBoost * tBurn;
    const hB = 0.5 * aBoost * tBurn * tBurn;
    const coastT = vB / G0;
    const total = padT + tBurn + coastT + 40;
    const time: number[] = [];
    const alt: number[] = [];
    const vel: number[] = [];
    for (let t = 0; t <= total; t += dt) {
      const ft = t - padT;
      let h: number;
      let v: number;
      if (ft <= 0) ((h = 0), (v = 0));
      else if (ft <= tBurn) ((h = 0.5 * aBoost * ft * ft), (v = aBoost * ft));
      else {
        const c = ft - tBurn;
        h = Math.max(0, hB + vB * c - 0.5 * G0 * c * c);
        v = Math.max(0, vB - G0 * c);
      }
      time.push(t);
      // Whole metres, as a baro altimeter actually reports them — so the velocity
      // channel below is a distinguishable second reading rather than this trace
      // differenced (which Debrief reads as derived, not measured).
      alt.push(Math.round(h));
      vel.push(v);
    }
    const baseFlight: RawFlight = {
      source: 'x', format: 'test', formatLabel: 'Test', time: Float64Array.from(time),
      channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }], meta: {}, notes: [],
    };
    const baro = analyzeFlight(baseFlight);
    expect(baro.series.velocitySource).toBe('baro');
    expect(baro.metrics.mach!).toBeGreaterThan(0.9);
    expect(baro.warnings.some((w) => /transonic/i.test(w))).toBe(true);
    // A Mach-1 crossing read off this baro speed is flagged unconfirmed, so the headline
    // and exports soften "went supersonic" rather than assert it.
    if (baro.metrics.transonicTime != null) expect(baro.metrics.transonicUnconfirmed).toBe(true);

    // Same flight recorded by a device that can actually measure a speed — an
    // accelerometer beside the barometer, as every logger with a trustworthy velocity
    // channel has. The reading is then trustworthy, so no transonic caveat at the same
    // Mach. (Without that sensor the same column is a filtered barometric derivative and
    // gets the caveat, which is the next test.)
    const accel = Float64Array.from(time, (t) => (t - padT > 0 && t - padT <= tBurn ? aBoost + G0 : 0));
    const measured = analyzeFlight({
      ...baseFlight,
      channels: [
        ...baseFlight.channels,
        { kind: 'velocity', label: 'v', unit: 'm/s', values: Float64Array.from(vel) },
        { kind: 'accelAxial', label: 'acc', unit: 'm/s²', values: accel },
      ],
    });
    expect(measured.series.velocitySource).toBe('device');
    expect(measured.warnings.some((w) => /transonic/i.test(w))).toBe(false);
    expect(measured.metrics.transonicUnconfirmed).toBe(false);
  });

  it('reads a velocity column as derived when the device had no way to measure a speed', () => {
    // A baro-only altimeter has one sensor. Whatever its firmware filters, the "velocity"
    // it writes is worked out from its own pressure readings, so it cannot count as a
    // second, independent reading — nine corpus flights used to claim it did, one of them
    // 4,483 ft/s on a 4,661 ft apogee. The column's own numbers are kept; the label is what
    // changes, and with it every derived-velocity caveat.
    const { flight } = syntheticBaroFlight();
    const alt = flight.channels[0].values;
    // A plausible filtered velocity: the true profile, so it is NOT this altitude
    // differenced (which the alt-diff detector catches separately).
    const vel = new Float64Array(alt.length);
    for (let i = 1; i < alt.length; i++) vel[i] = (alt[i] - alt[i - 1]) / (flight.time[i] - flight.time[i - 1]);
    for (let i = 0; i < alt.length; i++) alt[i] = Math.round(alt[i]);
    const withVel = { ...flight, channels: [...flight.channels, { kind: 'velocity' as const, label: 'Veloc', unit: 'm/s', values: vel }] };

    expect(analyzeFlight(withVel).series.velocitySource).toBe('baro');
    expect(analyzeFlight(withVel).warnings.some((w) => /derived from altitude/i.test(w))).toBe(true);

    // The same column IS a measurement once the file shows a sensor that can produce one —
    // an accelerometer, a GPS fix, or the device's own inertial altitude.
    for (const sensor of [
      { kind: 'accelAxial' as const, label: 'acc', unit: 'm/s²' },
      { kind: 'latitude' as const, label: 'lat', unit: '°' },
      { kind: 'altitudeInertial' as const, label: 'Inertial_Altitude', unit: 'm' },
    ]) {
      const a = analyzeFlight({
        ...withVel,
        channels: [...withVel.channels, { ...sensor, values: Float64Array.from(alt) }],
      });
      expect(a.series.velocitySource, sensor.kind).toBe('device');
    }
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

  it('discards a physically-impossible ground temperature instead of computing Mach off it', () => {
    // A real Mercury AltimeterCloud telemetry file writes "bmp_temp(x100)": 27 °C is
    // stored as 2700. Read as whole degrees it would make a ~2973 K pad and a ~1090 m/s
    // speed of sound — understating every Mach number ~3×. The guard must reject it and
    // fall back to the standard day.
    const { flight } = syntheticBaroFlight();
    const packed = new Float64Array(flight.time.length).fill(2710); // 27.1 °C, ×100-packed
    const withBadTemp: RawFlight = {
      ...flight,
      channels: [...flight.channels, { kind: 'temperature', label: 'bmp_temp(x100)', unit: 'c', values: packed }],
    };
    const a = analyzeFlight(withBadTemp);
    // Not trusted → reported as no reading, and the atmosphere is the standard 15 °C day.
    expect(a.metrics.groundTemperature).toBeNull();
    expect(a.series.speedOfSound).toBeGreaterThan(335);
    expect(a.series.speedOfSound).toBeLessThan(345);

    // A credible pad temperature, by contrast, is used as-is.
    const warm = new Float64Array(flight.time.length).fill(30); // 30 °C desert pad
    const withWarmTemp: RawFlight = {
      ...flight,
      channels: [...flight.channels, { kind: 'temperature', label: 'temp', unit: 'c', values: warm }],
    };
    const b = analyzeFlight(withWarmTemp);
    expect(b.metrics.groundTemperature).toBeGreaterThan(29);
    expect(b.metrics.groundTemperature).toBeLessThan(31);
    expect(b.series.speedOfSound).toBeGreaterThan(345); // warmer air → faster sound than the 15 °C day
  });
});

describe('reading the descent from a file’s second copy of one flight', () => {
  /**
   * One flight written twice, where the FIRST copy is cut just after apogee — a logger
   * restarting mid-flight, which is what the corpus Blue Raven does. The second copy runs to
   * the ground, and starts in the trough with no pad window of its own.
   */
  function cutFirstCopy(secondScale = 1): RawFlight {
    const one = syntheticBaroFlight().flight;
    const src = one.channels[0].values;
    const dt = one.time[1] - one.time[0];
    const n = src.length;
    // Where the first copy stops: a little past the peak.
    let peakI = 0;
    for (let i = 0; i < n; i++) if (src[i] > src[peakI]) peakI = i;
    const stop = peakI + 4;
    const time: number[] = [];
    const alt: number[] = [];
    for (let i = 0; i < stop; i++) { time.push(one.time[i]); alt.push(src[i]); }
    // A short stretch at the ground between the copies, then the whole flight again.
    for (let i = 0; i < 10; i++) { time.push(time[time.length - 1] + dt); alt.push(0); }
    for (let i = 0; i < n; i++) { time.push(time[time.length - 1] + dt); alt.push(src[i] * secondScale); }
    return {
      ...one,
      time: Float64Array.from(time),
      channels: [{ ...one.channels[0], values: Float64Array.from(alt) }],
    };
  }

  it('fills in the clock the first copy could not record, and says where it came from', () => {
    const whole = analyzeFlight(syntheticBaroFlight().flight);
    const a = analyzeFlight(cutFirstCopy());

    // The climb still comes from the copy that starts on the pad — nothing moved.
    // Cutting the first copy four samples past its peak moves the detected apogee by at most
    // one 0.05 s sample (0.03 m of height) — the climb is the first copy's, unchanged.
    expect(a.metrics.apogeeAltitude).toBeCloseTo(whole.metrics.apogeeAltitude, 1);
    expect(Math.abs(a.metrics.timeToApogee - whole.metrics.timeToApogee)).toBeLessThanOrEqual(0.051);

    // …and the descent the first copy stops short of is read from the second.
    expect(a.metrics.descentSource).toBe('second-copy');
    expect(a.metrics.descentTime).toBeGreaterThan(0);
    expect(a.metrics.descentTime!).toBeCloseTo(whole.metrics.descentTime!, 0);
    // Flight time is composed, so it adds up — the same invariant the corpus enforces.
    expect(a.metrics.flightTime!).toBeCloseTo(a.metrics.timeToApogee + a.metrics.descentTime!, 5);
    expect(a.warnings.some((w) => /descent CLOCK is read from the second copy/.test(w))).toBe(true);
    // The note about holding the climb but not the descent no longer applies to this flight.
    expect(a.warnings.some((w) => /holds the climb but not the descent/.test(w))).toBe(false);
  });

  it('does not take the descent RATES across', () => {
    // A descent time needs two instants both copies agree on. A rate needs the deployment
    // structure between them, and an unresolved one averages the whole descent into a figure
    // published under the label a flyer sizes a parachute against — on the corpus flight this
    // comes from, 48.2 m/s where the GPS recording it separately reads a 6.2 m/s main.
    const a = analyzeFlight(cutFirstCopy());
    expect(a.metrics.descentTime).not.toBeNull();
    expect(a.metrics.mainDescentRate).toBeNull();
    expect(a.metrics.wholeDescentRate).toBeNull();
    expect(a.metrics.drogueDescentRate).toBeNull();
  });

  it('leaves an ordinary single-record flight labelled as one', () => {
    expect(analyzeFlight(syntheticBaroFlight().flight).metrics.descentSource).toBe('same-record');
  });

  it('will not splice when the two copies are different flights', () => {
    // The same cut first copy, but the second climbs half as high again: two flights, and
    // the second one's descent is not this flight's descent.
    const a = analyzeFlight(cutFirstCopy(1.5));
    expect(a.metrics.descentSource).toBeNull();
    expect(a.metrics.descentTime).toBeNull();
  });
});
