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
    bad.analysis = { ...bad.analysis, series: { ...bad.analysis.series, velocityImplausible: true } };
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
    const split = statedDaySplit([
      flight('a.csv', '2021-10-30T20:07'),
      flight('b.csv', '2024-05-11T14:09'),
      flight('c.csv'),
    ])!;
    expect(undatedNote(split, 3)).toMatch(/other file states no date/);
    expect(undatedNote(split, 4)).toMatch(/other 2 files state no date/);
  });

  it('says nothing at all when every compared file is dated', () => {
    const split = statedDaySplit([flight('a.csv', '2021-10-30T20:07'), flight('b.csv', '2024-05-11T14:09')])!;
    expect(undatedNote(split, 2)).toBe('');
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
    expect(note, 'the disagreement is stated').toMatch(/disagree about the recovery/);
    expect(note).toMatch(/resolved a deployment/);
    expect(note).toMatch(/single descent/);
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
