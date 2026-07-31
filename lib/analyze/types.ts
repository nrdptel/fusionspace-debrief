export type EventType = 'liftoff' | 'burnout' | 'apogee' | 'drogue' | 'main' | 'landing';

/** How a number was arrived at — surfaced in the UI so nothing looks more certain than it is. */
export type Provenance = 'measured' | 'derived' | 'estimated';

export interface FlightEvent {
  type: EventType;
  label: string;
  /** Seconds from the first sample (the series time base). */
  time: number;
  index: number;
  /** AGL altitude at the event, metres. */
  altitude: number;
  provenance: Provenance;
  /** Peak acceleration magnitude (m/s²) measured at a deployment event — the
   *  "snatch" shock as the charge fires and the recovery gear snaps taut. Set for
   *  apogee (apogee charge / ejection) and main only when the logger recorded
   *  acceleration; absent otherwise. */
  peakAccel?: number;
}

export interface FlightMetrics {
  apogeeAltitude: number; // m AGL
  /** True when the record's peak is at or beside its last sample — the log stopped at or
   *  before apogee, so this figure is the highest the rocket was SEEN at, a lower bound,
   *  not the height it reached. The flight kept going; the recording did not. */
  apogeeIsFloor: boolean;
  timeToApogee: number; // s from liftoff
  maxVelocity: number; // m/s
  /** Why there is no peak speed, when there isn't one. 'gap' — the ascent has a stretch the
   *  record doesn't cover, so the top speed may fall inside it and a derivative across it is
   *  a spike, not a reading. 'implausible' — the trace produced a speed the analysis judged
   *  impossible. null — the log carries no speed and none could be derived, which is the only
   *  case where "not in this log" is true. The first two are Debrief declining to report a
   *  number from data that IS there, and a tile saying the log lacks it is actively wrong. */
  maxVelocityWithheld: 'gap' | 'implausible' | null;
  maxVelocitySource: 'device' | 'baro';
  maxVelocityAltitude: number; // m AGL where max velocity occurred
  mach: number | null;
  maxDynamicPressure: number | null; // Pa (max-Q) — peak ½ρv² over the flight
  maxDynamicPressureAltitude: number | null; // m AGL where max-Q occurred (the load case)
  /** When the rocket first crossed Mach 1 (s from liftoff) and the altitude there,
   *  or null for a subsonic flight. */
  transonicTime: number | null;
  transonicAltitude: number | null;
  /** True when that Mach-1 crossing was read from a speed differentiated out of an
   *  altitude rather than measured — so it can't be taken as confirmation the rocket
   *  actually went supersonic. The UI and exports soften the claim accordingly rather
   *  than dropping it. */
  transonicUnconfirmed: boolean;
  /** For a derived speed, which altitude it was differentiated from; null when the device
   *  measured the speed itself. Two failure modes wear the same "derived" label and need
   *  different sentences: a barometer is distorted by the shock over its port from about
   *  Mach 0.9 up, while a GPS is not — but differentiating a coarse, lagging GPS altitude
   *  runs the peak high instead. Saying "a barometer can't confirm this" over a GPS log
   *  names the wrong sensor and the wrong failure. */
  derivedVelocityFrom: 'baro' | 'gps' | null;
  maxAcceleration: number; // m/s²
  /** Mean acceleration over the boost (liftoff → burnout) — a standard altimeter
   *  reading alongside the peak. null without a burnout or an acceleration trace. */
  avgBoostAcceleration: number | null; // m/s²
  maxDeceleration: number; // m/s² (most negative)
  accelerationSource: 'device' | 'baro';
  /** True when a device accelerometer flat-tops at its peak — the signature of a
   *  sensor that hit its full-scale limit (saturated). The reported max is then a
   *  floor, not the truth. Always false for a derived (baro) acceleration. */
  accelClipped: boolean;
  /** Thrust-to-weight off the pad: the accelerometer's specific-force reading (in
   *  g) right at liftoff is the thrust-to-weight ratio, since drag is negligible at
   *  low speed — the "5:1 rule" launch-safety number. Null without a measured
   *  accelerometer, or when the trace was saturated at liftoff (a railed reading
   *  would understate it). */
  liftoffTWR: number | null;
  burnTime: number | null; // s
  burnoutAltitude: number | null; // m AGL
  burnoutVelocity: number | null; // m/s
  /** How burnout was located: 'measured' from a signed axial accelerometer crossing zero,
   *  or 'derived' from the velocity peak when no such channel exists. On a 'derived' flight
   *  the burnout velocity IS the max velocity by construction, which the readings say rather
   *  than printing one number twice under two labels. */
  burnoutSource: 'measured' | 'derived' | null;
  /** True when the burnout sample IS the max-velocity sample, so `burnoutVelocity` and
   *  `maxVelocity` are one reading printed under two labels. That is the ordinary case on a
   *  'derived' burnout (located at the peak by construction) but happens on a 'measured' one
   *  too — the axial trace crosses zero exactly where the speed peaks, so a real accelerometer
   *  crossing can land on that same sample. Every surface that shows both figures says so,
   *  rather than letting one number read as two instruments agreeing. */
  burnoutAtVelocityPeak: boolean;
  coastTime: number | null; // s, burnout → apogee
  /** How much of a drag-free coast the rocket achieved: the actual coast height
   *  gain (apogee − burnout altitude) over the vacuum coast a body would gain from
   *  the burnout velocity (v²/2g). 1.0 = no drag; the shortfall is what drag cost.
   *  Pure kinematics on the flown numbers — null without a clean, physical coast. */
  coastEfficiency: number | null;
  /** Altitude drag cost over the coast (m): the vacuum coast height minus the
   *  actual gain. The companion to coastEfficiency; null when that is. */
  dragLossAltitude: number | null;
  drogueDescentRate: number | null;
  /**
   * The average descent rate from apogee to landing, set ONLY where no deployment change was
   * found in the record — so there is no main leg to measure and this is what the descent did
   * as a whole. It is a real measurement, but it is not a main descent rate, and the two must
   * never share a field: four recordings of one corpus flight cross-checked to a 121.6%
   * "disagreement" when three of them contributed a main leg (24.6–30.9 ft/s) and the fourth
   * contributed this (71.3 ft/s). They did not disagree; they measured different things.
   */
  wholeDescentRate: number | null; // m/s (positive = downward)
  mainDescentRate: number | null; // m/s
  descentTime: number | null; // s, apogee → landing
  flightTime: number | null; // s, liftoff → landing
  /**
   * Which recording the descent readings above came from. `'same-record'` is the ordinary
   * case — one flight, one record, everything read from it. `'second-copy'` means this file
   * held the same flight written twice, the copy that starts on the pad stops before the
   * rocket lands, and the descent was read from the other copy. The climb, the apogee and
   * every reading above them still come from the first copy. Null when no descent was read.
   */
  descentSource: 'same-record' | 'second-copy' | null;
  groundTemperature: number | null; // °C
  /** Battery voltage when the logger recorded it: the resting voltage at the start
   *  and the lowest it sagged to. A big drop hints at a weak pack — a common cause
   *  of a charge that didn't fire. Both null when no voltage was logged. */
  batteryStartV: number | null;
  batteryMinV: number | null;
  /** Roll about the long axis, when the logger recorded a roll-rate channel: the
   *  peak rate (deg/s) and the total number of revolutions the airframe turned
   *  through over the flight. Both null when no roll-rate channel is present. */
  peakRollRate: number | null;
  rollRevolutions: number | null;
  /** Angle off vertical at burnout (degrees), when the logger solved for attitude
   *  and a burnout was found — how vertical the powered flight was (a low number is
   *  a straight boost; a large one flags weathercocking). Read straight from the
   *  logger's own tilt channel at burnout, not derived. Null without both. */
  tiltAtBurnout: number | null;
  /** When the main deployed, in seconds AFTER LIFTOFF rather than from the file's own
   *  zero — so several recordings of one flight can be lined up against each other on a
   *  comparison, which is the whole point of having it as a metric rather than reading it
   *  off each flight's timeline separately. Null without both a liftoff and a detected
   *  main. There is deliberately no drogue equivalent: Debrief does not detect drogue
   *  deployment, it assumes the drogue leg starts at apogee (see BACKLOG), and a null
   *  column would read as "no drogue" rather than "not measured". */
  mainDeployTime: number | null;
  /** Apogee as the GPS receiver recorded it, where the file carries a GPS altitude —
   *  a second, independent altitude recording (a different sensor, indifferent to the
   *  weather and to the shock over a static port that ruins a barometer transonically).
   *  Stated beside Debrief's barometric read as a cross-check and never merged into it:
   *  agreement builds confidence, a gap is worth chasing. Metres AGL, baselined on the
   *  pad the same way. Null unless the recording had a fix and covered the descent —
   *  a record that stops at its own highest sample never saw an apogee. */
  gpsApogeeAltitude: number | null;
  /** Seconds from liftoff to the GPS recording's own peak. */
  gpsApogeeTime: number | null;
  /** 3D fixes the GPS recording contributed on the way up — how well it could resolve a
   *  peak at all. A 1 Hz receiver on a 20-second ascent has twenty. */
  gpsAscentFixes: number | null;
}

export interface FlightSeries {
  time: Float64Array; // s from first sample
  altitude: Float64Array; // m AGL (spike-cleaned — what the report shows)
  altitudeRaw: Float64Array; // m AGL before spike removal (keeps ejection spikes/noise)
  velocity: Float64Array; // m/s (best estimate, + = up)
  acceleration: Float64Array; // m/s² (+ = up) — the magnitude read (resultant on a multi-axis logger)
  /** The signed axial specific force (m/s², + = up), a single signed trace even on a
   *  multi-axis logger — negative while decelerating. The magnitude `acceleration`
   *  can be the always-positive resultant, so the readings that need a sign (drag off
   *  the coast, the deceleration peak) must use this, not `acceleration`. */
  axialAccel: Float64Array;
  velocitySource: 'device' | 'baro';
  accelerationSource: 'device' | 'baro';
  /** True when `acceleration` is the resultant magnitude √(Σ aₖ²) of a multi-axis
   *  logger's body axes rather than a single signed axial trace — so it reads ≥ 0
   *  (no negative deceleration dip) and matches the device's own "max acc". */
  accelerationResultant?: boolean;
  /** Where altitude came from. 'gps' is coarse: velocity off it is rough and
   *  acceleration (a second derivative) isn't meaningful, so it's omitted. */
  altitudeSource: 'baro' | 'gps';
  /** Ground speed of sound (m/s), from the pad temperature — for near-pad reads like
   *  rail exit. Mach uses the altitude-varying profile below. */
  speedOfSound: number;
  /** Speed of sound at each sample (m/s), falling with altitude on the standard-atmosphere
   *  lapse (capped at the tropopause) — the divisor behind the Mach channel, so Mach is
   *  read against the colder, slower air aloft rather than the ground value. */
  speedOfSoundProfile: Float64Array;
  /** Air density at each sample (kg/m³), from a ground-anchored standard
   *  atmosphere — the ρ behind the dynamic-pressure channel. */
  airDensity: Float64Array;
  /** True when this record's peak speed was withheld — **for any reason**, so this is the
   *  one thing a consumer should test.
   *
   *  It is deliberately not named for a cause. It used to be `velocityImplausible`, meaning
   *  only "physically impossible", and when a SECOND reason to withhold arrived — an ascent
   *  with a gap across it, `FlightMetrics.maxVelocityWithheld === 'gap'` — every consumer went
   *  on testing the first one. On the corpus's `fwgps__trf-f1machbuster-jan10` GPS log, whose
   *  4.90 s dropout swallows the whole powered ascent, the headline correctly withheld the peak
   *  while the Mach and dynamic-pressure curves derived from that same trace were still drawn
   *  and exported, topping out at 6,263 ft/s. Two names for one decision is what did that, so
   *  there is one name now and it says what it is for.
   *
   *  The velocity trace itself is still exposed, so a mis-scaled column can be seen and
   *  diagnosed; what is withheld is everything DERIVED from a peak the analysis would not
   *  stand behind. *Why* it was withheld belongs on `FlightMetrics.maxVelocityWithheld`. */
  velocityUnusable?: boolean;
}

/**
 * One flight inside a record that holds several — where it sits in the file, and how high it
 * went. A launch day's download is the case this exists for: the vendor apps show that list
 * at download time on the device and write one file per flight, so a flyer who exported the
 * whole session has, until now, been told to go back and split it by hand.
 *
 * Every apogee here is measured on the **file's own pad datum**, so the rows are comparable
 * with each other and with the reading on screen. A later flight has no quiet pad window of
 * its own — it starts in the trough after the one before — and measuring it against that
 * trough is what once read 10,723 ft off a Blue Raven the device itself put at 10,266.
 *
 * These are Debrief's own segmentation. Where a flyer overrules it, the crop they chose wins
 * and this list says which flight, if any, it corresponds to.
 */
export interface FlightSegment {
  /** 1-based, in file order — the number the flyer sees. */
  index: number;
  /** First sample of this flight, and one past its last, in the record's own indexing. */
  from: number;
  to: number;
  /** Seconds on the FILE's clock, not re-zeroed per flight. */
  startTime: number;
  endTime: number;
  /** m AGL on the file's pad datum. For the flight that was actually read this is the
   *  analysis's own apogee, so the row and the headline reading can never disagree. */
  apogeeM: number;
  /** True for the one this analysis is of. */
  read: boolean;
}

/** Which stretch of the record this analysis is of, and who chose it. Always present, so no
 *  surface has to guess whether it is looking at a whole file. */
export interface ReadExtent {
  /** First sample read, and one past the last, in the FILE's own indexing. */
  from: number;
  to: number;
  /** Seconds on the file's own clock. */
  startTime: number;
  endTime: number;
  /** The file's last sample, so a surface can say "24 s of a 108 s file" without the file. */
  fileEndTime: number;
  /** `file` — the whole record. `segmented` — Debrief cut it and read one flight.
   *  `chosen` — the flyer said which stretch is theirs, and that overrules the segmentation. */
  source: 'file' | 'segmented' | 'chosen';
}

/** Read only this stretch of the record. Sample indices into the file, `to` exclusive. */
export interface ReadWindow {
  from: number;
  to: number;
}

export interface AnalyzeOptions {
  /** Recursion guard for the multi-segment branch. Internal to the analyzer. */
  depth?: number;
  /** A ground reference to use INSTEAD of this record's own pad window, in the altitude
   *  channel's raw units — for a slice that has no pad of its own. Internal. */
  datum?: number;
  /** The pad PRESSURE, for a record with no altitude channel: altitude derived from pressure
   *  takes its reference from that, and a datum in metres cannot correct it. Internal. */
  padPressure?: number;
  /** Whether the FILE started on the pad. A crop out of the middle of a flight has no quiet
   *  window of its own, so the question has to be answered about the record it came from.
   *  Internal. */
  padLikely?: boolean;
  /** The flyer's own answer to "which stretch is my flight". Honoured over Debrief's
   *  segmentation, and measured against the FILE's pad rather than the crop's first samples —
   *  a crop starting 1.5 s after liftoff otherwise re-zeroes altitude to mid-air and reads
   *  43% low. */
  read?: ReadWindow;
}

export interface FlightAnalysis {
  series: FlightSeries;
  events: FlightEvent[];
  metrics: FlightMetrics;
  /** Plain-language notes about anything imperfect in the data or the reading. */
  warnings: string[];
  /** Present only when the record holds more than one flight: every flight in it, with the
   *  one that was read marked. Absent — not an empty array — for the ordinary single-flight
   *  file, so a surface can branch on presence. */
  segments?: FlightSegment[];
  /** Which stretch of the file this analysis is of. */
  extent: ReadExtent;
}
