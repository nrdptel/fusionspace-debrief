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
// this product can produce, so this module refuses far more readily than it aligns, and every
// refusal says which check failed.
//
// It computes an alignment; it does not decide that two files belong together. That statement is
// the flyer's, exactly as it is for the recordings of one flight (`lib/flightGroups.ts`).

import type { FlightAnalysis } from './analyze/types';

/** How far BACK from a record's own liftoff we look for "was this thing sitting still". Two
 *  seconds is long enough to be sure and short enough to sit inside the shortest pad wait a real
 *  download has.
 *
 *  Back from the liftoff, not forward from the start of the record, and that distinction is the
 *  whole check. The corpus's booster refuted the obvious version: its log opens 0.2 s before the
 *  launch, so a two-second window measured from the first sample is mostly BOOST, and a rule
 *  written that way called a rocket on a pad "already flying". */
const REST_WINDOW_S = 2;

/** Above this the opening of the record is not a rocket at rest. A board on a pad reads a few
 *  tenths of a metre per second of barometric noise; a sustainer whose log opens at ignition is
 *  already doing tens or hundreds. Measured on the corpus's own staged pair: the booster opens
 *  at 0.00 m/s and the sustainer — which did capture the pad wait — at -1.13 m/s, while that
 *  same sustainer is doing 27.4 m/s by the time its own liftoff is detected. */
const REST_SPEED_MS = 5;

export interface StageRecording {
  /** How the flyer knows this recording — a file name. */
  name: string;
  analysis: FlightAnalysis;
}

export interface StageAlignment {
  /** The only method there is so far, and it is named rather than implied: every stage of a
   *  rocket leaves the pad at the same instant, so a record that CONTAINS the pad departure has
   *  one event in common with every other record of that launch. */
  method: 'shared liftoff';
  /** Per recording, in the order given: seconds to add to that recording's own clock to put it
   *  on the composite's, whose zero is the launch. */
  offsets: number[];
}

export type StitchRefusal = {
  /** Which recordings the check failed on, by name — a refusal that does not say which file is
   *  the problem leaves the flyer nothing to do about it. */
  recordings: string[];
  /** What was checked and what it found, in a sentence a flyer can act on. */
  why: string;
};

export type StitchResult = { ok: true; alignment: StageAlignment } | { ok: false; refusal: StitchRefusal };

/**
 * Was this record's own liftoff the rocket leaving the PAD, rather than a stage lighting its
 * motor somewhere up the trajectory?
 *
 * This is the load-bearing check, and it exists because the obvious one does not work. "Is the
 * altitude near zero at the start" is useless: the analyzer takes each record's pad datum from
 * its own opening samples, so a log that begins at 1,000 m in the air reads zero there too, and
 * a sustainer whose logger starts at boost detect looks exactly like one sitting on a pad.
 *
 * SPEED does work, measured in the moments before that liftoff. A rocket on a pad is not moving,
 * whatever its altimeter thinks its altitude is; a stage that is already flying when its log
 * opens is doing tens or hundreds of metres per second, and no plausible calibration makes those
 * two look alike. A record with NO samples before its own liftoff cannot answer the question at
 * all, and an unanswerable question is a refusal, not a pass.
 */
export function openedAtRest(analysis: FlightAnalysis): boolean {
  const { time, velocity } = analysis.series;
  const liftoff = analysis.events.find((e) => e.type === 'liftoff');
  if (time.length === 0 || !liftoff) return false;
  const speeds: number[] = [];
  for (let i = 0; i < time.length && time[i] < liftoff.time; i++) {
    if (liftoff.time - time[i] > REST_WINDOW_S) continue;
    if (Number.isFinite(velocity[i])) speeds.push(Math.abs(velocity[i]));
  }
  if (speeds.length === 0) return false;
  // The median, not the mean or the maximum: a single spike in a barometric trace is ordinary,
  // and it should not be able to say a rocket was flying.
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length / 2)] <= REST_SPEED_MS;
}

/**
 * Put N per-stage recordings of one launch on one clock, or refuse and say why.
 *
 * The method is the launch itself. Every stage of a rocket leaves the pad at the same instant,
 * so each record's own liftoff is the SAME moment, and the offsets follow. It works only where
 * every record actually contains that moment — which is the check above, and the reason this
 * refuses rather than aligns whenever a record opens already flying.
 *
 * There is deliberately no fallback. A sustainer whose logger starts at its own ignition could
 * be aligned by assuming a staging delay, or by correlating the traces, and either would produce
 * a composite that looks exactly like a measured one and is a guess. Where the shared event is
 * not in the data, the answer is that Debrief cannot do it — not a plausible number.
 */
export function alignStages(recordings: StageRecording[]): StitchResult {
  if (recordings.length < 2) {
    return { ok: false, refusal: { recordings: recordings.map((r) => r.name), why: 'A composite needs at least two per-stage recordings.' } };
  }

  const noLiftoff = recordings.filter((r) => !r.analysis.events.some((e) => e.type === 'liftoff'));
  if (noLiftoff.length > 0) {
    return {
      ok: false,
      refusal: {
        recordings: noLiftoff.map((r) => r.name),
        why:
          noLiftoff.length === 1
            ? 'Debrief found no liftoff in this recording, so it has no moment in common with the others to line up on.'
            : 'Debrief found no liftoff in these recordings, so they have no moment in common with the others to line up on.',
      },
    };
  }

  const airborne = recordings.filter((r) => !openedAtRest(r.analysis));
  if (airborne.length > 0) {
    return {
      ok: false,
      refusal: {
        recordings: airborne.map((r) => r.name),
        why:
          `${airborne.length === 1 ? 'This recording was' : 'These recordings were'} already moving when the log opened, so ` +
          `${airborne.length === 1 ? 'it does' : 'they do'} not contain the moment the rocket left the pad — the one moment every stage shares. ` +
          'Lining them up would mean assuming a staging delay, and a composite built on an assumed delay reads exactly like a measured one.',
      },
    };
  }

  // Every record contains the launch, so its own liftoff IS the launch. Rebase each onto that.
  const liftoffs = recordings.map((r) => r.analysis.events.find((e) => e.type === 'liftoff')!.time);
  return { ok: true, alignment: { method: 'shared liftoff', offsets: liftoffs.map((t) => -t) } };
}
