// The canonical flight model. Every parser, whatever the source format, produces
// one of these: a time base in seconds plus a set of named channels in SI units.
// The analysis pipeline only ever sees this shape, so adding a new logger never
// touches the analysis.

import type { FlownAt } from './flownAt';
import type { RepeatedSpan } from '../highRateRepeats';

export type ChannelKind =
  | 'altitude' // height (canonical metres) — AGL once a baseline is set
  | 'altitudeInertial' // the logger's own inertial (accelerometer-integrated) height, m —
  //   a second, independent altitude recording in the same file, kept beside the
  //   barometric one for cross-checking rather than merged into it
  | 'pressure' // ambient pressure, Pa
  | 'temperature' // °C
  | 'accelAxial' // acceleration along the rocket's long axis, m/s²
  | 'accelTotal' // magnitude of total acceleration, m/s²
  | 'velocity' // velocity as reported by the device, m/s
  | 'rollRate' // angular rate about the roll (long) axis, deg/s
  | 'rollAngle' // angle THROUGH which the airframe has rolled about its long axis, degrees —
  //   an orientation the logger itself solved, never a rate. Kept distinct from `rollRate`
  //   because confusing the two is a wrong number that looks right: a ±180° column read as a
  //   rate reports a plausible 179.99 deg/s peak. Boards that publish one state how they got
  //   it (the Blue Raven integrates its own roll rate over time and says so), and that limit
  //   travels with the channel rather than being inferred here.
  | 'tilt' // angle of the long axis from vertical, degrees (0 = straight up)
  | 'voltage' // battery / pyro voltage, V
  | 'latitude' // GPS latitude, decimal degrees (+N)
  | 'longitude' // GPS longitude, decimal degrees (+E)
  | 'altitudeGps' // the receiver's own altitude, m — a second, independent altitude
  //   recording in the same file (a different sensor from the barometer, and one that
  //   doesn't care about the weather or the shock over a static port). Kept beside the
  //   barometric channel for cross-checking, never merged into it. NaN wherever the
  //   receiver had no fix: a GPS holds its last position rather than saying nothing.
  | 'satellites' // satellites in the fix — 0 means the position and GPS altitude beside
  //   it are held-over values, not measurements. NOT the same quantity as a receiver's count of
  //   satellites it can HEAR: a Featherweight tracker reports 16 to 19 of those on rows its own
  //   FIX column calls no fix at all (10 such rows in the corpus), so a tracked count carried
  //   under this kind would say a held-over position was measured. A family that reports only the
  //   tracked count carries it as `other` and states its fix quality through `gpsFixGrade`.
  | 'gpsFixGrade' // what the receiver solved this fix in: 3 three-dimensional, 2 two-dimensional
  //   (latitude and longitude on an ASSUMED height), 0 no fix — NaN where the file says nothing.
  //   `lib/gpsFix.ts` is the one place a file's own statement is turned into this, from either a
  //   satellite count or a fix-type column, so every family answers the question the same way.
  //   The GRADE is not the accuracy: it says what a fix may be used for, never how many metres it
  //   is good to.
  //
  // The three below are DILUTION OF PRECISION, unitless: how much the satellite GEOMETRY at that
  // instant multiplies the receiver's own ranging error. Lower is better geometry; 1 is the floor
  // a perfect spread would give. They are a quality signal and NOT an accuracy in metres — turning
  // one into metres needs the receiver's ranging error, which no file here carries and no vendor
  // publishes (`COMPETITION.md` row 47). `dopPosition² = dopHorizontal² + dopVertical²` where a
  // file supplies all three, which is a cheap check that the columns are what they say.
  //
  // NaN where the receiver never supplied it. AltOS writes `2147483647` — INT32_MAX — for that,
  // and it is a PER-COLUMN statement rather than a per-file one: one corpus recording supplies
  // `pdop` at 1.60–1.70 while marking `hdop` and `vdop` never-supplied on all 346 of its rows. A
  // column that is never supplied carries no channel at all rather than a channel of NaN.
  | 'dopHorizontal' // HDOP — the geometry behind latitude and longitude
  | 'dopVertical' // VDOP — the geometry behind the receiver's own height
  | 'dopPosition' // PDOP — the two together, in three dimensions
  //
  // The three below are SENSOR-FRAME channels: one axis of a board's own inertial package,
  // named by the axis the board wrote rather than by what the airframe was doing. They are
  // deliberately NOT `accelAxial` / `rollRate`, even on a record where the long axis has been
  // measured and the axial one is known: those kinds are what the analysis reads to produce
  // readings, and a high-rate stream reaches Debrief reduced to an envelope (`lib/highRate.ts`),
  // so a metric computed off one would be a number taken from a trace built for looking at.
  // D8 keeps that for the slice that validates it.
  | 'accelAxis' // acceleration along one of the board's own sensor axes, m/s²
  | 'angularRate' // angular rate about one of the board's own sensor axes, deg/s
  | 'attitudeQuaternion' // one component of the board's normalised attitude quaternion,
  //   unitless. Only meaningful alongside its three siblings, at the same instant — see
  //   `HighRateStream.coherent`
  | 'other';

export interface Channel {
  kind: ChannelKind;
  /** The column label as it appeared in the source, for transparency. */
  label: string;
  /** Canonical SI unit string for the stored values. */
  unit: string;
  /** Values aligned 1:1 with the flight's `time` array. NaN marks a gap. */
  values: Float64Array;
  /** Set on an acceleration channel whose logger already removed gravity, so it reads 0
   *  sitting on the pad instead of the +1 g an accelerometer actually senses. Debrief
   *  reports SPECIFIC FORCE everywhere — the g the airframe felt — so the analyzer adds
   *  that g back. Only a parser can know this: it is a property of the file format, not
   *  something the numbers reveal on a record that opens after the motor lit. */
  gravityRemoved?: boolean;
}

/** A headline figure some instrument other than Debrief's own analysis states — the
 *  logger's own apogee and max velocity, or a simulator's prediction of them. Kept as
 *  first-class, provenance-labelled data so it can be shown beside Debrief's independent
 *  read as a cross-check, never blended into it. `metric` names the analysis field it
 *  lines up against. */
export interface ReportedValue {
  metric:
    | 'apogeeAltitude'
    | 'maxVelocity'
    | 'maxAcceleration'
    | 'burnoutVelocity'
    | 'mainDescentRate'
    | 'drogueDescentRate'
    /** The deployment shocks. Unlike every other member these do NOT name a field on
     *  `FlightMetrics` — Debrief measures the same quantity as `peakAccel` on the apogee and
     *  main EVENTS, so `compareReported` resolves them from the event list. A device that
     *  states them is often the only source there is: on a Blue Raven the board reports the
     *  charge's own channel, which no barometric trace can recover. */
    | 'apogeeShock'
    | 'mainShock'
    /** Stated by a PREDICTION, and each names a `FlightMetrics` field Debrief already
     *  measures, so all three cross-check directly. */
    | 'maxMach'
    | 'timeToApogee'
    | 'flightTime'
    /** Also stated by a prediction, and these four name NOTHING Debrief measures — on
     *  purpose. The nearest field is not the same quantity: `groundHitVelocity` is the
     *  speed at impact where `mainDescentRate` is an average over the main leg, and this
     *  repo has already paid for letting two descent figures share a field (four
     *  recordings of one flight "disagreed" by 121.6% because three measured a main leg
     *  and the fourth measured the whole descent). `optimumDelay` is not a measurement at
     *  all — it is the simulator's recommendation, which Debrief reads and repeats but
     *  would never compute, since recommending a delay is simulating.
     *
     *  `compareReported` yields no verdict for these, which is the honest outcome: a
     *  stated figure with nothing to check it against. */
    | 'groundHitVelocity'
    | 'launchRodVelocity'
    | 'deploymentVelocity'
    | 'optimumDelay';
  /** Human label as Debrief presents it, e.g. "Apogee". */
  label: string;
  /** The value in canonical SI (m, m/s, m/s², s, or a dimensionless Mach), converted
   *  from the file's unit. */
  value: number;
  /** Which kind of instrument said so. `'device'` is a logger's own computed figure —
   *  another *measurement* of the flight that was flown. `'predicted'` is a simulator's
   *  statement about a flight that had not happened yet. The two are never merged and
   *  never presented as agreeing or disagreeing in the same voice: two devices that
   *  differ is a discrepancy worth chasing, while a flight that missed its prediction
   *  is not an error at all — it is the answer. */
  source: 'device' | 'predicted';
}

export interface RawFlight {
  /** Source file name. */
  source: string;
  /** Parser id, e.g. 'altusmetrum' or 'csv'. */
  format: string;
  /** Human-readable format name for the UI. */
  formatLabel: string;
  /** Seconds from the file's own zero. Monotonic but not necessarily uniform. */
  time: Float64Array;
  channels: Channel[];
  /** Free-form metadata pulled from the file (device, serial, ground level…). */
  meta: Record<string, string | number>;
  /** When the flight flew, where the file states it — a GPS fix's UTC or the logger's own
   *  wall clock. Absent when the file carries no date; never inferred from the file itself
   *  arriving on this device. See ./flownAt.ts. */
  flownAt?: FlownAt;
  /** Anything the parser wants the reader to know (carried-forward rows, etc). */
  notes: string[];
  /** Headline figures the logger computed and wrote into the file — kept for a
   *  side-by-side cross-check against Debrief's own read. Absent when the file
   *  carries no such summary. */
  reported?: ReportedValue[];
  /** Stretches of this recording that repeat an earlier stretch of it VERBATIM — a backup
   *  download that wrote part of the flight twice. Seconds on this flight's own clock.
   *
   *  Structured rather than a sentence in `notes`, and that is the whole reason it is here: a
   *  repeat is only worth telling a flyer about if it falls inside the stretch the analysis
   *  ends up reading, and the extent is decided long after the parser that can see the repeat.
   *  `lib/highRateRepeats.ts` finds them; `repeatedSpanNote` turns them into a claim once an
   *  extent exists. Absent on every recording that does not repeat itself, which is nearly all
   *  of them. */
  repeatedSpans?: RepeatedSpan[];
  /** A simulation's own altitude curve, from a design dropped in beside this log. On the
   *  SIMULATION's clock, never this recording's, and never resampled onto it — a prediction is
   *  a third source, and moving its samples onto a measured liftoff would make a simulation look
   *  like it was measured.
   *
   *  It sits here rather than in `channels` deliberately: a `Channel` is something an instrument
   *  recorded, and everything downstream reads that list as measurement. This is a statement
   *  about a flight that had not happened yet, so it stays out of the analyzer's way entirely —
   *  nothing in `lib/analyze` looks at it, and no reading is derived from it. */
  predicted?: PredictedTrace;
}

/** A design's saved simulation curve, carried onto the flight it was dropped beside. */
export interface PredictedTrace {
  /** The design's own name, for the legend — the flyer chose it and will recognise it. */
  rocket: string;
  /** Seconds from the simulation's own zero, which is ignition. */
  time: Float64Array;
  /** Metres above ground, aligned 1:1 with `time`. */
  altitude: Float64Array;
}

export function getChannel(flight: RawFlight, kind: ChannelKind): Channel | undefined {
  return flight.channels.find((c) => c.kind === kind);
}
