import { describe, it, expect } from 'vitest';
import { alignStages, type StageRecording } from './stitch';
import type { FlightAnalysis, Provenance } from './analyze/types';

/** The one member of an analysis this module reads — its events — so a test says exactly which
 *  facts the decision rests on. */
function rec(name: string, liftoffAt: number | null, burnoutAt?: number | null, burnoutFrom: Provenance = 'measured'): StageRecording {
  const events = [
    ...(liftoffAt == null ? [] : [{ type: 'liftoff', time: liftoffAt, provenance: 'measured' }]),
    ...(burnoutAt == null ? [] : [{ type: 'burnout', time: burnoutAt, provenance: burnoutFrom }]),
  ];
  return { name, analysis: { events } as unknown as FlightAnalysis };
}

describe('alignStages', () => {
  it('lines two stages up on the launch they share', () => {
    // The corpus's own staged pair, to the tenth: the booster's log opens essentially at the
    // launch (liftoff 0.2 s, burnout 5.3 s) and the sustainer's carries a 307.5 s pad wait before
    // the same moment (liftoff 307.7 s, burnout 312.5 s). Both left the pad together.
    const out = alignStages([rec('booster.csv', 0.2, 5.3), rec('sustainer.csv', 307.7, 312.5)]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.alignment.method).toBe('shared liftoff');
    expect(out.alignment.offsets[0]).toBeCloseTo(-0.2, 6);
    expect(out.alignment.offsets[1]).toBeCloseTo(-307.7, 6);
    // The offsets put both launches at one instant, which is the whole point…
    expect(0.2 + out.alignment.offsets[0]).toBeCloseTo(307.7 + out.alignment.offsets[1], 6);
    // …and what the two records say about the burn rides along as a measurement, named and
    // provenance-labelled, rather than as a verdict on the alignment.
    expect(out.alignment.burnDurationSpreadS).toBeCloseTo(0.3, 1);
    expect(out.alignment.burns.map((b) => b.name)).toEqual(['booster.csv', 'sustainer.csv']);
    expect(out.alignment.burns.map((b) => b.durationS)).toEqual([expect.closeTo(5.1, 6), expect.closeTo(4.8, 6)]);
    expect(out.alignment.burns.map((b) => b.provenance)).toEqual(['measured', 'measured']);
  });

  it('refuses a recording with no liftoff at all, and names it', () => {
    const out = alignStages([rec('booster.csv', 0.2, 5.3), rec('fragment.csv', null)]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings).toEqual(['fragment.csv']);
    expect(out.refusal.why).toContain('no liftoff');
  });

  it('refuses one recording — a composite of one stage is not a composite', () => {
    expect(alignStages([rec('only.csv', 1, 5)]).ok).toBe(false);
    expect(alignStages([]).ok).toBe(false);
  });

  it('says nothing about the burn where fewer than two recordings marked one', () => {
    // Ordinary, and not a failure: neither StratoLogger booster on the corpus's `iss-sg1.2`
    // marks a burnout at all. Null is the flag that there was nothing to compare.
    const out = alignStages([rec('a', 1, 6), rec('b', 100, null)]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.alignment.burnDurationSpreadS).toBeNull();
    expect(out.alignment.burns.map((b) => b.name), 'and it says WHICH one marked it').toEqual(['a']);
    expect(alignStages([rec('a', 1, null), rec('b', 100, null)]).ok).toBe(true);
  });

  it('names the recordings a spread is over, so a surface can say which stage nothing checked', () => {
    // Three stages, one of which marked no burnout. Without the names that is indistinguishable
    // from a three-of-three comparison — and the stage nothing compared is exactly the one most
    // likely to be misplaced.
    const partly = alignStages([rec('a', 1, 6), rec('b', 50, 55.2), rec('c', 9, null)]);
    expect(partly.ok).toBe(true);
    if (!partly.ok) return;
    expect(partly.alignment.burnDurationSpreadS).toBeCloseTo(0.2, 6);
    expect(partly.alignment.burns.map((b) => b.name)).toEqual(['a', 'b']);
  });

  it('takes three stages as readily as two', () => {
    const ok = alignStages([rec('a', 1, 6), rec('b', 50, 55.2), rec('c', 9, 14.1)]);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.alignment.offsets).toEqual([-1, -50, -9]);
    expect(ok.alignment.burnDurationSpreadS).toBeCloseTo(0.2, 6);
    expect(ok.alignment.burns).toHaveLength(3);
  });

  it('never reports an alignment as verified, on any path', () => {
    // The field exists so a surface built on this has to look at it. Nothing here establishes
    // that a record contains the launch, and no rule on the records alone can.
    for (const set of [
      [rec('a', 1, 6), rec('b', 100, 105.2)],
      [rec('a', 1, 6), rec('b', 100, null)],
      [rec('a', 1, null), rec('b', 100, null)],
      [rec('a', 1, 6), rec('b', 100, 130)],
    ]) {
      const out = alignStages(set);
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.alignment.verified).toBe(false);
    }
  });
});

/**
 * Why there is no burn-duration gate, pinned as tests rather than left in a comment.
 *
 * One shipped, on the reading that two boards in one airframe record one burn, so a gap between
 * their burnouts catches a sustainer whose logger started at its own ignition. Measurement
 * refuted it in both directions at once, and both directions are asserted below, because the
 * argument for reinstating it is genuinely appealing and should fail loudly instead.
 */
describe('the burn-duration gate that was removed, and why', () => {
  it('cannot see the staging delay at all — the error it claimed to catch is not in the arithmetic', () => {
    // The failure the gate named: a sustainer whose log opens at its OWN ignition, `delay`
    // seconds after the launch. Its own clock therefore reads 0 at staging and its liftoff sits
    // at 0.1 s; to put it on the composite you must ADD `delay`. Aligning on its liftoff subtracts
    // 0.1 instead, so the composite is wrong by `delay` + 0.1 s — and the burn-duration spread is
    // the same 0.30 s whether the delay is two seconds or an hour and a half.
    for (const delay of [2, 9, 30, 300, 5000]) {
      const out = alignStages([rec('booster', 0.2, 5.3), rec('sustainer', 0.1, 4.9)]);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const errorS = Math.abs(out.alignment.offsets[1] - delay);
      expect(errorS, `a ${delay} s staging delay misplaces the sustainer by that much`).toBeCloseTo(delay + 0.1, 6);
      expect(out.alignment.burnDurationSpreadS, `and the spread does not move: ${delay} s delay`).toBeCloseTo(0.3, 6);
    }
  });

  it('would refuse two of the corpus’s six redundant-board groups, which are all correct', () => {
    // Boards bolted into ONE airframe recording ONE burn — the gate's premise, stated exactly.
    // These are the corpus's real burn durations; a 1 s tolerance rejected the first two.
    const groups: [string, number[]][] = [
      ['iss-endurance: TeleMetrum 2.900 (measured) vs StratoLogger 0.050 (derived)', [2.9, 0.05]],
      ['trf-lemiv-l3: BlueRaven / GPS / Proton / Quantum, four boards in one rocket', [3.16, 2.3, 1.75, 1.55]],
      ['iss-irec2023: EasyMega + TeleMega', [5.88, 5.88]],
      ['ac-lilnuke: four AltimeterCloud recordings', [1.497, 1.546, 1.517, 1.476]],
    ];
    for (const [why, burns] of groups) {
      const out = alignStages(burns.map((d, i) => rec(`board${i}`, i * 10, i * 10 + d)));
      expect(out.ok, why).toBe(true);
    }
    // The two that a 1 s gate rejected, quantified — so the cost of reinstating it is a number
    // in this file rather than a claim in a comment.
    const endurance = alignStages([rec('telemetrum', 1.08, 3.98), rec('stratologger', 1.3, 1.35, 'derived')]);
    expect(endurance.ok).toBe(true);
    if (!endurance.ok) return;
    expect(endurance.alignment.burnDurationSpreadS).toBeCloseTo(2.85, 2);
    // And the reason it is 2.85 s rides along with the number: one board measured that moment
    // and the other derived it. A spread reported without this is uninterpretable.
    expect(endurance.alignment.burns.map((b) => [b.name, b.provenance])).toEqual([
      ['telemetrum', 'measured'],
      ['stratologger', 'derived'],
    ]);
  });

  it('never separated one flight from another anyway', () => {
    // Measured over the corpus: the genuine staged pair agrees to 0.290 s, and the Kairos booster
    // paired with unrelated flights from other launches lands at 0.750 s and 0.910 s. No tolerance
    // sits between those, which is the third reason the gate is gone rather than merely widened.
    // Corpus event times to the hundredth: booster liftoff 0.17 / burnout 5.30 (5.13 s of burn),
    // sustainer 307.67 / 312.51 (4.84 s), IREC TeleMega 0.24 / 6.12 (5.88 s).
    const genuine = alignStages([rec('kairos-booster', 0.17, 5.3), rec('kairos-sustainer', 307.67, 312.51)]);
    const unrelated = alignStages([rec('kairos-booster', 0.17, 5.3), rec('irec2023-telemega', 0.24, 6.12)]);
    expect(genuine.ok && unrelated.ok).toBe(true);
    if (!genuine.ok || !unrelated.ok) return;
    expect(genuine.alignment.burnDurationSpreadS).toBeCloseTo(0.29, 2);
    expect(unrelated.alignment.burnDurationSpreadS).toBeCloseTo(0.75, 2);
    // Both are alignments with `verified: false`; neither is a claim that the files belong
    // together. That statement is the flyer's.
    expect(unrelated.alignment.verified).toBe(false);
  });
});
