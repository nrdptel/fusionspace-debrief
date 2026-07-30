// One flight, several recordings.
//
// A flyer who flies two altimeters comes home with two files of ONE flight. The logbook
// stores a row per FILE — that is what a row is, and it has to stay that way, because a row
// holds the file's text and the parser that read it. So a flight that was recorded twice is
// two rows, shows up twice in the list, and is counted twice by everything that counts
// flights.
//
// This module is the layer above: it reads the flyer's own statement of which rows are one
// flight and hands back FLIGHTS rather than files. Nothing here decides that two files belong
// together — inferring the grouping is a different and much more dangerous problem, because a
// wrong automatic merge fabricates one flight out of two. The flyer says so, and this reads
// what they said.
//
// The statement itself is one optional string per row (`RecentMeta.flightId`):
//
//   absent            — a flight of its own, which is nearly every row
//   equal to its id   — this recording is the PRIMARY of its flight
//   some other id     — a second recording of the flight whose primary carries that id
//
// Keeping "which recording is primary" in the same field as "which flight is this" means the
// two can never disagree, and a single-recording flight costs exactly one absent optional
// member — no wrapper object, no second store, nothing to migrate.
//
// The readings stay per-recording throughout. Two altimeters that measured one flight are two
// independent measurements that can disagree, and a flight's headline figure is the one the
// flyer nominated, NAMED — never a mean, a maximum, or a consensus of the two.

import type { RecentMeta } from './recents';

export interface FlightGroup {
  /** The flight's id — always the primary recording's logbook id, so a flight has one stable
   *  address whether it holds one recording or four. */
  id: string;
  /** The recording whose readings the flight is reported by. */
  primary: RecentMeta;
  /** Every recording of this flight, primary first, then the rest in logbook order. */
  recordings: RecentMeta[];
}

/** Whether this row is one of several recordings of one flight. */
export function isGrouped(group: FlightGroup): boolean {
  return group.recordings.length > 1;
}

/**
 * The logbook's rows read as flights, in the order the rows were given — each flight standing
 * where the FIRST of its recordings sits, which is not necessarily the one that reports it.
 * Callers that care about order sort the flights themselves, on the reading of the recording
 * that reports each one, so this is a stable starting order and not a claim about ranking.
 *
 * Two things a stored grouping can be that the code must survive, because a logbook is edited
 * over months and a backup can be hand-edited:
 *
 *  - **the primary is gone.** Removing a row does not rewrite the rows that pointed at it, and
 *    it must not have to: the flight is still that flyer's flight. So the rows are collected
 *    by the key they were WRITTEN with, whether or not a row of that id is still here, and the
 *    first survivor is promoted to report the flight. Resolving each row against the rows
 *    present instead would hand every orphan back its own id and quietly take the flight apart.
 *  - **a chain.** A points at B and B points at C. Only one hop is ever written, so this can
 *    only arrive from a hand-edited backup; the key is taken as written and never followed, so
 *    a cycle cannot hang the list and A simply keeps the membership it states.
 */
export function groupRecordings(recents: RecentMeta[]): FlightGroup[] {
  // The flight a row states it belongs to — its own id where it states nothing, which is
  // nearly every row.
  const flightOf = (r: RecentMeta): string => r.flightId || r.id;

  const groups = new Map<string, RecentMeta[]>();
  for (const r of recents) {
    const key = flightOf(r);
    const at = groups.get(key);
    if (at) at.push(r);
    else groups.set(key, [r]);
  }

  const out: FlightGroup[] = [];
  for (const [key, members] of groups) {
    // The nominated primary where it is still here, else the first surviving recording. The
    // members arrive in the caller's order, so "first" is the logbook's own order and not an
    // accident of iteration.
    const primary = members.find((r) => r.id === key) ?? members[0];
    out.push({
      id: primary.id,
      primary,
      recordings: [primary, ...members.filter((r) => r !== primary)],
    });
  }
  return out;
}

/**
 * The flight one logbook row belongs to, or null when the row is not in the list.
 *
 * The report holds the id of the recording it is showing and needs the flight around it — to
 * say which of several instruments these readings came from, and to offer the others.
 */
export function groupOf(recents: RecentMeta[], id: string): FlightGroup | null {
  return groupRecordings(recents).find((g) => g.recordings.some((r) => r.id === id)) ?? null;
}

/**
 * Join several flights into one, and say which recording reports it.
 *
 * Takes FLIGHTS rather than row ids, because that is what the flyer named: they ticked rows in
 * a list of flights. Every recording of every one of them moves. Naming only the rows that were
 * on screen left the others pointing at a row that was no longer the one reporting a flight,
 * which ejected them into flights of their own — the flyer's earlier statement destroyed by an
 * action that never mentioned those rows.
 *
 * The flight is reported by the recording that was opened FIRST. Deliberately not the first row
 * in the list's own order: under the Apogee or Speed sort that is by construction the largest of
 * the readings, so it would have Debrief nominate the maximum of two instruments — a best-of
 * dressed as a measurement, and the one thing this whole feature must never do. Opening order
 * has nothing to do with what anything read, and the flyer can hand the flight to any of its
 * recordings in one click afterwards.
 */
export function planJoin(groups: FlightGroup[]): { id: string; flightId: string }[] {
  const all = groups.flatMap((g) => g.recordings);
  if (all.length < 2) return [];
  const first = all.reduce((a, b) => (b.addedAt < a.addedAt ? b : a));
  return planGrouping(all.map((r) => r.id), first.id);
}

/**
 * The `flightId` each row should carry so that `ids` become one flight reported by `primaryId`.
 *
 * Returned as a plan rather than written here so the caller does one storage pass and the
 * decision stays testable without a database. Rows outside `ids` are untouched — including
 * rows that were in a DIFFERENT group, which is deliberate: joining a flight is a statement
 * about the rows named, not a licence to rewrite the ones that were not.
 *
 * Passing a single id, or an unknown `primaryId`, yields nothing — grouping one recording with
 * itself is not a flight of several recordings, and a primary that isn't in the set would name
 * a flight none of these rows can see.
 */
export function planGrouping(ids: string[], primaryId: string): { id: string; flightId: string }[] {
  const unique = [...new Set(ids)];
  if (unique.length < 2 || !unique.includes(primaryId)) return [];
  return unique.map((id) => ({ id, flightId: primaryId }));
}

/** The plan that separates a flight back into one flight per recording. The way out of a
 *  grouping, which every grouping needs: a flyer who joins the wrong two files must be able to
 *  say so without deleting them and dropping them again. */
export function planSeparation(group: FlightGroup): { id: string; flightId: null }[] {
  return group.recordings.map((r) => ({ id: r.id, flightId: null }));
}

/** How far apart a flight's recordings read, per reading. */
export interface RecordingSpread {
  label: string;
  /** The full range across the recordings, as a percentage of their mean. */
  pct: number;
  /** How many recordings contributed — never all of them when one withheld the reading, and the
   *  count is shown so a spread over two of four does not read as a spread over four. */
  count: number;
}

/**
 * How closely a flight's recordings agree, from the readings the logbook already holds.
 *
 * The number a redundant-altimeter flyer actually wants at a glance, and the one they otherwise
 * work out by hand: two altimeters agreeing to a fraction of a percent is the confidence they
 * flew two for, and a wide gap is the flag worth chasing. It is NOT a consensus — nothing here
 * blends the readings, and the flight is still reported by the one recording the flyer nominated.
 *
 * PER READING, never one figure for the flight. Measured on the corpus's four-altimeter flight,
 * the apogees agree to 0.027% while the derived top speeds spread 6.70% — nearly 250 times wider — so a
 * single "these agree to within X" would be either a false reassurance or a false alarm depending
 * on which reading it happened to take.
 *
 * Read off the stored figures rather than re-analysing, so opening this list cannot move a
 * number: these are the same values the rows themselves paint. A reading a recording withheld is
 * left out and the count says so, rather than being counted as a zero — a withheld apogee is not
 * an apogee of nought.
 */
export function recordingSpread(group: FlightGroup): RecordingSpread[] {
  const of = (label: string, get: (r: RecentMeta) => number | null | undefined): RecordingSpread | null => {
    const vals = group.recordings.map(get).filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { label, pct: mean > 0 ? ((max - min) / mean) * 100 : 0, count: vals.length };
  };
  return [of('apogee', (r) => r.apogeeM), of('top speed', (r) => r.maxVelocityMs)].filter((s): s is RecordingSpread => s != null);
}
