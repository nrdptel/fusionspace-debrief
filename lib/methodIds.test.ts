import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { METHOD_IDS } from './methodIds';
import { metricTiles } from './readings';
import type { FlightMetrics } from './analyze/types';

// Two lists that must agree: the definitions the methods page renders, and the readings that
// cite them. A reading pointing at a block that isn't there is a link that goes nowhere —
// the "control that fails only when pressed" in link form, and the worst version of it,
// because it fails on the page whose whole job is explaining the number.
//
// The compiler already stops a typo (`MethodId` is a union of METHOD_IDS), so what's left is
// what a type can't see: an id in the list that the page never renders, and a reading with no
// definition at all.

const PAGE = readFileSync(new URL('../app/methods/page.tsx', import.meta.url), 'utf8');

/** Every metric the grid can emit, with everything present so no reading is skipped. */
function everyReading(): ReturnType<typeof metricTiles> {
  const m = {
    apogeeAltitude: 1000,
    apogeeIsFloor: false,
    timeToApogee: 12,
    maxVelocity: 300,
    maxVelocitySource: 'device',
    maxVelocityAltitude: 500,
    mach: 0.9,
    maxAcceleration: 100,
    accelerationSource: 'device',
    avgBoostAcceleration: 80,
    liftoffTWR: 12,
    burnTime: 2.5,
    burnoutAltitude: 300,
    burnoutVelocity: 250,
    burnoutSource: 'measured',
    coastTime: 9,
    coastEfficiency: 0.8,
    coastShortfall: 120,
    maxDynamicPressure: 50_000,
    maxQAltitude: 400,
    drogueDescentRate: 20,
    mainDescentRate: 6,
    wholeDescentRate: 8,
    descentSource: 'main',
    descentTime: 60,
    flightTime: 72,
    groundTemperature: 15,
    batteryMinV: 7.4,
    batteryRestV: 8.4,
    peakRollRate: 900,
    rollRevolutions: 4,
    tiltAtBurnout: 6,
  } as unknown as FlightMetrics;
  return metricTiles(m, 'imperial');
}

describe('readings and the methods page', () => {
  it('renders a block for every id in the canonical list', () => {
    const missing = METHOD_IDS.filter((id) => !PAGE.includes(`<Method id="${id}"`));
    expect(missing, `ids with no block on the page: ${missing.join(', ')}`).toEqual([]);
  });

  it('puts the id on the heading, not only in the prop', () => {
    // Declaring an id and never rendering it is the failure this pair could otherwise miss:
    // every link would still be built, and every one would scroll to the top of the page and
    // look like it had worked.
    expect(PAGE, 'Method should render <h2 id={id}>').toMatch(/<h2\s+id=\{id\}/);
  });

  it('gives every reading a definition to point at', () => {
    const tiles = everyReading();
    // 21 is every reading `metricTiles` can emit. Pinned exactly: a fixture that quietly
    // stopped producing one would make the check below pass by covering less.
    expect(tiles.length, `the fixture must exercise every reading; got: ${tiles.map((t) => t.label).join(', ')}`).toBe(21);
    const unexplained = tiles.filter((t) => !t.method).map((t) => t.label);
    expect(unexplained, `readings with nowhere to send a flyer: ${unexplained.join(', ')}`).toEqual([]);
  });

  it('cites only definitions that exist', () => {
    const ids = new Set<string>(METHOD_IDS);
    const dangling = everyReading()
      .filter((t) => t.method && !ids.has(t.method))
      .map((t) => `${t.label} → ${t.method}`);
    expect(dangling, `readings citing a block that isn't there: ${dangling.join(', ')}`).toEqual([]);
  });
});
