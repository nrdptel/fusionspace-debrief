import { describe, it, expect } from 'vitest';
import { alignStages, type StageRecording } from './stitch';
import type { FlightAnalysis } from './analyze/types';

/** The one member of an analysis this module reads — its events — so a test says exactly which
 *  facts the decision rests on. */
function rec(name: string, liftoffAt: number | null, burnoutAt?: number | null): StageRecording {
  const events = [
    ...(liftoffAt == null ? [] : [{ type: 'liftoff', time: liftoffAt }]),
    ...(burnoutAt == null ? [] : [{ type: 'burnout', time: burnoutAt }]),
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
    // …and the evidence rides along as a number the flyer can check rather than a claim.
    expect(out.alignment.burnoutSpreadS).toBeCloseTo(0.3, 1);
  });

  it('refuses when the boards disagree about the burn they both recorded', () => {
    // The failure this exists to catch: a sustainer whose logger started at its own ignition, so
    // its "liftoff" is really the second stage lighting up. Aligning on it shifts the composite
    // by the staging delay — and the burnouts then sit that far apart, which is how it is caught.
    const out = alignStages([rec('booster.csv', 0.2, 5.3), rec('sustainer.csv', 0.1, 1.4)]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings.slice().sort()).toEqual(['booster.csv', 'sustainer.csv']);
    expect(out.refusal.why).toContain('first-stage burnout');
    expect(out.refusal.why, 'says how far apart, not just that they differ').toMatch(/[0-9]+\.[0-9] s apart/);
    // The refusal has to say what the alternative would have COST, or it reads as a limitation
    // rather than as the honest answer it is.
    expect(out.refusal.why).toContain('assumed staging delay');
  });

  it('accepts the spread two boost detectors on one motor really produce', () => {
    // 0.29 s on the corpus pair. Either side of that must not be a refusal.
    for (const gap of [0, 0.29, 0.6, 0.99]) {
      expect(alignStages([rec('a', 1, 6), rec('b', 100, 105 + gap)]).ok, `${gap} s apart`).toBe(true);
    }
    // …and a staging delay, which is seconds, must be.
    for (const gap of [1.01, 3, 12]) {
      expect(alignStages([rec('a', 1, 6), rec('b', 100, 105 + gap)]).ok, `${gap} s apart`).toBe(false);
    }
  });

  it('ships uncorroborated rather than pretending, when only one board marked a burnout', () => {
    // Ordinary, and not a failure — but the alignment then rests on the liftoff alone, and that
    // has to be visible rather than implied.
    const out = alignStages([rec('a', 1, 6), rec('b', 100, null)]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.alignment.burnoutSpreadS, 'null is the flag that nothing corroborated this').toBeNull();
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

  it('takes three stages as readily as two, and holds all of them to the burn', () => {
    const ok = alignStages([rec('a', 1, 6), rec('b', 50, 55.2), rec('c', 9, 14.1)]);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.alignment.offsets).toEqual([-1, -50, -9]);
    expect(ok.alignment.burnoutSpreadS).toBeCloseTo(0.2, 6);
    // One stage out of three is enough to refuse the set — a composite is only as good as its
    // worst-placed member.
    expect(alignStages([rec('a', 1, 6), rec('b', 50, 55.2), rec('c', 9, 20)]).ok).toBe(false);
  });
});
