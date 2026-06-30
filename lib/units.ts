// Unit handling. Everything inside Debrief is stored in SI canonical units
// (metres, m/s, m/s², pascals, °C, seconds); we convert at the edges — once on
// the way in from a logger, and again for display. Keeping one internal system
// means the analysis math never has to care what the file used.

export type Quantity = 'length' | 'speed' | 'accel' | 'pressure' | 'temperature' | 'time' | 'rotation';

export const CANONICAL: Record<Quantity, string> = {
  length: 'm',
  speed: 'm/s',
  accel: 'm/s²',
  pressure: 'Pa',
  temperature: '°C',
  time: 's',
  rotation: 'deg/s',
};

export const G0 = 9.80665; // standard gravity, m/s²

interface UnitDef {
  quantity: Quantity;
  // canonical = value * scale + offset
  scale: number;
  offset?: number;
  aliases: string[];
}

// The aliases are matched case-insensitively after stripping spaces and a few
// punctuation variants, so "ft/s", "fps", "feet per second" all resolve.
const UNITS: UnitDef[] = [
  // length
  { quantity: 'length', scale: 1, aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
  { quantity: 'length', scale: 0.3048, aliases: ['ft', 'feet', 'foot'] },
  { quantity: 'length', scale: 1000, aliases: ['km', 'kilometer', 'kilometers'] },
  { quantity: 'length', scale: 0.01, aliases: ['cm'] },
  { quantity: 'length', scale: 1609.344, aliases: ['mi', 'mile', 'miles'] },
  // speed
  { quantity: 'speed', scale: 1, aliases: ['m/s', 'mps', 'meterspersecond', 'metrespersecond'] },
  { quantity: 'speed', scale: 0.3048, aliases: ['ft/s', 'fps', 'feetpersecond'] },
  { quantity: 'speed', scale: 0.44704, aliases: ['mph'] },
  { quantity: 'speed', scale: 0.277778, aliases: ['km/h', 'kph', 'kmh'] },
  // acceleration
  { quantity: 'accel', scale: 1, aliases: ['m/s²', 'm/s2', 'm/s^2', 'mps2'] },
  { quantity: 'accel', scale: G0, aliases: ['g', 'gs', "g's", 'gee', 'grav'] },
  { quantity: 'accel', scale: 0.3048, aliases: ['ft/s²', 'ft/s2', 'ft/s^2', 'fps2'] },
  // pressure
  { quantity: 'pressure', scale: 1, aliases: ['pa', 'pascal', 'pascals'] },
  { quantity: 'pressure', scale: 100, aliases: ['hpa', 'mbar', 'millibar', 'mb'] },
  { quantity: 'pressure', scale: 1000, aliases: ['kpa'] },
  { quantity: 'pressure', scale: 6894.757, aliases: ['psi'] },
  { quantity: 'pressure', scale: 101325, aliases: ['atm'] },
  { quantity: 'pressure', scale: 3386.389, aliases: ['inhg', 'inchesofmercury'] },
  // temperature
  { quantity: 'temperature', scale: 1, offset: 0, aliases: ['c', '°c', 'celsius', 'degc', 'centigrade'] },
  { quantity: 'temperature', scale: 5 / 9, offset: -32 * (5 / 9), aliases: ['f', '°f', 'fahrenheit', 'degf'] },
  { quantity: 'temperature', scale: 1, offset: -273.15, aliases: ['k', 'kelvin'] },
  // time
  { quantity: 'time', scale: 1, aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  { quantity: 'time', scale: 0.001, aliases: ['ms', 'millisecond', 'milliseconds', 'msec'] },
  { quantity: 'time', scale: 60, aliases: ['min', 'minute', 'minutes'] },
  // rotation rate (canonical degrees/second) — for a roll/spin-rate channel
  { quantity: 'rotation', scale: 1, aliases: ['deg/s', 'dps', 'degs', 'degreespersecond', '°/s'] },
  { quantity: 'rotation', scale: 180 / Math.PI, aliases: ['rad/s', 'radianspersecond'] },
  { quantity: 'rotation', scale: 360, aliases: ['rev/s', 'rps', 'revs', 'revolutionspersecond'] },
  { quantity: 'rotation', scale: 6, aliases: ['rpm', 'rev/min', 'revolutionsperminute'] },
];

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
}

const ALIAS_INDEX = new Map<string, UnitDef>();
for (const def of UNITS) {
  for (const a of def.aliases) ALIAS_INDEX.set(normalizeToken(a), def);
}

export interface ResolvedUnit {
  unit: string; // the canonical display string for this unit, e.g. 'ft'
  quantity: Quantity;
  toCanonical(value: number): number;
  fromCanonical(value: number): number;
}

/** Resolve a free-text unit label (often pulled from a CSV header) to a converter. */
export function resolveUnit(label: string | undefined | null): ResolvedUnit | null {
  if (!label) return null;
  const def = ALIAS_INDEX.get(normalizeToken(label));
  if (!def) return null;
  const offset = def.offset ?? 0;
  return {
    unit: def.aliases[0],
    quantity: def.quantity,
    toCanonical: (v) => v * def.scale + offset,
    fromCanonical: (v) => (v - offset) / def.scale,
  };
}

/** Convert a value from one named unit to another of the same quantity. */
export function convert(value: number, from: string, to: string): number {
  const f = resolveUnit(from);
  const t = resolveUnit(to);
  if (!f || !t || f.quantity !== t.quantity) return value;
  return t.fromCanonical(f.toCanonical(value));
}
