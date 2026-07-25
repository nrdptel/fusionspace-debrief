import type { ColumnRole } from './columns';

/** The roles a column can be given, in groups the select renders as `optgroup`s. A flat
 *  list of twenty-odd entries is a scroll on a phone; grouped, "what did it measure" and
 *  "when did it fly" are two short lists. `Ignore` sits above both, ungrouped, because it
 *  is the answer for most columns in a wide log. */
export const ROLE_GROUPS: { label: string; options: { value: ColumnRole; label: string }[] }[] = [
  {
    label: 'What it measured',
    options: [
      { value: 'time', label: 'Time' },
      { value: 'altitude', label: 'Altitude' },
      { value: 'pressure', label: 'Pressure' },
      { value: 'velocity', label: 'Velocity' },
      { value: 'accelAxial', label: 'Acceleration (axial)' },
      { value: 'accelTotal', label: 'Acceleration (total)' },
      { value: 'rollRate', label: 'Roll rate' },
      { value: 'tilt', label: 'Tilt angle' },
      { value: 'temperature', label: 'Temperature' },
      { value: 'voltage', label: 'Voltage' },
      { value: 'latitude', label: 'GPS latitude' },
      { value: 'longitude', label: 'GPS longitude' },
    ],
  },
  {
    // A logger states the launch date in one of two shapes: a whole stamp in one cell, or
    // the calendar parts in columns of their own. Both are offered, because both are what
    // real files hold — and neither reaches the analysis; they name the flight's day.
    label: 'When it flew',
    options: [
      { value: 'date', label: 'Launch date' },
      { value: 'timeOfDay', label: 'Time of day (clock)' },
      { value: 'year', label: 'Year' },
      { value: 'month', label: 'Month' },
      { value: 'day', label: 'Day' },
      { value: 'hour', label: 'Hour' },
      { value: 'minute', label: 'Minute' },
      { value: 'second', label: 'Second' },
    ],
  },
];

export const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  ...ROLE_GROUPS.flatMap((g) => g.options),
];

const UNIT_OPTIONS: Partial<Record<ColumnRole, string[]>> = {
  time: ['s', 'ms', 'min'],
  altitude: ['ft', 'm'],
  pressure: ['Pa', 'hPa', 'kPa', 'psi', 'atm', 'inHg'],
  velocity: ['m/s', 'ft/s', 'mph', 'km/h'],
  accelAxial: ['g', 'mg', 'm/s²'],
  accelTotal: ['g', 'mg', 'm/s²'],
  rollRate: ['deg/s', 'rad/s', 'rev/s'],
  temperature: ['C', 'F', 'K'],
  voltage: ['V'],
};

export function unitOptionsFor(role: ColumnRole): string[] {
  return UNIT_OPTIONS[role] ?? [];
}
