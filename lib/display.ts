// Display formatting. The analysis works in SI; this turns those numbers into the
// units a rocketeer reads — feet or metres, with acceleration always in g — and
// into tidy strings for the cards and axes.

import { convert, G0 } from './units';

export type UnitSystem = 'imperial' | 'metric';

export const UNIT_LABEL: Record<UnitSystem, { length: string; speed: string; accel: string; temp: string }> = {
  imperial: { length: 'ft', speed: 'ft/s', accel: 'g', temp: '°F' },
  metric: { length: 'm', speed: 'm/s', accel: 'g', temp: '°C' },
};

function round(v: number, places: number): string {
  if (!Number.isFinite(v)) return '—';
  const f = Math.pow(10, places);
  return (Math.round(v * f) / f).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}

export function lengthIn(meters: number, sys: UnitSystem): number {
  return convert(meters, 'm', UNIT_LABEL[sys].length);
}
export function speedIn(ms: number, sys: UnitSystem): number {
  return convert(ms, 'm/s', UNIT_LABEL[sys].speed);
}
export function accelInG(ms2: number): number {
  return ms2 / G0;
}
export function tempIn(c: number, sys: UnitSystem): number {
  return sys === 'imperial' ? convert(c, 'C', 'F') : c;
}

export function fmtLength(meters: number, sys: UnitSystem): string {
  if (!Number.isFinite(meters)) return '—';
  return `${round(lengthIn(meters, sys), 0)} ${UNIT_LABEL[sys].length}`;
}
export function fmtSpeed(ms: number, sys: UnitSystem): string {
  if (!Number.isFinite(ms)) return '—';
  return `${round(speedIn(ms, sys), 0)} ${UNIT_LABEL[sys].speed}`;
}
export function fmtAccel(ms2: number): string {
  if (!Number.isFinite(ms2)) return '—';
  return `${round(accelInG(ms2), 1)} g`;
}
export function fmtTemp(c: number, sys: UnitSystem): string {
  if (!Number.isFinite(c)) return '—';
  return `${round(tempIn(c, sys), 0)} ${UNIT_LABEL[sys].temp}`;
}
export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  return `${round(seconds, 1)} s`;
}
export function fmtMach(m: number | null): string {
  return m && Number.isFinite(m) ? `Mach ${round(m, 2)}` : '—';
}

/** Dynamic pressure label/unit for a system — kPa (metric) or psi (imperial). */
export function pressureUnit(sys: UnitSystem): string {
  return sys === 'imperial' ? 'psi' : 'kPa';
}
export function pressureIn(pa: number, sys: UnitSystem): number {
  return convert(pa, 'Pa', pressureUnit(sys));
}
export function fmtPressure(pa: number | null, sys: UnitSystem): string {
  if (pa == null || !Number.isFinite(pa)) return '—';
  return `${round(pressureIn(pa, sys), 1)} ${pressureUnit(sys)}`;
}
