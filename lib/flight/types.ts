// The canonical flight model. Every parser, whatever the source format, produces
// one of these: a time base in seconds plus a set of named channels in SI units.
// The analysis pipeline only ever sees this shape, so adding a new logger never
// touches the analysis.

export type ChannelKind =
  | 'altitude' // height (canonical metres) — AGL once a baseline is set
  | 'pressure' // ambient pressure, Pa
  | 'temperature' // °C
  | 'accelAxial' // acceleration along the rocket's long axis, m/s²
  | 'accelTotal' // magnitude of total acceleration, m/s²
  | 'velocity' // velocity as reported by the device, m/s
  | 'voltage' // battery / pyro voltage, V
  | 'latitude' // GPS latitude, decimal degrees (+N)
  | 'longitude' // GPS longitude, decimal degrees (+E)
  | 'other';

export interface Channel {
  kind: ChannelKind;
  /** The column label as it appeared in the source, for transparency. */
  label: string;
  /** Canonical SI unit string for the stored values. */
  unit: string;
  /** Values aligned 1:1 with the flight's `time` array. NaN marks a gap. */
  values: Float64Array;
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
  /** Anything the parser wants the reader to know (carried-forward rows, etc). */
  notes: string[];
}

export function getChannel(flight: RawFlight, kind: ChannelKind): Channel | undefined {
  return flight.channels.find((c) => c.kind === kind);
}
