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

/**
 * **A flight Debrief made up is not one of your flights, and the star says "your flights".**
 *
 * This is the opposite treatment to the caveated apogee above and the difference is the point. A
 * caveat says Debrief cannot settle how high THIS flight went — so it might have been the highest,
 * and the whole set stops ranking. A synthetic flight was never flown: it did not go higher and it
 * did not go lower, so it drops out and the real flights rank against each other exactly as they
 * did before it was opened.
 *
 * Both directions are asserted, because getting this wrong in the second direction — a
 * demonstration file quietly suppressing a real flyer's personal best — is the version nobody
 * would notice.
 */
describe('the logbook does not crown a flight Debrief made up', () => {
  it('never gives the star to a synthetic flight, on either metric', () => {
    // Two REAL flights, because a best-of-one is not a record on either metric — the synthetic
    // one must not be allowed to make up the numbers either.
    const best = personalBests([
      row({ id: 'small', apogeeM: 300, maxVelocityMs: 60 }),
      row({ id: 'real', apogeeM: 500, maxVelocityMs: 90 }),
      row({ id: 'demo', apogeeM: 1666, maxVelocityMs: 173, synthetic: true }),
    ]);
    expect(best.apogeeId, 'a made-up apogee cannot be the highest of your remembered flights').toBe('real');
    expect(best.speedId, 'nor the fastest').toBe('real');
  });

  it('does not let a demonstration file suppress a real flyer’s best', () => {
    // Without the exclusion this set has two finite apogees and the synthetic one wins; with a
    // whole-set block (the caveat rule) nobody wins and the flyer silently loses a star they had.
    // Dropped instead, so the two real flights settle it between themselves.
    const best = personalBests([
      row({ id: 'a', apogeeM: 500 }),
      row({ id: 'b', apogeeM: 2115 }),
      row({ id: 'demo', apogeeM: 99_999, synthetic: true }),
    ]);
    expect(best.apogeeId).toBe('b');
  });

  it('a set of one real flight beside a demonstration still crowns nothing', () => {
    // `uniqueMaxId` needs two finite values: a best-of-one is not a record. The synthetic flight
    // must not be the second one that makes it look like a set.
    const best = personalBests([
      row({ id: 'a', apogeeM: 500 }),
      row({ id: 'demo', apogeeM: 1666, synthetic: true }),
    ]);
    expect(best.apogeeId).toBeNull();
  });

  it('survives the projection the list actually reads', () => {
    const stored = {
      id: 'demo',
      name: 'demo-mapper-flight.csv',
      formatLabel: 'Mapped by hand',
      addedAt: 1,
      apogeeM: 1666,
      maxVelocityMs: 173,
      synthetic: true,
      note: '',
      text: 'T,Alt\n0,0\n',
    } as RecentFlight;
    expect(toMeta(stored).synthetic).toBe(true);
    const best = personalBests([row({ id: 'a', apogeeM: 500 }), row({ id: 'b', apogeeM: 700 }), toMeta(stored)]);
    expect(best.apogeeId).toBe('b');
  });
});
