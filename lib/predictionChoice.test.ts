import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applySimulationChoice, summariseRuns, type PredictionOffer } from './predictionChoice';
import { orkToXml, readPrediction, predictionFiguresFrom, type Prediction } from './parsers/openrocket';
import type { RawFlight, ReportedValue } from './flight/types';

const CORPUS = fileURLToPath(new URL('./parsers/__corpus__/', import.meta.url));
const ORK = `${CORPUS}openrocket/openrocket__example-simple-model-rocket__A-simple-model-rocket.ork`;

/** Ten internally-consistent attributes: 29.249 / 0.086 is 340.1, the speed of sound, which is
 *  what proves metres per second. `apogee` scales the one figure the picker shows, so five runs
 *  built from this are distinguishable the way five real ones are. */
const ten = (apogee: number) =>
  `maxaltitude="${apogee}" maxvelocity="29.249" maxacceleration="143.649" maxmach="0.086" ` +
  `timetoapogee="3.481" flighttime="15.888" groundhitvelocity="4.681" ` +
  `launchrodvelocity="15.365" deploymentvelocity="2.646" optimumdelay="2.751"`;

function design(names: { name: string; apogee: number }[]): string {
  const sims = names
    .map(
      (s) =>
        `<simulation status="uptodate"><name>${s.name}</name><flightdata ${ten(s.apogee)}/></simulation>`,
    )
    .join('');
  return (
    `<?xml version='1.0' encoding='utf-8'?>` +
    `<openrocket version="1.10" creator="OpenRocket 24.12">` +
    `<rocket><name>Test rocket</name></rocket>` +
    `<simulations>${sims}</simulations>` +
    `</openrocket>`
  );
}

const FIVE = [
  { name: 'Simulation 1 - A8-3', apogee: 50.59 },
  { name: 'Simulation 2 - B6-4', apogee: 141.2 },
  { name: 'Simulation 3 - too short delay', apogee: 198.4 },
  { name: 'Simulation 4 - C6-3', apogee: 265.1 },
  { name: 'Simulation 5 - C6-5', apogee: 319.75 },
];

function prediction(): Prediction {
  return readPrediction(design(FIVE))!;
}

function offerFor(p: Prediction): PredictionOffer {
  return { file: 'rocket.ork', flightName: 'flight.csv', flightId: 'rec-1', prediction: p };
}

/** A flight in exactly the state `lib/ingest.ts` leaves it in after a five-simulation design
 *  paired onto it: the refusal on `notes`, nothing on `reported`, no curve. */
function ingestedFlight(p: Prediction, extraReported: ReportedValue[] = []): RawFlight {
  const contribution = predictionFiguresFrom(p);
  return {
    source: 'flight.csv',
    format: 'csv',
    formatLabel: 'CSV',
    time: Float64Array.from([0, 1, 2]),
    channels: [],
    meta: {},
    notes: ['a note the parser left', ...contribution.notes],
    ...(extraReported.length ? { reported: [...extraReported] } : {}),
  };
}

const deviceRow: ReportedValue = {
  metric: 'apogeeAltitude',
  label: 'Apogee',
  value: 312.4,
  source: 'device',
};

describe('which simulation flew — applying a flyer’s choice', () => {
  it('compares the run the flyer named, and says it was the flyer who named it', () => {
    const p = prediction();
    const out = applySimulationChoice(ingestedFlight(p), offerFor(p), 4);

    expect(out.reported).toHaveLength(10);
    expect(out.reported!.every((v) => v.source === 'predicted')).toBe(true);
    expect(out.reported!.find((v) => v.metric === 'apogeeAltitude')!.value).toBe(319.75);

    // The safety spine: this is the flyer's statement, not Debrief's reading.
    const said = out.notes.find((n) => n.includes('You said'))!;
    expect(said, 'the chosen run is named back to the flyer').toContain('Simulation 5 - C6-5');
    expect(said).toMatch(/Debrief cannot read that from a flight log/);
    expect(said, 'and it says what was NOT compared').toContain('the other 4 are not compared');

    // …and the refusal is no longer true of this flight, so it is gone.
    expect(out.notes.some((n) => n.includes('will not pick one'))).toBe(false);
  });

  it('is a two-way door: going back to no choice restores the ingested flight exactly', () => {
    const p = prediction();
    const base = ingestedFlight(p);
    const back = applySimulationChoice(applySimulationChoice(base, offerFor(p), 2), offerFor(p), null);

    expect(back.notes).toEqual(base.notes);
    expect(back.reported ?? []).toEqual([]);
    expect(back.predicted).toBeUndefined();
  });

  it('applying twice is applying once — no note or figure accumulates', () => {
    const p = prediction();
    const once = applySimulationChoice(ingestedFlight(p), offerFor(p), 1);
    const twice = applySimulationChoice(once, offerFor(p), 1);
    expect(twice.notes).toEqual(once.notes);
    expect(twice.reported).toEqual(once.reported);
  });

  it('switching between runs leaves nothing of the one before it', () => {
    const p = prediction();
    const first = applySimulationChoice(ingestedFlight(p), offerFor(p), 0);
    const second = applySimulationChoice(first, offerFor(p), 3);

    expect(second.reported).toHaveLength(10);
    expect(second.reported!.find((v) => v.metric === 'apogeeAltitude')!.value).toBe(265.1);
    expect(second.notes.filter((n) => n.includes('You said'))).toHaveLength(1);
    expect(second.notes.some((n) => n.includes('Simulation 1 - A8-3'))).toBe(false);
  });

  it('leaves a device summary’s own figures alone — only the prediction is swapped', () => {
    const p = prediction();
    const base = ingestedFlight(p, [deviceRow]);
    const chosen = applySimulationChoice(base, offerFor(p), 0);
    const back = applySimulationChoice(chosen, offerFor(p), null);

    expect(chosen.reported!.filter((v) => v.source === 'device')).toEqual([deviceRow]);
    expect(chosen.reported!.filter((v) => v.source === 'predicted')).toHaveLength(10);
    // The device's measurement of the same flight survives the round trip untouched.
    expect(back.reported).toEqual([deviceRow]);
  });

  it('falls back to the refusal when the index names no run', () => {
    // A choice can outlive the drop it was made in. Comparing nothing is the safe direction;
    // comparing run 0 because 9 was asked for would be Debrief picking after all.
    const p = prediction();
    const out = applySimulationChoice(ingestedFlight(p), offerFor(p), 9);
    expect(out.reported ?? []).toEqual([]);
    expect(out.notes.some((n) => n.includes('will not pick one'))).toBe(true);
    expect(out.predicted).toBeUndefined();
  });

  it('never mutates the flight it was handed', () => {
    const p = prediction();
    const base = ingestedFlight(p);
    const before = [...base.notes];
    applySimulationChoice(base, offerFor(p), 2);
    expect(base.notes).toEqual(before);
    expect(base.reported).toBeUndefined();
  });

  it('carries a chosen run’s saved curve, and takes it away again', () => {
    const withTrace = design(FIVE).replace(
      `${ten(319.75)}/>`,
      `${ten(319.75)}><databranch name="Main" types="Time,Altitude">` +
        `<datapoint>0,0</datapoint><datapoint>1,120</datapoint><datapoint>2,319.75</datapoint>` +
        `</databranch></flightdata>`,
    );
    const p = readPrediction(withTrace)!;
    const chosen = applySimulationChoice(ingestedFlight(p), offerFor(p), 4);
    expect(chosen.predicted?.rocket).toBe('Test rocket');
    expect(Array.from(chosen.predicted!.altitude)).toEqual([0, 120, 319.75]);

    // A run with no saved trace must not inherit the last one's line.
    const other = applySimulationChoice(chosen, offerFor(p), 0);
    expect(other.predicted).toBeUndefined();
  });
});

describe('what the picker shows', () => {
  it('gives each run the apogee that tells it apart from the others', () => {
    const rows = summariseRuns(prediction());
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.apogee)).toEqual([50.59, 141.2, 198.4, 265.1, 319.75]);
    // Every index addresses the run at that position — the picker's whole contract.
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(rows.map((r) => r.apogee)).size, 'five distinguishable rows').toBe(5);
  });
});

describe('the real five-simulation fixture', () => {
  const present = existsSync(ORK);

  it.skipIf(!present)('offers five runs, and each one compares a different apogee', async () => {
    const p = (await orkToXml(new Uint8Array(readFileSync(ORK))).then(readPrediction))!;
    const rows = summariseRuns(p);
    expect(rows).toHaveLength(5);

    const apogees = rows.map((r) => {
      const out = applySimulationChoice(ingestedFlight(p), offerFor(p), r.index);
      return out.reported!.find((v) => v.metric === 'apogeeAltitude')!.value;
    });
    // The spread is the reason the refusal exists: 50.59 m to 319.75 m is an A8-3 against a
    // C6-5, and picking one for the flyer would be inventing the claim under test.
    expect(new Set(apogees).size).toBe(5);
    expect(Math.min(...apogees)).toBeCloseTo(50.59, 2);
    expect(Math.max(...apogees)).toBeCloseTo(319.75, 2);
    // Each choice reports the apogee the picker showed for that same run.
    expect(apogees).toEqual(rows.map((r) => r.apogee));
  });

  it.skipIf(!present)('round-trips back to the refusal it started at', async () => {
    const p = (await orkToXml(new Uint8Array(readFileSync(ORK))).then(readPrediction))!;
    const base = ingestedFlight(p);
    const back = applySimulationChoice(applySimulationChoice(base, offerFor(p), 3), offerFor(p), null);
    expect(back.notes).toEqual(base.notes);
  });
});
