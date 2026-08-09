/**
 * Which simulation flew — the one thing a flight log cannot say and a flyer can.
 *
 * A `.ork` accumulates a simulation per motor: the corpus fixture holds five, for an A8-3 through
 * a C6-5, whose apogees run 50.59 m to 319.75 m. `predictionFigures` refuses to pick one, and that
 * refusal is right and stays the default — nothing in a flight log names the motor, so choosing
 * would be Debrief inventing the very claim the cross-check exists to test.
 *
 * What it cost was a flyer who *knows* which one flew having no way to say so, and a trip back to
 * OpenRocket to re-export a design with one simulation in it. This module is that sentence: the
 * flyer states which flew, Debrief compares that one, and every surface says whose statement it
 * was. The distinction is the safety spine, not a nicety — a predicted apogee sitting beside a
 * measured one must never look like something Debrief worked out.
 *
 * **It is a pure function over an already-built flight, and that is what makes it cheap.** A
 * prediction contributes `reported` figures, `notes` and an altitude `predicted` curve — none of
 * which the analyzer ever reads (see `RawFlight.predicted`). So choosing re-merges rather than
 * re-analyses: no worker round trip, no re-parse, and every surface downstream — the cross-check
 * table, the altitude chart, the report, the print card and all eight exports — reads the flight
 * object and updates with it, rather than each needing to learn about simulations.
 *
 * **Every application starts from the same base.** `apply` strips whatever a previous choice put
 * on the flight before it adds anything, so applying twice is applying once and going back to no
 * choice is exact rather than approximate. That property is asserted rather than assumed.
 *
 * **What survives, and what does not — measured against the two persistence paths rather than
 * assumed, because the sentence a flyer reads depends on it.** The LOGBOOK does not keep a design:
 * `lib/reopen.ts` restores a stored device summary and says in its own comment that "a prediction
 * is not persisted", so a reopened flight carries neither the figures nor the offer. A CANONICAL
 * RECORD does keep the answer: `toCanonical` writes `notes`, `reported` and `predicted` verbatim
 * (`lib/canonical.ts`), so a flyer who chose a simulation and saved the record gets the figures,
 * the curve AND the line saying it was their statement back when they drop it in months later —
 * which is right, since it was their statement and D11's whole point is that those survive. What
 * no path restores is the OFFER, so the wording says the design has to come back to change the
 * answer rather than claiming the answer is forgotten.
 */

import type { RawFlight } from './flight/types';
import type { Prediction, PredictedRun } from './parsers/openrocket';
import { figuresForRun, predictionRefusal } from './parsers/openrocket';

/**
 * A design that stated several simulations, held for the session beside the flight it paired onto.
 *
 * It carries the runs themselves rather than the file, deliberately: the corpus `.ork` is 996 KB
 * of XML and the ten figures plus a saved curve are a few kilobytes of it. Re-reading the file to
 * apply a choice would mean keeping the file.
 */
export interface PredictionOffer {
  /** The design file, as the flyer dropped it. Names the offer on screen. */
  file: string;
  /** The flight this design paired onto — the logbook id where one exists. */
  flightId?: string;
  /** That flight's name, for a surface showing more than one. */
  flightName: string;
  /** The design as read, runs and all. */
  prediction: Prediction;
  /** Which run the flight ALREADY states flew, where it arrived saying so — a canonical record
   *  keeps that sentence, and the picker has to open agreeing with the cross-check beside it
   *  rather than showing *Don't compare one* over a populated Predicted column. `null` on the
   *  ordinary first drop. See `statedChoice`. */
  stated?: SimulationChoice;
}

/** Which simulation the flyer says flew: an index into `prediction.runs`, or `null` for the
 *  default, which is Debrief declining to pick. */
export type SimulationChoice = number | null;

/**
 * Every sentence this offer could have put on a flight, in either state.
 *
 * Removal works by matching against this set rather than by remembering what was added, because
 * the flight a choice is applied to may have been round-tripped through the logbook since — and a
 * note is a string on a flight, not a record of who wrote it. Generating both sides from the same
 * functions that write them is what stops the two drifting: a reworded refusal cannot leave an
 * orphaned copy of its old self on a flight, because the code that adds it and the code that
 * removes it are one call apart.
 */
function everyNote(offer: PredictionOffer): Set<string> {
  const all = new Set<string>([predictionRefusal(offer.prediction)]);
  for (const run of offer.prediction.runs) {
    for (const chosen of [true, false]) {
      for (const n of figuresForRun(offer.prediction, run, chosen).notes) all.add(n);
    }
  }
  return all;
}

/**
 * Apply a flyer's choice to a flight, or take it back off.
 *
 * Returns a new flight; the input is never mutated. `choice === null` restores exactly the state
 * `lib/ingest.ts` produced — the refusal note, no predicted figures, no predicted curve — which is
 * what makes the control a two-way door rather than a decision a flyer cannot undo.
 */
export function applySimulationChoice(
  flight: RawFlight,
  offer: PredictionOffer,
  choice: SimulationChoice,
): RawFlight {
  const ours = everyNote(offer);
  // Strip this offer's contribution whatever it was, then add back the one state asked for. A
  // prediction is the only thing that writes `source: 'predicted'`, so the figures come off by
  // source; a device summary's rows are a different source and are left exactly where they are.
  const notes = flight.notes.filter((n) => !ours.has(n));
  const reported = (flight.reported ?? []).filter((v) => v.source !== 'predicted');

  const run: PredictedRun | undefined =
    choice === null ? undefined : offer.prediction.runs[choice];
  if (!run) {
    // Includes an out-of-range index, which is not a hypothetical: a choice can outlive the drop
    // it was made in. Falling back to the refusal is the safe direction — it compares nothing.
    return {
      ...flight,
      notes: [...notes, predictionRefusal(offer.prediction)],
      ...(reported.length ? { reported } : { reported: undefined }),
      predicted: undefined,
    };
  }

  const figures = figuresForRun(offer.prediction, run, true);
  return {
    ...flight,
    notes: [...notes, ...figures.notes],
    reported: [...reported, ...figures.reported],
    ...(figures.series
      ? { predicted: { rocket: figures.rocket, ...figures.series } }
      : { predicted: undefined }),
  };
}

/**
 * What one simulation looks like in the picker — enough for a flyer to recognise theirs.
 *
 * The name alone is not enough and OpenRocket's own defaults prove it: a design saved without
 * renaming anything states "Simulation 1" through "Simulation 5". The apogee is what tells them
 * apart, because a flyer who flew the thing knows roughly how high it went — which is the same
 * recognition the logbook leans on.
 */
export interface SimulationSummary {
  index: number;
  name: string | null;
  status: string | null;
  /** Apogee in metres, as the simulation states it. Null when it stated none. */
  apogee: number | null;
  hasSeries: boolean;
}

/**
 * Which simulation a flight ALREADY states was the one that flew, if any.
 *
 * A canonical record keeps `notes` verbatim, so a flight saved after a choice comes back carrying
 * the sentence that names the run. Dropping that record beside the same design is exactly what the
 * chosen note tells a flyer to do — and without this, `lib/ingest.ts` would staple the refusal on
 * beside the statement it contradicts, and the picker would open showing *Don't compare one* as
 * pressed directly above a populated Predicted column.
 *
 * Matched by regenerating each run's note from the same function that writes it, which is the rule
 * `everyNote` follows one level down: a reworded sentence cannot leave a stale matcher behind,
 * because there is only one place the sentence exists.
 */
export function statedChoice(flight: RawFlight, prediction: Prediction): SimulationChoice {
  const notes = new Set(flight.notes);
  for (let i = 0; i < prediction.runs.length; i++) {
    const said = figuresForRun(prediction, prediction.runs[i], true).notes[0];
    if (said && notes.has(said)) return i;
  }
  return null;
}

export function summariseRuns(prediction: Prediction): SimulationSummary[] {
  return prediction.runs.map((run, index) => ({
    index,
    name: run.name,
    status: run.status,
    apogee: run.values.find((v) => v.metric === 'apogeeAltitude')?.value ?? null,
    hasSeries: run.hasSeries,
  }));
}
