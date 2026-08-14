// The readings a single flight shows on screen, as data rather than as markup.
//
// This list and the one in lib/report.ts (`headlineRows`) describe the same flight to two
// audiences: the grid a flyer reads on the page, and the document they save. They are
// written separately because they genuinely differ — the grid splits a reading into a big
// number and a quiet sub-line and marks three of them as headline tiles, while a report
// row is one label and one sentence, and the report carries readings the grid has no tile
// for (the time to apogee, the landing energy, the deploy and ejection checks a flyer
// typed their own figures into).
//
// What they must NOT differ on is which readings exist. Six of them once did: avg
// acceleration, thrust-to-weight, coast efficiency, peak roll rate, revolutions and the
// battery low were on the screen and in no saved report, so a flyer who read the
// thrust-to-weight off the page and exported a write-up got a document without it. That
// was possible because the two lists could only be compared by reading both. Keeping this
// one in lib rather than inside the component is what lets a test hold them side by side
// (lib/readings.test.ts) and fail the moment one gains a reading the other doesn't.

import type { FlightMetrics } from './analyze/types';
import { fmtAccel, fmtLength, fmtMach, fmtPressure, fmtSpeed, fmtTemp, fmtTime, fmtVoltage } from './display';
import type { UnitChoice } from './display';
import type { MethodId } from './methodIds';

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
  /**
   * Which block on the methods page defines this reading.
   *
   * A flyer meeting "Coast efficiency", "Max Q" or "Thrust-to-weight" for the first time had
   * nowhere to look: the tiles carried no title, no help affordance and no link, and the
   * methods page had no anchors to point at anyway. Typed against the canonical id list, so
   * a renamed block breaks the build rather than leaving a reading pointing at nothing.
   */
  method?: MethodId;
}

/** Mach (when known), the altitude the peak speed was reached at, and its
 *  provenance — measured off a logged/inertial velocity, or derived from the
 *  barometric altitude (which usually reads high at the peak, not soft, and bounds the speed
 *  in neither direction — see `velocityProvenance`).
 *  Provenance is shown for the peak the way
 *  the max-acceleration tile shows it, so a headline number never reads as more
 *  direct than it is. */
/** Why a peak speed was withheld, in the words every surface uses.
 *
 *  Exported because the comparison table and its exports say this too, and a refusal explained
 *  one way on the metric grid and another way in a cert document is two accounts of one fact. */
export function withheldReason(why: NonNullable<FlightMetrics['maxVelocityWithheld']>): string {
  return why === 'gap'
    ? 'the ascent has a stretch the record doesn’t cover'
    : 'the speed this trace gives is not physically possible';
}

function maxVelocitySub(m: FlightMetrics, sys: UnitChoice): string | undefined {
  if (!Number.isFinite(m.maxVelocity)) {
    // "Not in this log" is only true when the file carries no speed at all. Where Debrief
    // withheld one it is the opposite of true — the data is there and the reading was
    // declined — and a withheld number has to say why it was withheld.
    if (m.maxVelocityWithheld != null) return `withheld — ${withheldReason(m.maxVelocityWithheld)}`;
    return 'not in this log';
  }
  const parts: string[] = [];
  if (m.mach) parts.push(fmtMach(m.mach));
  if (Number.isFinite(m.maxVelocityAltitude)) parts.push(`at ${fmtLength(m.maxVelocityAltitude, sys)}`);
  parts.push(velocityProvenance(m));
  return parts.join(' · ');
}

/** How the peak speed was obtained, in one word or two — and the DIRECTION of the error when it
 *  was derived, because "derived" alone is the vague caveat the safety invariant rejects.
 *
 *  Exported for the same reason `apogeeSub` and `burnoutSub` are, and it should have been from the
 *  start: `lib/report.ts` says in its own comment that "the document a flyer files has to carry the
 *  qualifier the screen shows, or the number that leaves the app is the one without it" — and then
 *  carried it for the apogee and not for the peak speed, because this was module-private and there
 *  was nothing to call. So the tile said "derived" while the .txt, .md, .html, the clipboard and
 *  the print card all printed the speed bare. A cert document is exactly where that matters most. */
/** How max Q was obtained, which is the peak speed's provenance carried through a square.
 *
 *  A measured speed needs no clause — the tile already says "at 1,204 m" and that is the whole
 *  story. A DERIVED one does, and it needs a different sentence from the speed's own: the speed
 *  tile says the peak "usually reads high", and `q = ½ρv²` takes that tendency through squared, so
 *  a 10% high speed is a 21% high max Q. Stating the mechanism rather than the multiplier, because
 *  the tendency is a direction and not a bound — the same reason `velocityProvenance` refuses to
 *  promise a ceiling. */
export function maxQProvenance(m: FlightMetrics): string | null {
  if (m.maxVelocitySource === 'device') return null;
  return 'from a derived speed, and squared by q = ½ρv², so it inherits that read twice over';
}

export function velocityProvenance(m: FlightMetrics, form: 'full' | 'short' = 'full'): string {
  if (m.maxVelocitySource === 'device') return 'measured';
  // Two lengths, one claim. The share card is a small image posted to a club chat and cannot carry
  // a clause — but it is also the surface where an unqualified figure did the most damage (nine
  // corpus flights put a SUPERSONIC claim on one, the loudest reading Mach 2.64 where the device
  // summary, a second altimeter, a GPS and an L3 cert PDF all say Mach 1.3). So it gets the short
  // form rather than the bare word: whichever surface a flyer is looking at, "derived" never
  // appears without the tendency attached. "Usually" is doing real work — five of the six corpus
  // pairs read high and one reads 14% low, so this is a tendency and not a bound, and a label that
  // promised a ceiling would be the same overclaim in the other direction.
  return form === 'short' ? 'derived (usually reads high)' : 'derived, which usually reads high at the peak';
}

/** Whether the record actually reached the ground. `descentSource` is set only where a
 *  landing was found, so a null one is a record that stops in the air — and the rate
 *  measured over it is the rate of the descent that WAS recorded, never a touchdown speed.
 *  The analyzer already withholds flight time and descent time in that state and says why;
 *  the descent rate went on being published, and every surface downstream read it as a
 *  landing. Six of the flights the corpus analyses end to end are in it — the loudest stops
 *  2,540 m up, 62.8% of its own apogee, and the page reported "touched down at 148.5 ft/s"
 *  beside its own warning that the record never reaches the ground.
 *
 *  Exported because the grid, the saved report, the exports and the two recovery panels
 *  must all make the same call. A landing energy is a safety number a flyer sizes a canopy
 *  against and shows an RSO; ½mv² off a drogue-leg average is not one. */
export function landedInRecord(m: FlightMetrics): boolean {
  return m.descentSource != null;
}

/** Where liftoff falls on the LOG's own clock, or null where the file already starts at
 *  liftoff and the two clocks are the same number.
 *
 *  Two surfaces now print a time on the log's clock — the Events list and the recovery
 *  map's readout — while every reading in the grid and the exports is seconds since
 *  liftoff. On 27 of the corpus's 45 flights those disagree by half a second or more, and
 *  on the ground-station GPS log by 960 s (apogee at 973.0 s against 13.0 s). Naming the
 *  clock reconciles them without moving either, and the rule for whether to name it lives
 *  here so a second surface cannot decide it differently from the first. */
export function liftoffOnLogClock(events: { type: string; time: number }[]): number | null {
  const l = events.find((e) => e.type === 'liftoff');
  return l && Number.isFinite(l.time) && l.time >= 0.05 ? l.time : null;
}

/** The landing descent rate, or null where the record never reached the ground — the one
 *  place that decision is made, so a panel cannot read a rate the flight didn't land at. */
export function landingRate(m: FlightMetrics): number | null {
  if (!landedInRecord(m)) return null;
  return m.mainDescentRate ?? m.wholeDescentRate ?? null;
}

/** True when that rate is the whole descent averaged rather than a resolved main leg — the
 *  flight landed, but no deployment change is in the record, so the figure is the same
 *  descent all the way down as far as this file can tell. Energy goes as v², so a document
 *  that prints the joules without saying which is a document that reads more precise than
 *  it is: the screen has said so since the card was written, and the saved report — the one
 *  a cert write-up and a club energy limit are read from — did not. */
export function landingRateIsWholeDescent(m: FlightMetrics): boolean {
  return landedInRecord(m) && m.mainDescentRate == null && m.wholeDescentRate != null;
}

/** True when a descent rate WAS read but the record stops before the ground — the state in
 *  which the landing energy and the parachute Cd are withheld, and the one the panel has to
 *  explain. It is not the same as "no descent rate at all", which is a log that ends at or
 *  before apogee, and saying the second where the first is true is a wrong explanation
 *  rather than a missing one.
 *
 *  Whichever leg was resolved counts. Testing `wholeDescentRate` alone missed every flight
 *  that found its main deploy and then stopped recording under canopy — 3 of the 37 corpus
 *  flights analysed end to end — which are exactly the ones carrying a number that looks
 *  most like a landing. */
export function descentStoppedAloft(m: FlightMetrics): boolean {
  return !landedInRecord(m) && (m.mainDescentRate ?? m.wholeDescentRate) != null;
}

/** How burnout was located, in the same voice the peak speed and peak acceleration already
 *  use. Every reading taken AT that instant — the burn time, the altitude and the speed at
 *  burnout — inherits it, because all three are only as direct as the instant they were read
 *  at: 'measured' means a signed axial trace fell through zero at the end of thrust,
 *  'derived' means no such crossing existed and the speed peak stood in for it.
 *
 *  Exported because lib/report.ts needs the identical sentence. The two reading lists are
 *  deliberately written separately (see the note at the top of this file), but what a
 *  provenance label MEANS is one fact, and it was previously two copies of one string that
 *  could drift apart silently. */
/** The apogee's qualifier. Every other primary tile says how direct its number is — the
 *  peak speed says measured or derived, the peak acceleration says measured, clipped or
 *  derived — and the apogee, the one number a flyer copies into a cert form, a club record
 *  or a sim correlation, said only how long it took to get there. On a record that stops at
 *  or before its own peak that reading is the highest the rocket was SEEN at, and the tile
 *  printed it as flat fact: 3,548 ft on a log whose last sample is that peak, still climbing
 *  at 1,057 ft/s. The number is right and worth showing — it is a real lower bound — but it
 *  is not the apogee, and the footer promises every value is labelled wherever it is derived
 *  or approximate.
 *
 *  Exported so the saved report says the identical thing, like `burnoutSub`. */
/** A record whose climb is impossible for the height it reaches is not describing a flight, and
 *  the apogee is the reading that carries that furthest. */
const UNPROVEN =
  'unproven — this record’s climb is too slow to be a flight, so its altitude channel is in doubt';
/** A log that ends at its own peak gives a LOWER BOUND, not a summit. */
const FLOOR = 'at least this high — the log ends at its own peak, so the rocket was still going up';

/** Short forms, for a comparison cell where a sentence would not fit. */
export const APOGEE_TAG_UNPROVEN = ' (unproven)';
export const APOGEE_TAG_FLOOR = ' (at least)';

/**
 * What a railed accelerometer does to the two readings taken off it — in the words every
 * surface uses, for the reason `withheldReason` above is exported: a caveat worded one way on
 * the grid and another in a cert document is two accounts of one fact.
 *
 * **The peak and the average need DIFFERENT words for the one cause, and that is the whole
 * point of this pair.** A clipped peak MAY be higher than the number printed, which is what
 * "may be clipped" says and why the tile has said it since the detector was written. The
 * average over the boost is not itself clipped — it is dragged down by the samples that were,
 * and clipping is one-sided, so the figure is a FLOOR whose error has a known direction.
 * `MAINTAINING.md` asks a caveat to name that direction, so this one does.
 *
 * **Measured on a REAL recording, and it has to be**: `public/samples/sample-altusmetrum.csv` is
 * an Altus Metrum TeleMetrum log of a flight somebody actually flew, it is the file behind "Try a
 * sample flight", and it rails. Over the boost window the analyzer itself averages
 * (2.00 s → 3.56 s, 79 samples) its peak is **18.874 g** and **75 of those 79 samples — 95% —
 * sit inside the detector's band at that peak**. The average it reported was **18.713 g**: a
 * sixth of a g under the rail, because almost the whole boost IS the flat top. That is the
 * clearest statement of why the average needs its own caveat — where the peak is a bound the
 * flat top imposes, the average is very nearly the bound itself.
 *
 * *(A first version of this note cited `sample-saturated.csv` instead — a file Debrief MADE UP,
 * whose own first line says no figure from it means anything about a real rocket. Citing a
 * generated curve as a measurement is the exact confusion the measurement invariant exists to
 * prevent, and the real railed recording was in the repo the whole time. The generated file
 * remains a useful cross-check because its velocity column is integrated from the unclipped
 * curve, so the truth is recoverable from it: over its burn, Δv/Δt is 14.92 g NET of gravity,
 * which is 15.92 g of specific force once the 1 g is added back — the quantity
 * `avgBoostAcceleration` actually reports — against the 12.90 g it reported, 19.0% low. Both
 * numbers in one convention; the first draft quoted the net figure under the specific-force
 * name, which is the trap `lib/report.ts` already records.)*
 */
export const AVG_ACCEL_CLIPPED = 'a floor — the trace reads as clipped';
/** The comparison cell's short form, shared with the saved document so the two agree. */
export const ACCEL_TAG_CLIPPED = ' (clipped)';

/** The two facts that qualify an acceleration reading, and the whole input either helper needs —
 *  shaped like `ApogeeCaveatFacts` above, and PARTIAL for the same reason: a caller that holds
 *  only some of a flight's metrics (the channel explorer builds its channels from a series) still
 *  gets an honest answer rather than a type error, and a missing flag reads as "not clipped",
 *  which is what an absent measurement means. */
export type AccelCaveatFacts = Partial<Pick<FlightMetrics, 'accelClipped' | 'maxAcceleration'>>;

/** Whether the readings taken off this accelerometer are qualified by saturation. The peak's
 *  own `Number.isFinite` guard rides along, because a flight with no acceleration at all has
 *  nothing to qualify — and that guard is here rather than at the four call sites so the grid,
 *  the document, the card and the comparison cell cannot drift on the edge case.
 *
 *  **`false` means one of TWO things and cannot tell them apart**, which matters now that the
 *  ABSENCE of a caveat is itself a claim. `lib/analyze/index.ts` evaluates `accelClipped` only
 *  inside `if (ascentPresent && !ascentGapBreaksPeak)`, so on an ascent with a gap that breaks
 *  the peak the flag is false because the plateau test never RAN, not because the sensor behaved.
 *  In that state `maxAcceleration` is `NaN` — which this predicate already refuses — so no
 *  surface prints a bare peak; but `avgBoostAcceleration` has no such guard and is published, and
 *  it will read as unqualified. Filed in `BACKLOG.md` rather than fixed here: separating "not
 *  clipped" from "never tested" is a change to what the analyzer returns and wants its own gate
 *  and its own corpus run. */
export function accelIsClipped(m: AccelCaveatFacts): boolean {
  return m.accelClipped === true && Number.isFinite(m.maxAcceleration);
}

/** The sub-line under "Max acceleration", on the grid and on the share card.
 *
 *  **Shared because it was already duplicated byte for byte.** `lib/flightCard.ts` carried this
 *  exact ternary — the one artifact that leaves the device as an image — so the card and the grid
 *  were two copies of one sentence, which the architecture invariant names outright ("where two
 *  surfaces do the same job, they share a module rather than a resemblance"). Collapsed here
 *  2026-08-13 while its sibling `avgBoostSub` was being written, because writing the second
 *  caveat beside a duplicated first one is how a third copy gets made. */
export function maxAccelSub(m: Pick<FlightMetrics, 'accelerationSource'> & AccelCaveatFacts): string {
  if (m.accelerationSource !== 'device') return 'derived';
  return accelIsClipped(m) ? 'measured · may be clipped' : 'measured';
}

/** The sub-line under "Avg acceleration", on the grid and in the saved document. */
export function avgBoostSub(m: AccelCaveatFacts): string {
  return accelIsClipped(m) ? `over the boost · ${AVG_ACCEL_CLIPPED}` : 'over the boost';
}

/** The full sentence, for a surface with room for one — the channel explorer's statistics and the
 *  report's own acceleration chart. That table publishes each plotted channel's `max` AND its
 *  `mean`, and on this channel those are the two readings the grid qualifies, so the sentence
 *  names both.
 *
 *  **Deliberately NOT worded like the withheld-velocity caveat beside it, and that is a
 *  correction.** A first draft opened "not a reading Debrief stands behind", copied from the
 *  velocity channel — where the peak really is WITHHELD and the trace is drawn only so a
 *  mis-scaled column can be diagnosed. Debrief does publish this peak: on the grid, the share
 *  card, the comparison, the JSON and the saved document. Disowning it here while five other
 *  surfaces headline it would be the same one-surface-disagrees defect this whole change exists
 *  to close, pointing the other way. It is an honest lower bound, and that is what it says.
 *
 *  "Reads as" rather than "railed", for the same reason the tile says *may* be clipped: the flag
 *  is a heuristic (`lib/analyze/index.ts` — a sustained run of samples inside a tight band at the
 *  peak), and a caveat may not be more certain than the test behind it. */
export const ACCEL_CLIPPED_CAVEAT =
  'the trace reads as clipped — the accelerometer looks to have hit its full-scale limit, so the true peak is higher than this max, and the mean over a railed stretch is a floor too';

/** The two facts that qualify an apogee, and the whole input either helper needs. */
export type ApogeeCaveatFacts = Partial<Pick<FlightMetrics, 'altitudeUnproven' | 'apogeeIsFloor'>>;

/**
 * What makes this apogee less than a plain reading — the CAVEATS alone, no "N s to apogee".
 *
 * **Split out of `apogeeSub` on 2026-08-03 because every artifact that leaves the device was
 * dropping the unproven half.** `lib/report.ts` gated the whole sub on `apogeeIsFloor`, so a
 * record flagged `altitudeUnproven` and not `apogeeIsFloor` — which is one real corpus flight,
 * reading 31 ft against a sibling altimeter in the same airframe that recorded 2,115 m — put the
 * caveat on the metric tile and printed a bare "31 ft" into the .txt, the .md, the clipboard
 * table, the JSON and the share card. The docstring on `apogeeSub` had promised the opposite in
 * as many words: *"onto the tile, into every export, onto the shareable card."*
 *
 * The reason it needs to be separate from `apogeeSub` rather than just called: a table that
 * prints "Time to apogee" as its own row must not repeat it inside the apogee cell.
 */
/** Takes only what it reads, so a caller holding a narrower shape than a whole `FlightMetrics`
 *  can share this sentence rather than restate it — which is how the channel explorer's altitude
 *  channels came to publish a bare apogee while every other surface qualified it. */
export function apogeeCaveat(m: ApogeeCaveatFacts): string | undefined {
  const parts = [m.altitudeUnproven ? UNPROVEN : undefined, m.apogeeIsFloor ? FLOOR : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Whether the apogee carries any caveat at all — what a comparison tests before crowning a
 *  "highest", and what an export tests before deciding there is nothing to qualify. */
/** The caveats in the shape the logbook persists — `undefined` where there are none, so a row
 *  for an ordinary flight costs no stored member and old rows keep their behaviour. */
export function apogeeCaveatFlags(m: FlightMetrics): { floor?: boolean; unproven?: boolean } | undefined {
  if (!apogeeIsQualified(m)) return undefined;
  return { ...(m.apogeeIsFloor ? { floor: true } : {}), ...(m.altitudeUnproven ? { unproven: true } : {}) };
}

export function apogeeIsQualified(m: ApogeeCaveatFacts): boolean {
  return !!m.altitudeUnproven || !!m.apogeeIsFloor;
}

export function apogeeSub(m: FlightMetrics): string | undefined {
  const to = Number.isFinite(m.timeToApogee) ? `${fmtTime(m.timeToApogee)} to apogee` : undefined;
  // The unproven clause LEADS and the floor clause trails, because a flyer who reads three words
  // of a caption reads the first three, and "in doubt" is the one that changes what they do next.
  const parts = [m.altitudeUnproven ? UNPROVEN : undefined, to, m.apogeeIsFloor ? FLOOR : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function burnoutSub(m: FlightMetrics): string | undefined {
  if (m.burnoutSource == null) return undefined;
  // Naming the fallback rather than just saying "derived" is the useful half: it tells a
  // flyer WHICH instant the reading was taken at, which is what makes the burn time and the
  // burnout altitude inherit it too.
  return m.burnoutSource === 'derived' ? 'derived from the speed peak' : 'measured';
}

/**
 * The burnout SPEED, which does not take `burnoutSub`'s answer — and that is the whole point of
 * this function existing separately.
 *
 * `burnoutSource` answers **how the INSTANT was located**: a signed axial crossing (`measured`)
 * or the velocity peak standing in for one (`derived`). Burn time and burnout altitude are read
 * at that instant off a clock and off the altitude channel, so for them that answer is the whole
 * story. **The burnout SPEED is not**: it is `velocity[burnoutIdx]`, read off the velocity trace,
 * and where that trace is a barometric derivative the number is derived however well the instant
 * was found. Handing it `burnoutSub`'s word published a differentiated altitude as `measured`
 * three rows under the identical figure labelled `derived` — measured 2026-08-09 on two corpus
 * recordings (`issuiuc-sg1.1` at 121.2 m/s, `issuiuc-stargazer1` at 128.4 m/s), which is the
 * caveat-on-one-surface, confident-claim-on-another failure this file's own docstrings forbid.
 *
 * It also carries the identity note, because it is the one burnout reading whose number is
 * literally another number already on the page: where burnout is the peak sample, this row and
 * the max-velocity row are one measurement printed twice, and left bare they read as two
 * instruments agreeing.
 */
export function burnoutVelocitySub(m: FlightMetrics): string | undefined {
  if (m.burnoutSource == null) return undefined;
  const atPeak = m.burnoutAtVelocityPeak ? ' — the same instant as max velocity' : '';
  // A device that logged its own velocity measured this sample like any other, so the only
  // question left is how the instant was found — which is exactly what `burnoutSub` answers.
  if (m.maxVelocitySource === 'device') return `${burnoutSub(m)}${atPeak}`;
  return m.burnoutAtVelocityPeak
    ? // Burnout IS the peak, so this row and the max-velocity row are one sample. It carries
      // that reading's own caveat rather than inventing a second wording for one number.
      `${velocityProvenance(m, 'short')}${atPeak}`
    : // Burnout is elsewhere on the trace. "Usually reads high at the peak" is a tendency
      // measured ON THE PEAK — five of six corpus pairs — and this sample is not it, so
      // repeating it here would quote one basis under another's name. The provenance is stated
      // without a tendency this reading has not earned.
      'derived from the altitude, at a measured burnout';
}

/**
 * The readings a flyer asks for about ONE STAGE of a staged launch, in the order they are asked
 * in: how high and how fast it got, how hard it pushed, and how long for.
 *
 * A subset of `metricTiles` rather than a second list, and by LABEL rather than by rebuilding the
 * tiles — so a stage panel can never invent a reading, never format one differently from the way
 * the single-flight grid formats it, and never carry a qualifier the grid has dropped. A label
 * that stops existing takes its entry out of here silently, which is the right failure: the
 * alternative is a per-stage tile whose value the rest of the app no longer computes.
 *
 * **What is deliberately NOT here, and why it is the whole point.** Nothing is combined. These are
 * each ONE recording's reading of the part of the launch it flew — a booster's apogee is where the
 * booster came down, not a stage of one number — so there is no per-stage total, no summed
 * impulse, no composite anything. `lib/composite.ts` says the same thing about the marks; this is
 * that rule applied to the readings.
 *
 * The descent and recovery readings are left out for a different reason: on a booster they
 * describe a separate, complete little flight that ended in a field, which is worth reading — but
 * on the surface whose job is the ASCENT of one launch it is the wrong question, and the flyer has
 * `/compare` and the single-flight report for it. Say that rather than let the list grow to the
 * full 21 per recording, which is four screens for three recordings.
 */
export const STAGE_READINGS = [
  'Apogee',
  'Max velocity',
  'Max acceleration',
  'Thrust-to-weight',
  'Burn time',
  'Burnout altitude',
  'Burnout velocity',
] as const;

export function stageTiles(m: FlightMetrics, sys: UnitChoice): Tile[] {
  const all = metricTiles(m, sys);
  return STAGE_READINGS.map((label) => all.find((t) => t.label === label)).filter((t): t is Tile => t != null);
}

export function metricTiles(m: FlightMetrics, sys: UnitChoice): Tile[] {
  const out: Tile[] = [
    {
      label: 'Apogee', method: 'apogee',
      value: fmtLength(m.apogeeAltitude, sys),
      sub: apogeeSub(m),
      primary: true,
    },
    {
      label: 'Max velocity', method: 'velocity-max-velocity',
      value: fmtSpeed(m.maxVelocity, sys),
      sub: maxVelocitySub(m, sys),
      primary: true,
    },
  ];
  // Acceleration is omitted for a GPS-only flight (it's not meaningful), so only
  // show the tile when there's a real figure.
  if (Number.isFinite(m.maxAcceleration)) {
    out.push({
      label: 'Max acceleration', method: 'acceleration',
      value: fmtAccel(m.maxAcceleration, sys),
      sub: maxAccelSub(m),
      primary: true,
    });
  }

  if (m.avgBoostAcceleration != null)
    out.push({ label: 'Avg acceleration', method: 'acceleration', value: fmtAccel(m.avgBoostAcceleration, sys), sub: avgBoostSub(m) });
  if (m.liftoffTWR != null)
    out.push({ label: 'Thrust-to-weight', method: 'thrust-to-weight', value: `${m.liftoffTWR.toFixed(1)}:1`, sub: 'off the pad' });
  // All three burnout readings carry the same provenance, because all three are read at the
  // one instant burnout was located at — a burn time is only as measured as the burnout that
  // ends it, and a burnout altitude only as measured as the sample it is taken from.
  if (m.burnTime != null) out.push({ label: 'Burn time', method: 'liftoff-burnout', value: fmtTime(m.burnTime), sub: burnoutSub(m) });
  if (m.burnoutAltitude != null)
    out.push({ label: 'Burnout altitude', method: 'liftoff-burnout', value: fmtLength(m.burnoutAltitude, sys), sub: burnoutSub(m) });
  if (m.burnoutVelocity != null)
    out.push({ label: 'Burnout velocity', method: 'liftoff-burnout', value: fmtSpeed(m.burnoutVelocity, sys), sub: burnoutVelocitySub(m) });
  if (m.coastTime != null) out.push({ label: 'Coast to apogee', method: 'coast-efficiency', value: fmtTime(m.coastTime) });
  if (m.coastEfficiency != null)
    out.push({
      label: 'Coast efficiency', method: 'coast-efficiency',
      value: `${Math.round(m.coastEfficiency * 100)}%`,
      // Named against what it is short OF. The figure is the vacuum coast this burnout speed
      // would have bought minus what the rocket actually gained, so on a fast, draggy flight it
      // is legitimately larger than the whole flight — 20 of the 31 corpus flights that show it
      // exceed their own apogee, up to 6.6x (107,217 ft on a 16,206 ft flight). Read as "drag
      // cost 107,217 ft" beside a 16,206 ft apogee that is a tool that looks broken; read as a
      // shortfall against a drag-free coast it is the reading it always was.
      sub: m.dragLossAltitude != null ? `${fmtLength(m.dragLossAltitude, sys)} short of a drag-free coast` : undefined,
    });
  if (m.maxDynamicPressure != null)
    out.push({
      label: 'Max Q', method: 'mach-dynamic-pressure',
      value: fmtPressure(m.maxDynamicPressure, sys),
      // **It carries the SPEED's provenance, and it is the reading that needs it most.** Max Q is
      // ½ρv², so it is QUADRATIC in exactly the figure `velocityProvenance` warns about: on a
      // barometer-only flight the peak speed is differentiated out of an altitude and "usually
      // reads high at the peak", and squaring it carries that tendency through roughly doubled.
      // The peak-speed tile has said so for a long time and Mach rides inside that same `sub`, so
      // Mach was qualified too — max Q was the one derived-speed reading on the page saying
      // nothing, on the surface where a structures number is read. `sub` reaches the .txt, .md,
      // .html and the clipboard as well as the tile, which is the whole reason `velocityProvenance`
      // was exported in the first place.
      sub: [
        m.maxDynamicPressureAltitude != null ? `at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : null,
        maxQProvenance(m),
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    });
  if (m.drogueDescentRate != null)
    out.push({ label: 'Drogue descent', method: 'deployments-descent-rates', value: fmtSpeed(m.drogueDescentRate, sys) });
  if (m.wholeDescentRate != null)
    out.push({
      label: 'Descent rate', method: 'main-descent-rate',
      value: fmtSpeed(m.wholeDescentRate, sys),
      sub: landedInRecord(m)
        ? 'averaged apogee to landing — no deployment change is in the record'
        : 'averaged over the recorded descent — the record stops before the ground, so this is not a landing speed',
    });
  if (m.mainDescentRate != null)
    out.push({
      label: 'Main descent', method: 'main-descent-rate',
      value: fmtSpeed(m.mainDescentRate, sys),
      // The same caveat the whole-descent tile above already carries, for the same reason.
      // A resolved main deploy does NOT mean the record reached the ground: on 3 of the 37
      // corpus flights the suite analyses end to end, the file stops in the air after the
      // main fired, and the leg averaged from the deploy to the last sample was printed
      // bare — 50 ft/s on a 2,841 m flight, read as a touchdown against the 20–50 ft/s band
      // the seven genuinely-landed mains fall in. (The 121 km TeleMega reaches the same
      // state at 143 ft/s through the generic mapper; it is a known-issue fixture, so the
      // corpus assert does not count it.) `landingRate` has withheld the touchdown speed in
      // this state since the landing-energy card was written; this tile went on publishing
      // the number that card refuses.
      sub: landedInRecord(m)
        ? undefined
        : 'averaged from the main deploy to the last sample — the record stops before the ground, so this is not a landing speed',
    });
  // Where this file held the same flight twice and the copy that starts on the pad stopped
  // before the rocket landed, the clock came from the other copy. Two readings from two
  // recordings, shown as such rather than merged silently into the rest.
  const fromCopy = m.descentSource === 'second-copy' ? 'from this file’s second copy of the flight' : undefined;
  if (m.descentTime != null) out.push({ label: 'Descent time', method: 'deployments-descent-rates', value: fmtTime(m.descentTime), sub: fromCopy });
  if (m.flightTime != null) out.push({ label: 'Flight time', method: 'deployments-descent-rates', value: fmtTime(m.flightTime), sub: fromCopy });
  if (m.groundTemperature != null)
    out.push({ label: 'Ground temp', method: 'ground-baseline-altitude', value: fmtTemp(m.groundTemperature, sys) });
  // Battery: the lowest it sagged to, with the resting voltage alongside so a
  // drop (a weak pack — a common cause of a charge that didn't fire) is visible.
  if (m.batteryMinV != null)
    out.push({
      label: 'Battery low', method: 'battery',
      value: fmtVoltage(m.batteryMinV),
      sub: m.batteryStartV != null ? `${fmtVoltage(m.batteryStartV)} at rest` : undefined,
    });

  // Roll/spin about the long axis, when the logger recorded a roll-rate channel.
  if (m.peakRollRate != null)
    out.push({
      label: 'Peak roll rate', method: 'roll-spin',
      value: `${Math.round(m.peakRollRate)} °/s`,
      sub: `${(m.peakRollRate / 360).toFixed(1)} rev/s`,
    });
  if (m.rollRevolutions != null)
    out.push({
      label: 'Revolutions', method: 'roll-spin',
      value: m.rollRevolutions.toFixed(m.rollRevolutions < 10 ? 1 : 0),
      sub: 'total roll',
    });

  // How vertical the powered flight was, when the logger solved for attitude.
  if (m.tiltAtBurnout != null)
    out.push({
      label: 'Tilt at burnout', method: 'roll-spin',
      value: `${Math.round(m.tiltAtBurnout)}°`,
      sub: 'off vertical',
    });

  return out;
}
