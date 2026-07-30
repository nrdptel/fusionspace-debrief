import { describe, it, expect } from 'vitest';
import { alignStages, openedAtRest, type StageRecording } from './stitch';
import type { FlightAnalysis } from './analyze/types';

/** The two members of an analysis this module reads, and nothing else — so a test says exactly
 *  which facts the decision rests on. */
function rec(name: string, opts: { liftoffAt?: number | null; openingSpeed?: number; dt?: number }): StageRecording {
  const { liftoffAt = 1, openingSpeed = 0, dt = 0.1 } = opts;
  const n = 4000;
  const time = Float64Array.from({ length: n }, (_, i) => i * dt);
  // `openingSpeed` is what the record was doing BEFORE its own liftoff — on a pad, nothing; on a
  // sustainer whose logger starts at ignition, the speed it was already carrying.
  const velocity = Float64Array.from({ length: n }, (_, i) => (liftoffAt != null && time[i] < liftoffAt ? openingSpeed : 100));
  const analysis = {
    series: { time, velocity },
    events: liftoffAt == null ? [] : [{ type: 'liftoff', time: liftoffAt }],
  } as unknown as FlightAnalysis;
  return { name, analysis };
}

describe('openedAtRest', () => {
  it('is true for a record that opens on the pad', () => {
    // Barometric noise on a still rocket, not stillness to the last digit.
    expect(openedAtRest(rec('pad', { openingSpeed: 0 }).analysis)).toBe(true);
    expect(openedAtRest(rec('noisy pad', { openingSpeed: -1.13 }).analysis)).toBe(true);
  });

  it('is false for a record that opens already flying', () => {
    // A sustainer whose logger starts at boost detect. Its ALTITUDE reads near zero — the pad
    // datum is taken from its own opening samples — which is exactly why altitude cannot be the
    // check and speed has to be.
    expect(openedAtRest(rec('airborne', { liftoffAt: 5, openingSpeed: 120 }).analysis)).toBe(false);
    expect(openedAtRest(rec('coasting up', { liftoffAt: 5, openingSpeed: 27.4 }).analysis)).toBe(false);
  });

  it('is not fooled by a single spike in the samples before liftoff', () => {
    const r = rec('spiky', { liftoffAt: 5, openingSpeed: 0 });
    r.analysis.series.velocity[33] = 400; // one bad barometric sample inside the pad wait
    expect(openedAtRest(r.analysis)).toBe(true);
  });

  it('is false for a record whose liftoff is its very first sample', () => {
    // Nothing before it to measure, so the question cannot be answered — and an unanswerable
    // question is a refusal, not a pass. This is what a logger that starts at boost detect
    // actually looks like.
    expect(openedAtRest(rec('starts-at-boost', { liftoffAt: 0 }).analysis)).toBe(false);
  });

  it('reads the moments BEFORE liftoff, not the opening of the record', () => {
    // The corpus's booster refuted the obvious rule: its log opens 0.2 s before the launch, so a
    // window measured forward from the first sample is mostly BOOST and called a rocket on a pad
    // "already flying". Two tenths of a second of pad is still a pad.
    expect(openedAtRest(rec('short pad wait', { liftoffAt: 0.2, openingSpeed: 0 }).analysis)).toBe(true);
  });

  it('is false for an empty record rather than throwing', () => {
    const empty = { series: { time: new Float64Array(0), velocity: new Float64Array(0) }, events: [{ type: 'liftoff', time: 0 }] } as unknown as FlightAnalysis;
    expect(openedAtRest(empty)).toBe(false);
  });
});

describe('alignStages', () => {
  it('lines two stages up on the launch they share', () => {
    // The corpus's own staged pair, to the tenth: the booster's log opens essentially at the
    // launch (liftoff 0.2 s) and the sustainer's carries a 307 s pad wait before the same
    // moment (liftoff 307.7 s). Both left the pad together, so those two instants are one.
    const out = alignStages([rec('booster.csv', { liftoffAt: 0.2 }), rec('sustainer.csv', { liftoffAt: 307.7 })]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.alignment.method).toBe('shared liftoff');
    expect(out.alignment.offsets[0]).toBeCloseTo(-0.2, 6);
    expect(out.alignment.offsets[1]).toBeCloseTo(-307.7, 6);
    // …and the offsets put both launches at the same instant, which is the whole point.
    expect(0.2 + out.alignment.offsets[0]).toBeCloseTo(307.7 + out.alignment.offsets[1], 6);
  });

  it('refuses a stage whose log opens already flying, and says which file and why', () => {
    const out = alignStages([rec('booster.csv', { liftoffAt: 0.2 }), rec('sustainer.csv', { liftoffAt: 5, openingSpeed: 120 })]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings, 'names the file the flyer has to do something about').toEqual(['sustainer.csv']);
    expect(out.refusal.why).toContain('already moving when the log opened');
    // The refusal has to say what the alternative would have COST, or it reads as a limitation
    // rather than as the honest answer it is.
    expect(out.refusal.why).toContain('assuming a staging delay');
  });

  it('refuses a recording with no liftoff at all', () => {
    const out = alignStages([rec('booster.csv', { liftoffAt: 0.2 }), rec('fragment.csv', { liftoffAt: null })]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings).toEqual(['fragment.csv']);
    expect(out.refusal.why).toContain('no liftoff');
  });

  it('refuses one recording — a composite of one stage is not a composite', () => {
    expect(alignStages([rec('only.csv', {})]).ok).toBe(false);
    expect(alignStages([]).ok).toBe(false);
  });

  it('takes three stages as readily as two', () => {
    const out = alignStages([rec('a', { liftoffAt: 1 }), rec('b', { liftoffAt: 50 }), rec('c', { liftoffAt: 9 })]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.alignment.offsets).toEqual([-1, -50, -9]);
  });

  it('never guesses: there is no fallback when the shared moment is missing', () => {
    // Two stages, NEITHER of which caught the pad departure. A correlation of the traces, or an
    // assumed staging delay, would produce an alignment here — and it would be a guess wearing
    // a measurement's clothes. The answer is that Debrief cannot do it.
    const out = alignStages([rec('a', { liftoffAt: 5, openingSpeed: 90 }), rec('b', { liftoffAt: 5, openingSpeed: 140 })]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings).toEqual(['a', 'b']);
  });
});
