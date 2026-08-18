import type { Channel, ChannelKind } from './flight/types';

/**
 * How good a GPS fix was, and what it is therefore allowed to say — one rule, written once,
 * for every logger family that records one.
 *
 * **Why this is a module rather than two comments.** Debrief read the same question two ways.
 * `lib/parsers/altusmetrum.ts` kept a three-satellite position and dropped only the height beside
 * it, on the reasoning that *a 2D fix still walks you to the rocket*; `lib/parsers/featherweightGps.ts`
 * dropped the whole row. One question, two answers, and neither said which it had taken — so the
 * same degraded fix survived on an AltOS log and vanished on a Featherweight one, and the recovery
 * view captioned whatever survived identically. The rule below is the AltOS one, because it is the
 * better-reasoned half: a position solved on an assumed height is a worse position, not an absent
 * one, and erasing it costs a flyer the only bearing they had.
 *
 * **The grade is not the accuracy.** A 3D fix is not "good"; it is merely solved in three
 * dimensions. What that buys in metres depends on satellite geometry and signal strength, which is
 * what dilution-of-precision and the dB-Hz bins are for. This module answers only what a fix may be
 * used FOR — the narrower question, and the one every parser has to answer identically.
 *
 * The arithmetic behind the satellite thresholds, because a reader should not have to take it on
 * trust: a receiver solves for four unknowns — x, y, z and its own clock bias — so four satellites
 * are what a three-dimensional solution takes. With three it can still solve x, y and the clock
 * bias if it ASSUMES z, which is a two-dimensional fix: a real latitude and longitude resting on a
 * height the receiver was told rather than measured. With none it reports neither, and a receiver
 * that has lost lock repeats its last position rather than saying nothing — which is why zero is a
 * grade here and not simply missing data.
 */

/**
 * What a fix was solved in.
 *
 * `none` covers both "no fix" and "lock lost, holding the last position": from a log's point of
 * view they are the same claim, which is no claim.
 */
export type FixGrade = 'none' | '2d' | '3d';

/**
 * Grade a fix from the number of satellites in it.
 *
 * The families that write a satellite count and no fix-type column — AltOS's CSV and its raw
 * eeprom — are graded here, so the threshold lives in one place instead of being spelled out at
 * each site that needs it.
 *
 * `null` means the file does not say. That is deliberately graded `3d` rather than `none`: a log
 * with no satellite column at all is not a log full of bad fixes, and downgrading it would blank
 * every position in a file whose receiver may have been perfectly locked.
 *
 * **The floor is THREE, not one, and the first draft of this function got that wrong.** It read
 * `n <= 0 ? 'none' : n >= 4 ? '3d' : '2d'`, which graded a one-satellite row as a two-dimensional
 * fix — a kept position — while the arithmetic written above says a 2D solution takes three. One
 * satellite is not a degraded fix, it is no fix. Caught by a review reading the threshold against
 * its own justification. Measured before changing it: **no corpus row anywhere reports 1 or 2
 * satellites**, so this moves no real file today; it stops the contradiction rather than adding a
 * guard, which is why it is worth making on zero evidence of harm.
 */
export function gradeFromSatellites(n: number | null | undefined): FixGrade {
  if (n === null || n === undefined || !Number.isFinite(n)) return '3d';
  if (n < 3) return 'none';
  return n >= 4 ? '3d' : '2d';
}

/**
 * Grade a fix from a receiver's own fix-type column.
 *
 * Featherweight's trackers write a u-blox receiver's `fixType` through unchanged, and u-blox
 * publishes that enumeration: `0` no fix, `1` dead-reckoning only, `2` 2D-fix, `3` 3D-fix,
 * `4` GNSS + dead reckoning, `5` time only (u-blox M8 receiver description / protocol
 * specification, UBX-13003221, NAV-PVT `fixType`).
 *
 * **`5` is enumerated and then excluded, and the first draft of this function did not exclude
 * it.** Written `v >= 3`, it graded a time-only row — a receiver that has solved its clock and no
 * position at all — as a full three-dimensional fix, so a fabricated latitude and longitude would
 * have reached the ground track and the GPX waypoint. The docstring listed `5` as time-only two
 * lines above the branch that accepted it. Only `3` and `4` carry a three-dimensional position.
 *
 * A column that is absent or unparseable grades `3d`, for the same reason `gradeFromSatellites`
 * does: the absence of a quality statement is not a statement of poor quality.
 */
export function gradeFromFixColumn(v: number | null | undefined): FixGrade {
  if (v === null || v === undefined || !Number.isFinite(v)) return '3d';
  if (v === 3 || v === 4) return '3d';
  return v === 2 ? '2d' : 'none';
}

/**
 * What a fix of this grade may be used for.
 *
 * The position survives a two-dimensional fix and the receiver's own altitude does not — the whole
 * of the rule this module exists to state once. Both parser families now read it from here, and
 * `lib/gpsFix.test.ts` holds them side by side so they cannot drift back apart.
 */
export function fixAllows(grade: FixGrade): { position: boolean; altitude: boolean } {
  return { position: grade !== 'none', altitude: grade === '3d' };
}

/** The numeric form a `gpsFixGrade` channel carries: 3, 2 or 0. */
export function gradeValue(grade: FixGrade): number {
  return grade === '3d' ? 3 : grade === '2d' ? 2 : 0;
}

/** …and back, for a surface reading the channel. Anything else — including the NaN a file that
 *  says nothing writes — is `null`, which every reader must treat as "not stated" rather than
 *  as a poor fix. */
export function gradeFromValue(v: number): FixGrade | null {
  if (v === 3) return '3d';
  if (v === 2) return '2d';
  if (v === 0) return 'none';
  return null;
}

/** What a track's fixes were solved in, as a count per grade, over the samples that KEPT a position. */
export interface FixQuality {
  /** Positions the parser kept — the fixes a flyer is looking at. */
  kept: number;
  twoD: number;
  threeD: number;
  /** TRUE where the file says nothing about its fix quality at all. */
  unstated: boolean;
  /** The grade of the LAST kept fix — the coordinate a flyer actually walks to. */
  last: FixGrade | null;
}

/**
 * Summarise a track's fix quality, for the one surface where it decides whether somebody walks.
 *
 * **The claim this replaces was a constant.** `components/GroundTrack.tsx` told every flyer
 * *"Positions are GPS, good to a few metres"* — in both branches, on every flight, derived from
 * nothing: not the satellite count, not the fix column, not whether the fix was two-dimensional.
 * It is the app's only statement about horizontal accuracy, and `MAINTAINING.md`'s measurement
 * spine says accuracy claims are a range with their basis, never a flattering single number. On a
 * corpus flight that spends 13 solutions on three satellites, that sentence is wrong by an order of
 * magnitude, and it is wrong on the surface a flyer acts on.
 *
 * Counts SAMPLES rather than distinct solutions on purpose, and the distinction is the opposite of
 * the one the corpus tests make: there the question is *how much independent evidence is behind a
 * figure*, so repeats must not inflate it. Here the question is *what am I looking at on this map*,
 * and a repeated position is a point on the track a flyer can see and walk to. Both are right for
 * their own question.
 */
export function trackFixQuality(
  lat: Float64Array,
  lon: Float64Array,
  grade: Float64Array | undefined,
): FixQuality {
  let kept = 0;
  let twoD = 0;
  let threeD = 0;
  let stated = 0;
  let last: FixGrade | null = null;
  const n = Math.min(lat.length, lon.length);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    kept++;
    const g = grade && i < grade.length ? gradeFromValue(grade[i]) : null;
    if (!g) continue;
    stated++;
    last = g;
    if (g === '2d') twoD++;
    else if (g === '3d') threeD++;
  }
  return { kept, twoD, threeD, unstated: stated === 0, last };
}

/**
 * That summary as the sentence the recovery view prints, or `null` where the file said nothing.
 *
 * **No metres, and that is the honest part.** What a fix is good to in metres depends on satellite
 * geometry and signal strength, and Debrief has neither a published function to compute it from
 * what these files carry nor any way to check one against the corpus — `COMPETITION.md` row 47
 * records that the dB-Hz→accuracy relationship does not exist as a function from either vendor.
 * What a log DOES state is what the receiver solved for, so that is what this says. A grade a flyer
 * can act on beats a number nobody can ground.
 */
export function fixQualitySentence(q: FixQuality): string | null {
  if (q.unstated || q.kept === 0) return null;
  const lastClause =
    q.last === '2d'
      ? ' The last fix here is one of them, so treat the coordinate as a direction rather than a doorstep.'
      : '';
  if (q.twoD === 0) {
    return 'Every fix on this track was solved in three dimensions — the receiver had the satellites for a full position.';
  }
  const share = q.twoD === q.kept ? 'Every' : `${q.twoD} of ${q.kept}`;
  return (
    `${share} ${q.twoD === q.kept ? 'fix on this track was' : 'fixes on this track were'} solved in TWO dimensions — ` +
    'latitude and longitude on a height the receiver assumed rather than measured, which is a worse ' +
    `position than the rest, not a wrong one.${lastClause}`
  );
}

/**
 * What AltOS writes in a dilution-of-precision column it never had a value for: `2147483647`,
 * which is INT32_MAX — the sentinel a signed 32-bit field uses to mean *not supplied*.
 *
 * Read naively it is not a missing value, it is a **dilution of precision of two billion**, and it
 * would be the worst-quality reading in every corpus flight that carries it.
 */
export const DOP_NEVER_SUPPLIED = 2147483647;

const DOP_KINDS = new Set<ChannelKind>(['dopHorizontal', 'dopVertical', 'dopPosition']);

/**
 * Turn every never-supplied sentinel into NaN, and drop a dilution channel the file never supplied
 * at all.
 *
 * **The sentinel is a PER-COLUMN statement, not a per-file one, and that is measured rather than
 * assumed.** `altusmetrum__…intrepid2…telemetrum_data.csv` supplies `pdop` at **1.60–1.70** on all
 * 346 of its rows while marking `hdop` and `vdop` never-supplied on every one of them; a second
 * recording marks all three on all 4,118. So a file cannot be judged by one of its columns, and
 * the two are handled apart: a sentinel VALUE becomes NaN, and only a column that is sentinel (or
 * absent) THROUGHOUT loses its channel.
 *
 * Dropping the channel rather than keeping one full of NaN is what makes the absence legible. An
 * all-NaN trace in the explorer is an empty chart a reader has to interpret; no channel is a
 * question the surface never asks. `lib/canonical.ts` round-trips presence as presence, so the
 * distinction survives an export.
 *
 * **Nothing here filters on quality.** Only the sentinel is removed, and it is not a reading. The
 * worst dilution Debrief reads off any file in reach — **6.10**, a position dilution on
 * `irec_2023_telemega.csv` — is kept exactly as the receiver wrote it, because `COMPETITION.md`
 * row 47's standing rule for this milestone is that fix quality buys graded confidence, never
 * extra filtering.
 *
 * **That number is scoped to what Debrief READS, and the distinction is the whole point.** A first
 * version of this comment said 12.1, which is a real value — `Mega38-1_TeleMega.csv`'s worst
 * position dilution — in a file no named parser claims: `importFlight` returns `kind: 'mapping'`
 * for it and the column mapper offers no dilution role at all (D12 slice 4). So Debrief publishes
 * nothing from it, and quoting it as a value that survives this function was a claim about the
 * corpus standing in for a claim about the product.
 */
export function dropNeverSupplied(flight: { channels: Channel[] }): void {
  flight.channels = flight.channels.filter((c) => {
    if (!DOP_KINDS.has(c.kind)) return true;
    let real = false;
    for (let i = 0; i < c.values.length; i++) {
      if (c.values[i] === DOP_NEVER_SUPPLIED) c.values[i] = NaN;
      else if (Number.isFinite(c.values[i])) real = true;
    }
    return real;
  });
}

/** The satellite geometry behind a track's kept positions — a range and a middle, never one number. */
export interface DopSummary {
  /** Kept positions that state an HDOP at all. */
  n: number;
  lo: number;
  hi: number;
  median: number;
}

/**
 * Summarise the horizontal dilution of precision over the fixes a flyer is actually looking at.
 *
 * Counted over KEPT positions for the same reason `trackFixQuality` is: the question this answers
 * is *what am I looking at on this map*, so a repeated position is a point on the track a flyer can
 * see and walk to. That is the opposite basis from the corpus counts, which ask how much
 * independent evidence is behind a figure and must not let repeats inflate it. Both are right for
 * their own question.
 */
export function trackDop(
  hdop: Float64Array | undefined,
  lat: Float64Array,
  lon: Float64Array,
): DopSummary | null {
  if (!hdop) return null;
  const kept: number[] = [];
  const n = Math.min(lat.length, lon.length, hdop.length);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(lat[i]) || !Number.isFinite(lon[i])) continue;
    if (!Number.isFinite(hdop[i])) continue;
    kept.push(hdop[i]);
  }
  if (kept.length === 0) return null;
  kept.sort((a, b) => a - b);
  return { n: kept.length, lo: kept[0], hi: kept[kept.length - 1], median: kept[kept.length >> 1] };
}

/**
 * That summary as the sentence every surface prints, or `null` where the file states no HDOP.
 *
 * **A RANGE and a middle, never a single flattering number** — `MAINTAINING.md`'s measurement spine
 * asks for exactly that of any accuracy-shaped claim, and the widest a corpus recording actually
 * states is **0.70 to 3.10** across one flight against a median of 0.80, so the middle alone would
 * hide a spread of four and a half times.
 *
 * **The example this used to give was 0.80 to 23.10, and the same change that added it removed
 * it**: 23.10 is `endurance`'s no-fix placeholder, dropped with the position it belonged to a
 * function above. Quoting a range that can no longer occur to argue for stating ranges is the
 * failure the argument is about, so it is measured here rather than remembered.
 *
 * **And no metres, which is the load-bearing half.** Dilution of precision multiplies the
 * receiver's own ranging error; it is not that error. Converting one to a distance takes a figure
 * no file here carries and no vendor publishes — `COMPETITION.md` row 47 records that the search
 * for it came up empty at both Featherweight and Altus Metrum. So this states the geometry the
 * receiver had and stops, which is a claim a flyer can check against the number beside it.
 */
export function dopSentence(d: DopSummary | null): string | null {
  if (!d) return null;
  const n = (v: number) => v.toFixed(2);
  const spread = d.lo === d.hi ? `HDOP ${n(d.lo)}` : `HDOP ${n(d.lo)} to ${n(d.hi)}, middling ${n(d.median)}`;
  return (
    `Satellite geometry behind these positions: ${spread} — lower is a better spread of satellites, ` +
    'and 1 is about as good as it gets. It says how much the geometry multiplied whatever ranging ' +
    'error the receiver already had, so it is a quality signal and not a distance; turning it into ' +
    'metres needs that error, which this file does not carry.'
  );
}
