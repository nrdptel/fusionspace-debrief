import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { landedInRecord, landingRateIsWholeDescent } from './readings';
import { analysisJson, headlineRows } from './report';
import type { FlightAnalysis } from './analyze/types';
import type { RawFlight } from './flight/types';

/**
 * The descent rate a recovery reading rests on has TWO bases, and every surface that publishes
 * one has to say which.
 *
 * `landingRate` returns `mainDescentRate ?? wholeDescentRate`. The second is the apogee-to-ground
 * average — drogue leg included — and it is not a rare corner: over the flights that land inside
 * their own record it carries **23 of 38** in the private corpus, and here it carries
 * `altimetercloud-mercury.csv`, one of the repo's own committed fixtures.
 *
 * Three surfaces said so and two did not. `LandingEnergy` branched on it from the day it was
 * written and the `.txt`/`.md`/`.html` row was fixed later; the `.json` — the sink a script or a
 * cert tool reads — and the parachute-Cd card were left publishing bare. The Cd card was the
 * sharpest of the five, because it labelled the figure "(measured)" and "at X terminal" while
 * asserting a terminal main leg the record had not resolved.
 *
 * **Both fixtures are committed and public**, so this runs on a fork with no corpus token. They
 * are chosen for the contrast rather than for convenience: the AIM XTRA resolves a real dual
 * deploy (drogue 20.35 m/s, main 7.01 m/s), and the AltimeterCloud resolves neither.
 */
const FIXTURES = path.join(__dirname, 'parsers', '__fixtures__');

/** No deployment change in the record: `landingRate` falls back to the whole-descent average. */
const WHOLE_DESCENT = 'altimetercloud-mercury.csv';
/** A resolved dual deploy: the main leg is its own figure and the rate is genuinely terminal. */
const MAIN_LEG = 'aim-xtra.csv';

function read(name: string): { flight: RawFlight; analysis: FlightAnalysis } {
  const bytes = new Uint8Array(readFileSync(path.join(FIXTURES, name)));
  const r = importFlight({ name, text: decodeBytes(bytes), bytes });
  if (r.kind !== 'flight') throw new Error(`${name} did not parse as a flight`);
  return { flight: r.flight, analysis: analyzeFlight(r.flight) };
}

/** A mass, so the energy and the Cd both compute. Any positive number does; this is a real one. */
const MASS_KG = 1.5;

describe('the two fixtures are the two bases, measured rather than assumed', () => {
  it('the AltimeterCloud record resolves no deployment change, so its rate is the whole descent', () => {
    const { analysis } = read(WHOLE_DESCENT);
    const m = analysis.metrics;
    expect(landedInRecord(m), 'this fixture must reach the ground or it proves nothing').toBe(true);
    expect(m.mainDescentRate, 'no main leg is resolved').toBeNull();
    expect(landingRateIsWholeDescent(m)).toBe(true);
  });

  it('the AIM XTRA record resolves a real dual deploy, so its rate IS terminal', () => {
    const { analysis } = read(MAIN_LEG);
    const m = analysis.metrics;
    expect(landedInRecord(m)).toBe(true);
    expect(m.mainDescentRate, 'a main leg is resolved').toBeGreaterThan(0);
    expect(m.drogueDescentRate, 'and a drogue leg above it').toBeGreaterThan(0);
    expect(landingRateIsWholeDescent(m)).toBe(false);
    // The reason the caveat is worth printing rather than a rounding note: the two legs on this
    // flight differ by roughly 3x, and a Cd goes as 1/v².
    expect(m.drogueDescentRate! / m.mainDescentRate!).toBeGreaterThan(2);
  });
});

describe('every document that publishes the landing energy publishes its basis', () => {
  const documents = (name: string) => {
    const { flight, analysis } = read(name);
    const recovery = { descendingMassKg: MASS_KG };
    const prose = headlineRows(analysis.metrics, 'imperial', recovery)
      .map((r) => r.join(' '))
      .join('\n');
    const json = JSON.parse(analysisJson(flight, analysis, 'imperial', undefined, undefined, recovery)) as Record<
      string,
      Record<string, unknown>
    >;
    return { prose, json, analysis };
  };

  it('names the whole-descent average in the prose row AND as data in the .json', () => {
    const { prose, json } = documents(WHOLE_DESCENT);
    expect(prose, 'the row a cert write-up is read from').toMatch(/whole-descent average/);
    // The .json is the sink a script reads; it has no sentence to parse, so it gets a field.
    expect(json.recovery?.landingEnergyBasis).toBe('whole-descent-average');
    // …and the energy itself is still there, so this is a qualifier and not a withholding.
    expect(json.recovery?.landingEnergyJoules).toBeTypeOf('number');
  });

  it('says main-leg — not silence — when the rate really is terminal', () => {
    const { prose, json } = documents(MAIN_LEG);
    expect(prose, 'no qualifier belongs on a resolved main leg').not.toMatch(/whole-descent average/);
    // Stated positively rather than omitted, so a consumer reads the good case rather than
    // inferring it from an absence. (Absence stays ambiguous — the key lives inside the
    // `joules != null` branch, so it also covers "no descending mass entered". That is written
    // down at the emit site rather than papered over here.)
    expect(json.recovery?.landingEnergyBasis).toBe('main-leg');
  });

  it('emits the basis on every flight that emits the energy, with no third value', () => {
    for (const name of [WHOLE_DESCENT, MAIN_LEG]) {
      const { json } = documents(name);
      const rec = json.recovery ?? {};
      expect(Object.keys(rec), `${name}: the energy is published`).toContain('landingEnergyJoules');
      expect(['whole-descent-average', 'main-leg'], `${name}: basis is one of the two`).toContain(
        rec.landingEnergyBasis,
      );
    }
  });
});

/**
 * **Two checks here were written first in a form that could not fail, and the pre-push review
 * killed both.** They are kept in the file's history through this comment because the shape
 * recurs: a check that exercises a LAW rather than the code is green before the change and green
 * after it.
 *
 * The first asserted that `parachuteCd(m, A, 0.8v, rho) > parachuteCd(m, A, v, rho)`. That is
 * true of every positive input by the definition of the function — it never touched
 * `wholeDescent`, `ParachuteCd`, or a single changed line, so reverting the whole commit left it
 * passing. The second grepped `ParachuteCd.tsx` for `mainDescentRate` and asserted its absence;
 * the card is handed a `descentRate: number | null` and never sees a `FlightMetrics` at all, so
 * there was nothing there to find and a card that ignored `wholeDescent` entirely would pass.
 *
 * What the card SAYS is asserted in `e2e/audit3.spec.ts` instead, against the real card in a real
 * browser. That is the right home for it rather than a convenience: `ParachuteCd` loads the canopy
 * diameter from `localStorage` in an effect, so a server-rendered copy of it has no Cd to print and
 * would assert against an empty card — a third check that passes for the wrong reason.
 */
describe('the parachute Cd rests on the same rate, so it carries the same basis', () => {
  it('has a rate whose two legs differ enough that the basis is worth naming', () => {
    // The arithmetic the card's claim rests on, checked on the two real fixtures rather than
    // asserted as a law. A whole-descent average is `legRate(apogee, landing)` — a time-weighted
    // blend lying strictly BETWEEN the legs — so the claim that can be made is "faster than the
    // MAIN leg alone", never "the faster of the two legs". On the dual-deploy fixture the two
    // legs are ~3x apart, which is the size of the thing being qualified.
    const dual = read(MAIN_LEG).analysis.metrics;
    expect(dual.drogueDescentRate!).toBeGreaterThan(dual.mainDescentRate!);
    const blend = (dual.drogueDescentRate! + dual.mainDescentRate!) / 2;
    expect(blend, 'a blend sits above the main leg…').toBeGreaterThan(dual.mainDescentRate!);
    expect(blend, '…and below the drogue leg, which is why "the faster of the two" is false').toBeLessThan(
      dual.drogueDescentRate!,
    );
  });

  it('is fed the flag by the report rather than deciding it a second time', () => {
    // The rule lives in `landingRateIsWholeDescent`. A second panel answering the same question
    // for itself is how these two answers drifted apart in the first place.
    const source = readFileSync(path.join(__dirname, '..', 'components', 'FlightReport.tsx'), 'utf8');
    expect(source, 'FlightReport passes the basis to the Cd card').toMatch(
      /wholeDescent=\{landingRateIsWholeDescent\(metrics\)\}/,
    );
  });
});
