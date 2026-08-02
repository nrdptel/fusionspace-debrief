// One timeline across several per-stage recordings of one launch.
//
// `lib/stitch.ts` decides whether N recordings CAN be put on one clock and produces the offsets
// or a refusal. This turns that into the thing a flyer reads: every recording's marks in one
// order, each naming the recording it came from, on the clock they share.
//
// **It merges nothing.** There is no composite altitude, no composite speed, no blended reading
// of any kind — the recordings are independent measurements of different parts of one launch and
// a single number made out of them would be a guess wearing a measurement's clothes. What a
// composite adds is ORDER, which is the one thing no single recording has.
//
// Three things this deliberately cannot say, each refuted by measurement rather than by taste
// (`ROADMAP.md` D4 has the corpus numbers):
//
//  1. **No mark here is a staging event.** `EventType` has no `separation` member to render and
//     this table must not invent one. Every row names a recording; none names a stage.
//
//     The reason is narrower than it was: this used to read "no corpus record holds two separable
//     burns", and one does — `meraki2`, an O7800 booster under an N3100 sustainer, whose TeleMega
//     shows two ascent thrust runs 15.79 s apart (see `lib/stitch.ts`). What has not changed is
//     that nothing separates it from `iss-endurance`, a single-motor flight whose record produces
//     a second run inside a corrupted stretch. One example against one example is not a rule, and
//     a mark labelled "separation" on the strength of it would be a guess wearing a measurement's
//     clothes on the surface built specifically to refuse that.
//  2. **No composite time is good to a tenth.** The two boards on the corpus's real staged pair
//     were bolted into ONE airframe over the first-stage burn and still disagree once aligned:
//     the extra shift that minimises the difference is 0.56 s on altitude and 0.74 s on velocity,
//     and at t+3 s they read 333 m and 487 m. So times print in whole seconds and the surface says
//     that two marks within a second are not ordered by this table.
//  3. **The composite is the flyer's statement, not a measurement.** Nothing in the records
//     establishes that they belong to one launch, and `StageAlignment.verified` is false on every
//     result `alignStages` returns. That field is carried through to here rather than dropped.

import type { EventType, FlightAnalysis } from './analyze/types';
import { alignStages, type BurnMark, type StitchRefusal } from './stitch';

/** One recording's mark, on the composite clock. */
export interface CompositeMark {
  /** Seconds after the shared launch. Whole seconds is what a surface may PRINT (see above); the
   *  unrounded value is kept so the ordering and the within-a-second test are done on the real
   *  numbers rather than on the rounded ones. */
  t: number;
  type: EventType;
  label: string;
  /** Which recording this mark came from — the only provenance a composite row can honestly
   *  carry, and the reason every row has it. */
  recording: string;
  /** That recording's own altitude at the mark, in metres AGL on its own pad datum. Never
   *  compared across recordings by this module: two stages' data are two different heights above
   *  two different reference samples, and a reader who wants them compared has `/compare`. */
  altitudeM: number | null;
  /** True when the mark before it on this list is within `SIMULTANEITY_S`, so the surface can say
   *  the two are not ordered rather than implying they are. */
  tiedWithPrevious: boolean;
}

export interface Composite {
  method: 'shared liftoff';
  /** Always false — see `StageAlignment.verified`. Carried, never dropped. */
  verified: false;
  /** In the order given, the seconds added to each recording's own clock. */
  offsets: number[];
  marks: CompositeMark[];
  /** Per recording that marked one, its burn duration and how the analyzer found it. Presented,
   *  never gated on: a `measured` burn and a `derived` one are two definitions of the word, and
   *  across the corpus they run 0.769–6.040 s and 0.050–23.910 s respectively. */
  burns: BurnMark[];
  /** The recordings that carried no marks at all, by name, so a flyer is never left wondering
   *  whether a file is missing or simply quiet. */
  silent: string[];
}

export type CompositeResult = { ok: true; composite: Composite } | { ok: false; refusal: StitchRefusal };

/** Two marks closer together than this are not ordered by a composite.
 *
 *  Set from the measurement rather than chosen: two boards in ONE airframe, aligned on their own
 *  liftoffs, still want a further 0.56 s (altitude) to 0.74 s (velocity) to agree. One second is
 *  the next whole number above the worst of those, and it is the resolution the printed times use
 *  for the same reason. */
export const SIMULTANEITY_S = 1;

export interface CompositeRecording {
  name: string;
  analysis: FlightAnalysis;
}

/** Whole seconds, with a sign, for a composite clock whose zero is the launch.
 *
 *  Deliberately coarser than `fmtTime`, which prints tenths. A tenth here would be a precision
 *  claim the alignment cannot support — see the module header. */
export function fmtCompositeTime(seconds: number): string {
  const r = Math.round(seconds);
  return `${r >= 0 ? 'T+' : 'T−'}${Math.abs(r)} s`;
}

/**
 * Assemble N per-stage recordings into one ordered timeline, or refuse and say why.
 *
 * `firstStage` is the flyer's statement of which recording is the first stage. It is a LABEL and
 * not a gate: the alignment never reads it, because every stage leaves the pad together, so
 * stating `[1,2]` or `[2,1]` produces identical offsets. It orders marks that land at the same
 * instant — a booster's liftoff before a sustainer's — and nothing else. Passing a name that is
 * not in `recordings` is not an error; it simply orders nothing.
 */
export function buildComposite(recordings: CompositeRecording[], firstStage?: string): CompositeResult {
  const aligned = alignStages(recordings);
  if (!aligned.ok) return { ok: false, refusal: aligned.refusal };
  const { offsets, burns, method, verified } = aligned.alignment;

  const marks: CompositeMark[] = [];
  const silent: string[] = [];
  recordings.forEach((rec, i) => {
    const own = rec.analysis.events.filter((e) => Number.isFinite(e.time));
    if (own.length === 0) silent.push(rec.name);
    for (const e of own) {
      marks.push({
        t: e.time + offsets[i],
        type: e.type,
        label: e.label,
        recording: rec.name,
        altitudeM: Number.isFinite(rec.analysis.series.altitude[e.index])
          ? rec.analysis.series.altitude[e.index]
          : null,
        tiedWithPrevious: false,
      });
    }
  });

  // Time first, then by name so the table does not reshuffle between renders where nothing
  // distinguishes two rows.
  marks.sort((a, b) => a.t - b.t || a.recording.localeCompare(b.recording));

  // Then group the marks the alignment cannot separate, and order INSIDE each group by the one
  // thing the flyer told us. A booster and a sustainer both leave the pad at T+0 and both boards
  // see the same first-stage burn, so those runs are simultaneous within the alignment's own
  // resolution — printing them in whatever order the arithmetic happened to produce would be an
  // ordering claim the measurement refuses, and putting the stated first stage first is the only
  // ordering there is any evidence for.
  //
  // Grouped BEFORE reordering, and from the time-sorted list, so a group's membership is a fact
  // about the times rather than about the order this then imposes on them. Comparing each mark
  // with the previous one directly would not be a valid sort key at all — "within a second of" is
  // not transitive, and a comparator built on it can order a list inconsistently.
  const ordered: CompositeMark[] = [];
  for (let i = 0; i < marks.length; ) {
    let j = i + 1;
    while (j < marks.length && marks[j].t - marks[j - 1].t < SIMULTANEITY_S) j++;
    const group = marks.slice(i, j);
    if (firstStage != null) {
      const lead = group.filter((m) => m.recording === firstStage);
      const rest = group.filter((m) => m.recording !== firstStage);
      group.length = 0;
      group.push(...lead, ...rest);
    }
    group.forEach((m, k) => {
      m.tiedWithPrevious = k > 0;
      ordered.push(m);
    });
    i = j;
  }

  return { ok: true, composite: { method, verified, offsets, marks: ordered, burns, silent } };
}
