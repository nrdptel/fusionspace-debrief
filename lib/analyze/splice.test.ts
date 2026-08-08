import { describe, it, expect } from 'vitest';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';
import { landedInRecord, landingRate, descentStoppedAloft } from '../readings';
import { G0 } from '../units';

/**
 * A file holding one flight written twice, where the FIRST copy stops part-way down.
 *
 * This is the shape `descentFromSecondCopy` exists for, and the corpus has one of it — a Blue
 * Raven whose first copy cuts 3.3 s after apogee, before any descent rate resolves. That file
 * leaves all three rate fields null, which is why the splice's own contract could be wrong for
 * as long as it was without a single test noticing.
 *
 * Here the first copy cuts LATER: far enough down for a drogue-leg rate to resolve, still well
 * above the ground. Both conditions are separately ordinary — 13 of the 47 corpus recordings
 * that analyse report a descent rate with no landing, and one holds a doubled recording — so
 * this is a file one logger setting away, not a hypothetical.
 */
function doubledFlight(): { flight: RawFlight; truth: { apogee: number; drogueRate: number; mainRate: number } } {
  const dt = 0.05;
  const aBoost = 100;
  const tBurn = 2;
  const vBurnout = aBoost * tBurn;
  const altBurnout = 0.5 * aBoost * tBurn * tBurn;
  const coastT = vBurnout / G0;
  const apogee = altBurnout + (vBurnout * vBurnout) / (2 * G0);
  const drogueRate = 20;
  const mainRate = 5;
  const mainAt = 300;
  /** Where the first copy's recording stops — under drogue, a long way up. */
  const cutAt = 900;

  const time: number[] = [];
  const alt: number[] = [];
  let t = 0;
  const push = (a: number) => {
    time.push(t);
    alt.push(Math.max(0, a));
    t += dt;
  };
  /** One ascent, identical in both copies. `padS` seconds sitting on the pad first. */
  const climb = (padS: number) => {
    for (let s = 0; s < padS; s += dt) push(0);
    for (let ft = 0; ft <= tBurn; ft += dt) push(0.5 * aBoost * ft * ft);
    for (let ct = dt; ct <= coastT; ct += dt) push(altBurnout + vBurnout * ct - 0.5 * G0 * ct * ct);
  };

  // Copy 1 — starts on the pad, comes down under drogue, and the recording stops at 900 m.
  climb(2);
  for (let a = apogee; a > cutAt; a -= drogueRate * dt) push(a);

  // Copy 2 — the same flight again, from a restart. No pad window of its own worth the name,
  // which is exactly why the apogee is never read from it; it does run to the ground.
  climb(1);
  let a = apogee;
  for (; a > mainAt; a -= drogueRate * dt) push(a);
  for (; a > 0; a -= mainRate * dt) push(a);
  for (let s = 0; s < 5; s += dt) push(0);

  return {
    flight: {
      source: 'doubled.csv',
      format: 'test',
      formatLabel: 'Test',
      time: Float64Array.from(time),
      channels: [{ kind: 'altitude', label: 'Alt', unit: 'm', values: Float64Array.from(alt) }],
      meta: {},
      notes: [],
    },
    truth: { apogee, drogueRate, mainRate },
  };
}

describe('a descent spliced from the second copy publishes no rate from either', () => {
  it('does not publish the first copy’s in-the-air rate as a touchdown speed', () => {
    const { flight, truth } = doubledFlight();
    const { metrics } = analyzeFlight(flight);

    // The splice fired: this is the path under test, not some other branch.
    expect(metrics.descentSource, 'the descent came from the second copy').toBe('second-copy');
    expect(metrics.descentTime, 'and it has a descent clock').toBeGreaterThan(0);

    // The reading a flyer sizes a canopy against, and shows an RSO. Before 2026-08-08 the
    // splice carried the clock and left the FIRST copy's rates in place — so the drogue-leg
    // average off a recording that stops 900 m up was published as a touchdown speed, and
    // because `descentSource` was set, `landedInRecord` said the flight had landed and the
    // "stops before the ground" caveat was suppressed on every surface at once. Measured here
    // before the fix: 19.94 m/s against this flight's true 5 m/s main. Energy goes as v², so
    // that is 4x on the rate and 16x on the landing energy.
    //
    // The answer is NO RATE, not the second copy's rate. That is the other obvious repair and
    // it is worse: a rate needs the deployment structure between two instants, and an
    // unresolved one averages the whole descent — on the corpus flight this comes from, 48.2
    // m/s where a GPS recording of the same flight separately reads a 6.2 m/s main.
    expect(landingRate(metrics), 'no rate is published for a descent no copy resolved').toBeNull();
    expect(metrics.mainDescentRate, 'main leg withheld').toBeNull();
    expect(metrics.drogueDescentRate, 'drogue leg withheld').toBeNull();
    expect(metrics.wholeDescentRate, 'whole-descent average withheld').toBeNull();
    // Specifically: not the first copy's drogue average, which is what used to come out here.
    expect(metrics.wholeDescentRate as number | null, 'not the first copy’s ~20 m/s').not.toBeCloseTo(
      truth.drogueRate,
      0,
    );

    // The flight still LANDED — the second copy reached the ground — so the surfaces must not
    // say the record stops in the air. What they must say is that no rate was resolved.
    expect(landedInRecord(metrics), 'landed').toBe(true);
    expect(descentStoppedAloft(metrics), 'not "stopped aloft" — a different, wrong story').toBe(false);
    expect(truth.mainRate, 'the synthetic really does have a resolvable main leg').toBeGreaterThan(0);
  });

  it('proves the first copy really did have a rate to hand across', () => {
    // Without this the test above passes for the wrong reason: if the first copy resolved no
    // rate either, "withheld" is not a behaviour, it is an absence. Analysing the first copy
    // ALONE — everything up to the restart — must produce the ~20 m/s drogue average that used
    // to reach the report.
    const { flight, truth } = doubledFlight();
    const alt = flight.channels[0].values;
    // The restart is where the trace returns to the ground between the copies.
    let cut = 0;
    for (let i = 1; i < alt.length; i++) {
      if (alt[i] === 0 && alt[i - 1] > 100) {
        cut = i;
        break;
      }
    }
    expect(cut, 'the synthetic has a restart').toBeGreaterThan(0);
    const firstOnly: RawFlight = {
      ...flight,
      time: flight.time.slice(0, cut),
      channels: flight.channels.map((c) => ({ ...c, values: c.values.slice(0, cut) })),
    };
    const { metrics } = analyzeFlight(firstOnly);
    const rate = metrics.wholeDescentRate ?? metrics.mainDescentRate ?? metrics.drogueDescentRate;
    expect(rate, 'the first copy resolves a descent rate on its own').not.toBeNull();
    expect(rate as number, 'and it is the drogue average the splice must not publish').toBeCloseTo(
      truth.drogueRate,
      0,
    );
    // …and on its own it is correctly marked as a record that stops in the air.
    expect(landedInRecord(metrics), 'the first copy alone did not land').toBe(false);
    expect(descentStoppedAloft(metrics), 'the first copy alone stops aloft').toBe(true);
  });
});

describe('the panel explaining a withheld landing rate tells the right story', () => {
  // `MAINTAINING.md`: "a withheld number says why it is withheld". Three states reach this
  // panel with no rate, and they are not the same fact — a log that ends at apogee, a record
  // that stops in the air, and a doubled file whose descent came from the copy that landed but
  // resolved no rate. The third used to be told the first's story.
  it('separates a spliced descent from a record that stops in the air', () => {
    const { flight } = doubledFlight();
    const { metrics } = analyzeFlight(flight);
    expect(metrics.descentSource).toBe('second-copy');
    // The three predicates the panel branches on, held apart.
    expect(landedInRecord(metrics), 'it landed').toBe(true);
    expect(descentStoppedAloft(metrics), 'it did not stop in the air').toBe(false);
    expect(landingRate(metrics), 'and no rate is published').toBeNull();
    // Which is exactly the combination that used to fall through to "it may end at or before
    // apogee" — a claim contradicted by this flight having a flight time at all.
    expect(metrics.flightTime, 'the flight has a flight time').not.toBeNull();
    expect(metrics.flightTime as number).toBeGreaterThan(0);
  });
});
