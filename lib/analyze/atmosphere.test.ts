import { describe, it, expect } from 'vitest';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';

/**
 * Max-Q is the structural load case an airframe is sized against, and it is `½ρv²` — so the
 * height the air was read at is half the reading. The atmosphere used to be built from the
 * raw barometric trace hundreds of lines before the ascent bounds existed, which left the
 * analysis holding TWO heights for one instant: the one it printed beside the load case and
 * the one it read the air at. On the corpus's `f1machbuster-jan10` those were 482.5 m and
 * −93.5 m — 576 m apart in a single row — and because density falls exponentially with
 * height, reading it too low reads the air too THICK and the load case too high.
 *
 * These hold the two rules that closed it, on flights built from first principles so they
 * run wherever the corpus does not:
 *
 *  - where the record can place the sample, the air is read at that placement;
 *  - where it cannot, the sample still cannot be below the pad, so the air is never thicker
 *    than pad air.
 *
 * The load-bearing assertion is the same in both, and it is checkable from the published
 * figures alone: **a load case is never heavier than the air at the height it says it
 * happened**, taken with the flight's own fastest speed, which is an upper bound on the
 * speed at that instant.
 */

const R_AIR = 287.05;
const LAPSE = -0.0065;
const G_STD = 9.80665;
const ISA_P0 = 101325;
/** These flights log no temperature, so the model anchors to the standard day. */
const T0 = 288.15;

/** The published model, restated here rather than imported: a check that shares its
 *  subject's implementation cannot fail when that implementation is what is wrong. */
function isaDensity(hAgl: number): number {
  return (ISA_P0 / (R_AIR * T0)) * Math.pow((T0 + LAPSE * hAgl) / T0, -G_STD / (R_AIR * LAPSE) - 1);
}

/**
 * A vertical flight to 3,500 m whose barometric trace dives to −400 m across burnout,
 * exactly the way a shock sitting over a static port drives the sensed pressure. It is a
 * smooth excursion rather than a one-sample spike, because a spike is what the median filter
 * upstream removes and this artefact survives one — which is the whole reason it reaches the
 * atmosphere at all.
 *
 * `withInertial` adds the logger's own inertial solution, which holds the true height
 * through the same stretch. That is the difference between the two cases below: one file
 * can place the sample and the other cannot.
 */
function shockedFlight(withInertial: boolean): RawFlight {
  const dt = 0.02;
  const padT = 1;
  const aBoost = 100; // m/s²
  const tBurn = 2.5; // s → 250 m/s at burnout, 312.5 m up
  const vBurnout = aBoost * tBurn;
  const hBurnout = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vBurnout / G_STD;
  const apogee = hBurnout + (vBurnout * vBurnout) / (2 * G_STD);
  const descentRate = 18;
  const total = padT + tBurn + coastT + apogee / descentRate + 3;
  // Centred ON burnout, so the fastest sample of the climb — which is where max-Q lands —
  // is the one the artefact is worst at. Centred just BEFORE it, the peak falls on an
  // undistorted sample and the flight proves nothing.
  const from = padT + tBurn - 0.4;
  const to = padT + tBurn + 0.4;

  const time: number[] = [];
  const baro: number[] = [];
  const truth: number[] = [];
  const vel: number[] = [];
  const ax: number[] = [];
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    let v: number;
    let a: number;
    if (ft <= 0) {
      h = 0;
      v = 0;
      a = 0;
    } else if (ft <= tBurn) {
      h = 0.5 * aBoost * ft * ft;
      v = aBoost * ft;
      a = aBoost * (0.6 + (0.8 * ft) / tBurn); // rising, so no sample reads as a clipped flat top
    } else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hBurnout + vBurnout * c - 0.5 * G_STD * c * c;
      v = vBurnout - G_STD * c;
      a = -G_STD;
    } else {
      h = Math.max(0, apogee - descentRate * (ft - tBurn - coastT));
      v = h > 0 ? -descentRate : 0;
      a = 0;
    }
    time.push(t);
    truth.push(h);
    vel.push(v);
    ax.push(a);
    const u = (t - from) / (to - from);
    baro.push(t >= from && t <= to ? h - (h + 400) * Math.sin(Math.PI * u) ** 2 : h);
  }
  // Real barometric noise, deterministic. It is not decoration: without it the velocity
  // column reads as this trace differenced sample to sample and the analysis correctly
  // refuses to treat it as a measurement.
  const noisy = baro.map((h, i) => h + 3 * Math.sin(i * 2.399963) + 1.5 * Math.sin(i * 5.1));

  const channels: RawFlight['channels'] = [
    { kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(noisy) },
    { kind: 'velocity', label: 'speed', unit: 'm/s', values: Float64Array.from(vel) },
    { kind: 'accelAxial', label: 'accel', unit: 'm/s^2', values: Float64Array.from(ax) },
  ];
  if (withInertial) {
    channels.push({ kind: 'altitudeInertial', label: 'alt (inertial)', unit: 'm', values: Float64Array.from(truth) });
  }
  return {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels,
    meta: {},
    notes: [],
  };
}

describe('the air behind max-Q is read at the height the analysis will state', () => {
  it('takes the placement the record can make, so one row does not hold two heights', () => {
    const a = analyzeFlight(shockedFlight(true));
    const q = a.metrics.maxDynamicPressure;
    const hQ = a.metrics.maxDynamicPressureAltitude;
    const vMax = a.metrics.maxVelocity;
    expect(q, 'a load case is reported').not.toBeNull();
    expect(hQ, 'and the height it happened at').not.toBeNull();
    expect(vMax, 'and a top speed').not.toBeNull();

    // The inertial solution holds the true height through the dive, so the row states the
    // placement — 312.5 m — rather than the −400 m the barometer wrote.
    expect(hQ!, 'the stated height is the placement, not the dive').toBeGreaterThan(300);

    // THE INVARIANT. `vMax` is at least the speed at the max-Q instant, so the air at the
    // stated height taken with the flight's own fastest speed bounds the load case from
    // above. Read the air lower than the row says and this fails by exactly that gap:
    // reverting the correction reads it at −402 m and publishes 39.8 kPa against a bound
    // of 37.1 kPa.
    const bound = 0.5 * isaDensity(hQ!) * vMax! * vMax!;
    expect(
      q!,
      `max-Q ${(q! / 1000).toFixed(1)} kPa exceeds ${(bound / 1000).toFixed(1)} kPa — the air at the ${hQ!.toFixed(1)} m it says it happened at, taken with this flight's own fastest ${vMax!.toFixed(1)} m/s`,
    ).toBeLessThanOrEqual(bound);

    // And the air really is thinner than pad air, so the assertion above is biting rather
    // than passing on a technicality.
    expect(q!, 'the air behind it is thinner than pad air').toBeLessThan(0.5 * isaDensity(0) * vMax! * vMax!);
  });

  it('never reads the air below the pad, on a flight nothing can place', () => {
    const a = analyzeFlight(shockedFlight(false));
    const q = a.metrics.maxDynamicPressure;
    const vMax = a.metrics.maxVelocity;
    expect(q, 'a load case is still reported — the flyer has one, and it is not withheld').not.toBeNull();
    expect(vMax).not.toBeNull();
    // Nothing in this file can say how high the rocket was, so the height is withheld…
    expect(a.metrics.maxDynamicPressureAltitude, 'the height is withheld — nothing can state it').toBeNull();

    // …but a climbing rocket is not underground, and that much the record can still state.
    // The barometer wrote −400 m here, where the air is 3.9% thicker than at the pad.
    const padBound = 0.5 * isaDensity(0) * vMax! * vMax!;
    expect(
      q!,
      `max-Q ${(q! / 1000).toFixed(1)} kPa is heavier than pad air can make it (${(padBound / 1000).toFixed(1)} kPa) — the atmosphere was read below the pad`,
    ).toBeLessThanOrEqual(padBound * 1.0001);
    expect(isaDensity(-400) / isaDensity(0), 'the dive really is thicker air, so this assertion can fail').toBeGreaterThan(1.038);
  });

  it('says which fault it found when only the second recording could see it', () => {
    // A trace that goes FLAT through the push rather than diving: it never drops below the
    // pad and never outruns the speed cap, so neither test that holds the trace against
    // itself fires — and the height is hundreds of metres wrong the whole time. Only the
    // second recording can see this, and if the sentence it produces were built from the
    // other two faults' clauses it would come out as "contradicts itself on the way up — ,
    // and a climbing rocket can do neither".
    const a = analyzeFlight(plateauFlight());
    const w = a.warnings.find((x) => x.includes('inertial solution'));
    expect(w, 'the flight is told its barometer parted from the second recording').toBeTruthy();
    expect(w, 'and the sentence is whole').toContain('disagrees with the logger’s own inertial solution');
    expect(w, 'no dangling clause where a fault that did not happen would have gone').not.toMatch(/—\s*,/);
    expect(w, 'and it does not claim the trace dropped below the pad, which it never did').not.toContain('below the pad');
  });
});

/** A climb whose barometer STOPS at 300 m for 1.4 s while the rocket goes on to 800 m, then
 *  rejoins. The running maximum never falls, so nothing in the trace's own history objects. */
function plateauFlight(): RawFlight {
  const dt = 0.02;
  const padT = 1;
  const aBoost = 100;
  const tBurn = 4; // 400 m/s at burnout, 800 m up
  const vBurnout = aBoost * tBurn;
  const hBurnout = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vBurnout / G_STD;
  const apogee = hBurnout + (vBurnout * vBurnout) / (2 * G_STD);
  const descentRate = 20;
  const total = padT + tBurn + coastT + apogee / descentRate + 3;
  const flatFrom = padT + 2.45; // where the true height is ~300 m
  const flatTo = padT + tBurn;

  const time: number[] = [];
  const baro: number[] = [];
  const truth: number[] = [];
  const vel: number[] = [];
  const ax: number[] = [];
  let held = NaN;
  for (let t = 0; t <= total; t += dt) {
    const ft = t - padT;
    let h: number;
    let v: number;
    let a: number;
    if (ft <= 0) {
      h = 0;
      v = 0;
      a = 0;
    } else if (ft <= tBurn) {
      h = 0.5 * aBoost * ft * ft;
      v = aBoost * ft;
      a = aBoost * (0.6 + (0.8 * ft) / tBurn);
    } else if (ft <= tBurn + coastT) {
      const c = ft - tBurn;
      h = hBurnout + vBurnout * c - 0.5 * G_STD * c * c;
      v = vBurnout - G_STD * c;
      a = -G_STD;
    } else {
      h = Math.max(0, apogee - descentRate * (ft - tBurn - coastT));
      v = h > 0 ? -descentRate : 0;
      a = 0;
    }
    time.push(t);
    truth.push(h);
    vel.push(v);
    ax.push(a);
    if (t >= flatFrom && t <= flatTo) {
      if (!Number.isFinite(held)) held = h;
      baro.push(held);
    } else {
      baro.push(h);
    }
  }
  const noisy = baro.map((h, i) => h + 3 * Math.sin(i * 2.399963) + 1.5 * Math.sin(i * 5.1));
  return {
    source: 'synthetic',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [
      { kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(noisy) },
      { kind: 'velocity', label: 'speed', unit: 'm/s', values: Float64Array.from(vel) },
      { kind: 'accelAxial', label: 'accel', unit: 'm/s^2', values: Float64Array.from(ax) },
      { kind: 'altitudeInertial', label: 'alt (inertial)', unit: 'm', values: Float64Array.from(truth) },
    ],
    meta: {},
    notes: [],
  };
}
