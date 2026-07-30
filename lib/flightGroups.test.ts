import { describe, it, expect } from 'vitest';
import { groupRecordings, isGrouped, planGrouping, planJoin, planSeparation, recordingSpread } from './flightGroups';
import type { RecentMeta } from './recents';

const row = (id: string, over: Partial<RecentMeta> = {}): RecentMeta => ({
  id,
  name: `${id}.csv`,
  formatLabel: 'Generic CSV',
  addedAt: 1_700_000_000_000,
  apogeeM: 100,
  maxVelocityMs: 50,
  note: '',
  ...over,
});

describe('groupRecordings', () => {
  it('leaves a logbook of ordinary flights exactly as it found it', () => {
    // The case that has to cost nothing: nobody has said anything about recordings, so every
    // row is its own flight, in the order it arrived, reported by itself.
    const rows = [row('a'), row('b'), row('c')];
    const out = groupRecordings(rows);
    expect(out.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((g) => g.recordings.length)).toEqual([1, 1, 1]);
    expect(out.map((g) => g.primary)).toEqual(rows);
    expect(out.every((g) => !isGrouped(g))).toBe(true);
  });

  it('reads two files as one flight once the flyer has said so', () => {
    const out = groupRecordings([row('a', { flightId: 'a' }), row('b', { flightId: 'a' }), row('c')]);
    expect(out.map((g) => g.id)).toEqual(['a', 'c']);
    expect(out[0].recordings.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out[0].primary.id).toBe('a');
    expect(isGrouped(out[0])).toBe(true);
    expect(isGrouped(out[1])).toBe(false);
  });

  it('puts the recording that reports the flight first, wherever it sits in the list', () => {
    // The backup altimeter's file can easily be the one dropped first.
    const out = groupRecordings([row('b', { flightId: 'a' }), row('a', { flightId: 'a' })]);
    expect(out[0].primary.id).toBe('a');
    expect(out[0].recordings.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the flight when its reporting recording is removed', () => {
    // Removing a row does not rewrite the rows that pointed at it, and must not have to: the
    // flight is still that flyer's flight. Without promotion the survivors would each stand
    // alone again and the flight would silently come apart.
    const out = groupRecordings([row('b', { flightId: 'gone' }), row('c', { flightId: 'gone' })]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
    expect(out[0].recordings.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('does not walk a chain a hand-edited backup could carry', () => {
    // a → b → c. Only one hop is ever written, so this shape can only arrive from an edited
    // backup. Each row keeps the membership it states and nothing is followed, so a cycle
    // cannot hang the list — a goes with b's key, b and c go together, and no row is lost.
    const out = groupRecordings([row('a', { flightId: 'b' }), row('b', { flightId: 'c' }), row('c')]);
    expect(out.flatMap((g) => g.recordings.map((r) => r.id)).sort()).toEqual(['a', 'b', 'c']);
    expect(out.find((g) => g.recordings.some((r) => r.id === 'c'))!.recordings.map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('survives a row that points at itself and a cycle of two', () => {
    const self = groupRecordings([row('a', { flightId: 'a' })]);
    expect(self).toHaveLength(1);
    expect(self[0].recordings.map((r) => r.id)).toEqual(['a']);

    const cycle = groupRecordings([row('a', { flightId: 'b' }), row('b', { flightId: 'a' })]);
    expect(cycle.map((g) => g.recordings.length).sort()).toEqual([1, 1]);
  });

  it('holds four recordings of one flight as one flight', () => {
    // The corpus case: four AltimeterCloud boards in one airframe. Their apogees agree to
    // 0.20 m over 756 m and their top speeds spread 10.9 m/s — all four device-measured, so that
    // spread is between four instruments, not between two ways of arriving at a speed — which is why
    // the flight is reported by ONE of them by name rather than by a number made of all four.
    const four = ['1784', '1785', '1786', '1796'].map((id, i) =>
      row(id, { flightId: '1784', apogeeM: [756.675, 756.544, 756.659, 756.745][i], maxVelocityMs: [164.83, 167.78, 156.91, 159.42][i] }),
    );
    const out = groupRecordings(four);
    expect(out).toHaveLength(1);
    expect(out[0].recordings).toHaveLength(4);
    expect(out[0].primary.apogeeM).toBe(756.675);
  });
});

describe('planGrouping', () => {
  it('points every named row at the recording that will report the flight', () => {
    expect(planGrouping(['a', 'b', 'c'], 'a')).toEqual([
      { id: 'a', flightId: 'a' },
      { id: 'b', flightId: 'a' },
      { id: 'c', flightId: 'a' },
    ]);
  });

  it('can hand the flight to a different recording without touching the others’ membership', () => {
    expect(planGrouping(['a', 'b'], 'b')).toEqual([
      { id: 'a', flightId: 'b' },
      { id: 'b', flightId: 'b' },
    ]);
  });

  it('refuses to make a flight of one recording, or one reported by a stranger', () => {
    expect(planGrouping(['a'], 'a')).toEqual([]);
    expect(planGrouping([], 'a')).toEqual([]);
    expect(planGrouping(['a', 'a'], 'a'), 'the same row twice is still one row').toEqual([]);
    expect(planGrouping(['a', 'b'], 'z'), 'a reporting recording none of these rows can see').toEqual([]);
  });
});

describe('planSeparation', () => {
  it('gives every recording its own flight back', () => {
    const group = groupRecordings([row('a', { flightId: 'a' }), row('b', { flightId: 'a' })])[0];
    expect(planSeparation(group)).toEqual([
      { id: 'a', flightId: null },
      { id: 'b', flightId: null },
    ]);
  });

  it('round-trips: joined then separated is where it started', () => {
    const rows = [row('a'), row('b'), row('c')];
    const joined = rows.map((r) => {
      const change = planGrouping(['a', 'b'], 'a').find((c) => c.id === r.id);
      return change ? { ...r, flightId: change.flightId } : r;
    });
    expect(groupRecordings(joined)).toHaveLength(2);

    const group = groupRecordings(joined).find((g) => isGrouped(g))!;
    const separated = joined.map((r) => {
      const change = planSeparation(group).find((c) => c.id === r.id);
      if (!change) return r;
      const { flightId: _drop, ...rest } = r;
      return rest as RecentMeta;
    });
    expect(groupRecordings(separated).map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });
});

/**
 * Joining two flights that ALREADY carry recordings. The list shows one row per flight, so
 * ticking two rows and saying "these are one flight" names two FLIGHTS — and every recording of
 * both has to move. Re-pointing only the two visible rows left the second flight's other
 * recordings pointing at a row that was no longer a primary, which ejected them into flights of
 * their own: the flyer's earlier statement destroyed by an action that never named those rows.
 */
describe('joining flights that already have recordings', () => {
  const rows = [row('P', { flightId: 'P' }), row('Q', { flightId: 'P' }), row('R', { flightId: 'R' }), row('S', { flightId: 'R' })];

  it('loses nobody — planJoin moves every recording of both', () => {
    const before = groupRecordings(rows);
    expect(before.map((g) => g.recordings.length)).toEqual([2, 2]);

    const plan = planJoin(before);
    const after = groupRecordings(rows.map((r) => ({ ...r, flightId: plan.find((c) => c.id === r.id)!.flightId })));
    expect(after).toHaveLength(1);
    expect(after[0].recordings.map((r) => r.id)).toEqual(['P', 'Q', 'R', 'S']);
  });

  it('ejects a recording when only the two visible rows are named — the bug this guards', () => {
    // Kept as a test rather than a comment: it is the exact shape the UI produced, and the
    // difference between the two is one `flatMap`.
    const plan = planGrouping(['P', 'R'], 'P');
    const after = groupRecordings(rows.map((r) => { const c = plan.find((x) => x.id === r.id); return c ? { ...r, flightId: c.flightId } : r; }));
    expect(after.map((g) => g.recordings.map((x) => x.id))).toEqual([['P', 'Q', 'R'], ['S']]);
  });
});

describe('planJoin', () => {
  const at = (n: number) => ({ addedAt: 1_700_000_000_000 + n * 1000 });

  it('reports the flight by the recording opened first, not the one that read highest', () => {
    // The trap this exists to close: taking the first row in the LIST's order nominates the
    // largest reading whenever the flyer has sorted by Apogee or Speed, which would have
    // Debrief pick a winner between two instruments.
    const hi = row('hi', { apogeeM: 756.745, ...at(9) });
    const lo = row('lo', { apogeeM: 756.544, ...at(1) });
    const solo = (r: RecentMeta) => ({ id: r.id, primary: r, recordings: [r] });

    // …in either order of presentation, and whichever read higher.
    for (const order of [[hi, lo], [lo, hi]]) {
      const plan = planJoin(order.map(solo));
      expect(plan.every((c) => c.flightId === 'lo'), 'the earliest-opened recording reports it').toBe(true);
      expect(plan.map((c) => c.id).sort()).toEqual(['hi', 'lo']);
    }
  });

  it('is nothing for fewer than two recordings', () => {
    const one = row('a');
    expect(planJoin([{ id: 'a', primary: one, recordings: [one] }])).toEqual([]);
    expect(planJoin([])).toEqual([]);
  });

  it('carries the recordings of flights that already had them', () => {
    const groups = groupRecordings([row('P', { flightId: 'P', ...at(2) }), row('Q', { flightId: 'P', ...at(3) }), row('R', { flightId: 'R', ...at(1) }), row('S', { flightId: 'R', ...at(4) })]);
    const plan = planJoin(groups);
    expect(plan.map((c) => c.id).sort()).toEqual(['P', 'Q', 'R', 'S']);
    expect(new Set(plan.map((c) => c.flightId))).toEqual(new Set(['R']));
  });
});

describe('recordingSpread', () => {
  const four = ['1784', '1785', '1786', '1796'].map((id, i) =>
    row(id, { flightId: '1784', apogeeM: [756.675, 756.544, 756.659, 756.745][i], maxVelocityMs: [164.83, 167.78, 156.91, 159.42][i] }),
  );

  it('reports the corpus\u2019s four-altimeter flight the way it actually reads', () => {
    const out = recordingSpread(groupRecordings(four)[0]);
    expect(out.map((s) => s.label)).toEqual(['apogee']);
    expect(out[0].pct).toBeCloseTo(0.027, 2);
    expect(out[0].count).toBe(4);
  });

  it('never reports a TOP SPEED spread, because two boards can measure it two different ways', () => {
    // Measured over all six same-flight groups in the corpus: apogee runs 0.03% to 2.29% and
    // never higher, because apogee is altitude-sourced on every logger. Top speed runs 2.56% to
    // 81.65%, and the two widest — 26.37% on iss-endurance and 81.65% on trf-lemiv-l3 — are
    // exactly the two groups that pair a device-MEASURED speed with a DERIVED one. Those are
    // documented, correctly-grouped flights, so a row showing that figure would have told their
    // owners their grouping was wrong. The logbook stores no `maxVelocitySource` and so cannot
    // caveat it; the comparison surface, which has the whole analysis, already does.
    const mixed = [row('device', { flightId: 'device', apogeeM: 2841, maxVelocityMs: 315 }), row('derived', { flightId: 'device', apogeeM: 2855, maxVelocityMs: 410 })];
    const out = recordingSpread(groupRecordings(mixed)[0]);
    expect(out.map((s) => s.label)).toEqual(['apogee']);
    expect(out[0].pct, 'the apogee spread is the honest one, and it is small').toBeLessThan(1);
  });

  it('says nothing at all when a recording carries a crop', () => {
    // A cropped recording's stored apogee is the CROP's apogee. Comparing it with an uncropped
    // one measures two different stretches and paints the flyer's own choice as instrument
    // disagreement — measured: an ordinary "look at the motor" crop of one corpus recording
    // stores 646.6 m where the whole flight reads 756.7, which is a fabricated 15% gap.
    const cropped = [row('a', { flightId: 'a', apogeeM: 646.6, read: { fromS: 5, toS: 20 } }), row('b', { flightId: 'a', apogeeM: 756.7 })];
    expect(recordingSpread(groupRecordings(cropped)[0])).toEqual([]);
    // …and it comes back once the crop is gone.
    const whole = [row('a', { flightId: 'a', apogeeM: 756.6 }), row('b', { flightId: 'a', apogeeM: 756.7 })];
    expect(recordingSpread(groupRecordings(whole)[0])).toHaveLength(1);
  });

  it('is zero — not absent — when two recordings agree exactly', () => {
    const pair = [row('a', { flightId: 'a', apogeeM: 2995.674 }), row('b', { flightId: 'a', apogeeM: 2995.674 })];
    expect(recordingSpread(groupRecordings(pair)[0])[0]).toEqual({ label: 'apogee', pct: 0, count: 2 });
  });

  it('leaves a withheld apogee out and says how many it had', () => {
    const mixed = [
      row('a', { flightId: 'a', apogeeM: 1000 }),
      row('b', { flightId: 'a', apogeeM: null }),
      row('c', { flightId: 'a', apogeeM: 1005 }),
    ];
    expect(recordingSpread(groupRecordings(mixed)[0])[0].count, 'two of three, and it says so').toBe(2);
  });

  it('says nothing at all about a flight recorded once', () => {
    expect(recordingSpread(groupRecordings([row('solo')])[0])).toEqual([]);
  });
});
