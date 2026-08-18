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
      // **Everything below was a legal `ColumnRole` and a legal `ChannelKind` and was missing
      // from this list**, so a flyer with their own GPS spreadsheet got a position and no way to
      // say how good it was — while the identical data through a named parser came back graded.
      // One file, two answers, decided by which route it came in on.
      { value: 'altitudeGps', label: 'GPS altitude' },
      // **The label carries the contract, because the wrong column here is a wrong number that
      // looks right.** This kind means satellites IN THE FIX: zero says the position beside it is
      // held over, and `buildFlight` blanks that row on the strength of it. Featherweight's file
      // carries a different quantity under a similar name — satellites the receiver can HEAR,
      // which reads 16, 18 or 19 on rows whose own FIX column says NO FIX — and mapping that here
      // would make a held-over position claim to be measured. `COMPETITION.md` row 47 records the
      // measurement; this parenthesis is what stops a flyer walking into it.
      { value: 'satellites', label: 'GPS satellites (in the fix)' },
      // Dilution of precision: unitless, and deliberately never converted to metres anywhere —
      // that needs the receiver's own ranging error, which no file carries and no vendor
      // publishes. Offered as three because a file that states all three lets Debrief check them
      // against each other (`PDOP² = HDOP² + VDOP²`), which is the cheapest guard there is against
      // a column picked one place out of line.
      { value: 'dopHorizontal', label: 'GPS dilution — horizontal (HDOP)' },
      { value: 'dopVertical', label: 'GPS dilution — vertical (VDOP)' },
      { value: 'dopPosition', label: 'GPS dilution — position (PDOP)' },
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
  // The receiver's own height, so it takes the same lengths the barometric one does.
  altitudeGps: ['ft', 'm'],
  // `satellites` and the three dilution roles deliberately have NO entry, for the reason
  // `rollAngle` and `tilt` do not: they are counts and ratios, there is no quantity to convert
  // between, and offering a unit menu on a unitless column invites a choice that can only be
  // wrong. A dilution of 1.6 is 1.6 whatever the rest of the file is written in.
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
