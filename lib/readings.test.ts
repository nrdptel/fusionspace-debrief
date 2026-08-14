import { describe, it, expect } from 'vitest';
import { ACCEL_TAG_CLIPPED, accelIsClipped, AVG_ACCEL_CLIPPED, descentStoppedAloft, metricTiles, stageTiles, STAGE_READINGS } from './readings';
import { headlineRows, type RecoveryFigures } from './report';
import { maxQProvenance, velocityProvenance } from './readings';
import type { FlightMetrics } from './analyze/types';

// A flight that has every reading Debrief can produce. Nothing here is a measurement —
// the figures are only plausible enough to keep the formatters honest; what matters is
// that no optional metric is null, so both lists are asked for everything they have.
const EVERYTHING: FlightMetrics = {
  apogeeIsFloor: false,
  altitudeUnproven: false,
  apogeeAltitude: 2841,
  timeToApogee: 24.6,
  maxVelocity: 341,
  burnoutSource: 'measured' as const,
  burnoutAtVelocityPeak: false,
  maxVelocityWithheld: null,
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

  // The labels agreeing is half of it. The QUALIFIER has to travel too — `lib/report.ts` says so
  // in its own comment ("the document a flyer files has to carry the qualifier the screen shows,
  // or the number that leaves the app is the one without it") and carried it for the apogee floor
  // while the peak speed left bare, because `velocityProvenance` was module-private and there was
  // nothing to call. A flyer filing a cert document got a speed with no sign it had been
  // differentiated out of an altitude — on the one reading whose derived form the corpus measures
  // as reading HIGH by up to 110%.
  it('carries the peak speed’s provenance into the saved report, not just onto the tile', () => {
    for (const [name, m] of [
      ['measured', { ...EVERYTHING, maxVelocitySource: 'device' as const }],
      ['derived', { ...EVERYTHING, maxVelocitySource: 'baro' as const }],
    ] as const) {
      const tile = metricTiles(m, 'imperial').find((t) => t.label === 'Max velocity');
      const row = headlineRows(m, 'imperial').find(([l]) => l === 'Max velocity');
      expect(tile, `${name}: the tile exists`).toBeTruthy();
      expect(row, `${name}: the report row exists`).toBeTruthy();
      const want = velocityProvenance(m);
      expect(row![1], `${name}: the saved row must carry the provenance — got "${row![1]}"`).toContain(want);
      // …and it must be the SAME words the tile uses, from the same function, so the two can
      // never drift into describing one reading two ways.
      expect(tile!.sub ?? '', `${name}: the tile must say the same — got "${tile!.sub}"`).toContain(want);
    }
  });

  // **Max Q is the same failure one reading over, and it is the worse one.** `q = ½ρv²` is
  // QUADRATIC in the peak speed, so a derived speed that "usually reads high" carries that
  // tendency through roughly doubled — and the max-Q tile said only "at 1,204 m" while the speed
  // tile beside it, and the Mach that rides inside that same sub-line, both carried the caveat.
  // A max Q is a structures number; an unqualified one on a derived speed is exactly the overclaim
  // the safety invariant exists to stop.
  it('carries a derived speed’s provenance onto max Q, which is squared in it', () => {
    const derived = { ...EVERYTHING, maxVelocitySource: 'baro' as const };
    const measured = { ...EVERYTHING, maxVelocitySource: 'device' as const };

    const tileOf = (m: FlightMetrics) => metricTiles(m, 'imperial').find((t) => t.label === 'Max Q');
    const rowOf = (m: FlightMetrics) => headlineRows(m, 'imperial', RECOVERY).find(([l]) => l === 'Max Q');
    expect(tileOf(derived), 'the max Q tile exists').toBeTruthy();

    const want = maxQProvenance(derived);
    expect(want, 'a derived speed produces a caveat').toBeTruthy();
    // It names the MECHANISM, not just the word "derived" — the square is why this reading needs
    // its own sentence rather than borrowing the speed's.
    expect(want!).toContain('derived');
    expect(want!).toContain('q = ½ρv²');

    expect(tileOf(derived)!.sub ?? '', 'the tile says it').toContain(want!);
    // …and it reaches the saved report, which is the whole reason `velocityProvenance` was
    // exported: the document a flyer files has to carry the qualifier the screen shows.
    expect(rowOf(derived), 'the report row exists').toBeTruthy();
    expect(rowOf(derived)![1], 'the saved row says it too').toContain(want!);

    // A MEASURED speed gets no clause at all — the caveat is about the method, and inventing one
    // where there is nothing to warn about teaches a flyer to skip the ones that matter.
    expect(maxQProvenance(measured)).toBeNull();
    expect(tileOf(measured)!.sub ?? '', 'a measured speed adds nothing').not.toContain('derived');
    // The altitude the peak happened at survives either way.
    expect(tileOf(measured)!.sub ?? '').toMatch(/^at /);
    expect(tileOf(derived)!.sub ?? '').toMatch(/^at /);
  });

  // "derived" alone is the vague caveat the safety invariant rejects: it has to name the
  // DIRECTION, because a flyer told their peak is soft will read it as a floor when the corpus
  // says it is a ceiling.
  it('says which WAY a derived peak is wrong, not merely that it is derived', () => {
    // BOTH forms — the share card has room only for the short one, and it is the surface where an
    // unqualified figure did the most damage, so it is the one that must not lose the direction.
    for (const form of ['full', 'short'] as const) {
      const derived = velocityProvenance({ ...EVERYTHING, maxVelocitySource: 'baro' }, form);
      expect(derived, `${form}: names the method`).toContain('derived');
      expect(derived, `${form}: names the DIRECTION`).toMatch(/high/i);
      expect(velocityProvenance({ ...EVERYTHING, maxVelocitySource: 'device' }, form)).toBe('measured');
    }
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

  it('qualifies the apogee in both places, or in neither', () => {
    // The apogee is the number a flyer copies into a cert form, and on a record that stops
    // at its own peak it is a lower bound rather than the height reached. The grid carries
    // that as a sub-line and the report inside the row's value, which is why the assert
    // above compares them exactly — so this one holds the qualifier itself, in both places,
    // rather than letting the saved document quietly drop it.
    const floor: FlightMetrics = { ...EVERYTHING, apogeeIsFloor: true };
    const tile = metricTiles(floor, 'imperial').find((t) => t.label === 'Apogee')!;
    const row = headlineRows(floor, 'imperial').find(([l]) => l === 'Apogee')![1];
    expect(tile.sub, 'the grid says the number is a floor').toMatch(/at least this high/);
    expect(row, 'and so does the saved report').toMatch(/at least this high/);
    expect(row.startsWith(tile.value), 'both still lead with the same figure').toBe(true);

    // …and a flight whose record covers its apogee says nothing of the kind.
    const normal = metricTiles(EVERYTHING, 'imperial').find((t) => t.label === 'Apogee')!;
    expect(normal.sub ?? '').not.toMatch(/at least this high/);
    expect(headlineRows(EVERYTHING, 'imperial').find(([l]) => l === 'Apogee')![1]).not.toMatch(/at least this high/);
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

describe('a descent rate read off a record that never reached the ground', () => {
  // `descentSource: null` is how the analysis says it never found a landing. The whole-descent
  // tile has carried that caveat since the landing-energy card was written; the MAIN-leg tile
  // did not, and a resolved main deploy is no guarantee of a landing — the file can simply
  // stop while the rocket is still under canopy. 3 of the 37 corpus flights the suite analyses
  // end to end are exactly that, the loudest an AltusMetrum TeleMetrum publishing 50 ft/s for
  // its main, which reads as a main that failed rather than as a record that ends early.
  const stoppedAloft = { ...EVERYTHING, descentSource: null, wholeDescentRate: null, flightTime: null, descentTime: null };

  it('says so on the main-descent tile, not only on the whole-descent one', () => {
    const tile = metricTiles(stoppedAloft, 'metric').find((t) => t.label === 'Main descent');
    expect(tile?.value, 'the rate is still shown — it is a real reading of the leg that was recorded').toBeTruthy();
    expect(tile?.sub).toMatch(/record stops before the ground/);
    expect(tile?.sub).toMatch(/not a landing speed/);
  });

  it('carries the same caveat into the saved report', () => {
    const row = headlineRows(stoppedAloft, 'metric').find(([l]) => l === 'Main descent');
    expect(row?.[1]).toMatch(/record stops before the ground/);
  });

  it('explains the withheld landing energy by the missing ground, not by a missing rate', () => {
    // The landing-energy card has two "nothing to show" messages and only one of them is
    // true here. Deciding on `wholeDescentRate` alone sent a flight that HAD resolved a main
    // to the wrong one — "no landing descent rate was read from this log (it may end at or
    // before apogee)" over a log with a main leg in it that flew well past apogee.
    expect(descentStoppedAloft(stoppedAloft), 'a resolved main that stops in the air').toBe(true);
    expect(
      descentStoppedAloft({ ...stoppedAloft, mainDescentRate: null, wholeDescentRate: 12.8 }),
      'the whole-descent case it always caught',
    ).toBe(true);
    expect(descentStoppedAloft(EVERYTHING), 'a flight that landed is not this').toBe(false);
    expect(
      descentStoppedAloft({ ...stoppedAloft, mainDescentRate: null }),
      'a log ending at or before apogee has no rate at all, and is the OTHER message',
    ).toBe(false);
  });

  it('leaves the reading bare on a flight that did reach the ground', () => {
    // The caveat has to be about the missing ground, not decoration on every main descent.
    expect(metricTiles(EVERYTHING, 'metric').find((t) => t.label === 'Main descent')?.sub).toBeUndefined();
    expect(headlineRows(EVERYTHING, 'metric').find(([l]) => l === 'Main descent')?.[1]).not.toMatch(/stops before the ground/);
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

describe('a stage panel shows one recording’s own readings and cannot invent one', () => {
  it('is a strict subset of the single-flight grid, formatted identically', () => {
    // The reason this is a filter over `metricTiles` and not a second list. Two lists describing
    // one flight is the exact failure the file header records — six readings were on screen and in
    // no saved report because the only way to compare them was to read both. A per-stage panel
    // that rebuilt its own tiles could drift the same way, and worse: it would be the surface
    // where a qualifier matters most, because a booster and a sustainer disagree by design.
    const grid = metricTiles(EVERYTHING, 'imperial');
    for (const t of stageTiles(EVERYTHING, 'imperial')) {
      const same = grid.find((g) => g.label === t.label);
      expect(same, `${t.label} exists in the single-flight grid`).toBeTruthy();
      expect(t.value, `${t.label} is formatted the same on both surfaces`).toBe(same!.value);
      expect(t.sub, `${t.label} carries the same qualifier on both surfaces`).toBe(same!.sub);
    }
  });

  it('names only readings that exist, so a renamed one drops out rather than blanking', () => {
    // `STAGE_READINGS` is a list of labels, and a label is a string: the one way this can go wrong
    // is a reading being renamed in `metricTiles` while this list keeps the old name, which would
    // empty the panel silently. Held side by side here, the same way the grid and the report are.
    const labels = metricTiles(EVERYTHING, 'imperial').map((t) => t.label);
    const unknown = STAGE_READINGS.filter((l) => !labels.includes(l));
    expect(unknown, `named in STAGE_READINGS and produced by no reading: ${unknown.join(', ')}`).toEqual([]);
  });

  it('drops a reading the recording does not carry rather than printing a blank', () => {
    // A GPS-only booster has no acceleration channel, so no thrust-to-weight and no burn. §6: "a
    // withheld value says why, and what would restore it" — and a tile that is simply ABSENT
    // explains nothing, so the panel says the board did not record it rather than showing an empty
    // cell. What must never happen is a tile with no value in it.
    const baroOnly: FlightMetrics = {
      ...EVERYTHING,
      maxAcceleration: NaN,
      liftoffTWR: null,
      burnTime: null,
      burnoutAltitude: null,
      burnoutVelocity: null,
    };
    const tiles = stageTiles(baroOnly, 'metric');
    expect(tiles.map((t) => t.label)).toEqual(['Apogee', 'Max velocity']);
    for (const t of tiles) expect(t.value, `${t.label} has a value`).toBeTruthy();
  });

  it('leaves the single-flight grid untouched', () => {
    // The milestone's own "and a single-stage flight is unchanged". `stageTiles` reads
    // `metricTiles` and adds nothing to it, so this is the assertion that the reading list a
    // flyer sees on `/` did not move when the composite gained a panel.
    expect(metricTiles(EVERYTHING, 'imperial').map((t) => t.label)).toEqual([
      'Apogee',
      'Max velocity',
      'Max acceleration',
      'Avg acceleration',
      'Thrust-to-weight',
      'Burn time',
      'Burnout altitude',
      'Burnout velocity',
      'Coast to apogee',
      'Coast efficiency',
      'Max Q',
      'Drogue descent',
      'Descent rate',
      'Main descent',
      'Descent time',
      'Flight time',
      'Ground temp',
      'Battery low',
      'Peak roll rate',
      'Revolutions',
      'Tilt at burnout',
    ]);
  });
});

/**
 * The Sev-1 found 2026-08-09 and its fix: a burnout SPEED took its provenance from how the
 * INSTANT was located, so a barometric derivative was published as `measured` three rows under
 * the identical figure labelled `derived`. Two corpus recordings do this.
 *
 * `EVERYTHING` carries `maxVelocitySource: 'device'`, which is why every existing assertion above
 * passed throughout: the whole defect lives on the baro path, and nothing exercised it.
 */
describe('a burnout speed says what the SPEED is, not how the instant was found', () => {
  /** A flight whose velocity is differentiated from the altitude — the case the corpus hits. */
  const BARO = { ...EVERYTHING, maxVelocitySource: 'baro' as const };

  it('never calls a differentiated altitude "measured", however clean the crossing', () => {
    // The defect verbatim: a signed axial crossing located the instant, so `burnoutSource` is
    // 'measured' — but the number at that instant came off a baro derivative.
    const m = { ...BARO, burnoutSource: 'measured' as const, burnoutAtVelocityPeak: false, burnoutVelocity: 121.2 };
    const sub = metricTiles(m, 'metric').find((t) => t.label === 'Burnout velocity')?.sub;
    expect(sub, 'the old bug was this reading bare-labelled "measured"').not.toBe('measured');
    expect(sub).toMatch(/derived/);
    // …and it is explicit about WHERE the derivation came from, so the row is readable alone.
    expect(sub).toMatch(/altitude/);
  });

  it('does not borrow the peak\u2019s tendency for a sample that is not the peak', () => {
    // "usually reads high" was measured ON THE PEAK — five of six corpus pairs. Quoting it on a
    // different sample would be stating one basis under another's name, which is the mistake
    // this repo has made before with speed and Mach percentages.
    const m = { ...BARO, burnoutSource: 'measured' as const, burnoutAtVelocityPeak: false, burnoutVelocity: 121.2 };
    expect(metricTiles(m, 'metric').find((t) => t.label === 'Burnout velocity')?.sub).not.toMatch(/reads high/);
  });

  it('does carry the peak\u2019s own caveat where burnout IS the peak, because it is one sample', () => {
    const m = { ...BARO, burnoutSource: 'derived' as const, burnoutAtVelocityPeak: true, burnoutVelocity: 156.91, maxVelocity: 156.91 };
    const sub = metricTiles(m, 'metric').find((t) => t.label === 'Burnout velocity')?.sub;
    expect(sub).toMatch(/reads high/);
    expect(sub, 'and still says the two rows are one sample').toMatch(/same instant as max velocity/);
  });

  it('leaves a device-measured speed exactly as it was', () => {
    // The regression guard for the other half: a logger that recorded its own velocity measured
    // this sample like any other, and the row must go on saying how the instant was found.
    const m = { ...EVERYTHING, burnoutSource: 'measured' as const, burnoutAtVelocityPeak: false };
    expect(metricTiles(m, 'metric').find((t) => t.label === 'Burnout velocity')?.sub).toBe('measured');
  });

  it('says the same thing on the tile and in the saved document', () => {
    // The failure this whole class belongs to is a caveat landing on one surface and a confident
    // claim on another, so the two are compared directly rather than each pinned alone.
    for (const m of [
      { ...BARO, burnoutSource: 'measured' as const, burnoutAtVelocityPeak: false },
      { ...BARO, burnoutSource: 'derived' as const, burnoutAtVelocityPeak: true },
      { ...EVERYTHING, burnoutSource: 'measured' as const, burnoutAtVelocityPeak: false },
    ]) {
      const sub = metricTiles(m, 'metric').find((t) => t.label === 'Burnout velocity')?.sub;
      const row = headlineRows(m, 'metric').find(([l]) => l === 'Burnout velocity')?.[1];
      expect(sub, 'the tile has a provenance at all').toBeTruthy();
      expect(row, `the report row repeats the tile's exact words: ${sub}`).toContain(sub as string);
    }
  });
});

/**
 * A railed accelerometer qualifies BOTH readings taken off it, on every surface.
 *
 * The peak has carried "may be clipped" on the grid since the detector was written. The average
 * over the boost carried nothing anywhere, and the peak's own row in the saved document carried
 * nothing either — so a cert write-up quoted a railed maximum as flat fact and a railed average
 * beside it, while the grid three clicks away qualified one of the two.
 *
 * **The average's error has a KNOWN DIRECTION and that is why it gets its own words.** Clipping
 * removes only the samples above the rail, so the mean it drags down can only be dragged down:
 * the figure is a floor. Measured on `public/samples/sample-saturated.csv`, whose velocity column
 * is integrated from the unclipped curve and so cannot be biased by the rail — Δv/Δt across the
 * detected burn gives a true boost mean of 15.9 g against the 12.9 g reported, 19% low.
 */
describe('a railed accelerometer qualifies both readings taken off it', () => {
  const CLIPPED = { ...EVERYTHING, accelClipped: true };

  it('marks the average as a floor on the grid, and says why', () => {
    const sub = metricTiles(CLIPPED, 'metric').find((t) => t.label === 'Avg acceleration')?.sub;
    expect(sub, 'the average names the direction of its error').toContain(AVG_ACCEL_CLIPPED);
    // Falsified against the same fixture unclipped: the words appear for the clip and not
    // merely for the reading, which is the half a one-sided assertion cannot tell apart.
    expect(metricTiles(EVERYTHING, 'metric').find((t) => t.label === 'Avg acceleration')?.sub).toBe(
      'over the boost',
    );
  });

  it('carries both tags into the saved document, which had neither', () => {
    const rows = headlineRows(CLIPPED, 'metric');
    const peak = rows.find(([l]) => l === 'Max acceleration')?.[1];
    const avg = rows.find(([l]) => l === 'Avg acceleration')?.[1];
    expect(peak, 'the document tags the railed peak').toContain(ACCEL_TAG_CLIPPED.trim());
    expect(avg, 'and says the average is a floor').toContain(AVG_ACCEL_CLIPPED);

    // Unclipped, the document says neither — so this pins the caveat rather than the row.
    const plain = headlineRows(EVERYTHING, 'metric');
    expect(plain.find(([l]) => l === 'Max acceleration')?.[1]).not.toContain(ACCEL_TAG_CLIPPED.trim());
    expect(plain.find(([l]) => l === 'Avg acceleration')?.[1]).toMatch(/ over the boost$/);
    expect(plain.find(([l]) => l === 'Avg acceleration')?.[1]).not.toContain(AVG_ACCEL_CLIPPED);
  });

  it('says the same thing on the grid and in the document, word for word', () => {
    const sub = metricTiles(CLIPPED, 'metric').find((t) => t.label === 'Avg acceleration')?.sub;
    const row = headlineRows(CLIPPED, 'metric').find(([l]) => l === 'Avg acceleration')?.[1];
    expect(row, `the document repeats the tile's exact words: ${sub}`).toContain(sub as string);
  });

  it('needs a peak for there to be anything to qualify', () => {
    // `accelClipped` without a finite maximum is a flag about a channel that produced no
    // reading. The predicate carries the guard the comparison's cell tag already had, so the
    // three surfaces cannot drift on the edge case.
    expect(accelIsClipped({ accelClipped: true, maxAcceleration: NaN })).toBe(false);
    expect(accelIsClipped({ accelClipped: true, maxAcceleration: 178 })).toBe(true);
    expect(accelIsClipped({ accelClipped: false, maxAcceleration: 178 })).toBe(false);
  });
});
