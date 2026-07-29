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
 *  barometric altitude (softer at peak). Provenance is shown for the peak the way
 *  the max-acceleration tile shows it, so a headline number never reads as more
 *  direct than it is. */
function maxVelocitySub(m: FlightMetrics, sys: UnitChoice): string | undefined {
  if (!Number.isFinite(m.maxVelocity)) {
    // "Not in this log" is only true when the file carries no speed at all. Where Debrief
    // withheld one it is the opposite of true — the data is there and the reading was
    // declined — and a withheld number has to say why it was withheld.
    if (m.maxVelocityWithheld === 'gap') return 'withheld — the ascent has a stretch the record doesn’t cover';
    if (m.maxVelocityWithheld === 'implausible') return 'withheld — the speed this trace gives is not physically possible';
    return 'not in this log';
  }
  const parts: string[] = [];
  if (m.mach) parts.push(fmtMach(m.mach));
  if (Number.isFinite(m.maxVelocityAltitude)) parts.push(`at ${fmtLength(m.maxVelocityAltitude, sys)}`);
  parts.push(m.maxVelocitySource === 'device' ? 'measured' : 'derived');
  return parts.join(' · ');
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
  if (!m.apogeeIsFloor) return to;
  const floor = 'at least this high — the log ends at its own peak, so the rocket was still going up';
  return to ? `${to} · ${floor}` : floor;
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
