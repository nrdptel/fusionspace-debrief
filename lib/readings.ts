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
export function apogeeSub(m: FlightMetrics): string | undefined {
  const to = Number.isFinite(m.timeToApogee) ? `${fmtTime(m.timeToApogee)} to apogee` : undefined;
  // A record whose climb is impossible for the height it reaches is not describing a flight, and
  // the apogee is the reading that carries that furthest — onto the tile, into every export, onto
  // the shareable card. It leads the sub rather than trailing it, because a flyer who reads three
  // words of a caption reads the first three.
  const unproven = m.altitudeUnproven
    ? 'unproven — this record’s climb is too slow to be a flight, so its altitude channel is in doubt'
    : undefined;
  const floor = m.apogeeIsFloor
    ? 'at least this high — the log ends at its own peak, so the rocket was still going up'
    : undefined;
  const parts = [unproven, to, floor].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function burnoutSub(m: FlightMetrics): string | undefined {
  if (m.burnoutSource == null) return undefined;
  // Naming the fallback rather than just saying "derived" is the useful half: it tells a
  // flyer WHICH instant the reading was taken at, which is what makes the burn time and the
  // burnout altitude inherit it too.
  return m.burnoutSource === 'derived' ? 'derived from the speed peak' : 'measured';
}

/** The burnout SPEED additionally carries the identity note, because it is the one burnout
 *  reading whose number is literally another number already on the page: where burnout is
 *  the peak sample, this row and the max-velocity row are one measurement printed twice, and
 *  left bare they read as two instruments agreeing. The other two burnout readings get the
 *  provenance alone — a duration is not a duplicate of anything, and repeating the full
 *  sentence down three consecutive rows buys nothing. */
export function burnoutVelocitySub(m: FlightMetrics): string | undefined {
  const base = burnoutSub(m);
  if (base == null) return undefined;
  return m.burnoutAtVelocityPeak ? `${base} — the same instant as max velocity` : base;
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
      sub:
        m.accelerationSource === 'device'
          ? m.accelClipped
            ? 'measured · may be clipped'
            : 'measured'
          : 'derived',
      primary: true,
    });
  }

  if (m.avgBoostAcceleration != null)
    out.push({ label: 'Avg acceleration', method: 'acceleration', value: fmtAccel(m.avgBoostAcceleration, sys), sub: 'over the boost' });
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
      sub: m.maxDynamicPressureAltitude != null ? `at ${fmtLength(m.maxDynamicPressureAltitude, sys)}` : undefined,
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
