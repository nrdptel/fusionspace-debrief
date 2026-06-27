// Logbook helpers over the remembered recent flights: ordering and the
// personal-best crowns. Pure and tiny so they're easy to test; the bests are
// only "best of the flights you have on this device", never an all-time claim.

import type { RecentMeta } from './recents';

export type LogbookSort = 'recent' | 'apogee' | 'speed';

/** A copy of the list ordered by the chosen key (descending for the metrics,
 *  most-recent-first for time). Missing values sink to the bottom. */
export function sortRecents(recents: RecentMeta[], sort: LogbookSort): RecentMeta[] {
  const out = [...recents];
  const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : -Infinity);
  if (sort === 'apogee') out.sort((a, b) => num(b.apogeeM) - num(a.apogeeM));
  else if (sort === 'speed') out.sort((a, b) => num(b.maxVelocityMs) - num(a.maxVelocityMs));
  else out.sort((a, b) => b.addedAt - a.addedAt);
  return out;
}

/** The id holding the single highest value of `get`, or null when fewer than two
 *  flights have a finite value or the top is tied (a best-of-one or a tie isn't a
 *  record worth crowning — mirrors the comparison table's rule). */
function uniqueMaxId(recents: RecentMeta[], get: (r: RecentMeta) => number | null): string | null {
  let bestId: string | null = null;
  let bestV = -Infinity;
  let finite = 0;
  let ties = 0;
  for (const r of recents) {
    const v = get(r);
    if (v == null || !Number.isFinite(v)) continue;
    finite++;
    if (v > bestV) {
      bestV = v;
      bestId = r.id;
      ties = 1;
    } else if (v === bestV) {
      ties++;
    }
  }
  return finite >= 2 && ties === 1 ? bestId : null;
}

/** Which remembered flight holds the best apogee and the best top speed. */
export function personalBests(recents: RecentMeta[]): { apogeeId: string | null; speedId: string | null } {
  return {
    apogeeId: uniqueMaxId(recents, (r) => r.apogeeM),
    speedId: uniqueMaxId(recents, (r) => r.maxVelocityMs),
  };
}
