// Display formatting. The analysis works in SI; this turns those numbers into the
// units a rocketeer reads and into tidy strings for the cards and axes.
//
// A flight is read in whatever units the flyer thinks in, and that isn't one system:
// a US club quotes altitude in feet and speed in mph, a cert document may want metres
// and m/s, a school project °C. So the unit is chosen per quantity. `imperial` and
// `metric` name the two familiar sets — they stay the one-click default, and every
// call site that only cares about the system keeps passing them — while a `Units`
// object overrides any single quantity.

import { convert, G0 } from './units';

export type UnitSystem = 'imperial' | 'metric';

export type LengthUnit = 'ft' | 'm';
export type SpeedUnit = 'ft/s' | 'mph' | 'm/s' | 'km/h' | 'kt';
export type AccelUnit = 'g' | 'm/s²' | 'ft/s²';
export type TempUnit = '°F' | '°C';
export type PressureUnit = 'psi' | 'kPa';

/** The unit for each quantity Debrief displays. Every value is a label `convert()`
 *  understands, so the unit and the string shown to the flyer are the same thing. */
export interface Units {
  length: LengthUnit;
  speed: SpeedUnit;
  accel: AccelUnit;
  temp: TempUnit;
  pressure: PressureUnit;
}

/** Either of the two named systems, or a per-quantity set. */
export type UnitChoice = UnitSystem | Units;

export const SYSTEM_UNITS: Record<UnitSystem, Units> = {
  imperial: { length: 'ft', speed: 'ft/s', accel: 'g', temp: '°F', pressure: 'psi' },
  metric: { length: 'm', speed: 'm/s', accel: 'g', temp: '°C', pressure: 'kPa' },
};

/** The per-quantity units a choice resolves to. */
export function unitsOf(choice: UnitChoice): Units {
  return typeof choice === 'string' ? SYSTEM_UNITS[choice] : choice;
}

/** Which system a choice sits closest to — for the few inputs still keyed to one
 *  (the mass a flyer types for landing energy, in ounces or grams). Length decides
 *  it, since that's the unit a flyer picks first and thinks in. */
export function systemOf(choice: UnitChoice): UnitSystem {
  return unitsOf(choice).length === 'ft' ? 'imperial' : 'metric';
}

/** True when the choice is exactly one of the named systems — so the UI can show
 *  "feet" or "metres" rather than spelling out five units. */
export function isSystem(choice: UnitChoice, sys: UnitSystem): boolean {
  const u = unitsOf(choice);
  const s = SYSTEM_UNITS[sys];
  return u.length === s.length && u.speed === s.speed && u.accel === s.accel && u.temp === s.temp && u.pressure === s.pressure;
}

/** Decimal places to show for a unit — a value in g wants a decimal, the same
 *  acceleration in m/s² is hundreds and wants none. */
const PLACES: Record<string, number> = { g: 1, 'm/s²': 0, 'ft/s²': 0, psi: 1, kPa: 1 };

function round(v: number, places: number): string {
  if (!Number.isFinite(v)) return '—';
  const f = Math.pow(10, places);
  return (Math.round(v * f) / f).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}

export function lengthIn(meters: number, choice: UnitChoice): number {
  return convert(meters, 'm', unitsOf(choice).length);
}
export function speedIn(ms: number, choice: UnitChoice): number {
  return convert(ms, 'm/s', unitsOf(choice).speed);
}
/** Acceleration in g — the figure that is a ratio rather than a unit choice
 *  (thrust-to-weight, a saturation check), so it ignores the chosen unit. */
export function accelInG(ms2: number): number {
  return ms2 / G0;
}
export function accelIn(ms2: number, choice: UnitChoice): number {
  return convert(ms2, 'm/s²', unitsOf(choice).accel);
}
export function tempIn(c: number, choice: UnitChoice): number {
  return convert(c, '°C', unitsOf(choice).temp);
}
export function pressureIn(pa: number, choice: UnitChoice): number {
  return convert(pa, 'Pa', unitsOf(choice).pressure);
}

export function fmtLength(meters: number, choice: UnitChoice): string {
  if (!Number.isFinite(meters)) return '—';
  const u = unitsOf(choice).length;
  return `${round(lengthIn(meters, choice), PLACES[u] ?? 0)} ${u}`;
}
export function fmtSpeed(ms: number, choice: UnitChoice): string {
  if (!Number.isFinite(ms)) return '—';
  const u = unitsOf(choice).speed;
  return `${round(speedIn(ms, choice), PLACES[u] ?? 0)} ${u}`;
}
export function fmtAccel(ms2: number, choice: UnitChoice = 'imperial'): string {
  if (!Number.isFinite(ms2)) return '—';
  const u = unitsOf(choice).accel;
  return `${round(accelIn(ms2, choice), PLACES[u] ?? 0)} ${u}`;
}
export function fmtTemp(c: number, choice: UnitChoice): string {
  if (!Number.isFinite(c)) return '—';
  const u = unitsOf(choice).temp;
  return `${round(tempIn(c, choice), PLACES[u] ?? 0)} ${u}`;
}
export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  return `${round(seconds, 1)} s`;
}
export function fmtVoltage(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${round(v, 1)} V`;
}
export function fmtMach(m: number | null): string {
  return m && Number.isFinite(m) ? `Mach ${round(m, 2)}` : '—';
}

/** The dynamic-pressure unit in force. */
export function pressureUnit(choice: UnitChoice): string {
  return unitsOf(choice).pressure;
}
export function fmtPressure(pa: number | null, choice: UnitChoice): string {
  if (pa == null || !Number.isFinite(pa)) return '—';
  const u = unitsOf(choice).pressure;
  return `${round(pressureIn(pa, choice), PLACES[u] ?? 1)} ${u}`;
}

/** Encode a unit choice for the URL and for local storage: the plain system name when
 *  it is one, otherwise the five units in a fixed order. Readable in a shared link
 *  ("?u=ft" or "?u=ft.mph.g.°F.psi") and stable, so an old link keeps working. */
export function encodeUnits(choice: UnitChoice): string {
  if (isSystem(choice, 'imperial')) return 'ft';
  if (isSystem(choice, 'metric')) return 'm';
  const u = unitsOf(choice);
  return [u.length, u.speed, u.accel, u.temp, u.pressure].join('.');
}

/** Read back what `encodeUnits` wrote, tolerating the older `metric`/`imperial`
 *  spellings. Null when the string isn't a unit choice at all, so the caller can fall
 *  back to its own default rather than to a half-parsed set. */
export function decodeUnits(s: string | null | undefined): UnitChoice | null {
  if (!s) return null;
  if (s === 'm' || s === 'metric') return 'metric';
  if (s === 'ft' || s === 'imperial') return 'imperial';
  const parts = s.split('.');
  if (parts.length !== 5) return null;
  const [length, speed, accel, temp, pressure] = parts;
  const ok =
    (['ft', 'm'] as string[]).includes(length) &&
    (['ft/s', 'mph', 'm/s', 'km/h', 'kt'] as string[]).includes(speed) &&
    (['g', 'm/s²', 'ft/s²'] as string[]).includes(accel) &&
    (['°F', '°C'] as string[]).includes(temp) &&
    (['psi', 'kPa'] as string[]).includes(pressure);
  if (!ok) return null;
  return { length, speed, accel, temp, pressure } as Units;
}
