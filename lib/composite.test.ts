import { describe, it, expect } from 'vitest';
import { buildComposite, fmtCompositeTime, SIMULTANEITY_S, type CompositeRecording } from './composite';
import type { EventType, FlightAnalysis } from './analyze/types';

/** The three members this module reads — a recording's events, their indices, and the altitude
 *  those indices point at — so a test says exactly which facts the composite rests on. */
function rec(
  name: string,
  events: { type: EventType; time: number; alt?: number }[],
): CompositeRecording {
  const altitude = new Float64Array(events.length ? Math.max(...events.map((_, i) => i)) + 1 : 0);
  const evs = events.map((e, i) => {
    altitude[i] = e.alt ?? NaN;
    return { type: e.type, label: e.type, time: e.time, index: i, provenance: 'measured' };
  });
  return { name, analysis: { events: evs, series: { altitude } } as unknown as FlightAnalysis };
}

/** The corpus's real staged pair, to the tenth: the booster's log opens essentially at the launch,
 *  and the sustainer's carries a 307.5 s pad wait before the same instant. */
const BOOSTER = rec('booster.csv', [
  { type: 'liftoff', time: 0.2, alt: 0 },
  { type: 'burnout', time: 5.3, alt: 900 },
  { type: 'apogee', time: 22.9, alt: 2973 },
]);
const SUSTAINER = rec('sustainer.csv', [
  { type: 'liftoff', time: 307.7, alt: 0 },
  { type: 'burnout', time: 312.5, alt: 1400 },
  { type: 'apogee', time: 335.3, alt: 4045 },
]);

describe('buildComposite', () => {
  it('puts both recordings’ marks in one order on the launch they share', () => {
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { marks } = out.composite;
    // Six marks, in composite order, each naming where it came from. This IS the milestone's
    // "events read in order across staging, each mark naming the recording it came from".
    expect(marks.map((m) => `${Math.round(m.t)}|${m.type}|${m.recording}`)).toEqual([
      '0|liftoff|booster.csv',
      '0|liftoff|sustainer.csv',
      // The sustainer's own burn is 4.8 s after ITS liftoff and the booster's is 5.1 s after its,
      // so by the clock the sustainer's lands first. Both boards were in one airframe watching one
      // motor, so that ordering means nothing — which is what `tiedWithPrevious` is for, below.
      '5|burnout|sustainer.csv',
      '5|burnout|booster.csv',
      '23|apogee|booster.csv',
      '28|apogee|sustainer.csv',
    ]);
    // The sustainer's apogee lands AFTER the booster's, which is the whole point of ordering them.
    const apogees = marks.filter((m) => m.type === 'apogee');
    expect(apogees[0].recording).toBe('booster.csv');
    expect(apogees[1].t).toBeGreaterThan(apogees[0].t);
  });

  it('never reports a composite as verified, whatever it is given', () => {
    // A field rather than an omission, so a surface built on this has to look at it. There is no
    // path to true: nothing in the records establishes that they belong to one launch.
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok && out.composite.verified).toBe(false);
    expect(out.ok && out.composite.method).toBe('shared liftoff');
  });

  it('says which marks are too close together to be ordered', () => {
    // Both stages leave the pad at T+0 and both boards see the same first-stage burn, so those
    // pairs are simultaneous within the alignment's own resolution. A table that printed them as
    // an order would be claiming a precision the measurement refuses.
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const tied = out.composite.marks.filter((m) => m.tiedWithPrevious).map((m) => `${m.type}|${m.recording}`);
    expect(tied).toEqual(['liftoff|sustainer.csv', 'burnout|booster.csv']);
    // …and the apogees, seconds apart, are NOT tied — the ordering a composite exists for survives.
    expect(out.composite.marks.find((m) => m.type === 'apogee' && m.recording === 'sustainer.csv')!.tiedWithPrevious).toBe(
      false,
    );
  });

  it('lets the flyer’s stated first stage break a tie, and nothing else', () => {
    // The statement is a LABEL, not a gate. Stating it either way must give the same offsets,
    // because every stage leaves the pad together and the alignment never reads it — all it may
    // do is order two marks that land at the same instant.
    const a = buildComposite([SUSTAINER, BOOSTER], 'booster.csv');
    const b = buildComposite([SUSTAINER, BOOSTER], 'sustainer.csv');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.composite.offsets).toEqual(b.composite.offsets);
    expect(a.composite.marks[0].recording).toBe('booster.csv');
    expect(b.composite.marks[0].recording).toBe('sustainer.csv');
    // And it leads the whole simultaneity group, not just an exact tie: naming the booster puts
    // its burnout ahead of the sustainer's 0.3 s earlier one, which is the only ordering of that
    // pair anything supports.
    expect(a.composite.marks.filter((m) => m.type === 'burnout').map((m) => m.recording)).toEqual([
      'booster.csv',
      'sustainer.csv',
    ]);
    // Naming a recording that is not there orders nothing and is not an error.
    const c = buildComposite([SUSTAINER, BOOSTER], 'nothing.csv');
    expect(c.ok && c.composite.marks.length).toBe(6);
  });

  it('refuses, by name and with a reason, when a recording has no launch in it', () => {
    const noLiftoff = rec('sustainer.csv', [{ type: 'apogee', time: 40, alt: 4045 }]);
    const out = buildComposite([BOOSTER, noLiftoff]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.recordings).toEqual(['sustainer.csv']);
    expect(out.refusal.why).toMatch(/no liftoff/i);
    expect(out.refusal.why).toMatch(/no moment in common/i);
  });

  it('refuses a composite of one', () => {
    const out = buildComposite([BOOSTER]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.why).toMatch(/at least two/i);
  });

  it('carries each recording’s burn with its provenance, and gates on none of it', () => {
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 5.1 s and 4.8 s from their own liftoffs. Two boards on one motor compare DEFINITIONS as
    // much as they compare the flight, so this is shown and never used to accept or reject.
    expect(out.composite.burns.map((b) => b.name)).toEqual(['booster.csv', 'sustainer.csv']);
    expect(out.composite.burns[0].durationS).toBeCloseTo(5.1, 5);
    expect(out.composite.burns[1].durationS).toBeCloseTo(4.8, 5);
    expect(out.composite.burns.every((b) => b.provenance === 'measured')).toBe(true);
  });

  it('names a recording that carried no marks rather than dropping it silently', () => {
    // A recording with a liftoff and nothing else is not a failure, but a table that simply
    // omitted it would leave the flyer unable to tell it from a file that never loaded.
    const quiet = rec('quiet.csv', [{ type: 'liftoff', time: 1, alt: 0 }]);
    const out = buildComposite([BOOSTER, quiet]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.composite.silent).toEqual([]);
    expect(out.composite.marks.filter((m) => m.recording === 'quiet.csv')).toHaveLength(1);
  });

  it('carries each mark’s own altitude and never one made out of both', () => {
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const apogees = out.composite.marks.filter((m) => m.type === 'apogee');
    expect(apogees.map((m) => m.altitudeM)).toEqual([2973, 4045]);
    // Nothing on the composite is a blend: no field holds a merged reading of any kind.
    expect(Object.keys(out.composite).sort()).toEqual(
      ['burns', 'marks', 'method', 'offsets', 'silent', 'verified'].sort(),
    );
  });

  it('carries whether each mark’s own recording is one Debrief made up, per mark', () => {
    // A composite is the one table in this app whose rows come from DIFFERENT flights, so the
    // question "is this made up" has a different answer per row and a blanket flag can only
    // label everything or nothing.
    const out = buildComposite([{ ...BOOSTER, synthetic: true }, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const boosterMarks = out.composite.marks.filter((m) => m.recording === 'booster.csv');
    const sustainerMarks = out.composite.marks.filter((m) => m.recording === 'sustainer.csv');
    expect(boosterMarks.length).toBeGreaterThan(0);
    expect(sustainerMarks.length).toBeGreaterThan(0);
    expect(boosterMarks.every((m) => m.synthetic)).toBe(true);
    // BOTH directions: labelling the real recording too is the mutant a one-sided assertion
    // passes against, and it is the wrong claim in the more damaging direction.
    expect(sustainerMarks.every((m) => m.synthetic === false)).toBe(true);
  });

  it('reads an unstated recording as recorded rather than as unknown', () => {
    // `synthetic` is optional on the input because a caller that was never told cannot honestly
    // claim either way — but the MARK is always a boolean, so no surface downstream has to decide
    // what `undefined` means in a cell a flyer reads.
    const out = buildComposite([BOOSTER, SUSTAINER]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.composite.marks.every((m) => m.synthetic === false)).toBe(true);
  });

  it('labels by the recording that drew the mark, not by its name', () => {
    // Two logbook rows can share a file name — two launch days both holding a `data.csv` — so a
    // name-keyed lookup would label the real one as made up. Positional cannot.
    const same = rec('data.csv', [
      { type: 'liftoff', time: 0.2, alt: 0 },
      { type: 'apogee', time: 19.4, alt: 1500 },
    ]);
    const out = buildComposite([{ ...BOOSTER, name: 'data.csv', synthetic: true }, same]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const apogees = out.composite.marks.filter((m) => m.type === 'apogee');
    // Same name on both, and exactly one of them is the made-up one.
    expect(apogees.map((m) => m.recording)).toEqual(['data.csv', 'data.csv']);
    expect(apogees.filter((m) => m.synthetic).length).toBe(1);
    expect(apogees.find((m) => m.synthetic)!.altitudeM).toBe(2973);
  });
});

describe('fmtCompositeTime', () => {
  it('prints whole seconds, because a tenth would be a precision the alignment cannot support', () => {
    // Two boards in ONE airframe still want a further 0.56–0.74 s to agree once aligned, so a
    // tenth on a composite clock is a claim about the alignment that the corpus refuses.
    expect(fmtCompositeTime(0)).toBe('T+0 s');
    expect(fmtCompositeTime(22.94)).toBe('T+23 s');
    expect(fmtCompositeTime(27.6)).toBe('T+28 s');
    expect(fmtCompositeTime(-0.2)).toBe('T+0 s');
    expect(fmtCompositeTime(-1.6)).toBe('T−2 s');
    // And the resolution the printing uses is the same one the ordering refuses to claim inside.
    expect(SIMULTANEITY_S).toBe(1);
  });
});
