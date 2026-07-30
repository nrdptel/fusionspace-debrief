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
// this product can produce, so nothing here is presented as more than it is.
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
//  3. *Requiring the boards to agree on the burnout they share.* Shipped once as a refusal, and
//     **removed**, because measurement showed it fails in both directions at once:
//
//     - **No power against the failure it named.** Lined up on liftoff, the gap between two
//       boards' burnouts is exactly |burn duration_i − burn duration_j|. The staging delay is not
//       a term in it — a sustainer log that starts at its own ignition carries no trace of the
//       delay — so the number is *identical* for a delay of 2 s and of 5,000 s. Measured by
//       sweeping it: 0.30 s at every delay. Not "weak evidence": no evidence.
//     - **It refused correct data.** Run over the corpus's six redundant-board groups — several
//       boards bolted into ONE airframe recording ONE burn, which is the premise stated exactly —
//       a 1 s tolerance REFUSED two of the six. `iss-endurance`: TeleMetrum 2.900 s against
//       StratoLogger 0.050 s. `trf-lemiv-l3`, four boards in one rocket: 3.160 / 2.300 / 1.750 /
//       1.550 s. All nine files carry `knownIssue: None`. The mechanism is in this repo's own
//       analyzer: a burnout found on the signed axial trace may be sought up to `BURNOUT_TAIL_S`
//       past the velocity peak, while the baro path takes the peak itself — so across the corpus,
//       burns marked `measured` run 0.769–6.040 s and burns marked `derived` run 0.050–23.910 s.
//       Two loggers on one motor are comparing DEFINITIONS, not flights.
//     - And it did not even separate one flight from another: the corpus's genuine staged pair
//       agrees to 0.290 s, while the Kairos booster paired against 32 unrelated corpus flights was
//       accepted three times — a June 2023 IREC flight at 0.750 s, and an SG1.2 sustainer from a
//       different launch at 0.910 s.
//
// So what ships is an alignment and no gate. The offsets are computed from the one instant the
// stages physically share; the burn durations ride along as a labelled measurement of what the
// records say, not as corroboration; and `verified` is FALSE on every path. **A surface built on
// this must not present the composite as measured.** What would settle it is the flyer saying
// which recording is the first stage — the same shape as D1's crop and D3's grouping, where the
// flyer states what the data cannot — and that is the next increment, not this one.

import type { FlightAnalysis, Provenance } from './analyze/types';

export interface StageRecording {
  /** How the flyer knows this recording — a file name. */
  name: string;
  analysis: FlightAnalysis;
}

/** What one recording says about the burn it shared with the others, and how it knows. */
export interface BurnMark {
  name: string;
  /** Burnout minus that recording's own liftoff, seconds. */
  durationS: number;
  /** How the analyzer found the burnout. Comparing a `measured` burn against a `derived` one
   *  compares two definitions of the word — see the header for the corpus's range of each. */
  provenance: Provenance;
}

export interface StageAlignment {
  /** Named rather than implied, because a flyer reading a composite is entitled to know what it
   *  was built on. */
  method: 'shared liftoff';
  /** Per recording, in the order given: seconds to add to that recording's own clock to put it
   *  on the composite's, whose zero is the launch. */
  offsets: number[];
  /** One entry per recording that marked a burnout at all — by name, so a surface can say WHICH
   *  stage nothing checked, that being the one most likely to be misplaced. Empty where none did,
   *  which is ordinary: neither StratoLogger booster on `iss-sg1.2` marks a burnout. */
  burns: BurnMark[];
  /** The largest gap between any two entries in `burns`, seconds; null below two of them.
   *
   *  **Read this as a description, not a check.** It is the difference between the recordings'
   *  burn DURATIONS. It does not bound the alignment error — the staging delay is not a term in
   *  it — and it is not a same-flight test: the header has the measurements, including two boards
   *  in one airframe that land 2.8 s apart with nothing wrong. Nothing in this module gates on
   *  it, and a surface that presents it as agreement is overstating it. */
  burnDurationSpreadS: number | null;
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

/** The event of a type on a recording's own clock, or null when it has none. */
function event(a: FlightAnalysis, type: 'liftoff' | 'burnout') {
  const e = a.events.find((x) => x.type === type);
  return e && Number.isFinite(e.time) ? e : null;
}

/**
 * Put N per-stage recordings of one launch on one clock, or refuse and say why.
 *
 * Aligns on the launch — the one instant every stage of a rocket shares. It refuses exactly one
 * thing: a record with no liftoff, which has no moment in common with the others to line up on.
 * **It does not check the alignment, because there is nothing to check it with**; the header sets
 * out the three rules that were tried and why each was deleted, one of them after shipping. That
 * is why `verified` is false on every result this returns, and false on purpose.
 *
 * There is deliberately no fallback and no repair. A sustainer whose logger started at its own
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

  const noLiftoff = recordings.filter((r) => event(r.analysis, 'liftoff') == null);
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

  const liftoffs = recordings.map((r) => event(r.analysis, 'liftoff')!.time);
  const offsets = liftoffs.map((t) => -t);

  // Reported, never gated on. Until the stages separate every board is in the same airframe, so
  // every board that marked a burnout marked the same burn — but what each one CALLS that moment
  // differs by construction, so the spread below measures the detectors at least as much as the
  // flight. The header has the corpus numbers behind that sentence.
  const burns: BurnMark[] = recordings
    .map((r, i) => {
      const b = event(r.analysis, 'burnout');
      return b == null ? null : { name: r.name, durationS: b.time - liftoffs[i], provenance: b.provenance };
    })
    .filter((b): b is BurnMark => b != null);

  const durations = burns.map((b) => b.durationS);
  const burnDurationSpreadS = durations.length < 2 ? null : Math.max(...durations) - Math.min(...durations);

  return { ok: true, alignment: { method: 'shared liftoff', offsets, burns, burnDurationSpreadS, verified: false } };
}
