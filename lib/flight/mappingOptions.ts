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
      // Beside the rate, and named so the two cannot be picked by accident: a column of
      // degrees chosen as a rate is a wrong number that looks right.
      { value: 'rollAngle', label: 'Roll angle' },
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
  // `rollAngle` deliberately has NO entry, exactly like `tilt`, and the reason is a wrong
  // number this nearly shipped. There is no `angle` quantity in `lib/units.ts` — only
  // `rotation`, which is a RATE — so an angle kind has no `KIND_QUANTITY`, which means
  // `build.ts` resolves no converter and passes the column through untouched. Offering
  // `['deg', 'rad']` here would therefore have let a flyer pick radians and had Debrief
  // store radians while labelling them `°`. Degrees are assumed and stated in the model;
  // supporting radians means adding an `angle` quantity to the converter first.
  temperature: ['C', 'F', 'K'],
  voltage: ['V'],
};

export function unitOptionsFor(role: ColumnRole): string[] {
  return UNIT_OPTIONS[role] ?? [];
}

/**
 * The unit to PRESELECT for a column, given whatever was read off the file.
 *
 * A wrong number reached the flyer through this, and it was a case mismatch. `resolveUnit`
 * returns the CANONICAL unit, which is lower-case (`'f'`), while the options offered here are
 * spelled the way a flyer reads them (`'F'`). A membership test on the raw strings therefore
 * missed, and the caller fell through to `options[0]` — so a PerfectFlite StratoLogger whose
 * every temperature cell reads `58.7F`, correctly resolved to Fahrenheit by `unitFromCells`,
 * arrived in the mapper preselected as **Celsius**, and 58.7 °C is **138 °F** on the report.
 *
 * Temperature is the only role it could bite, because it is the only one whose options are not
 * already in canonical spelling — but the fix belongs here rather than in a re-spelling of that
 * one list, since the next role added with a capital in it would do the same thing silently.
 *
 * Returns the option's OWN spelling, never the caller's, so what is stored is always one of the
 * strings this module offers.
 */
export function prefillUnit(role: ColumnRole, wantUnit: string | null | undefined): string {
  const options = unitOptionsFor(role);
  const want = wantUnit?.trim().toLowerCase();
  if (want) {
    const match = options.find((o) => o.toLowerCase() === want);
    if (match) return match;
  }
  return options[0] ?? '';
}
