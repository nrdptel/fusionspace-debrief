import type { ColumnRole } from './columns';

export const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'time', label: 'Time' },
  { value: 'altitude', label: 'Altitude' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'accelAxial', label: 'Acceleration (axial)' },
  { value: 'accelTotal', label: 'Acceleration (total)' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'voltage', label: 'Voltage' },
  { value: 'latitude', label: 'GPS latitude' },
  { value: 'longitude', label: 'GPS longitude' },
];

const UNIT_OPTIONS: Partial<Record<ColumnRole, string[]>> = {
  time: ['s', 'ms', 'min'],
  altitude: ['ft', 'm'],
  pressure: ['Pa', 'hPa', 'kPa', 'psi', 'atm', 'inHg'],
  velocity: ['m/s', 'ft/s', 'mph', 'km/h'],
  accelAxial: ['g', 'm/s²'],
  accelTotal: ['g', 'm/s²'],
  temperature: ['C', 'F', 'K'],
  voltage: ['V'],
};

export function unitOptionsFor(role: ColumnRole): string[] {
  return UNIT_OPTIONS[role] ?? [];
}
