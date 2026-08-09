import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applySimulationChoice, statedChoice, summariseRuns, type PredictionOffer } from './predictionChoice';
import { flyerChoseSimulation, orkToXml, readPrediction, predictionFiguresFrom, type Prediction } from './parsers/openrocket';
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

describe('a flight that already says which simulation flew', () => {
  it('is recognised from the sentence it carries, and only for the run that owns it', () => {
    // A canonical record keeps `notes` verbatim, so a saved-and-reopened flight arrives stating
    // its own choice. Matching regenerates each run's sentence from the function that writes it —
    // a reworded note cannot leave a stale matcher behind.
    const p = prediction();
    expect(statedChoice(ingestedFlight(p), p), 'a fresh drop states nothing').toBeNull();

    for (const i of [0, 2, 4]) {
      const chosen = applySimulationChoice(ingestedFlight(p), offerFor(p), i);
      expect(statedChoice(chosen, p)).toBe(i);
    }
    // …and taking the choice back takes the statement with it.
    const back = applySimulationChoice(applySimulationChoice(ingestedFlight(p), offerFor(p), 1), offerFor(p), null);
    expect(statedChoice(back, p)).toBeNull();
  });

  it('survives the canonical round trip, which is the whole reason it is detected', () => {
    // The failure this closes: a flyer chooses, saves the record, drops it back beside the same
    // design months later — exactly what the chosen note tells them to do — and the picker opens
    // showing "Don't compare one" pressed over a populated Predicted column.
    const p = prediction();
    const chosen = applySimulationChoice(ingestedFlight(p), offerFor(p), 3);
    const reopened: RawFlight = { ...chosen, notes: [...chosen.notes] };
    expect(statedChoice(reopened, p), 'the record still names the run').toBe(3);
  });
});

describe('the machine-readable half of the attribution', () => {
  it('says a flyer chose the run, and says the design did when nobody chose', () => {
    // `analysisJson` carries this as `predictionChosenBy` so a script reading ten numbers out of
    // `doc.prediction` does not have to parse English to learn a human picked them. Detector and
    // sentence share one constant, so a reworded note cannot leave the detector on the old one.
    const p = prediction();
    expect(flyerChoseSimulation(ingestedFlight(p).notes), 'the refusal is not a choice').toBe(false);

    const chosen = applySimulationChoice(ingestedFlight(p), offerFor(p), 2);
    expect(flyerChoseSimulation(chosen.notes)).toBe(true);

    // A design stating ONE simulation contributes its figures unasked — that is the design's
    // provenance, not the flyer's, and the two must not read the same on the way out.
    const single = readPrediction(design([FIVE[0]]))!;
    expect(flyerChoseSimulation(predictionFiguresFrom(single).notes)).toBe(false);

    // …and taking the choice back takes the claim with it.
    const back = applySimulationChoice(chosen, offerFor(p), null);
    expect(flyerChoseSimulation(back.notes)).toBe(false);
  });
});
