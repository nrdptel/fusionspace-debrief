// Putting the per-stage logs of one staged flight on a single clock.
//
// A two-stage rocket flown with a flight computer in each stage comes home with two files that
// describe ONE flight from two places: the booster's record ends under its own recovery while
// the sustainer is still climbing, and the sustainer's record covers a flight that began before
// its own motor lit. Read separately they are two flights that both claim to start at zero.
//
// **The whole problem is the offset between the two clocks, and the whole danger is guessing
// it.** A composite built on a wrong offset does not look wrong: it looks like a flight, with
// events in a plausible order and numbers a flyer would act on. That is the most damaging thing
// this product can produce, so nothing here aligns without producing evidence that it worked.
//
// It computes an alignment; it does not decide that two files belong together. That statement is
// the flyer's, exactly as it is for the recordings of one flight (`lib/flightGroups.ts`).
//
// ## Why the alignment is checked the way it is
//
// The method is the launch: every stage of a rocket leaves the pad at the same instant, so each
// record's own liftoff is the SAME moment. That much is physics. The question is how to know
// whether a given record actually CONTAINS that moment, or begins later — a sustainer whose
// logger starts at boost detect has a "liftoff" that is really its own ignition, and aligning on
// it shifts the whole composite by the staging delay.
//
// **The obvious tests for that were tried against the corpus and both failed.** Altitude is
// useless: the analyzer takes each record's pad datum from its own opening samples, so a log
// beginning at 1,000 m in the air reads zero there too. Motion before the liftoff is worse than
// useless — measured over all 50 corpus flights, ordinary SINGLE-stage records show pre-liftoff
// climb rates from 0 to 141 m/s, because plenty of loggers begin recording at boost and the
// detector fires a little way into it. There is no threshold that separates "a sustainer lighting
// up at altitude" from "a StratoLogger that records only the flight"; picking one would only have
// meant telling the owner of a plain single-stage flight their file was already moving.
//
// So the alignment is not gatekept on a heuristic about one record. It is CORROBORATED against
// the other: until separation, every stage is bolted into the same rocket, so every board records
// the same first-stage burn. Line the records up on liftoff and their burnouts must agree — and a
// wrong offset shows up here as a disagreement of exactly the amount it is wrong by. On the
// corpus's real two-stage pair, aligned on liftoff alone, the booster's and the sustainer's
// boards put that burnout 0.29 s apart.

import type { FlightAnalysis } from './analyze/types';

/**
 * How far apart two boards' readings of the SAME burn may fall before the alignment that
 * produced them is not to be trusted.
 *
 * One second. The corpus's own pair agrees to 0.29 s, which is the sort of spread two independent
 * boost detectors have on one motor; a staging delay — the error this exists to catch — is
 * seconds, because that is what a delay charge is for. There is a wide gap between the two and
 * this sits in it.
 */
const BURNOUT_AGREEMENT_S = 1;

export interface StageRecording {
  /** How the flyer knows this recording — a file name. */
  name: string;
  analysis: FlightAnalysis;
}

export interface StageAlignment {
  /** Named rather than implied, because a flyer reading a composite is entitled to know what it
   *  was built on. */
  method: 'shared liftoff';
  /** Per recording, in the order given: seconds to add to that recording's own clock to put it
   *  on the composite's, whose zero is the launch. */
  offsets: number[];
  /** The evidence, in seconds: how far apart the recordings put the first-stage burnout once
   *  aligned. Every stage is in the same rocket until separation, so they all recorded that same
   *  burn — a figure a flyer can check, not a claim they have to take. Null where fewer than two
   *  recordings marked a burnout, in which case the alignment ships UNCORROBORATED and says so. */
  burnoutSpreadS: number | null;
}

export interface StitchRefusal {
  /** Which recordings the check failed on, by name — a refusal that does not say which file is
   *  the problem leaves the flyer nothing to do about it. */
  recordings: string[];
  /** What was checked and what it found, in a sentence a flyer can act on. */
  why: string;
}

export type StitchResult = { ok: true; alignment: StageAlignment } | { ok: false; refusal: StitchRefusal };

/** The time of an event on a recording's own clock, or null when it has none of that type. */
function eventTime(a: FlightAnalysis, type: 'liftoff' | 'burnout'): number | null {
  const e = a.events.find((x) => x.type === type);
  return e && Number.isFinite(e.time) ? e.time : null;
}

/**
 * Put N per-stage recordings of one launch on one clock, or refuse and say why.
 *
 * Aligns on the launch — the one instant every stage of a rocket shares — and then checks that
 * alignment against an event it was NOT built from. Refuses where a record has no liftoff to
 * align on, and where the corroborating burnouts disagree by more than two boost detectors on one
 * motor plausibly can.
 *
 * There is deliberately no fallback for a refusal. A sustainer whose logger started at its own
 * ignition could be placed by assuming a staging delay, or by correlating the traces, and either
 * would produce a composite that looks exactly like a measured one. Where the evidence is not
 * there, the answer is that Debrief cannot do it — not a plausible number.
 */
export function alignStages(recordings: StageRecording[]): StitchResult {
  if (recordings.length < 2) {
    return {
      ok: false,
      refusal: { recordings: recordings.map((r) => r.name), why: 'A composite needs at least two per-stage recordings.' },
    };
  }

  const noLiftoff = recordings.filter((r) => eventTime(r.analysis, 'liftoff') == null);
  if (noLiftoff.length > 0) {
    return {
      ok: false,
      refusal: {
        recordings: noLiftoff.map((r) => r.name),
        why:
          `Debrief found no liftoff in ${noLiftoff.length === 1 ? 'this recording' : 'these recordings'}, so ` +
          `${noLiftoff.length === 1 ? 'it has' : 'they have'} no moment in common with the others to line up on.`,
      },
    };
  }

  const liftoffs = recordings.map((r) => eventTime(r.analysis, 'liftoff') as number);
  const offsets = liftoffs.map((t) => -t);

  // The corroboration. Every stage is in the same airframe until separation, so every board that
  // marked a burnout marked the SAME first-stage burn; on one clock those instants are one.
  const burnouts = recordings
    .map((r, i) => {
      const t = eventTime(r.analysis, 'burnout');
      return t == null ? null : { name: r.name, at: t + offsets[i] };
    })
    .filter((b): b is { name: string; at: number } => b != null);

  if (burnouts.length < 2) {
    // Not a failure — a flight whose boards did not all mark a burnout is ordinary. But the
    // alignment then rests on the liftoff alone, and that has to be said rather than implied.
    return { ok: true, alignment: { method: 'shared liftoff', offsets, burnoutSpreadS: null } };
  }

  const times = burnouts.map((b) => b.at);
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > BURNOUT_AGREEMENT_S) {
    const lo = burnouts.reduce((a, b) => (b.at < a.at ? b : a));
    const hi = burnouts.reduce((a, b) => (b.at > a.at ? b : a));
    return {
      ok: false,
      refusal: {
        recordings: [lo.name, hi.name],
        why:
          `Lined up on the launch, these recordings put the first-stage burnout ${spread.toFixed(1)} s apart — and until the stages separate ` +
          'they were in the same rocket, recording the same burn, so it should be the same instant. ' +
          'Either one of them did not record the moment the rocket left the pad — a logger that starts at boost detect has that problem, ' +
          'and its first movement is a later stage lighting up rather than the launch — or these are not two stages of one flight. ' +
          'Debrief will not shift them to fit, because a composite built on an assumed staging delay still reads like a measured one.',
      },
    };
  }

  return { ok: true, alignment: { method: 'shared liftoff', offsets, burnoutSpreadS: spread } };
}
