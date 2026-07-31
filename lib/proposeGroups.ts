// Which files LOOK like one flight — offered, never applied.
//
// `flightGroups.ts` reads the flyer's own statement of which rows are one flight. This module
// is the step before it: it looks at rows nobody has grouped yet and says which ones are worth
// OFFERING as one flight, with the evidence in words. Nothing here writes anything. A proposal
// is a suggestion beside the files, never a state the logbook is already in — a wrong automatic
// merge fabricates one flight out of two and every downstream reading inherits it.
//
// ## What the signal is, and why it is not the obvious one
//
// The obvious signals were measured over the corpus and do not work. `lib/parsers/d6Grouping.test.ts`
// holds that measurement and it is the reason this file keys on what it does:
//
//  - **Apogee agreement is worse than useless.** Over all pairs, same-flight pairs run a median
//    0.51% apart and different-flight pairs 63% — separable until the tail, where the TIGHTEST
//    agreement in the whole corpus (0.28%) is between two files that are NOT one flight: a Kairos
//    sustainer at 4,044 m and an unrelated scratch rocket at 4,055 m, different airframes,
//    different continents, nine years apart. The reason is physics, not noise — the same airframe
//    on the same motor twice in a day agrees to a fraction of a percent because it should.
//  - **The in-file wall clock is mostly absent, and where two files DO share one it is the wrong
//    relation.** Of the manifest's groups exactly one holds two files that both carry a stamp, and
//    it is the STAGED booster/sustainer pair, which must never be merged. One logger reports 2013
//    for a 2023 flight and passes every sanity window because it is a real date.
//
// What does work is narrower and stronger: **the launch second the vendor's own download tool
// writes into the FILE NAME.** Featherweight's tooling names each file for the flight it pulled
// off the board, so two files bearing the same stamp were downloaded as one flight by the vendor's
// own software — the vendor asserting the grouping, rather than two clocks happening to agree.
//
// Verified rather than assumed, on `BlRv_SN1537_HR_04-12-2025_12_45_49.csv`: its first row reads
// `12:45:47.382` at `Flight_Time -2.040`, so T0 = 12:45:49.4 — the second in its own name. It is
// the LAUNCH instant, not the download time, which is why it can be shown to a flyer as evidence.
//
// Measured over the corpus manifest (61 files, 29 groups): **12 files carry the stamp, and a
// +/-120 s rule over them yields 16 true pairs and 0 false pairs.** The widest spread inside a true
// group is 5 s; the nearest refusal is 956 s — the jan18 ground-station file, which is a MISS and
// must stay one rather than be reached by widening the window. So the tolerance sits 24x above the
// widest true pair and 8x below the nearest false one.
//
// Two consequences worth stating, because both are load-bearing:
//
//  - **This is a vendor-specific key.** All 12 stamped files are Featherweight-ecosystem. It does
//    not reach an Altus Metrum or an Eggtimer download at all, and it is not supposed to: refusing
//    to guess where the evidence is absent is the whole posture. It also means the staged pairs the
//    roadmap names as standing negatives (`iss-kairos`, `iss-sg1.2`) are refused for a REASON
//    rather than by a special case — they carry no stamp, so nothing opens a proposal over them.
//  - **A file name is not a measurement**, and this deliberately never becomes `FlownAt`. A flight
//    date is published as a reading of the flight; this is metadata a download tool wrote, and it
//    survives a copy but not a rename. It is evidence for a grouping the flyer confirms, and
//    nothing else reads it.

import type { RecentMeta } from './recents';

/** How far apart two stated launch instants may be and still be one flight. Measured: the widest
 *  spread inside a true corpus group is 5 s (one board's clock against another's), and the nearest
 *  pair that must be REFUSED sits at 956 s. */
const LAUNCH_TOLERANCE_S = 120;

/** How far apart two rows may have reached the logbook and still count as one arrival. A drop is
 *  ingested in one pass, so files land milliseconds apart; this is loose enough for a folder whose
 *  last file took seconds to parse, and far tighter than "some time today".
 *
 *  Arrival is a NECESSARY condition, never a sufficient one. On its own it is far too loose — a
 *  launch day's folder of eight files from four flights all arrive together — so it scopes a
 *  proposal to what the flyer just did and the stamp decides which of those files pair up. It also
 *  keeps a restored backup safe: `importLogbook` writes every row in one transaction, so a whole
 *  logbook shares an arrival, and only the stamp stops that becoming one enormous flight. */
const ARRIVAL_WINDOW_MS = 60_000;

/** `MM-DD-YYYY_HH_MM_SS`, as Featherweight's downloader writes it, with the separator before the
 *  clock either `_` or `-` and a trailing `_` on the summary files. Anchored on the date so a
 *  serial number or a rocket name in the same string cannot be read as one. */
const NAME_STAMP = /(\d{2})-(\d{2})-(\d{4})[_-](\d{2})[_-](\d{2})[_-](\d{2})/;

/** The launch instant this file NAME states, as `YYYY-MM-DDTHH:MM:SS`, or null where the name
 *  carries none — which is most files, and is not a defect.
 *
 *  Exported because it is the whole evidential basis of a proposal: a flyer is shown the second
 *  their two files claim, so the inference is one they can check against the names in front of
 *  them rather than one they have to trust. */
export function launchStampFromName(name: string): string | null {
  const m = NAME_STAMP.exec(name);
  if (!m) return null;
  const [, mo, d, y, H, M, S] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(H);
  const minute = Number(M);
  const second = Number(S);
  // A real date, not just six numbers. `13-40-2025` is a serial number that happens to fit the
  // shape, and reading it as a launch would pair two unrelated files on a coincidence.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const t = new Date(Date.UTC(Number(y), month - 1, day, hour, minute, second));
  if (t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) return null;
  return `${y}-${mo}-${d}T${H}:${M}:${S}`;
}

/** Seconds between two stamps produced by `launchStampFromName`, or null if either is absent. */
function secondsApart(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(`${a}Z`);
  const tb = Date.parse(`${b}Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(ta - tb) / 1000;
}

/** Rows that look like one flight, and the reason, in the words a flyer is shown. */
export interface GroupProposal {
  /** The logbook ids being offered as one flight — always two or more. */
  ids: string[];
  /** Which recording would report the flight. A SUGGESTION: `flightGroups.planGrouping` makes the
   *  flyer name the primary, and that is the part of this surface already ahead of every vendor
   *  tool surveyed, so the surface offering this must let them change it rather than apply it. */
  suggestedPrimaryId: string;
  /** The launch instant the names agree on, as stated. */
  statedLaunch: string;
  /** One sentence, in the flyer's terms, naming the evidence — never "these look similar". */
  reason: string;
}

/**
 * Which of these rows are worth OFFERING as one flight.
 *
 * Both conditions must hold, and neither is sufficient alone:
 *  1. the rows arrived together, and
 *  2. their names state the same launch second.
 *
 * Rows the flyer has already grouped are left alone entirely — a proposal never re-opens a
 * decision that has been made, in either direction.
 */
export function proposeGroups(rows: RecentMeta[]): GroupProposal[] {
  const candidates = rows
    .filter((r) => !r.flightId) // already stated, in either direction — leave it alone
    .map((r) => ({ row: r, stamp: launchStampFromName(r.name) }))
    .filter((c): c is { row: RecentMeta; stamp: string } => c.stamp != null);
  if (candidates.length < 2) return [];

  const used = new Set<string>();
  const proposals: GroupProposal[] = [];

  // Newest arrival first, so a proposal is about the drop the flyer just made.
  const ordered = [...candidates].sort((a, b) => b.row.addedAt - a.row.addedAt);

  for (const seed of ordered) {
    if (used.has(seed.row.id)) continue;
    const members = ordered.filter(
      (c) =>
        !used.has(c.row.id) &&
        Math.abs(c.row.addedAt - seed.row.addedAt) <= ARRIVAL_WINDOW_MS &&
        (secondsApart(c.stamp, seed.stamp) ?? Infinity) <= LAUNCH_TOLERANCE_S,
    );
    if (members.length < 2) continue;
    for (const m of members) used.add(m.row.id);

    // The stamp shown is the seed's, and every member is within the tolerance of it.
    const stated = seed.stamp;
    const clock = stated.slice(11);
    const day = stated.slice(0, 10);
    proposals.push({
      ids: members.map((m) => m.row.id),
      suggestedPrimaryId: seed.row.id,
      statedLaunch: stated,
      reason:
        `${members.length} files arrived together and their names each state a launch at ` +
        `${clock} on ${day} — the second the altimeter's own download names, not when they were opened.`,
    });
  }

  return proposals;
}
