import { describe, it, expect } from 'vitest';
import { resample, buildComparison, crossCheck, crossCheckLede, differentFlightDays, statedDaySplit, statedDaysPhrase, undatedNote, COMPARE_PALETTE, MAX_COMPARE, type CompareInput, type CompareFlight, distinguishingLabels, recoveryDisagreement } from './compare';
import type { FlownAt } from './flight/flownAt';
import type { FlightAnalysis, FlightMetrics } from './analyze/types';

describe('crossCheck', () => {
  const flight = (apogee: number, maxV: number): CompareFlight =>
    ({ metrics: { apogeeAltitude: apogee, maxVelocity: maxV } as FlightMetrics }) as CompareFlight;

  it('reports the spread across flights for apogee and max speed', () => {
    const a = crossCheck([flight(2440, 300), flight(2490, 310), flight(2465, 305)]);
    const apo = a.find((x) => x.key === 'apogee')!;
    expect(apo.count).toBe(3);
    expect(apo.min).toBe(2440);
    expect(apo.max).toBe(2490);
    expect(apo.spreadPct).toBeCloseTo((50 / 2465) * 100, 1);
    expect(a.find((x) => x.key === 'maxVelocity')!.spreadPct).toBeGreaterThan(0);
  });

  it('skips a metric that is finite on fewer than two flights', () => {
    const a = crossCheck([flight(2000, NaN), flight(2100, NaN)]);
    expect(a.some((x) => x.key === 'apogee')).toBe(true);
    expect(a.some((x) => x.key === 'maxVelocity')).toBe(false);
  });

  const timedFlight = (apogee: number, tToApogee: number): CompareFlight =>
    ({ metrics: { apogeeAltitude: apogee, timeToApogee: tToApogee } as FlightMetrics }) as CompareFlight;

  it('cross-checks time to apogee as an independent temporal corroboration', () => {
    const a = crossCheck([timedFlight(2440, 14.8), timedFlight(2465, 15.1)]);
    const t = a.find((x) => x.key === 'timeToApogee')!;
    expect(t.count).toBe(2);
    expect(t.spreadPct).toBeCloseTo((0.3 / 14.95) * 100, 1);
    // It carries no measurement source, so it's never a measured/derived mix.
    expect(t.mixedSource).toBe(false);
    // A flight with no detected liftoff (NaN time to apogee) drops out of the check.
    const partial = crossCheck([timedFlight(2440, 14.8), timedFlight(2465, NaN)]);
    expect(partial.some((x) => x.key === 'timeToApogee')).toBe(false);
  });

  const srcFlight = (maxV: number, source: 'device' | 'baro'): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: maxV, maxVelocitySource: source } as FlightMetrics }) as CompareFlight;

  it('flags a max-speed cross-check that mixes a measured and a derived velocity', () => {
    const a = crossCheck([srcFlight(300, 'device'), srcFlight(285, 'baro')]);
    expect(a.find((x) => x.key === 'maxVelocity')!.mixedSource).toBe(true);
    // Apogee shares no measured/derived split, so it is never flagged.
    expect(a.find((x) => x.key === 'apogee')!.mixedSource).toBe(false);
  });

  it('does not flag when every velocity comes from the same source', () => {
    const a = crossCheck([srcFlight(300, 'device'), srcFlight(305, 'device')]);
    expect(a.find((x) => x.key === 'maxVelocity')!.mixedSource).toBe(false);
  });

  const apogeeFlight = (apogee: number, caveat?: 'floor' | 'unproven'): CompareFlight =>
    ({
      metrics: {
        apogeeAltitude: apogee,
        ...(caveat === 'floor' ? { apogeeIsFloor: true } : {}),
        ...(caveat === 'unproven' ? { altitudeUnproven: true } : {}),
      } as FlightMetrics,
    }) as CompareFlight;

  it('flags an apogee spread the comparison table already refuses to read plainly', () => {
    // The defect: this panel published a spread over apogees the table beside it tags
    // `(at least)` / `(unproven)` and refuses to crown. Measured on the corpus, two intrepid
    // TeleMetrum recordings printed `996 m (at least)` and `1,082 m (at least)` and were reported
    // as an 8.2% disagreement between two LOWER BOUNDS.
    const floors = crossCheck([apogeeFlight(996, 'floor'), apogeeFlight(1082, 'floor')]);
    expect(floors.find((x) => x.key === 'apogee')!.qualified).toBe(true);
    // One qualified contributor is enough — the spread is between a measurement and a bound.
    const one = crossCheck([apogeeFlight(996, 'floor'), apogeeFlight(1082)]);
    expect(one.find((x) => x.key === 'apogee')!.qualified).toBe(true);
    // And the other branch: an altitude channel Debrief has disowned.
    const unproven = crossCheck([apogeeFlight(9, 'unproven'), apogeeFlight(465)]);
    expect(unproven.find((x) => x.key === 'apogee')!.qualified).toBe(true);
  });

  it('leaves an ordinary apogee unflagged, and never flags another metric', () => {
    // The half that makes the case above able to fail: a plain pair must come back clean, or the
    // footnote is on every comparison and says nothing.
    const plain = crossCheck([apogeeFlight(2440), apogeeFlight(2490)]);
    expect(plain.find((x) => x.key === 'apogee')!.qualified).toBe(false);
    // `qualified` is the apogee's own caveat, so a qualified apogee does not leak onto the speed
    // row sitting beside it in the same panel.
    const withSpeed = crossCheck([
      { metrics: { apogeeAltitude: 996, apogeeIsFloor: true, maxVelocity: 300 } as FlightMetrics } as CompareFlight,
      { metrics: { apogeeAltitude: 1082, maxVelocity: 305 } as FlightMetrics } as CompareFlight,
    ]);
    expect(withSpeed.find((x) => x.key === 'apogee')!.qualified).toBe(true);
    expect(withSpeed.find((x) => x.key === 'maxVelocity')!.qualified).toBe(false);
  });

  it('keeps the qualified recording in the spread rather than dropping it', () => {
    // The call that was not obvious. Dropping an unproven apogee would leave a two-recording group
    // with one contributor and no apogee row at all — so a flyer whose second altimeter recorded
    // garbage would be told nothing, when the gap is exactly the signal that it is broken.
    const a = crossCheck([apogeeFlight(9, 'unproven'), apogeeFlight(465)]).find((x) => x.key === 'apogee')!;
    expect(a.count).toBe(2);
    expect(a.min).toBe(9);
    expect(a.max).toBe(465);
  });

  const accelFlight = (maxA: number, source: 'device' | 'baro'): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: 300, maxAcceleration: maxA, accelerationSource: source } as FlightMetrics }) as CompareFlight;

  it('cross-checks max acceleration when two recordings both carry it', () => {
    const a = crossCheck([accelFlight(180, 'device'), accelFlight(172, 'device')]);
    const acc = a.find((x) => x.key === 'maxAcceleration')!;
    expect(acc.count).toBe(2);
    expect(acc.min).toBe(172);
    expect(acc.max).toBe(180);
    expect(acc.mixedSource).toBe(false);
  });

  it('flags a mixed measured/derived max-acceleration cross-check, and skips it when a flight lacks accel', () => {
    const mixed = crossCheck([accelFlight(180, 'device'), accelFlight(150, 'baro')]);
    expect(mixed.find((x) => x.key === 'maxAcceleration')!.mixedSource).toBe(true);
    // A baro-only flight (NaN acceleration) leaves fewer than two, so no accel cross-check.
    const partial = crossCheck([accelFlight(180, 'device'), srcFlight(300, 'baro')]);
    expect(partial.some((x) => x.key === 'maxAcceleration')).toBe(false);
  });

  // `descentSource` is what says a landing was actually found; these recordings landed
  // unless a test says otherwise.
  const descentFlight = (drogue: number | null, main: number | null, landed = true): CompareFlight =>
    ({
      metrics: {
        apogeeAltitude: 2000,
        drogueDescentRate: drogue,
        mainDescentRate: main,
        descentSource: landed ? 'same-record' : null,
      } as FlightMetrics,
    }) as CompareFlight;

  it('cross-checks the descent rates when two recordings both caught recovery', () => {
    const a = crossCheck([descentFlight(22, 6.1), descentFlight(19, 5.8)]);
    const main = a.find((x) => x.key === 'mainDescentRate')!;
    expect(main.count).toBe(2);
    expect(main.min).toBe(5.8);
    expect(main.max).toBe(6.1);
    // Altitude-derived on every logger, so it never reads as a measured/derived mix.
    expect(main.mixedSource).toBe(false);
    expect(a.find((x) => x.key === 'drogueDescentRate')!.count).toBe(2);
    // Only one recording reached main → too few to corroborate, so it's skipped.
    const partial = crossCheck([descentFlight(22, 6.1), descentFlight(19, null)]);
    expect(partial.some((x) => x.key === 'mainDescentRate')).toBe(false);
    expect(partial.some((x) => x.key === 'drogueDescentRate')).toBe(true);
  });

  const fullFlight = (over: Partial<FlightMetrics>): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: 300, ...over } as FlightMetrics }) as CompareFlight;

  it('cross-checks every reading the comparison table shows, not a shorter list', () => {
    // The panel is the sentence a flyer reads to decide whether to trust the set, and it used
    // to check seven readings while the table beside it displayed twelve. Measured on the
    // corpus's same-flight groups: iss-endurance's worst CHECKED spread was 26.4% while its
    // max-Q differed 53%, its burn time 193% and its burnout altitude 176%; the four-altimeter
    // group read every checked metric inside 6.7% while its tilt at burnout ran 4°, 9°, 11°.
    const a = crossCheck([
      fullFlight({ maxDynamicPressure: 58017, burnTime: 2.9, burnoutAltitude: 488, mainDeployTime: 120, tiltAtBurnout: 4, burnoutSource: 'measured', maxVelocitySource: 'device' }),
      fullFlight({ maxDynamicPressure: 99672, burnTime: 0.05, burnoutAltitude: 30, mainDeployTime: 121, tiltAtBurnout: 11, burnoutSource: 'derived', maxVelocitySource: 'device' }),
    ]);
    for (const key of ['maxDynamicPressure', 'burnTime', 'burnoutAltitude', 'mainDeployTime', 'tiltAtBurnout']) {
      expect(a.some((x) => x.key === key), `${key} is cross-checked`).toBe(true);
    }
    // Max-Q is the structural load case — the one of these a flyer sizes an airframe against.
    expect(a.find((x) => x.key === 'maxDynamicPressure')!.spreadPct).toBeGreaterThan(40);
    // Burn time and burnout altitude are read at one instant, so a measured/derived pair is
    // two definitions of that instant rather than two readings of one quantity.
    expect(a.find((x) => x.key === 'burnTime')!.mixedSource, 'a measured/derived burnout pair is flagged').toBe(true);
    expect(a.find((x) => x.key === 'burnoutAltitude')!.mixedSource).toBe(true);
    // Tilt is read off each logger's own attitude solution — no source mix to flag.
    expect(a.find((x) => x.key === 'tiltAtBurnout')!.mixedSource).toBe(false);
  });

  it('does not say readings "agree to within" a spread that is a disagreement', () => {
    // With a 193% burn-time spread in the list, "the independent readings agree to within …
    // 193% on burn time" is nonsense, and the corpus has a group that produces exactly that.
    const wide = crossCheck([
      fullFlight({ burnTime: 2.9, burnoutSource: 'measured' }),
      fullFlight({ burnTime: 0.05, burnoutSource: 'measured' }),
    ]);
    expect(crossCheckLede(wide)).toBe('differ by');

    const tight = crossCheck([fullFlight({ apogeeAltitude: 2000 }), fullFlight({ apogeeAltitude: 2010 })]);
    expect(crossCheckLede(tight)).toBe('agree to within');
  });

  const clippedAccelFlight = (maxA: number, clipped: boolean): CompareFlight =>
    ({ metrics: { apogeeAltitude: 2000, maxVelocity: 300, maxAcceleration: maxA, accelerationSource: 'device', accelClipped: clipped } as FlightMetrics }) as CompareFlight;

  it('flags a max-acceleration cross-check when one recording’s sensor saturated (its peak is a floor)', () => {
    // A saturated 16 g floor beside a real 31 g would otherwise read as a ~64% flight
    // difference; it's a sensor limit, so the spread must be flagged, not blessed.
    const a = crossCheck([clippedAccelFlight(157, true), clippedAccelFlight(304, false)]);
    const acc = a.find((x) => x.key === 'maxAcceleration')!;
    expect(acc.saturated).toBe(true);
    // Both are device-measured, so the measured/derived mix flag stays off — saturation
    // is a distinct reason the spread is misleading.
    expect(acc.mixedSource).toBe(false);
    // With neither sensor clipped, nothing is flagged.
    const clean = crossCheck([clippedAccelFlight(180, false), clippedAccelFlight(172, false)]);
    expect(clean.find((x) => x.key === 'maxAcceleration')!.saturated).toBe(false);
  });
});

const metrics = (apogee: number): FlightMetrics => ({
  apogeeIsFloor: false,
  altitudeUnproven: false,
  apogeeAltitude: apogee,
  timeToApogee: 1,
  maxVelocity: 100,
  maxVelocityWithheld: null,
  maxVelocitySource: 'baro',
  burnoutSource: 'derived',
  burnoutAtVelocityPeak: true,
  maxVelocityAltitude: 50,
  mach: null,
  maxDynamicPressure: null,
  maxDynamicPressureAltitude: null,
  transonicTime: null,
  transonicAltitude: null,
  transonicUnconfirmed: false,
  maxAcceleration: 100,
  avgBoostAcceleration: 60,
  maxDeceleration: -20,
  accelerationSource: 'baro',
  accelClipped: false,
  liftoffTWR: null,
  burnTime: 1,
  burnoutAltitude: 50,
  burnoutVelocity: 90,
  coastTime: 1,
  coastEfficiency: 0.6,
  dragLossAltitude: 120,
  drogueDescentRate: 30,
  mainDescentRate: 6,
  descentTime: 10,
  flightTime: 12,
  groundTemperature: null,
  batteryStartV: null,
  batteryMinV: null,
  peakRollRate: null,
  rollRevolutions: null,
  tiltAtBurnout: null,
  mainDeployTime: null,
  derivedVelocityFrom: null,
  wholeDescentRate: null,
  descentSource: null,
    gpsApogeeAltitude: null,
    gpsApogeeTime: null,
    gpsAscentFixes: null,
});

// A flight whose liftoff is at `t0` on its own clock; altitude is a small ramp so
// the value at liftoff is a known number we can assert alignment against.
function analysis(t0: number, apogee: number): FlightAnalysis {
  const time = Float64Array.from([t0 - 2, t0 - 1, t0, t0 + 1, t0 + 2]);
  const altitude = Float64Array.from([0, 0, 50, 100, 50]); // 50 m AGL at liftoff
  const velocity = Float64Array.from([0, 0, 80, 40, -10]);
  return {
    series: { time, altitude, altitudeRaw: altitude, velocity, acceleration: new Float64Array(5), axialAccel: new Float64Array(5), velocitySource: 'baro', accelerationSource: 'baro', altitudeSource: 'baro', speedOfSound: 340, speedOfSoundProfile: new Float64Array(5).fill(340), airDensity: new Float64Array(5).fill(1.225) },
    events: [{ type: 'liftoff', label: 'Liftoff', time: t0, index: 2, altitude: 50, provenance: 'measured' }],
    metrics: metrics(apogee),
    warnings: [],
    extent: { from: 0, to: 5, startTime: t0 - 2, endTime: t0 + 2, fileEndTime: t0 + 2, source: 'file' },
  };
}

const input = (id: string, t0: number, apogee: number): CompareInput => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Test',
  analysis: analysis(t0, apogee),
});

describe('resample', () => {
  it('linearly interpolates within the source range', () => {
    const t = Float64Array.from([0, 1, 2]);
    const v = Float64Array.from([0, 10, 20]);
    const grid = Float64Array.from([0, 0.5, 1, 1.5, 2]);
    expect([...resample(t, v, grid)]).toEqual([0, 5, 10, 15, 20]);
  });

  it('returns NaN outside the source range', () => {
    const t = Float64Array.from([0, 1, 2]);
    const v = Float64Array.from([0, 10, 20]);
    const out = resample(t, v, Float64Array.from([-1, 1, 3]));
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[1]).toBe(10);
    expect(Number.isNaN(out[2])).toBe(true);
  });

  it('never extrapolates past a duplicated timestamp', () => {
    // Duplicate at t=1 (zero-width bracket): the value must stay within [10,20],
    // not shoot past it.
    const t = Float64Array.from([0, 1, 1, 2]);
    const v = Float64Array.from([0, 10, 20, 30]);
    const out = resample(t, v, Float64Array.from([1]));
    expect(out[0]).toBeGreaterThanOrEqual(10);
    expect(out[0]).toBeLessThanOrEqual(20);
  });
});

describe('buildComparison', () => {
  it('aligns flights at liftoff regardless of pad time', () => {
    // Two flights with different pad times (liftoff at t=2 and t=5).
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    expect(cmp.time.length).toBe(800);
    expect(cmp.flights).toHaveLength(2);

    // The grid point nearest t=0 should read ~50 m (each flight's altitude at its
    // own liftoff), proving they were aligned despite different pad times.
    let k = 0;
    for (let i = 1; i < cmp.time.length; i++) {
      if (Math.abs(cmp.time[i]) < Math.abs(cmp.time[k])) k = i;
    }
    expect(cmp.flights[0].altitude[k]).toBeCloseTo(50, 0);
    expect(cmp.flights[1].altitude[k]).toBeCloseTo(50, 0);
  });

  it('assigns a distinct palette colour per flight and passes metrics through', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 2, 200)]);
    expect(cmp.flights[0].color).toBe(COMPARE_PALETTE[0]);
    expect(cmp.flights[1].color).toBe(COMPARE_PALETTE[1]);
    expect(cmp.flights[1].metrics.apogeeAltitude).toBe(200);
  });

  it('flags whether each flight had a detected liftoff', () => {
    const withLiftoff = input('a', 2, 100); // analysis() includes a liftoff event
    const noLiftoff = { ...input('b', 2, 200), analysis: { ...analysis(2, 200), events: [] } };
    const cmp = buildComparison([withLiftoff, noLiftoff]);
    expect(cmp.flights[0].liftoffDetected).toBe(true);
    expect(cmp.flights[1].liftoffDetected).toBe(false);
  });

  it('carries each flight’s events onto the shared clock, so the overlay can line them up', () => {
    // The point of the comparison: two bays that agree on apogee can still fire main seconds
    // apart, and until the events reached the overlay only the table could say so. Each flight
    // starts its clock somewhere different, so an event is carried as seconds after ITS OWN
    // liftoff — the same zero every flight is aligned to.
    const withEvents = (id: string, t0: number, mainAt: number): CompareInput => ({
      ...input(id, t0, 100),
      analysis: {
        ...analysis(t0, 100),
        events: [
          { type: 'liftoff', label: 'Liftoff', time: t0, index: 2, altitude: 50, provenance: 'measured' },
          { type: 'apogee', label: 'Apogee', time: t0 + 1, index: 3, altitude: 100, provenance: 'derived' },
          { type: 'main', label: 'Main deploy', time: t0 + mainAt, index: 4, altitude: 50, provenance: 'derived' },
        ],
      },
    });
    // Same flight profile, pad clocks 3 s apart, mains 0.4 s apart.
    const cmp = buildComparison([withEvents('a', 2, 1.6), withEvents('b', 5, 2.0)]);

    // Liftoff is NOT carried per flight — every flight is aligned there, so a per-flight marker
    // would be a stack of lines on x=0 saying nothing.
    for (const f of cmp.flights) {
      expect(f.events.some((e) => e.type === 'liftoff')).toBe(false);
    }

    // The differing pad clocks are gone; what survives is the real 0.4 s difference.
    const mainOf = (i: number) => cmp.flights[i].events.find((e) => e.type === 'main')!.t;
    expect(mainOf(0)).toBeCloseTo(1.6, 6);
    expect(mainOf(1)).toBeCloseTo(2.0, 6);
    expect(mainOf(1) - mainOf(0)).toBeCloseTo(0.4, 6);

    // And an event both flights share lands on the same instant, so agreement reads as agreement.
    const apogeeOf = (i: number) => cmp.flights[i].events.find((e) => e.type === 'apogee')!.t;
    expect(apogeeOf(0)).toBeCloseTo(apogeeOf(1), 6);
  });

  it('resamples altitude, velocity and acceleration onto the shared grid', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    for (const f of cmp.flights) {
      expect(f.altitude.length).toBe(cmp.time.length);
      expect(f.velocity.length).toBe(cmp.time.length);
      expect(f.acceleration.length).toBe(cmp.time.length);
    }
  });

  it('derives Mach and dynamic-pressure curves on the shared grid', () => {
    const cmp = buildComparison([input('a', 2, 100), input('b', 5, 200)]);
    // The grid point nearest liftoff (t≈0), where velocity is 80 m/s in the fixture.
    let k = 0;
    for (let i = 1; i < cmp.time.length; i++) {
      if (Math.abs(cmp.time[i]) < Math.abs(cmp.time[k])) k = i;
    }
    const f = cmp.flights[0];
    expect(f.mach.length).toBe(cmp.time.length);
    expect(f.dynamicPressure.length).toBe(cmp.time.length);
    // v≈80 m/s at this grid point (interpolated), so Mach≈0.235 and q≈3920 Pa.
    expect(f.mach[k]).toBeGreaterThan(0.22);
    expect(f.mach[k]).toBeLessThan(0.245);
    expect(f.dynamicPressure[k]).toBeGreaterThan(3700);
    expect(f.dynamicPressure[k]).toBeLessThan(3950);
  });

  it('withholds the Mach and dynamic-pressure overlay curves for an impossible velocity', () => {
    const bad = input('bad', 2, 100);
    bad.analysis = { ...bad.analysis, series: { ...bad.analysis.series, velocityUnusable: true } };
    const cmp = buildComparison([bad, input('ok', 2, 200)]);
    // The flagged flight draws no Mach or dynamic-pressure curve…
    expect(cmp.flights[0].mach.every((v) => Number.isNaN(v))).toBe(true);
    expect(cmp.flights[0].dynamicPressure.every((v) => Number.isNaN(v))).toBe(true);
    // …but its velocity line still overlays (the recorded trace stays visible), and the
    // healthy flight's derived curves are untouched.
    expect(cmp.flights[0].velocity.some((v) => Number.isFinite(v))).toBe(true);
    expect(cmp.flights[1].mach.some((v) => Number.isFinite(v))).toBe(true);
  });

  it('caps the number of flights at MAX_COMPARE', () => {
    const many = Array.from({ length: MAX_COMPARE + 3 }, (_, i) => input(`f${i}`, 2, 100 + i));
    expect(buildComparison(many).flights).toHaveLength(MAX_COMPARE);
  });
});

describe('differentFlightDays', () => {
  const at = (stamp: string): FlownAt => ({ stamp, zone: 'UTC' });
  const withDates = (...stamps: (string | null)[]): CompareFlight[] =>
    stamps.map(
      (s, i) =>
        ({ name: `rec-${i + 1}.csv`, metrics: metrics(1000), ...(s ? { flownAt: at(s) } : {}) }) as CompareFlight,
    );

  it('stays open when fewer than two files state a date', () => {
    expect(differentFlightDays(withDates(null, null))).toBeNull();
    expect(differentFlightDays(withDates('2025-04-12T12:45', null))).toBeNull();
  });

  it('stays open for recordings of one flight', () => {
    expect(differentFlightDays(withDates('2025-04-12T12:45', '2025-04-12T16:45'))).toBeNull();
  });

  it('stays open across a midnight straddle — one clock is UTC, another is the logger’s', () => {
    // The same launch, stamped either side of midnight by two different clocks, is not
    // evidence of two flights.
    expect(differentFlightDays(withDates('2025-04-12T23:50', '2025-04-13T04:50'))).toBeNull();
  });

  it('is refuted when the files date the flights a season apart', () => {
    expect(differentFlightDays(withDates('2021-10-30T20:07', '2024-05-11T14:09'))).toEqual([
      '2021-10-30',
      '2024-05-11',
    ]);
  });

  it('lists each stated day once, in order', () => {
    expect(
      differentFlightDays(withDates('2024-05-11T14:09', '2021-10-30T20:07', '2024-05-11T15:00')),
    ).toEqual(['2021-10-30', '2024-05-11']);
  });
});

describe('statedDaySplit — the evidence, not just the verdict', () => {
  const at = (stamp: string): FlownAt => ({ stamp, zone: 'UTC' });
  const flight = (name: string, stamp?: string): CompareFlight =>
    ({ name, metrics: metrics(1000), ...(stamp ? { flownAt: at(stamp) } : {}) }) as CompareFlight;

  it('says which recording states which day, so an odd clock can be found', () => {
    // Two devices agree on the day and a third is a decade out — the shape of a dead
    // backup cell, and the only way a flyer spots it is being told which file said what.
    expect(
      statedDaySplit([
        flight('BlRv_SN1537.csv', '2025-04-12T12:45'),
        flight('GPSTrk05305.csv', '2025-04-12T12:45'),
        flight('TeleMetrum.csv', '2013-04-27T18:00'),
      ]),
    ).toEqual([
      { day: '2013-04-27', names: ['TeleMetrum.csv'] },
      { day: '2025-04-12', names: ['BlRv_SN1537.csv', 'GPSTrk05305.csv'] },
    ]);
  });

  it('reads as a phrase that names the files beside the days', () => {
    const split = statedDaySplit([flight('a.csv', '2021-10-30T20:07'), flight('b.csv', '2024-05-11T14:09')])!;
    expect(statedDaysPhrase(split, (n) => n.replace(/\.[^.]+$/, ''))).toBe(
      '30 Oct 2021 (a), 11 May 2024 (b)',
    );
  });

  it('agrees with differentFlightDays on when the question is open', () => {
    // One function, two views of it — they can never disagree about the verdict itself.
    for (const stamps of [
      [null, null],
      ['2025-04-12T12:45', null],
      ['2025-04-12T12:45', '2025-04-12T16:45'],
      ['2025-04-12T23:50', '2025-04-13T04:50'],
      ['2021-10-30T20:07', '2024-05-11T14:09'],
    ] as (string | null)[][]) {
      const fs = stamps.map((s, i) => flight(`f${i}.csv`, s ?? undefined));
      expect(!!statedDaySplit(fs)).toBe(!!differentFlightDays(fs));
    }
  });
});

describe('undatedNote — the files that state nothing', () => {
  const at = (stamp: string): FlownAt => ({ stamp, zone: 'UTC' });
  const flight = (name: string, stamp?: string): CompareFlight =>
    ({ name, metrics: metrics(1000), ...(stamp ? { flownAt: at(stamp) } : {}) }) as CompareFlight;

  it('says how many files carry no date, so the count adds up', () => {
    // Comparing three flights where only two are dated, the panel named two days beside
    // three columns and left the third to be wondered about.
    const three = [flight('a.csv', '2021-10-30T20:07'), flight('b.csv', '2024-05-11T14:09'), flight('c.csv')];
    const split = statedDaySplit(three)!;
    expect(undatedNote(split, three)).toMatch(/other file states no date/);
    expect(undatedNote(split, [...three, flight('d.csv')])).toMatch(/other 2 files state no date/);
  });

  it('says nothing at all when every compared file is dated', () => {
    const two = [flight('a.csv', '2021-10-30T20:07'), flight('b.csv', '2024-05-11T14:09')];
    expect(undatedNote(statedDaySplit(two)!, two)).toBe('');
  });

  it('does not count a flight Debrief made up among the files stating no date', () => {
    // The sentence ends "not evidence either way", and a demonstration is not on either side of
    // that — it is not a file that failed to state a day, it is not a file. This took the flights
    // rather than a COUNT for exactly this reason: the count shape had all three callers passing
    // `flights.length`, so one fix here covers the screen, the `.md` and the `.html` at once.
    const two = [flight('a.csv', '2021-10-30T20:07'), flight('b.csv', '2024-05-11T14:09')];
    const madeUp = { ...flight('demo.csv'), synthetic: true } as CompareFlight;
    expect(undatedNote(statedDaySplit(two)!, [...two, madeUp]), 'the demonstration is not counted').toBe('');
    // …and a real undated file still is, so this is an exclusion rather than a blanket silence.
    expect(undatedNote(statedDaySplit(two)!, [...two, madeUp, flight('c.csv')])).toMatch(/other file states no date/);
  });

  it('never reads a made-up flight as one of the days a file states', () => {
    // `statedDaySplit` decides whether the whole panel says "Flight to flight" instead of
    // "Cross-check" — a claim about what the flyer's own files record. A demonstration cannot
    // put a day on that. The generator writes no date column today, so this is unreachable
    // through it; that is a property of one generated FILE, not of this sink, and the marker
    // rides in a metadata row any mappable CSV can carry.
    const oneReal = [flight('a.csv', '2021-10-30T20:07')];
    const madeUpDated = { ...flight('demo.csv', '2024-05-11T14:09'), synthetic: true } as CompareFlight;
    expect(
      statedDaySplit([...oneReal, madeUpDated]),
      'one recording and a demonstration is one stated day, which is not a split',
    ).toBeNull();
  });
});

// A main leg and a whole-descent average are different quantities, and the comparison must
// never put them in one row. Four recordings of one corpus flight did exactly that: three
// resolved a main deployment and read 24.6, 26.7 and 30.9 ft/s over the leg after it, while
// the fourth resolved none and read 71.3 ft/s over the whole descent. Sharing one key, the
// cross-check reported a 121.6% disagreement between four instruments that agreed on the
// drogue to 2.1% — they had not disagreed, they had measured different things.
describe('a whole-descent average is not a main descent rate', () => {
  const withRates = (main: number | null, whole: number | null, drogue: number | null) =>
    ({
      metrics: {
        apogeeIsFloor: false,
        apogeeAltitude: 3576,
        drogueDescentRate: drogue,
        mainDescentRate: main,
        wholeDescentRate: whole,
      } as FlightMetrics,
    }) as CompareFlight;

  it('cross-checks each against its own kind, never against the other', () => {
    const flights = [
      withRates(7.5, null, 22.1), // resolved a main
      withRates(8.1, null, 21.9), // resolved a main
      withRates(9.4, null, 21.9), // resolved a main
      withRates(null, 21.7, null), // resolved none — the whole descent
    ];
    const rows = crossCheck(flights);
    const main = rows.find((r) => r.key === 'mainDescentRate');
    const whole = rows.find((r) => r.key === 'wholeDescentRate');

    // The three main legs are compared with each other and agree.
    expect(main, 'the main legs are cross-checked').toBeTruthy();
    expect(main!.max).toBeCloseTo(9.4, 5);
    expect(main!.min).toBeCloseTo(7.5, 5);
    // …and the whole-descent figure is nowhere near them, so it must not be in that row.
    expect(main!.max).toBeLessThan(21);

    // One recording cannot cross-check anything on its own, so the whole-descent row is
    // absent rather than a single value dressed up as agreement.
    expect(whole).toBeUndefined();
  });

  it('would report a false disagreement if the two shared a row', () => {
    // The same four numbers with the outlier put in the main column — what shipped before.
    const wrong = crossCheck([
      withRates(7.5, null, 22.1),
      withRates(8.1, null, 21.9),
      withRates(9.4, null, 21.9),
      withRates(21.7, null, null),
    ]);
    const main = wrong.find((r) => r.key === 'mainDescentRate')!;
    expect(main.spreadPct).toBeGreaterThan(100);
  });
});

// Four recordings of one flight share everything but a short tail, so a column header
// clamped to 160 px painted the identical string for all four and the colour dot was the
// only thing telling them apart — on the surface whose whole job is picking a reading out
// of the column you meant. The label is computed against the set on screen, so what it
// keeps is whatever distinguishes THESE files from each other.
describe('distinguishingLabels', () => {
  it('elides what a set of recordings shares and keeps what tells them apart', () => {
    const out = distinguishingLabels([
      'mercury__altimetercloud-lilnuke4alt-1784__1784.csv',
      'mercury__altimetercloud-lilnuke4alt-1785__1785.csv',
      'mercury__altimetercloud-lilnuke4alt-1786__1786.csv',
    ]);
    expect(new Set(out).size, 'all three are distinct').toBe(3);
    for (const l of out) expect(l.length).toBeLessThan(20);
    expect(out[0]).toContain('1784');
    expect(out[1]).toContain('1785');
    // The shared head is gone, so the difference is near the front where a clamp can show it.
    for (const l of out) expect(l).not.toContain('altimetercloud');
  });

  it('leaves a mixed set alone, because nothing is shared to drop', () => {
    const names = [
      'blueraven__trf-lemiv-l3__BlRv_SN1537_LR.csv',
      'fwgps__trf-lemiv-l3__GPSTrk05305.csv',
      'altusmetrum__issuiuc-endurance__TeleMetrum.csv',
    ];
    expect(distinguishingLabels(names)).toEqual(names.map((n) => n.replace(/\.[^.]+$/, '')));
  });

  it('never elides down to a stub, and passes a single flight through', () => {
    // Two names differing only in the last character would leave one char after eliding;
    // the whole stem is better than something a flyer cannot match back to a file.
    const out = distinguishingLabels(['launchday-flight-a.csv', 'launchday-flight-b.csv']);
    for (const l of out) expect(l.length).toBeGreaterThan(3);
    expect(distinguishingLabels(['only-one.csv'])).toEqual(['only-one']);
    expect(distinguishingLabels([])).toEqual([]);
  });
});

// Two instruments on one airframe can disagree about WHETHER a charge fired, and a spread
// cannot express that. The three descent keys are deliberately separate, so when one
// recording resolves a drogue and a main and another reads a single descent, each key has
// one contributor, all three are skipped for "too few to corroborate", and the panel says
// nothing about the descent at all — on precisely the pair worth chasing.
describe('recoveryDisagreement', () => {
  // The same shaped fixture the rest of this file builds comparisons from.
  const f = (id: string, m: Partial<FlightMetrics>) =>
    ({ id, name: id, formatLabel: 'x', color: '#000', metrics: { ...metrics(1000), ...m } }) as unknown as CompareFlight;

  it('speaks up when the recordings disagree about whether a deployment happened', () => {
    const flights = [
      f('blueraven', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }),
      f('fwgps', { drogueDescentRate: 22.7, mainDescentRate: 6.2, wholeDescentRate: null }),
    ];
    const note = recoveryDisagreement(flights, []);
    expect(note, 'the difference is stated').toMatch(/differ in what Debrief could resolve/);
    expect(note).toMatch(/resolved a deployment/);
    expect(note).toMatch(/single, undivided descent/);
    // **And it must NOT tell the flyer their charges disagreed.** A whole-descent figure means
    // Debrief did not RESOLVE a deployment in that record, never that none happened — and the
    // corpus settles it on the pair this note exists for. On `iss-irec2023`, both recordings of one
    // flight fall at 34–35 m/s after apogee and both break to 10 m/s at t≈60 s and ≈7,72x m; only
    // one of them resolves it, because the other runs on to a landing whose at-rest tail drags the
    // terminal median under the `mainTerminal > 1` guard. The wording this replaced ("with no
    // deployment change in it", "whether a charge fired") asserted a fact about the ROCKET from a
    // limit of ours, on a flight where both traces show the same charge firing.
    expect(note, 'no claim about whether a charge fired').not.toMatch(/charge fired/);
    expect(note, 'no claim that the record held no deployment change').not.toMatch(/no deployment change/);
    expect(note, 'the limit is named as ours, not theirs').toMatch(/Debrief could not identify one/);
  });

  it('stays quiet when a descent row is already cross-checked', () => {
    const flights = [
      f('a', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }),
      f('b', { drogueDescentRate: 22.7, mainDescentRate: 6.2, wholeDescentRate: null }),
    ];
    // The panel is already saying something about the descent; a second voice on the same
    // point is noise.
    expect(recoveryDisagreement(flights, [{ key: 'mainDescentRate' } as never])).toBe('');
  });

  it('stays quiet when they agree about what happened', () => {
    const bothResolved = [
      f('a', { drogueDescentRate: 22.7, mainDescentRate: 6.2, wholeDescentRate: null }),
      f('b', { drogueDescentRate: 22.1, mainDescentRate: 6.5, wholeDescentRate: null }),
    ];
    expect(recoveryDisagreement(bothResolved, [])).toBe('');
    const bothWhole = [
      f('a', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }),
      f('b', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.4 }),
    ];
    expect(recoveryDisagreement(bothWhole, [])).toBe('');
  });

  // **A flight Debrief MADE UP is not a recording, and this sentence is entirely about what the
  // RECORDINGS did.** D10 slice 5h excluded made-up flights from `crossCheck` for exactly this
  // reason — a demonstration can neither agree with a recording nor disagree with one — and left
  // this sentence, in the same panel, reading the unfiltered list. The result was the strongest
  // form of the error the MEASUREMENT invariant names: a claim about the flyer's own recovery
  // system, counting a flight nothing recorded as evidence for it.
  const madeUp = (id: string, m: Partial<FlightMetrics>) =>
    ({ ...f(id, m), synthetic: true }) as unknown as CompareFlight;

  it('never counts a flight Debrief made up as a recording that resolved anything', () => {
    // The demonstration `lib/synthetic.ts` generates resolves both legs — a drogue at 7.5 m/s to
    // 150 m and a main at 4.2 — so it lands in `resolved` and is the one that makes this sentence
    // appear at all. Two real flights that AGREE, plus the demonstration: without the exclusion
    // the flyer is told their recordings differ about the recovery when they do not.
    const twoAgreeingRecordings = [
      f('pnut', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }),
      f('raven', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.4 }),
    ];
    expect(
      recoveryDisagreement([...twoAgreeingRecordings, madeUp('demo', { drogueDescentRate: 7.5, mainDescentRate: 4.2, wholeDescentRate: null })], []),
      'a demonstration cannot manufacture a disagreement between two recordings that agree',
    ).toBe('');

    // The other direction, on the set a demonstration is most often opened in: one recording and
    // one made-up flight. Excluding the demonstration leaves one recording, and one recording
    // cannot disagree with itself.
    expect(
      recoveryDisagreement(
        [f('pnut', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }), madeUp('demo', { drogueDescentRate: 7.5, mainDescentRate: 4.2, wholeDescentRate: null })],
        [],
      ),
      'one recording plus a demonstration is one recording',
    ).toBe('');
  });

  it('still speaks up about two REAL recordings when a made-up flight is in the same comparison', () => {
    // The half that stops the fix being a blanket silence — the same second direction slice 5h's
    // cross-check exclusion is asserted in. A demonstration sitting in the comparison must not
    // cost the real pair a note about their own recovery.
    const real = [
      f('blueraven', { drogueDescentRate: null, mainDescentRate: null, wholeDescentRate: 16.7 }),
      f('fwgps', { drogueDescentRate: 22.7, mainDescentRate: 6.2, wholeDescentRate: null }),
    ];
    const alone = recoveryDisagreement(real, []);
    expect(alone).toMatch(/differ in what Debrief could resolve/);
    // Byte-identical, so the demonstration contributes to neither count in the sentence.
    expect(
      recoveryDisagreement([...real, madeUp('demo', { drogueDescentRate: 7.5, mainDescentRate: 4.2, wholeDescentRate: null })], []),
      'the sentence a real pair gets is the sentence they get alone',
    ).toBe(alone);
  });
});

// Two recordings of one flight can resolve a main deploy and still not have measured the same
// thing: where one file stops while the rocket is under canopy, its "main descent rate" covers
// a shorter span than one that ran to the ground. Both corpus groups that cross-check a main
// leg are in exactly that state — iss-endurance pairs a StratoLogger that landed (13.4 m/s)
// with a TeleMetrum that stops in the air (15.2), and trf-lemiv-l3 pairs two landed recordings
// (8.1, 7.5) with a Quantum-FW that stops (9.4). The module already keeps a main leg and a
// whole descent on separate keys for the same reason; this is the half a shared key could
// still get wrong, and it was reported as plain corroboration.
describe('a cross-checked descent leg that stops before the ground', () => {
  const leg = (main: number, landed: boolean): CompareFlight =>
    ({
      metrics: {
        apogeeAltitude: 2000,
        drogueDescentRate: 22,
        mainDescentRate: main,
        descentSource: landed ? 'same-record' : null,
      } as FlightMetrics,
    }) as CompareFlight;

  it('flags the pair where one recording landed and the other did not', () => {
    const a = crossCheck([leg(13.4, true), leg(15.2, false)]);
    const main = a.find((x) => x.key === 'mainDescentRate')!;
    expect(main.count, 'the cross-check still runs — the readings are worth showing').toBe(2);
    expect(main.partialLeg).toBe(true);
    // It is neither of the flags that already existed: not a measured/derived method split,
    // and not a saturated sensor reading a floor.
    expect(main.mixedSource).toBe(false);
    expect(main.saturated).toBe(false);
  });

  it('leaves the pair unflagged when both recordings reached the ground', () => {
    const both = crossCheck([leg(13.4, true), leg(12.9, true)]);
    expect(both.find((x) => x.key === 'mainDescentRate')!.partialLeg).toBe(false);
  });

  it('flags a whole-descent leg the same way, and says so without naming a main', () => {
    // The flag is wired onto `wholeDescentRate` too — a booster and a sustainer can both read a
    // single descent with no deployment in it — so the footnote it triggers must not describe a
    // main leg, and the row it appears on may have no main at all.
    const whole = (rate: number, landed: boolean): CompareFlight =>
      ({
        metrics: {
          apogeeAltitude: 2000,
          mainDescentRate: null,
          wholeDescentRate: rate,
          descentSource: landed ? 'same-record' : null,
        } as FlightMetrics,
      }) as CompareFlight;
    const a = crossCheck([whole(11.0, true), whole(45.3, false)]);
    expect(a.find((x) => x.key === 'wholeDescentRate')!.partialLeg).toBe(true);
    expect(a.some((x) => x.key === 'mainDescentRate'), 'neither recording has a main leg').toBe(false);
  });

  it('still flags a pair where BOTH recordings stop in the air', () => {
    // `some`, not `mixed`: if neither reached the ground, neither figure is a landing rate and
    // the spread is still partly the two files' differing stopping points. The footnote is
    // worded so it claims no landed comparator that this set does not contain.
    const a = crossCheck([leg(14.4, false), leg(21.7, false)]);
    expect(a.find((x) => x.key === 'mainDescentRate')!.partialLeg).toBe(true);
  });

  // A regression pin, not evidence: the drogue spec carries no `partial` predicate at all, so
  // this would hold however `landedInRecord` behaved. What actually establishes the drogue claim
  // is the code — `drogueDescentRate` is only ever `legRate(apogeeIdx, mainIdx)` inside
  // `if (mainIdx !== null && cameDown)` (lib/analyze/index.ts), two indices into the record — so
  // the leg cannot run past the end of the file whether or not a landing was found. This test
  // exists to fail if someone later wires `partial` onto that row by symmetry with the main leg.
  it('leaves the drogue leg unflagged, and fails if a later pass wires the flag onto it', () => {
    const a = crossCheck([leg(13.4, true), leg(15.2, false)]);
    expect(a.find((x) => x.key === 'drogueDescentRate')!.partialLeg).toBe(false);
  });
});

describe('the palette and the cap are separate decisions', () => {
  it('caps a comparison by MAX_COMPARE, not by how many colours there are', () => {
    // These were one value. A seventh stroke would have raised the cap silently, and that is
    // the trap in front of D5's colour work: once the palette is the flyer's, its length stops
    // being a fact about the product. The palette is indexed modulo its own length, so a
    // comparison of MAX_COMPARE flights is well-defined whatever the palette holds.
    expect(MAX_COMPARE).toBe(6);
    const inputs = Array.from({ length: MAX_COMPARE + 2 }, (_, i) => input(`f${i}`, 2, 100 + i));
    const built = buildComparison(inputs);
    expect(built.flights).toHaveLength(MAX_COMPARE);
    // Every flight got a stroke, none of them undefined, even past the palette's length.
    expect(built.flights.every((f) => /^#[0-9a-f]{6}$/i.test(f.color))).toBe(true);
  });
});


/**
 * **A comparison had no provenance member at all**, so a flight Debrief made up could sit in a
 * column beside three real ones with nothing saying which was which — on the surface whose entire
 * job is putting flights next to each other.
 *
 * Named here rather than in `lib/synthetic.test.ts` because what is being checked is the
 * COMPARISON's shape: that `buildComparison` carries the fact through, and that it is absent by
 * default. The rendering of it is `components/CompareView.tsx`'s `metricsTable()`, which the
 * screen, the `.csv` and the clipboard all read from.
 */
describe('a made-up flight in a comparison is carried through as one', () => {
  const input = (id: string, synthetic?: boolean): CompareInput =>
    ({
      id,
      name: `${id}.csv`,
      formatLabel: 'Generic CSV',
      analysis: {
        series: { time: new Float64Array([0, 1, 2]), altitude: new Float64Array([0, 10, 0]), velocity: new Float64Array([0, 10, -10]), acceleration: new Float64Array([0, 0, 0]), airDensity: new Float64Array([1.2, 1.2, 1.2]), speedOfSoundProfile: new Float64Array([340, 340, 340]) },
        events: [],
        metrics: { apogeeAltitude: 10, maxVelocity: 10 },
        warnings: [],
      },
      ...(synthetic ? { synthetic: true } : {}),
    }) as unknown as CompareInput;

  it('carries the fact from the input onto the flight the surfaces read', () => {
    const c = buildComparison([input('real'), input('demo', true)]);
    expect(c.flights[0].synthetic, 'a recording is not marked').toBeUndefined();
    expect(c.flights[1].synthetic, 'a made-up flight is').toBe(true);
  });

  it('is ABSENT rather than false on a comparison of real flights', () => {
    // Absent means "a recording", which is what every comparison built before this member already
    // means — and what a surface branching on presence needs.
    const c = buildComparison([input('a'), input('b')]);
    expect(c.flights.every((f) => !('synthetic' in f)), 'nothing extra came along').toBe(true);
  });

  /**
   * **A cross-check is a claim about INDEPENDENT MEASUREMENTS agreeing, and a made-up flight is
   * not a measurement of anything.** The panel opens *"If these are recordings of the same flight,
   * the independent readings agree to within X%"* — over a set that included a demonstration, and
   * ABOVE the provenance row that says so, in the Markdown and the HTML as well as on screen.
   *
   * Excluded, exactly like the crown in `compareMetricRows` and the ★ in `lib/logbook.ts`. Two
   * real recordings still cross-check each other with a demonstration in the same comparison;
   * what changes is that one recording beside one made-up flight now yields nothing, which is
   * true.
   */
  describe('a made-up flight is not an independent measurement', () => {
    const withApogee = (id: string, apogee: number, synthetic?: boolean): CompareInput =>
      ({
        id,
        name: `${id}.csv`,
        formatLabel: 'Generic CSV',
        analysis: {
          series: { time: new Float64Array([0, 1, 2]), altitude: new Float64Array([0, apogee, 0]), velocity: new Float64Array([0, 10, -10]), acceleration: new Float64Array([0, 0, 0]), airDensity: new Float64Array([1.2, 1.2, 1.2]), speedOfSoundProfile: new Float64Array([340, 340, 340]) },
          events: [],
          metrics: { apogeeAltitude: apogee, maxVelocity: 10, timeToApogee: 1 },
          warnings: [],
        },
        ...(synthetic ? { synthetic: true } : {}),
      }) as unknown as CompareInput;

    it('yields NO agreement for one recording beside one made-up flight', () => {
      const c = buildComparison([withApogee('real', 1000), withApogee('demo', 1200, true)]);
      expect(crossCheck(c.flights), 'there is nothing to cross-check').toEqual([]);
    });

    it('still cross-checks two real recordings when a demonstration sits beside them', () => {
      // The exclusion must not cost a real pair its cross-check — the same second direction
      // `lib/logbookStar.test.ts` asserts about the star, and the reason `rankBlocked` was the
      // wrong tool for this job.
      const withDemo = buildComparison([withApogee('a', 1000), withApogee('b', 1040), withApogee('demo', 5000, true)]);
      const realOnly = buildComparison([withApogee('a', 1000), withApogee('b', 1040)]);
      const apo = crossCheck(withDemo.flights).find((x) => x.key === 'apogee')!;
      expect(apo.count, 'two contributors, not three').toBe(2);
      // …and byte-for-byte the spread the two real flights have on their own. A demonstration
      // 5× higher than both would wreck this number if it were contributing.
      expect(apo.spreadPct).toBeCloseTo(crossCheck(realOnly.flights).find((x) => x.key === 'apogee')!.spreadPct, 10);
      expect(apo.max).toBe(1040);
    });
  });
});
