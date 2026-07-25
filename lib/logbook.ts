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

/**
 * The flights a search matches. A season's logbook runs to dozens of entries and sorting
 * alone doesn't find one: what a flyer remembers is the airframe, the launch, the motor —
 * so the search covers the file name, the logger it came off, and the note they wrote on it
 * (which is where the motor and conditions live).
 *
 * Every whitespace-separated term has to match somewhere, in any order, so "raven h135"
 * narrows to one flight where a single substring couldn't. Case- and accent-insensitive;
 * an empty or whitespace query matches everything rather than nothing.
 */
export function filterRecents(recents: RecentMeta[], query: string): RecentMeta[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return recents;
  return recents.filter((r) => {
    const hay = fold(`${r.name} ${r.formatLabel} ${r.note ?? ''}`);
    return terms.every((t) => hay.includes(t));
  });
}

/** Lower-cased and stripped of accents, so "Entacore" matches "entacore" and a pasted
 *  file name with a decomposed character still matches what was typed. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
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
