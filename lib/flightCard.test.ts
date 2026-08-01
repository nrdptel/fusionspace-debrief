import { describe, it, expect } from 'vitest';
import { flightCardStats } from './flightCard';
import { metricTiles } from './readings';
import type { FlightMetrics } from './analyze/types';

const base: FlightMetrics = {
  apogeeIsFloor: false,
  apogeeAltitude: 1000,
  timeToApogee: 8,
  maxVelocity: 200,
  burnoutSource: 'measured' as const,
  burnoutAtVelocityPeak: false,
  maxVelocityWithheld: null,
  maxVelocitySource: 'device',
  maxVelocityAltitude: 400,
  mach: 0.6,
  maxDynamicPressure: 50000,
  maxDynamicPressureAltitude: 300,
  transonicTime: null,
  transonicAltitude: null,
  transonicUnconfirmed: false,
  maxAcceleration: 120,
  avgBoostAcceleration: 70,
  maxDeceleration: -20,
  accelerationSource: 'device',
  accelClipped: false,
  liftoffTWR: null,
  burnTime: 1.6,
  burnoutAltitude: 200,
  burnoutVelocity: 190,
  coastTime: 6,
  coastEfficiency: 0.7,
  dragLossAltitude: 200,
  drogueDescentRate: 20,
  mainDescentRate: 6,
  descentTime: 40,
  flightTime: 48,
  groundTemperature: 15,
  batteryStartV: 9.2,
  batteryMinV: 8.9,
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
};

describe('flightCardStats', () => {
  it('says an apogee is a floor, on the artefact most likely to be posted', () => {
    // The card already qualifies a derived speed and a clipped acceleration. Apogee was the one
    // headline that went out bare — and this is the surface built to be pasted into a club chat,
    // so it is the worst place to print a lower bound as though it were the number. Two corpus
    // records reach this state: issuiuc-intrepid1 (996.2 m) and intrepid2 (1,081.6 m).
    const normal = flightCardStats(base, 'metric');
    expect(normal[0].label).toBe('Apogee');
    expect(normal[0].sub).toBeUndefined();

    const floor = flightCardStats({ ...base, apogeeIsFloor: true }, 'metric');
    expect(floor[0].label).toBe('Apogee');
    expect(floor[0].sub, 'a floor apogee has to say so on the card').toBe('at least this high');
    // The value itself is unchanged — the caveat is added, the reading is not altered.
    expect(floor[0].value).toBe(normal[0].value);
  });

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
    // No Mach where Mach is unknown — but the provenance stands on its own, because the
    // card leaves the device and a bare speed on it reads as a measurement either way.
    expect(flightCardStats(gps, 'imperial')[1].sub).toBe('measured');
  });

  it('honours the flyer’s show/hide choice, by the label the chooser actually stores', () => {
    // The card ignored the chooser entirely: hiding every reading in the grid and in every
    // report still left all four stats on the shareable image — the one artifact that
    // leaves the device kept printing what the flyer had turned off everywhere else.
    expect(flightCardStats(base, 'metric', []).map((s) => s.label)).toEqual([
      'Apogee',
      'Max velocity',
      'Max accel',
      'Flight time',
    ]);

    // The trap is the label. The card prints "Max accel" because four stats share its
    // width, while the chooser stores the grid's "Max acceleration" — so filtering on what
    // the card DRAWS would silently miss it. It filters on the canonical reading instead.
    const hidden = ['Max acceleration', 'Flight time'];
    expect(flightCardStats(base, 'metric', hidden).map((s) => s.label)).toEqual(['Apogee', 'Max velocity']);

    // Every card stat names a reading the grid also names, or the two can never agree
    // about what "hidden" means.
    const gridLabels = metricTiles(base, 'metric').map((t) => t.label);
    for (const s of flightCardStats(base, 'metric')) {
      expect(gridLabels, `the card's "${s.label}" maps to a reading the grid knows`).toContain(s.reading);
    }
  });

  it('never puts an unqualified speed or acceleration on a card that leaves the device', () => {
    // The card is share-only: it exists to be posted to a club chat or a forum. Nine corpus
    // flights used to put a SUPERSONIC claim on one with nothing beside it, every one of
    // them differentiated out of an altitude rather than measured — the loudest reading
    // Mach 2.64 where the flight's own device summary, a second altimeter, a GPS and an L3
    // cert PDF all say Mach 1.3. The grid tile said "derived" the whole time.
    const derived: FlightMetrics = { ...base, maxVelocitySource: 'baro', accelerationSource: 'baro', mach: 2.64 };
    const stats = flightCardStats(derived, 'metric');
    // "derived" alone let a reader take the figure as a floor. The card carries the DIRECTION now,
    // in the short form the image has room for — same claim as the tile and the saved report, and
    // `lib/readings.test.ts` holds all three to naming it.
    expect(stats.find((s) => s.label === 'Max velocity')?.sub).toBe('Mach 2.64 · derived (usually reads high)');
    expect(stats.find((s) => s.label === 'Max accel')?.sub).toBe('derived');

    const measured = flightCardStats(base, 'metric');
    expect(measured.find((s) => s.label === 'Max velocity')?.sub).toBe('Mach 0.6 · measured');
    expect(measured.find((s) => s.label === 'Max accel')?.sub).toBe('measured');

    // A railed accelerometer reports a floor, not the truth, and the card says so too.
    const clipped = flightCardStats({ ...base, accelClipped: true }, 'metric');
    expect(clipped.find((s) => s.label === 'Max accel')?.sub).toBe('measured · may be clipped');

    // Whatever the log, no headline figure on the card is ever bare.
    for (const m of [base, derived, { ...base, accelClipped: true }]) {
      for (const s of flightCardStats(m, 'metric')) {
        if (s.label === 'Max velocity' || s.label === 'Max accel') {
          expect(s.sub, `${s.label} states its provenance`).toMatch(/measured|derived/);
        }
      }
    }
  });

  it('drops flight time when the log ends at apogee', () => {
    const truncated: FlightMetrics = { ...base, flightTime: null };
    expect(flightCardStats(truncated, 'metric').some((s) => s.label === 'Flight time')).toBe(false);
  });
});
