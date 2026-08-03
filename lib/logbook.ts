// Logbook helpers over the remembered recent flights: ordering and the
// personal-best crowns. Pure and tiny so they're easy to test; the bests are
// only "best of the flights you have on this device", never an all-time claim.

import type { RecentMeta } from './recents';
import { groupRecordings } from './flightGroups';
import { formatFlownAt } from './flight/flownAt';

export type LogbookSort = 'recent' | 'flown' | 'apogee' | 'speed';

/** A copy of the list ordered by the chosen key (descending for the metrics,
 *  most-recent-first for time). Missing values sink to the bottom. */
export function sortRecents(recents: RecentMeta[], sort: LogbookSort): RecentMeta[] {
  const out = [...recents];
  const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : -Infinity);
  if (sort === 'apogee') out.sort((a, b) => num(b.apogeeM) - num(a.apogeeM));
  else if (sort === 'speed') out.sort((a, b) => num(b.maxVelocityMs) - num(a.maxVelocityMs));
  else if (sort === 'flown') {
    // Newest launch day first. The stamps are 'YYYY-MM-DD…', so they order as strings; a
    // flight whose file states no date has no launch day to sort by and sinks to the
    // bottom rather than being given one.
    out.sort((a, b) => (b.flownAt?.stamp ?? '').localeCompare(a.flownAt?.stamp ?? ''));
  } else out.sort((a, b) => b.addedAt - a.addedAt);
  return out;
}

/**
 * The flights a search matches. A season's logbook runs to dozens of entries and sorting
 * alone doesn't find one: what a flyer remembers is the airframe, the launch, the motor —
 * so the search covers the file name, the logger it came off, and the note they wrote on it
 * (which is where the motor and conditions live).
 *
 * Every whitespace-separated term has to match somewhere, in any order, so "raven h135"
 * narrows to one flight where a single substring couldn't. The launch day the file stated is
 * in there too, so "oct 2021" finds a launch. Case- and accent-insensitive;
 * an empty or whitespace query matches everything rather than nothing.
 */
export function filterRecents(recents: RecentMeta[], query: string): RecentMeta[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return recents;
  return recents.filter((r) => {
    // The launch day is searchable too, in the form it's shown: "oct 2021" or "2021-10".
    const hay = fold(`${r.name} ${r.formatLabel} ${r.note ?? ''} ${r.flownAt?.stamp ?? ''} ${formatFlownAt(r.flownAt)}`);
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

/**
 * Which remembered FLIGHT holds the best apogee and the best top speed.
 *
 * Over flights, not over files, and the difference is not cosmetic. A flyer who flies a
 * primary and a backup altimeter brings home two recordings of one flight, and until they are
 * one flight the crowns read them as two — which breaks the rule above in both directions at
 * once. Two recordings that agree EXACTLY are a tie, and a tie crowns nothing, so a flyer's
 * highest flight lost its star for having been recorded twice (the corpus has three such
 * pairs: an AltOS `.eeprom` beside AltosUI's export of the same bytes, an RRC3 `.rff` beside
 * its mDACS text export, a Blue Raven's two rates). Two that disagree slightly are two
 * entries either side of a third flight that actually sits between them.
 *
 * A flight is reported by the recording the flyer nominated, so that is the value that
 * competes — never the highest of its recordings, which would be a best-of dressed as a
 * measurement.
 */
export function personalBests(recents: RecentMeta[]): { apogeeId: string | null; speedId: string | null } {
  const flights = groupRecordings(recents).map((g) => g.primary);
  // **A star is a ranking, and a ranking needs a number the app is willing to stand behind.** The
  // report prints a caveated apogee as "(at least)" or "unproven"; the comparison refuses its
  // crown outright (`rankBlocked`). The logbook was the last surface still ranking on the bare
  // figure, so a flight whose height Debrief has disowned could wear "Highest of your remembered
  // flights". Mirrors the comparison's rule rather than inventing one: if any flight in the set
  // carries an apogee caveat, the set cannot settle which went highest.
  //
  // Whole-set, not per-flight, and that is deliberate: withholding the star only from the
  // caveated flight would hand it to the runner-up, which is a stronger claim than the data
  // supports — the disowned one may well have gone higher.
  const apogeeUnrankable = flights.some((r) => r.apogeeCaveats && r.apogeeM != null);
  return {
    apogeeId: apogeeUnrankable ? null : uniqueMaxId(flights, (r) => r.apogeeM),
    speedId: uniqueMaxId(flights, (r) => r.maxVelocityMs),
  };
}

/**
 * What to CALL each flight where a name has to identify it on its own — the accessible name
 * of a row's select, note and remove controls, and any message that names a flight the flyer
 * can no longer see.
 *
 * Two flights can share a file name: plenty of loggers write every export under one fixed
 * name, and the logbook keeps them apart by their contents rather than collapsing them. A
 * unique name is not optional here — three pairs of identically-named controls that do
 * different things is a screen reader with no way to tell which row it is on.
 *
 * So: the bare name where it is already unique; otherwise the facts the row itself paints,
 * which are what a flyer would use to tell them apart; and where even those collide — a
 * batch drop of one rocket's files all read "just now", and two apogees can round to the
 * same figure — an ordinal, because SOMETHING has to be different.
 *
 * Returned as a map rather than a predicate so the "is it unique" question is answered once
 * over the whole list instead of per row, and numbered against the list's own order, which
 * does not move when the flyer re-sorts the view.
 */
export function logbookRowNames(recents: RecentMeta[], fmtApogee: (m: number) => string, opened: (addedAt: number) => string): Map<string, string> {
  const tally = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

  const byName = tally(recents.map((r) => r.name));
  const described = recents.map((r) => {
    if ((byName.get(r.name) ?? 0) < 2) return r.name;
    const when = r.flownAt ? `flown ${formatFlownAt(r.flownAt)}` : `opened ${opened(r.addedAt)}`;
    return `${r.name}, ${when}${r.apogeeM != null ? `, apogee ${fmtApogee(r.apogeeM)}` : ''}`;
  });

  const byDescription = tally(described);
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  recents.forEach((r, i) => {
    const label = described[i];
    const total = byDescription.get(label) ?? 0;
    if (total < 2) {
      out.set(r.id, label);
      return;
    }
    const n = (used.get(label) ?? 0) + 1;
    used.set(label, n);
    out.set(r.id, `${label} (${n} of ${total})`);
  });
  return out;
}
