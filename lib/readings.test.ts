import { describe, it, expect } from 'vitest';
import { metricTiles } from './readings';
import { headlineRows, type RecoveryFigures } from './report';
import type { FlightMetrics } from './analyze/types';

// A flight that has every reading Debrief can produce. Nothing here is a measurement —
// the figures are only plausible enough to keep the formatters honest; what matters is
// that no optional metric is null, so both lists are asked for everything they have.
const EVERYTHING: FlightMetrics = {
  apogeeAltitude: 2841,
  timeToApogee: 24.6,
  maxVelocity: 341,
  burnoutSource: 'measured' as const,
  burnoutAtVelocityPeak: false,
  maxVelocitySource: 'device',
  maxVelocityAltitude: 620,
  mach: 1.02,
  maxDynamicPressure: 71_300,
  maxDynamicPressureAltitude: 590,
  transonicTime: 3.9,
  transonicAltitude: 610,
  transonicUnconfirmed: false,
  maxAcceleration: 178,
  avgBoostAcceleration: 96,
  maxDeceleration: -64,
  accelerationSource: 'device',
  accelClipped: false,
  liftoffTWR: 11.4,
  burnTime: 3.4,
  burnoutAltitude: 640,
  burnoutVelocity: 338,
  coastTime: 21.2,
  coastEfficiency: 0.48,
  dragLossAltitude: 2_640,
  drogueDescentRate: 22.4,
  mainDescentRate: 6.1,
  descentTime: 186,
  flightTime: 211,
  groundTemperature: 24.5,
  batteryStartV: 9.2,
  batteryMinV: 8.4,
  peakRollRate: 720,
  rollRevolutions: 14.2,
  tiltAtBurnout: 7,
  mainDeployTime: 168,
  derivedVelocityFrom: null,
  wholeDescentRate: 12.8,
  descentSource: 'same-record',
  gpsApogeeAltitude: 2_795,
  gpsApogeeTime: 24.9,
  gpsAscentFixes: 24,
};

const RECOVERY: RecoveryFigures = {
  descendingMassKg: 4.2,
  mainDeploy: { setM: 213, actualM: 226 },
  ejectionDelay: { printedS: 10, coastS: 21.2 },
};

/**
 * Readings the saved report carries and the grid deliberately has no tile for.
 *
 * Every one of these is a sentence rather than a number — a verification ("fired at
 * 741 ft, set 700 ft — 41 ft high"), a claim with a caveat attached, or a figure that
 * only exists once the flyer has typed their own numbers in. A tile is a big number and
 * a three-word sub-line; these don't fit one, and cramming them into the grid would be a
 * worse page rather than a more consistent one. The screen shows the transonic crossing
 * and the deploy checks in their own places, in full sentences, for the same reason.
 *
 * This list is the deliberate half of the difference. Anything NOT on it that the report
 * has and the grid doesn't — or the other way round — is drift, and the tests below fail.
 */
const REPORT_ONLY = [
  'Time to apogee',
  'Supersonic',
  'Transonic',
  'Landing energy',
  'Main deploy check',
  'Ejection check',
];

describe('the screen and the saved report agree on which readings exist', () => {
  const gridLabels = metricTiles(EVERYTHING, 'imperial').map((t) => t.label);
  const reportLabels = headlineRows(EVERYTHING, 'imperial', RECOVERY).map(([l]) => l);

  it('puts every reading on the page into the report', () => {
    // The failure this guards: avg acceleration, thrust-to-weight, coast efficiency, the
    // roll pair and the battery low were all on screen and in no export, so a flyer who
    // read a number off the page and saved a write-up got a document without it.
    const missing = gridLabels.filter((l) => !reportLabels.includes(l));
    expect(missing, `on screen but in no saved report: ${missing.join(', ')}`).toEqual([]);
  });

  it('adds nothing to the report that the page does not show, beyond the documented rows', () => {
    const extra = reportLabels.filter((l) => !gridLabels.includes(l) && !REPORT_ONLY.includes(l));
    expect(extra, `in the report but on no tile: ${extra.join(', ')}`).toEqual([]);
  });

  it('keeps the documented exceptions live rather than stale', () => {
    // An allow-list nothing matches is an allow-list that has quietly stopped describing
    // the code — a renamed report row would then read as "deliberate" forever. Every
    // entry has to be a row this fixture really produces.
    for (const label of REPORT_ONLY.filter((l) => l !== 'Transonic')) {
      expect(reportLabels, `${label} is allow-listed but no longer a report row`).toContain(label);
    }
    // 'Transonic' is the same row as 'Supersonic' on a flight where only the barometer
    // saw the crossing, so it takes a second flight to reach it.
    const unconfirmed = headlineRows({ ...EVERYTHING, transonicUnconfirmed: true }, 'imperial').map(([l]) => l);
    expect(unconfirmed).toContain('Transonic');
    expect(unconfirmed).not.toContain('Supersonic');
  });

  it('names the sensor an unconfirmed crossing came from, not just "derived"', () => {
    // A barometer and a GPS both produce a derived speed and both fail to settle a Mach-1
    // crossing, but for different reasons — the shock over a static port, versus
    // differentiating a coarse, lagging altitude. Telling a GPS flyer their barometer is
    // the problem is a wrong explanation of a right caveat.
    const row = (from: 'baro' | 'gps') =>
      headlineRows({ ...EVERYTHING, transonicUnconfirmed: true, derivedVelocityFrom: from }, 'imperial').find(
        ([l]) => l === 'Transonic',
      )![1];
    expect(row('baro')).toMatch(/barometric speed/);
    expect(row('baro')).not.toMatch(/GPS/);
    expect(row('gps')).toMatch(/GPS-derived speed/);
    expect(row('gps')).toMatch(/runs the peak high/);
  });

  it('keeps both lists free of duplicate labels', () => {
    // Labels are the join between the two lists and the key the flyer's show/hide choice
    // is stored under, so a repeat would silently make one reading control another.
    expect(new Set(gridLabels).size).toBe(gridLabels.length);
    expect(new Set(reportLabels).size).toBe(reportLabels.length);
  });

  it('reads the same reading the same way in both', () => {
    // Not a formatting check — the two are formatted differently on purpose — but the
    // headline figure itself has to be the same number in both places.
    const tile = metricTiles(EVERYTHING, 'imperial').find((t) => t.label === 'Apogee')!;
    const rowValue = headlineRows(EVERYTHING, 'imperial').find(([l]) => l === 'Apogee')![1];
    expect(rowValue).toBe(tile.value);
  });

  it('drops the same readings from both when the flight lacks them', () => {
    // A GPS-only flight: no accelerometer, no burnout, no roll, no battery.
    const sparse: FlightMetrics = {
      ...EVERYTHING,
      maxAcceleration: NaN,
      avgBoostAcceleration: null,
      liftoffTWR: null,
      burnTime: null,
      burnoutAltitude: null,
      burnoutVelocity: null,
      coastTime: null,
      coastEfficiency: null,
      dragLossAltitude: null,
      maxDynamicPressure: null,
      maxDynamicPressureAltitude: null,
      transonicTime: null,
      transonicAltitude: null,
      batteryStartV: null,
      batteryMinV: null,
      peakRollRate: null,
      rollRevolutions: null,
      tiltAtBurnout: null,
      mainDeployTime: null,
      wholeDescentRate: null,
      descentSource: null,
      groundTemperature: null,
    };
    const tiles = metricTiles(sparse, 'metric').map((t) => t.label);
    const rows = headlineRows(sparse, 'metric').map(([l]) => l);
    expect(tiles).not.toContain('Max acceleration');
    expect(rows).not.toContain('Max acceleration');
    expect(tiles.filter((l) => !rows.includes(l))).toEqual([]);
    expect(rows.filter((l) => !tiles.includes(l) && !REPORT_ONLY.includes(l))).toEqual([]);
  });

  it('honours the flyer’s show/hide choice by the same label in both', () => {
    // One stored list of hidden labels drives the page and every export; if the label a
    // tile is keyed on differed from the report's, turning a reading off on screen would
    // leave it in the document.
    const hidden = ['Thrust-to-weight', 'Battery low'];
    const rows = headlineRows(EVERYTHING, 'imperial', RECOVERY, hidden).map(([l]) => l);
    expect(rows).not.toContain('Thrust-to-weight');
    expect(rows).not.toContain('Battery low');
    expect(rows).toContain('Apogee');
  });
});

describe('a burnout velocity that is the max velocity', () => {
  it('says so on the tile whenever it is the same sample, however burnout was located', () => {
    // Without a signed axial accelerometer, burnout is taken at the velocity peak — so the
    // burnout velocity IS the max velocity, the same number under a second label. Left bare
    // it reads as two measurements agreeing. Every AltimeterCloud file in the corpus is this
    // case: 156.91 m/s in both rows.
    const derived = metricTiles({ ...EVERYTHING, burnoutSource: 'derived', burnoutAtVelocityPeak: true, burnoutVelocity: 156.91, maxVelocity: 156.91 }, 'metric');
    const tile = derived.find((t) => t.label === 'Burnout velocity');
    expect(tile?.sub).toMatch(/same instant as max velocity/);

    // A genuine accelerometer crossing that lands somewhere else is two readings, and says
    // only how it was located.
    const measured = metricTiles({ ...EVERYTHING, burnoutSource: 'measured', burnoutAtVelocityPeak: false, burnoutVelocity: 150, maxVelocity: 156.91 }, 'metric');
    expect(measured.find((t) => t.label === 'Burnout velocity')?.sub).toBe('measured');

    // …but a MEASURED crossing can still land on the peak sample: the axial trace passes +1 g
    // at the speed peak and zero a little after it, so on a flight whose thrust tail is
    // shorter than one sample the two coincide. Two corpus AltusMetrum flights are this case,
    // and gating the note on `burnoutSource` alone left them printing 580.86 m/s twice with
    // nothing to say the two rows are one sample.
    const measuredAtPeak = metricTiles({ ...EVERYTHING, burnoutSource: 'measured', burnoutAtVelocityPeak: true, burnoutVelocity: 580.86, maxVelocity: 580.86 }, 'metric');
    expect(measuredAtPeak.find((t) => t.label === 'Burnout velocity')?.sub).toMatch(/same instant as max velocity/);
  });

  it('labels every reading taken at burnout, not just the speed', () => {
    // A burn time is only as measured as the burnout that ends it, and a burnout altitude
    // only as measured as the sample it is read from — so all three carry the provenance,
    // on the page and in the saved document alike. They shipped bare on every human surface
    // while `burnoutSource` went out in the JSON export, so the one reader who could tell a
    // measured burn time from an inferred one was a machine.
    for (const source of ['measured', 'derived'] as const) {
      const m = { ...EVERYTHING, burnoutSource: source, burnoutAtVelocityPeak: source === 'derived' };
      const tiles = metricTiles(m, 'metric');
      const rows = headlineRows(m, 'metric');
      for (const label of ['Burn time', 'Burnout altitude', 'Burnout velocity']) {
        expect(tiles.find((t) => t.label === label)?.sub, `${label} tile states how burnout was located`).toMatch(
          source === 'measured' ? /measured/ : /derived/,
        );
        expect(rows.find(([l]) => l === label)?.[1], `${label} report row states how burnout was located`).toMatch(
          source === 'measured' ? /measured/ : /derived/,
        );
      }
    }
  });

  it('carries the same qualifier into the saved report', () => {
    const rows = headlineRows({ ...EVERYTHING, burnoutSource: 'derived', burnoutAtVelocityPeak: true, burnoutVelocity: 156.91, maxVelocity: 156.91 }, 'metric');
    expect(rows.find(([l]) => l === 'Burnout velocity')?.[1]).toMatch(/same instant as max velocity/);
    const measured = headlineRows({ ...EVERYTHING, burnoutSource: 'measured', burnoutAtVelocityPeak: false, burnoutVelocity: 150 }, 'metric');
    expect(measured.find(([l]) => l === 'Burnout velocity')?.[1]).not.toMatch(/same instant/);
    const measuredAtPeak = headlineRows({ ...EVERYTHING, burnoutSource: 'measured', burnoutAtVelocityPeak: true, burnoutVelocity: 580.86, maxVelocity: 580.86 }, 'metric');
    expect(measuredAtPeak.find(([l]) => l === 'Burnout velocity')?.[1]).toMatch(/same instant as max velocity/);
  });
});
