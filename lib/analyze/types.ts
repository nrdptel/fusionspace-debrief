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
  timeToApogee: number; // s from liftoff
  maxVelocity: number; // m/s
  maxVelocitySource: 'device' | 'baro';
  maxVelocityAltitude: number; // m AGL where max velocity occurred
  mach: number | null;
  maxDynamicPressure: number | null; // Pa (max-Q) — peak ½ρv² over the flight
  maxDynamicPressureAltitude: number | null; // m AGL where max-Q occurred (the load case)
  /** When the rocket first crossed Mach 1 (s from liftoff) and the altitude there,
   *  or null for a subsonic flight. */
  transonicTime: number | null;
  transonicAltitude: number | null;
  /** True when that Mach-1 crossing was read from a barometric speed in the transonic
   *  band, where the shock over the pressure port inflates the reading — so it can't be
   *  taken as confirmation the rocket actually went supersonic. The UI and exports soften
   *  the claim accordingly rather than dropping it. */
  transonicUnconfirmed: boolean;
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
  coastTime: number | null; // s, burnout → apogee
  /** How much of a drag-free coast the rocket achieved: the actual coast height
   *  gain (apogee − burnout altitude) over the vacuum coast a body would gain from
   *  the burnout velocity (v²/2g). 1.0 = no drag; the shortfall is what drag cost.
   *  Pure kinematics on the flown numbers — null without a clean, physical coast. */
  coastEfficiency: number | null;
  /** Altitude drag cost over the coast (m): the vacuum coast height minus the
   *  actual gain. The companion to coastEfficiency; null when that is. */
  dragLossAltitude: number | null;
  drogueDescentRate: number | null; // m/s (positive = downward)
  mainDescentRate: number | null; // m/s
  descentTime: number | null; // s, apogee → landing
  flightTime: number | null; // s, liftoff → landing
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
  /** True when the velocity peak was physically impossible (a mis-scaled or
   *  misidentified column, or corrupt data), so the headline max velocity, Mach and
   *  max-Q were withheld. The velocity trace is still exposed for diagnosis, but the
   *  Mach and dynamic-pressure DERIVED from it are not — plotting them would present a
   *  curve the analysis has already judged impossible. */
  velocityImplausible?: boolean;
}

export interface FlightAnalysis {
  series: FlightSeries;
  events: FlightEvent[];
  metrics: FlightMetrics;
  /** Plain-language notes about anything imperfect in the data or the reading. */
  warnings: string[];
}
