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
// ## What the alignment can and cannot establish — read this before building on it
//
// The method is the launch: every stage of a rocket leaves the pad at the same instant, so each
// record's own liftoff is the SAME moment. That much is physics. The question is whether a given
// record actually CONTAINS that moment, or begins later — a sustainer whose logger starts at
// boost detect has a "liftoff" that is really its own ignition, and aligning on it shifts the
// whole composite by the staging delay.
//
// **Nothing in the records answers that question, and three attempts to make one failed.**
//
//  1. *Altitude at the start.* Useless: the analyzer takes each record's pad datum from its own
//     opening samples, so a log beginning at 1,000 m in the air reads zero there too.
//  2. *Motion before the liftoff.* Worse than useless. Measured over all 50 corpus flights,
//     ordinary SINGLE-stage records show speeds before their own detected liftoff ranging from
//     0 to thousands of metres per second, because plenty of loggers begin recording at boost and
//     the detector fires a little way in. No threshold separates "a sustainer lighting up at
//     altitude" from "a StratoLogger that records only the flight"; a rule written this way
//     flagged 14 of 50 ordinary corpus flights.
//  3. *Agreement on the burnout the boards share.* This is the one below, and it is REAL evidence
//     but much weaker than it first appears. **It does not measure the staging delay.** Lined up
//     on liftoff, the gap between two boards' burnouts is |booster burn duration − sustainer burn
//     duration|; the delay never enters the arithmetic, because a sustainer log that starts at its
//     own ignition carries no trace of it. Measured: a booster burning 5.1 s beside a
//     wrongly-aligned sustainer burning 4.5-5.6 s passes this check every time, and HPR motors of
//     similar burn time are the ordinary case, not a contrivance.
//
// So what ships is honest about its own strength. The offsets are computed, the burn-duration
// agreement rides along as a number, and `verified` is FALSE: it is a sanity check that catches a
// gross mismatch, not proof that either record contains the launch. **A surface built on this
// must not present the composite as measured.** What would settle it is the flyer saying which
// recording is the first stage — the same shape as D1's crop and D3's grouping, where the flyer
// states what the data cannot — and that is the next increment, not this one.

import type { FlightAnalysis } from './analyze/types';

/**
 * How far apart two boards' burn durations may fall before the alignment that produced them is
 * not to be trusted.
 *
 * One second. The corpus's own staged pair agrees to 0.29 s, which is the sort of spread two
 * independent boost detectors have on one motor. Note what this does NOT bound: see the header —
 * it catches a gross mismatch, not a sustainer whose logger missed the launch.
 */
const BURN_AGREEMENT_S = 1;

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
  /** How far apart, in seconds, the recordings put their burnout once aligned — which is the
   *  difference between their BURN DURATIONS, not a measure of the staging delay. See the header
   *  for what that does and does not establish. Null where fewer than two recordings marked a
   *  burnout, which is half the corpus's staged flights: neither StratoLogger booster on
   *  `iss-sg1.2` marks one at all. */
  burnSpreadS: number | null;
  /** How many recordings that spread is over. A three-stage alignment where one board marked no
   *  burnout is checked by two of three, and without this it is indistinguishable from one
   *  checked by all three — the stage nothing checked being exactly the one most likely to be
   *  misplaced. Zero where nothing checked it. */
  burnCount: number;
  /** **Always false**, and it is a field rather than an omission so that a surface built on this
   *  has to look at it. Nothing here establishes that a record contains the launch; the header
   *  says why, and why no rule on the records alone can. Until a flyer says which recording is
   *  the first stage, a composite built from these offsets is their statement, not a measurement. */
  verified: false;
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
 * Aligns on the launch — the one instant every stage of a rocket shares — and then sanity-checks
 * that alignment against an event it was NOT built from. Refuses where a record has no liftoff to
 * align on, and where the burn durations disagree by more than two boost detectors on one motor
 * plausibly can. **Read the header for what that check is worth**: `verified` is false on every
 * result this returns, and it is false on purpose.
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
    return { ok: true, alignment: { method: 'shared liftoff', offsets, burnSpreadS: null, burnCount: burnouts.length, verified: false } };
  }

  const times = burnouts.map((b) => b.at);
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > BURN_AGREEMENT_S) {
    const lo = burnouts.reduce((a, b) => (b.at < a.at ? b : a));
    const hi = burnouts.reduce((a, b) => (b.at > a.at ? b : a));
    return {
      ok: false,
      refusal: {
        recordings: [lo.name, hi.name],
        why:
          `Lined up on the launch, these recordings put their burnouts ${spread.toFixed(1)} s apart — and until the stages separate ` +
          'they were in the same rocket recording the same burn, so those should be the same instant. ' +
          'Either one of them did not record the moment the rocket left the pad — a logger that starts at boost detect has that problem, ' +
          'and its first movement is a later stage lighting up rather than the launch — or these are not two stages of one flight. ' +
          'Debrief will not shift them to fit, because a composite built on an assumed staging delay still reads like a measured one.',
      },
    };
  }

  return { ok: true, alignment: { method: 'shared liftoff', offsets, burnSpreadS: spread, burnCount: burnouts.length, verified: false } };
}
