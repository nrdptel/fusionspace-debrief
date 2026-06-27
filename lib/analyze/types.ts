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
}

export interface FlightMetrics {
  apogeeAltitude: number; // m AGL
  timeToApogee: number; // s from liftoff
  maxVelocity: number; // m/s
  maxVelocitySource: 'device' | 'baro';
  mach: number | null;
  maxDynamicPressure: number | null; // Pa (max-Q) — peak ½ρv² over the flight
  maxAcceleration: number; // m/s²
  maxDeceleration: number; // m/s² (most negative)
  accelerationSource: 'device' | 'baro';
  burnTime: number | null; // s
  burnoutAltitude: number | null; // m AGL
  burnoutVelocity: number | null; // m/s
  coastTime: number | null; // s, burnout → apogee
  drogueDescentRate: number | null; // m/s (positive = downward)
  mainDescentRate: number | null; // m/s
  descentTime: number | null; // s, apogee → landing
  flightTime: number | null; // s, liftoff → landing
  groundTemperature: number | null; // °C
}

export interface FlightSeries {
  time: Float64Array; // s from first sample
  altitude: Float64Array; // m AGL (spike-cleaned — what the report shows)
  altitudeRaw: Float64Array; // m AGL before spike removal (keeps ejection spikes/noise)
  velocity: Float64Array; // m/s (best estimate, + = up)
  acceleration: Float64Array; // m/s² (+ = up)
  velocitySource: 'device' | 'baro';
  accelerationSource: 'device' | 'baro';
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
