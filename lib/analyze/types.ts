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
  maxAcceleration: number; // m/s²
  maxDeceleration: number; // m/s² (most negative)
  accelerationSource: 'device' | 'baro';
  /** True when a device accelerometer flat-tops at its peak — the signature of a
   *  sensor that hit its full-scale limit (saturated). The reported max is then a
   *  floor, not the truth. Always false for a derived (baro) acceleration. */
  accelClipped: boolean;
  burnTime: number | null; // s
  burnoutAltitude: number | null; // m AGL
  burnoutVelocity: number | null; // m/s
  coastTime: number | null; // s, burnout → apogee
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
}

export interface FlightSeries {
  time: Float64Array; // s from first sample
  altitude: Float64Array; // m AGL (spike-cleaned — what the report shows)
  altitudeRaw: Float64Array; // m AGL before spike removal (keeps ejection spikes/noise)
  velocity: Float64Array; // m/s (best estimate, + = up)
  acceleration: Float64Array; // m/s² (+ = up)
  velocitySource: 'device' | 'baro';
  accelerationSource: 'device' | 'baro';
  /** Where altitude came from. 'gps' is coarse: velocity off it is rough and
   *  acceleration (a second derivative) isn't meaningful, so it's omitted. */
  altitudeSource: 'baro' | 'gps';
  /** Speed of sound for this flight (m/s), from the ground temperature — the
   *  divisor behind the Mach channel. */
  speedOfSound: number;
  /** Air density at each sample (kg/m³), from a ground-anchored standard
   *  atmosphere — the ρ behind the dynamic-pressure channel. */
  airDensity: Float64Array;
}

export interface FlightAnalysis {
  series: FlightSeries;
  events: FlightEvent[];
  metrics: FlightMetrics;
  /** Plain-language notes about anything imperfect in the data or the reading. */
  warnings: string[];
}
