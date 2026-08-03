import { describe, it, expect } from 'vitest';
import { personalBests } from './logbook';
import { toMeta } from './recents';
import type { RecentMeta, RecentFlight } from './recents';

const row = (o: Partial<RecentMeta>): RecentMeta =>
  ({
    id: o.id ?? 'x',
    name: o.name ?? 'f.csv',
    formatLabel: 'Eggtimer',
    addedAt: 1,
    apogeeM: null,
    maxVelocityMs: null,
    note: '',
    ...o,
  }) as RecentMeta;

/**
 * **A star is a ranking, and a ranking needs a number the app is willing to stand behind.**
 *
 * The report prints a caveated apogee as *"(at least)"* or *"unproven"*; the comparison refuses its
 * crown outright. The logbook was the last surface still ranking on the bare figure — so a flight
 * whose height Debrief has disowned could wear ★ *"Highest of your remembered flights"*.
 * `ROADMAP.md`'s P1 item named this as what its own last increment did NOT close, and said why: it
 * wants a field on the persisted store.
 */
describe('the logbook does not crown an apogee Debrief has qualified', () => {
  it('crowns the highest of a set it can settle', () => {
    const best = personalBests([
      row({ id: 'a', apogeeM: 500 }),
      row({ id: 'b', apogeeM: 2115 }),
      row({ id: 'c', apogeeM: 900 }),
    ]);
    expect(best.apogeeId).toBe('b');
  });

  it('withholds the star once any flight in the set carries an apogee caveat', () => {
    for (const caveat of [{ floor: true }, { unproven: true }, { floor: true, unproven: true }]) {
      const best = personalBests([
        row({ id: 'a', apogeeM: 500 }),
        row({ id: 'b', apogeeM: 2115, apogeeCaveats: caveat }),
      ]);
      expect(best.apogeeId, `caveat ${JSON.stringify(caveat)}`).toBeNull();
    }
  });

  it('withholds it even when the caveated flight is NOT the highest', () => {
    // Whole-set, not per-flight. Handing the star to the runner-up would be a stronger claim than
    // the data supports: the disowned flight may well have gone higher.
    const best = personalBests([
      row({ id: 'a', apogeeM: 2115 }),
      row({ id: 'b', apogeeM: 500, apogeeCaveats: { floor: true } }),
    ]);
    expect(best.apogeeId).toBeNull();
  });

  it('leaves the SPEED star alone — a caveated altitude says nothing about it', () => {
    const best = personalBests([
      row({ id: 'a', apogeeM: 500, maxVelocityMs: 100 }),
      row({ id: 'b', apogeeM: 2115, maxVelocityMs: 340, apogeeCaveats: { unproven: true } }),
    ]);
    expect(best.apogeeId).toBeNull();
    expect(best.speedId, 'the speed ranking is untouched').toBe('b');
  });

  it('a row with a caveat but no apogee cannot block a star', () => {
    // A flight with no height at all is not in the apogee ranking, so its flags are irrelevant —
    // without this guard one unreadable row would silently disable the star for a whole logbook.
    const best = personalBests([
      row({ id: 'a', apogeeM: 500 }),
      row({ id: 'b', apogeeM: 2115 }),
      row({ id: 'c', apogeeM: null, apogeeCaveats: { floor: true } }),
    ]);
    expect(best.apogeeId).toBe('b');
  });

  it('an older row, written before the field existed, keeps exactly its old behaviour', () => {
    // `apogeeCaveats` is absent on every row stored before 2026-08-03. Absent means qualified: a
    // migration that silently withheld every star would be a worse regression than the defect.
    const best = personalBests([row({ id: 'a', apogeeM: 500 }), row({ id: 'b', apogeeM: 2115 })]);
    expect(best.apogeeId).toBe('b');
  });

  it('survives the projection the list actually reads', () => {
    // `personalBests` runs over `RecentMeta`, which `toMeta` builds from the stored flight. If the
    // projection drops the field the star comes back and nothing else fails.
    const stored = {
      id: 'b',
      name: 'f.csv',
      formatLabel: 'Eggtimer',
      addedAt: 1,
      apogeeM: 2115,
      maxVelocityMs: null,
      apogeeCaveats: { unproven: true },
      note: '',
      text: 'T,Alt\n0,0\n',
    } as RecentFlight;
    expect(toMeta(stored).apogeeCaveats).toEqual({ unproven: true });
    expect(personalBests([row({ id: 'a', apogeeM: 500 }), toMeta(stored)]).apogeeId).toBeNull();
  });
});
