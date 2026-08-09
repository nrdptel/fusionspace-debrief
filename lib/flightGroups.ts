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

/** One dropped flight record's grouping statement, paired with where that file landed. */
export interface RecordedGrouping {
  /** The logbook id this file was just saved under — the id the plan will be written against. */
  id: string;
  /** The file's name, for the sentence the flyer reads afterwards. */
  name: string;
  /** The flight token the record states. Opaque; only equality across records matters. */
  flight: string;
  /** Whether the record says this recording is the one its flight is reported by. */
  reports: boolean;
  /** How many recordings the flight had when the record was written. */
  of: number;
}

/** What a drop of flight records restored, and the sentence to say about it. */
export interface RestoredGroupings {
  /** For `setFlightIds`. Empty where nothing in the drop belongs together. */
  changes: { id: string; flightId: string }[];
  /** "a.json + b.json → one flight", one per flight restored. */
  restored: string[];
}

/**
 * The flyer's earlier grouping, restored from a set of flight records dropped together.
 *
 * **This reads a statement rather than inferring one**, which is the rule at the top of this
 * file and the reason it is safe to do automatically where `proposeGroups` has to ask. The flyer
 * already said these files were one flight; each record carries that statement, written when it
 * was exported. Nothing here looks at what the flights CONTAIN — not the name, not the clock, not
 * the apogee — so there is no reading of the data that could be wrong.
 *
 * Two cases the tokens make possible and the code has to answer, both settled the way
 * `groupRecordings` already settles them for a logbook whose primary row was deleted:
 *
 *  - **no record in the drop claims to report the flight.** A flyer who exported four recordings
 *    and drops the two that are not the primary has stated a real grouping with its nominee
 *    missing, so the first of them is promoted, exactly as a logbook does when the primary row
 *    is removed. The flight is still their flight.
 *  - **more than one claims it.** Only reachable from a hand-edited file. The first wins, and
 *    nothing follows the token any further, so a contradictory pair cannot produce two flights
 *    that each think they report the other.
 *
 * A token with a single record under it yields nothing: one recording is not a flight of
 * several, and `planGrouping` refuses it in any case.
 */
export function planRestoredGroupings(records: RecordedGrouping[]): RestoredGroupings {
  const buckets = new Map<string, RecordedGrouping[]>();
  for (const r of records) {
    const at = buckets.get(r.flight);
    if (at) at.push(r);
    else buckets.set(r.flight, [r]);
  }

  const changes: { id: string; flightId: string }[] = [];
  const restored: string[] = [];
  for (const members of buckets.values()) {
    // No length guard here on purpose: `planGrouping` already refuses a set that does not name
    // at least two DISTINCT rows, and that is the stricter test — a `members.length < 2` check
    // passes a bucket holding the same file dropped twice, which dedupes to one logbook id.
    // Falsified: adding the guard changes no test, because it can only ever agree.
    const primary = members.find((r) => r.reports) ?? members[0];
    const plan = planGrouping(members.map((r) => r.id), primary.id);
    if (plan.length === 0) continue;
    changes.push(...plan);
    // Say when the set is INCOMPLETE. The records state how many recordings the flight had when
    // they were written, so a flyer who drops two of four can be told the other two are missing
    // rather than shown a flight that quietly claims to be all of it — the same reason
    // `RecordingSpread` prints the count it was taken over. `of` is the largest any record
    // claims: a set exported at different times can disagree, and the fullest statement is the
    // only one that cannot understate what is absent.
    const of = Math.max(...members.map((r) => r.of));
    const names = members.map((r) => r.name).join(' + ');
    restored.push(
      members.length < of
        ? `${names} → one flight (${members.length} of the ${of} recordings it was saved with)`
        : `${names} → one flight`,
    );
  }
  return { changes, restored };
}

/** The plan that separates a flight back into one flight per recording. The way out of a
 *  grouping, which every grouping needs: a flyer who joins the wrong two files must be able to
 *  say so without deleting them and dropping them again. */
export function planSeparation(group: FlightGroup): { id: string; flightId: null }[] {
  return group.recordings.map((r) => ({ id: r.id, flightId: null }));
}

/** How far apart a flight's recordings read. */
export interface RecordingSpread {
  label: string;
  /** The full range across the recordings, as a percentage of their mean. */
  pct: number;
  /** How many recordings contributed. Shown, so a spread over two of four cannot read as a
   *  spread over four. */
  count: number;
}

/**
 * How closely a flight's recordings agree on APOGEE, from the readings the logbook already
 * holds — or nothing, when the figures are not comparable.
 *
 * The number a redundant-altimeter flyer actually wants at a glance, and the one they otherwise
 * work out by hand: two altimeters agreeing to a fraction of a percent is the confidence they
 * flew two for, and a wide gap is the flag worth chasing. It is NOT a consensus — nothing here
 * blends the readings, and the flight is still reported by the one recording the flyer nominated.
 *
 * **Apogee only, and that is a measurement rather than a simplification.** Apogee is
 * altitude-sourced on every logger, so two recordings of it have no measured-versus-derived mix
 * to confuse the spread — `lib/compare.ts` says the same thing where it declines to flag one.
 * TOP SPEED does not survive the same treatment: one board can measure it while another
 * differentiates it out of an altitude, and the difference between the two methods swamps the
 * difference between the instruments. Over the six same-flight groups in the corpus the apogee
 * spread runs 0.03% to 2.29% — never above two and a half percent — while the top-speed spread
 * runs 2.56% to **81.65%**, and the two widest (26.37% and 81.65%) are exactly the two groups
 * that mix a device-measured speed with a derived one. A row showing that figure would have told
 * the owner of two documented, correctly-grouped corpus flights that their grouping was wrong.
 * The logbook stores no `maxVelocitySource`, so the row cannot qualify it even in principle;
 * the comparison surface, which has the whole analysis, is where a caveated speed spread belongs.
 *
 * **Nothing at all when any recording carries a crop.** A cropped recording's stored apogee is
 * the CROP's apogee, so comparing it with an uncropped one measures two different stretches and
 * paints the flyer's own choice as instrument disagreement. `components/RecordingPicker.tsx`
 * already declines to print a figure for exactly this reason one level down.
 *
 * Read off the stored figures rather than re-analysing, so opening this list cannot move a
 * number: these are the same values the rows themselves paint.
 */
export function recordingSpread(group: FlightGroup): RecordingSpread[] {
  if (group.recordings.length < 2) return [];
  if (group.recordings.some((r) => r.read)) return [];
  const vals = group.recordings.map((r) => r.apogeeM).filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 2) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return [{ label: 'apogee', pct: mean > 0 ? ((max - min) / mean) * 100 : 0, count: vals.length }];
}
