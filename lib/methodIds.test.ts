import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { METHOD_IDS, METHOD_GROUPS } from './methodIds';
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
    //
    // `h3` since 2026-08-08, not `h2`, and the change is the point rather than an adjustment
    // to keep this green: the page's 51 blocks were 51 sibling `h2`s with nothing above them,
    // so a reader had no level to scan. The group `<section>`s own `h2` now and the blocks sit
    // under them — owner note ON-1.
    expect(PAGE, 'Method should render <h3 id={id}>').toMatch(/<h3\s+id=\{id\}/);
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

/**
 * The grouping is exhaustive by TEST, not by care.
 *
 * `METHOD_IDS` reached 51 entries as a flat list because nothing ever objected to one more
 * being appended — which is the mechanism behind `OWNER-NOTES.md` `ON-1`. A grouping maintained
 * by good intentions decays the same way: the next block gets written, the author forgets to
 * place it, and it renders under whichever heading happens to be last. These fail the build
 * instead.
 */
describe('the methods page has a structure, and every block is in it', () => {
  const placed = METHOD_GROUPS.flatMap((g) => g.ids);

  it('places every block in exactly one group', () => {
    const counts = new Map<string, number>();
    for (const id of placed) counts.set(id, (counts.get(id) ?? 0) + 1);

    const missing = METHOD_IDS.filter((id) => !counts.has(id));
    expect(missing, `blocks in METHOD_IDS with no group — add each to METHOD_GROUPS:\n${missing.join('\n')}`).toEqual([]);

    const twice = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    expect(twice, `blocks placed in more than one group:\n${twice.join('\n')}`).toEqual([]);

    // There is deliberately NO check here for an id in a group that is not in METHOD_IDS.
    // `METHOD_GROUPS` is typed `ids: readonly MethodId[]`, so a made-up id is a compile error
    // that `prebuild`'s `tsc --noEmit` catches before vitest is reached — the assertion could
    // never fire, and a dead assertion in a suite whose whole claim is "exhaustive by test,
    // not by care" is worse than none. Falsified by adding `'nope'` to a group: the type-check
    // errors and this file never runs.

    // The two totals agreeing is the claim; the checks above say WHICH when it breaks.
    expect(placed).toHaveLength(METHOD_IDS.length);
  });

  it('renders each group as its own section, in the order it declares', () => {
    // The grouping is worth nothing if the page does not follow it. Read off the page source
    // rather than the data, because the data is what a session edits and the page is what a
    // flyer reads — this is the pair that can drift.
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const rendered = [...PAGE.matchAll(/<section id="([^"]+)" className="mt-12 scroll-mt-12">/g)].map((m) => m[1]);
    expect(rendered, 'every group has a section on the page, in order').toEqual(
      METHOD_GROUPS.map((g) => slug(g.title)),
    );

    // And the blocks appear in the order their group places them, so the contents list and
    // the page agree about what follows what.
    const order = [...PAGE.matchAll(/<Method id="([^"]+)"/g)].map((m) => m[1]);
    expect(order, 'blocks are rendered in group order').toEqual(placed);
  });

  it('gives every group a title and a blurb that is not the title again', () => {
    // A group heading that restates its members' names teaches nothing — the craft bar's
    // "tooltips that restate the label" one level up. The blurb says what the subject IS.
    for (const g of METHOD_GROUPS) {
      expect(g.title.trim().length, `"${g.title}" has a title`).toBeGreaterThan(0);
      expect(g.blurb.trim().length, `"${g.title}" has a blurb`).toBeGreaterThan(20);
      expect(g.blurb.trim(), `"${g.title}"'s blurb is not its title`).not.toBe(g.title.trim());
      expect(g.ids.length, `"${g.title}" is not empty`).toBeGreaterThan(0);
    }
  });

  it('keeps any single group scannable', () => {
    // The whole complaint is that 51 items in one list cannot be scanned. A group holding a
    // third of them has moved the problem rather than fixed it.
    const big = METHOD_GROUPS.filter((g) => g.ids.length > 12).map((g) => `${g.title} (${g.ids.length})`);
    expect(big, `groups too large to scan:\n${big.join('\n')}`).toEqual([]);
  });
});
