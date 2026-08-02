import { describe, it, expect } from 'vitest';
import { analyzeTable } from './columns';

/** A headerless table: time, an altitude arc (rise then fall), and a flat voltage. */
function headerlessRows(): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i * 0.1).toFixed(2);
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25); // single interior peak at i=30
    const volt = (9.1 - i * 0.001).toFixed(2);
    rows.push([t, String(alt), volt]);
  }
  return rows;
}

describe('analyzeTable — headerless role inference from data shape', () => {
  it('guesses time and altitude from the data when there are no headers', () => {
    const t = analyzeTable(headerlessRows());
    expect(t.headerRow).toBe(-1); // detected as headerless
    expect(t.columns[0].role).toBe('time'); // monotonic from ~0
    expect(t.columns[1].role).toBe('altitude'); // widest range with an interior peak
    expect(t.columns[2].role).toBe('ignore'); // flat voltage — never mistaken for altitude
  });

  it('reads an in-cell °F temperature in a headerless file and infers feet for the altitude', () => {
    // A headerless StratoLogger-style TSV: time, altitude in feet, a Fahrenheit
    // temperature carried in-cell, a flat voltage. The °F is the only unit signal, and
    // it must pin the whole file imperial — otherwise the feet altitude falls to the
    // metres default and the apogee reads ~3.3x high.
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) {
      const t = (i * 0.1).toFixed(2);
      const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25);
      rows.push([t, String(alt), `${(100.5 - i * 0.01).toFixed(1)}F`, (9.1).toFixed(1)]);
    }
    const parsed = analyzeTable(rows);
    expect(parsed.columns[0].role).toBe('time');
    expect(parsed.columns[1].role).toBe('altitude');
    expect(parsed.columns[1].unit).toBe('ft'); // inferred imperial from the °F column
    expect(parsed.columns[2].role).toBe('temperature'); // a whole column of °F cells
    expect(parsed.columns[2].unit).toBe('f');
  });

  it('leaves a headerless altitude unit-less when the file carries no unit signal at all', () => {
    // No in-cell unit anywhere → nothing to infer from, so altitude stays unlabelled
    // (the neutral default) rather than a guessed foot/metre.
    const parsed = analyzeTable(headerlessRows());
    expect(parsed.columns[1].role).toBe('altitude');
    expect(parsed.columns[1].unit).toBeNull();
  });

  it('infers time but not altitude when nothing has an apogee shape', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) rows.push([(i * 0.1).toFixed(2), '9.1', '25.0']); // clock + two flats
    const t = analyzeTable(rows);
    expect(t.columns[0].role).toBe('time');
    expect(t.columns[1].role).toBe('ignore');
    expect(t.columns[2].role).toBe('ignore');
  });

  it('does not let a small-range column (lat/lon, temp) win altitude', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) {
      const t = (i * 0.1).toFixed(2);
      const lat = (34.5 + Math.sin(i / 10) * 0.001).toFixed(6); // tiny wander, no big peak
      rows.push([t, lat]);
    }
    const parsed = analyzeTable(rows);
    expect(parsed.columns[0].role).toBe('time');
    expect(parsed.columns[1].role).toBe('ignore');
  });

  it('leaves a headered table to name-based inference (no shape override)', () => {
    const rows = [
      ['Time (s)', 'Height', 'Battery'],
      ['0.0', '0', '9.1'],
      ['0.1', '15', '9.1'],
      ['0.2', '40', '9.0'],
      ['0.3', '20', '9.0'],
    ];
    const t = analyzeTable(rows);
    expect(t.headerRow).toBe(0);
    expect(t.columns[0].role).toBe('time');
    expect(t.columns[1].role).toBe('altitude');
    expect(t.columns[2].role).toBe('voltage');
  });

  it('tells a tilt angle from a roll angle, and both from a rate', () => {
    // **This test used to assert the defect.** It read `expect(by('Roll_Angle_(deg)').role)
    // .toBe('rollRate')`, with a comment explaining that "Roll_Angle" correctly "keys off
    // 'roll' as a rate channel" — so a column of DEGREES was pinned as a channel of
    // degrees-per-second, and the assert made it permanent.
    //
    // It is the same defect the AltimeterCloud block at the bottom of this file exists to
    // stop, in the one shape that block cannot see: `releaseAttitudeRoll` fires only when
    // `pitch` AND `yaw` siblings prove the file solves an attitude, and a logger writing
    // `Tilt_Angle` / `Future_Angle` / `Roll_Angle` has neither. A ±180° column read as a rate
    // peaks at a perfectly plausible 179.99 deg/s; the Blue Raven's own roll angle is
    // cumulative and reaches 26,099° in the corpus, which as a rate is nonsense a flyer would
    // still have had no way to spot on the chart.
    const rows = [
      ['Flight_Time_(s)', 'Baro_Altitude_AGL_(feet)', 'Tilt_Angle_(deg)', 'Roll_Angle_(deg)', 'Roll Rate (deg/s)'],
      ['0.0', '0', '0', '0', '4'],
      ['0.1', '15', '2', '30', '11'],
      ['0.2', '40', '5', '65', '9'],
      ['0.3', '20', '8', '90', '2'],
    ];
    const t = analyzeTable(rows);
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    expect(by('Tilt_Angle_(deg)').role).toBe('tilt');
    expect(by('Roll_Angle_(deg)').role).toBe('rollAngle');
    // The rate is still a rate — the angle test must not swallow the column it sits beside.
    expect(by('Roll Rate (deg/s)').role).toBe('rollRate');
    expect(by('Baro_Altitude_AGL_(feet)').role).toBe('altitude');
  });

  it('does not read a board’s FUTURE angle as anything', () => {
    // Every Blue Raven low-rate file carries `Future_Angle_(deg)` between its tilt and its
    // roll. It is the board's PROJECTION of where its tilt is heading — what it uses for its
    // own tilt lockout — not a recording of anything that happened. Debrief reports what was
    // flown, so this column stays ignored, and that is pinned rather than left to the fact
    // that no keyword happens to match it today.
    const rows = [
      ['Flight_Time_(s)', 'Baro_Altitude_AGL_(feet)', 'Tilt_Angle_(deg)', 'Future_Angle_(deg)'],
      ['0.0', '0', '0', '1'],
      ['0.1', '15', '2', '3'],
      ['0.2', '40', '5', '6'],
      ['0.3', '20', '8', '9'],
    ];
    const t = analyzeTable(rows);
    expect(t.columns.find((c) => c.header === 'Future_Angle_(deg)')!.role).toBe('ignore');
  });
});

describe('analyzeTable — a multi-axis logger (per-axis accel + a total)', () => {
  // Headers in the style of AltimeterCloud/Mercury: three body axes in milli-g
  // plus a total-magnitude channel, also in milli-g.
  const rows = [
    ['Time(ms)', 'Altitude(m)', 'Velocity(m/s)', 'acceleration_x(mG)', 'acceleration_y(mG)', 'acceleration_z(mG)', 'acceleration_total(mG)'],
    ['0', '0', '0', '0', '0', '-1000', '-1000'],
    ['20', '5', '30', '1400', '400', '-360', '509'],
    ['40', '20', '42', '1200', '450', '-360', '354'],
    ['60', '48', '52', '1080', '360', '-400', '215'],
  ];
  const t = analyzeTable(rows);
  const by = (h: string) => t.columns.find((c) => c.header === h)!;

  it('reads acceleration_total as the total channel, not a bare axial one', () => {
    expect(by('acceleration_total(mG)').role).toBe('accelTotal');
  });

  it('leaves the per-axis channels as axial acceleration', () => {
    expect(by('acceleration_x(mG)').role).toBe('accelAxial');
    expect(by('acceleration_z(mG)').role).toBe('accelAxial');
  });

  it('reads the milli-g unit off the header for every accel column', () => {
    expect(by('acceleration_x(mG)').unit).toBe('mg');
    expect(by('acceleration_total(mG)').unit).toBe('mg');
  });
});

describe('analyzeTable — compact "AltiM"/"AltiF" altitude headers', () => {
  // Several SRAD/Arduino flight computers write altitude with the unit fused onto the
  // name — "AltiM" (metres), "AltiF" (feet) — with no bracket or separator. "altif"
  // has no word boundary after "alt", so the plain \balt\b test misses it entirely and
  // the column reads as nothing, dropping the flyer onto a pressure-derived altitude.
  const rows = [
    ['Time', 'Baro', 'AltiM', 'AltiF', 'AccelX'],
    ['0', '900', '100', '328', '0'],
    ['1', '880', '160', '525', '2'],
    ['2', '870', '190', '623', '1'],
  ];
  const t = analyzeTable(rows);
  const by = (h: string) => t.columns.find((c) => c.header === h)!;

  it('recognizes AltiM as an altitude column and reads its fused "M" as metres', () => {
    expect(by('AltiM').role).toBe('altitude');
    // Without this the metres column would fall to the mapper's feet default and read ~3.3× off.
    expect(by('AltiM').unit).toBe('m');
  });

  it('leaves the second altitude column (AltiF) for the flyer, one altitude role auto-assigned', () => {
    expect(by('AltiF').role).toBe('ignore');
  });

  it('reads AltiF as feet when it is the only altitude column', () => {
    const b = analyzeTable([
      ['Time', 'Baro', 'AltiF', 'AccelX'],
      ['0', '900', '328', '0'],
      ['1', '880', '525', '2'],
      ['2', '870', '623', '1'],
    ]);
    expect(b.columns[2].role).toBe('altitude');
    expect(b.columns[2].unit).toBe('ft');
  });

  it('still reads a plain "Altitude (ft)" the bracketed way, and leaves "altitude" unit-less', () => {
    const b = analyzeTable([
      ['t', 'Altitude (ft)', 'Altitude'],
      ['0', '10', '3'],
      ['1', '20', '6'],
    ]);
    expect(b.columns[1].role).toBe('altitude');
    expect(b.columns[1].unit).toBe('ft'); // from the bracket, not the suffix reader
    // A bare "Altitude" carries no fused unit, so none is invented (defaults live in the mapper).
    expect(b.columns[2].unit).toBeNull();
  });
});

describe('analyzeTable — the bare "Acc" acceleration abbreviation', () => {
  // A very common single-accel-column layout ("Time (s), Acc (g), Alt AGL (ft), …").
  // The plain \baccel\b test misses "Acc", so the real logged acceleration was ignored
  // and a noisy pressure-derived one used in its place.
  const t = analyzeTable([
    ['Time (s)', 'Acc (g)', 'Alt AGL (ft)', 'Temp (F)'],
    ['0', '-25.8', '43', '79'],
    ['1', '-12.0', '400', '79'],
    ['2', '2.0', '900', '78'],
  ]);
  const by = (h: string) => t.columns.find((c) => c.header === h)!;

  it('recognizes "Acc" as an acceleration column, with its g unit', () => {
    expect(by('Acc (g)').role).toBe('accelAxial');
    expect(by('Acc (g)').unit).toBe('g');
  });

  it('does not steal a GPS accuracy column ("hAcc"/"vAcc")', () => {
    const g = analyzeTable([
      ['Time', 'hAcc', 'vAcc', 'Alt'],
      ['0', '2.5', '3.1', '10'],
      ['1', '2.4', '3.0', '20'],
    ]);
    expect(g.columns[1].role).not.toBe('accelAxial');
    expect(g.columns[2].role).not.toBe('accelAxial');
  });
});

describe('analyzeTable — a unit the values carry in-cell', () => {
  // Some loggers append the unit to the value rather than the header ("58.7F"), e.g. a
  // PerfectFlite StratoLogger export. The value was already read; now the unit is too.
  const t = analyzeTable([
    ['Time', 'Temp.', 'Press', 'Alt'],
    ['0', '58.7F', '1013hPa', '10'],
    ['1', '58.8F', '1000hPa', '20'],
    ['2', '59.0F', '990hPa', '35'],
  ]);
  const by = (h: string) => t.columns.find((c) => c.header === h)!;

  it('reads a trailing unit from the data when the header gives none', () => {
    expect(by('Temp.').unit).toBe('f'); // Fahrenheit, so ground temp → speed of sound is right
    expect(by('Press').unit).toBe('hpa'); // pressure unit, so a derived altitude is right
  });

  it('invents no unit for plain numbers when the file gives no unit at all', () => {
    // No foot/metre/°F/°C signal anywhere, so nothing is inferred either.
    const p = analyzeTable([
      ['Time', 'Speed', 'Alt'],
      ['0', '5', '10'],
      ['1', '30', '20'],
      ['2', '42', '35'],
    ]);
    expect(p.columns[0].unit).toBeNull();
    expect(p.columns[1].unit).toBeNull();
    expect(p.columns[2].unit).toBeNull();
  });

  it('does not mistake a date/time cell for a value-plus-unit', () => {
    const d = analyzeTable([
      ['Time', 'Clock', 'Alt'],
      ['0', '16:24:04', '10'],
      ['1', '16:24:05', '20'],
      ['2', '16:24:06', '35'],
    ]);
    // The clock column carries digits after the number, so it's never read as a unit.
    expect(d.columns[1].unit).toBeNull();
  });
});

describe('analyzeTable — infers the file-wide unit system for unlabelled columns', () => {
  it('reads a bare velocity as ft/s when the altitude is in feet (an imperial file)', () => {
    const t = analyzeTable([
      ['Time', 'Altitude (ft)', 'Velocity_Up'],
      ['0', '0', '0'],
      ['1', '500', '300'],
      ['2', '1200', '250'],
    ]);
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    expect(by('Velocity_Up').role).toBe('velocity');
    // Without the inference this bare velocity would fall to the m/s default and read ~3.3× high.
    expect(by('Velocity_Up').unit).toBe('ft/s');
  });

  it('reads a bare altitude as metres when a Celsius temperature marks a metric file', () => {
    const t = analyzeTable([
      ['Time', 'Alt', 'Temp'],
      ['0', '0', '15C'],
      ['1', '500', '14C'],
      ['2', '1200', '13C'],
    ]);
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    // Feet is the fixed altitude default; the °C signal corrects it to metres for this file.
    expect(by('Alt').unit).toBe('m');
  });

  it('leaves defaults alone when the file mixes unit systems', () => {
    const t = analyzeTable([
      ['Time', 'Altitude (ft)', 'Temp (C)', 'Velocity_Up'],
      ['0', '0', '15', '0'],
      ['1', '500', '14', '150'],
      ['2', '1200', '13', '120'],
    ]);
    // Feet (imperial) and °C (metric) both present → ambiguous → the bare velocity keeps
    // null (falls to the mapper default) rather than guessing a system.
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    expect(by('Velocity_Up').unit).toBeNull();
  });
});

describe('a first record fused onto the header line', () => {
  // Firmware that prints its header without a trailing newline: the names and the first
  // record arrive as one row, with the record's first value stuck to the last name.
  const fused = [
    ['Time', 'Baro', 'AltiM', 'AccelX10.42', '876.41', '1207.22', '0.10'],
    ['10.51', '810.50', '1844.00', '0.20'],
    ['10.58', '810.51', '1843.91', '0.30'],
    ['10.65', '810.50', '1843.99', '0.40'],
  ];

  it('splits the names back out instead of inventing columns named after numbers', () => {
    const t = analyzeTable(fused);
    expect(t.headers).toEqual(['Time', 'Baro', 'AltiM', 'AccelX']);
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    expect(by('Time').role).toBe('time');
    expect(by('AltiM').role).toBe('altitude');
    expect(by('AltiM').unit).toBe('m');
  });

  it('recovers the fused record as the first sample', () => {
    const t = analyzeTable(fused);
    expect(t.dataRows.length).toBe(4);
    expect(t.dataRows[0]).toEqual(['10.42', '876.41', '1207.22', '0.10']);
  });

  it('leaves a header that merely names unfilled columns alone', () => {
    // Wider than the data, but its tail is names, not a record — nothing to split.
    const t = analyzeTable([
      ['Time', 'Altitude', 'Velocity', 'Spare1', 'Spare2'],
      ['0', '0', '0'],
      ['1', '500', '150'],
      ['2', '1200', '120'],
    ]);
    expect(t.headers).toEqual(['Time', 'Altitude', 'Velocity', 'Spare1', 'Spare2']);
    expect(t.dataRows.length).toBe(3);
  });
});

describe('body-axis acceleration columns', () => {
  const rows = (headers: string[]) => [
    headers,
    ...Array.from({ length: 20 }, (_, i) => headers.map((_, c) => String(c === 0 ? i * 0.1 : i * (c + 1)))),
  ];
  const roleOfHeader = (headers: string[], h: string) =>
    analyzeTable(rows(headers)).columns.find((c) => c.header === h)!.role;

  it('maps every axis, whichever way round the logger writes it', () => {
    // Y is the one that used to fall through, so a three-axis resultant came out of two
    // axes and under-read the peak the airframe felt.
    for (const set of [
      ['Time', 'AccelX', 'AccelY', 'AccelZ'],
      ['Time', 'accel_x', 'accel_y', 'accel_z'],
      ['Time', 'Xacc_g', 'Yacc_g', 'Zacc_g'],
      ['Time', 'acc_x', 'acc_y', 'acc_z'],
      ['Time', 'acceleration_x', 'acceleration_y', 'acceleration_z'],
      ['Time', 'Xaccel', 'Yaccel', 'Zaccel'],
    ]) {
      for (const h of set.slice(1)) expect(roleOfHeader(set, h), `${h} in ${set.join(',')}`).toBe('accelAxial');
    }
  });

  it('still leaves a GPS accuracy column alone', () => {
    const set = ['Time', 'hAcc', 'vAcc', 'AccelY'];
    expect(roleOfHeader(set, 'hAcc')).toBe('ignore');
    expect(roleOfHeader(set, 'vAcc')).toBe('ignore');
    expect(roleOfHeader(set, 'AccelY')).toBe('accelAxial');
  });

  it('keeps a total/magnitude column distinct from the axes', () => {
    const set = ['Time', 'Xacc_g', 'Yacc_g', 'Zacc_g', 'TotalAcc_g'];
    expect(roleOfHeader(set, 'TotalAcc_g')).toBe('accelTotal');
    expect(roleOfHeader(set, 'Yacc_g')).toBe('accelAxial');
  });
});

describe('analyzeTable — the columns that say when the flight flew', () => {
  /** Rows of a plausible little flight, with whatever date columns are prepended. */
  function withDate(prefix: (i: number) => string[], headers: string[]): string[][] {
    const rows: string[][] = [headers];
    for (let i = 0; i < 40; i++) {
      const alt = i <= 20 ? i * 30 : Math.max(0, 600 - (i - 20) * 30);
      rows.push([...prefix(i), (i * 0.1).toFixed(2), String(alt)]);
    }
    return rows;
  }

  it('claims Year/Month/Day/Hour/Minute/Second, which it used to throw away', () => {
    const t = analyzeTable(
      withDate(() => ['2023', '6', '21', '14', '32', '9'], [
        'Year', 'Month', 'Day', 'Hour', 'Minute', 'Second', 'Time (s)', 'Alt (ft)',
      ]),
    );
    expect(t.columns.map((c) => c.role)).toEqual([
      'year', 'month', 'day', 'hour', 'minute', 'second', 'time', 'altitude',
    ]);
  });

  it('hands the time base back when a calendar Second had taken it', () => {
    // "Second" reads as an elapsed-time column too, and being first it took the role and
    // blocked the real one — the whole flight lost to a naming clash. With a Year/Month/Day
    // beside it, it is a calendar second and "Time (s)" gets the time base.
    const t = analyzeTable(
      withDate(() => ['2023', '6', '21', '9'], ['Year', 'Month', 'Day', 'Second', 'Time (s)', 'Alt (ft)']),
    );
    expect(t.columns[3].role).toBe('second');
    expect(t.columns[4].role).toBe('time');
  });

  it('keeps a lone Second as the time base — a flight with no clock is worse than one with no date', () => {
    const rows: string[][] = [['Year', 'Month', 'Day', 'Second', 'Alt (ft)']];
    for (let i = 0; i < 40; i++) {
      const alt = i <= 20 ? i * 30 : Math.max(0, 600 - (i - 20) * 30);
      rows.push(['2023', '6', '21', (i * 0.1).toFixed(2), String(alt)]);
    }
    const t = analyzeTable(rows);
    expect(t.columns[3].role).toBe('time');
    expect(t.columns[0].role).toBe('year'); // the date is still read
  });

  it('leaves the calendar parts alone unless a whole date is there', () => {
    // A year with no month and day names no day, and taking the column would only cost
    // the flyer a channel. "Second" stays whatever the channel pass made of it.
    const t = analyzeTable(
      withDate(() => ['2023', '9'], ['Year', 'Second', 'Time (s)', 'Alt (ft)']),
    );
    expect(t.columns[0].role).toBe('ignore');
    expect(t.columns[1].role).not.toBe('second');
  });

  it('never takes a column the channel pass already assigned', () => {
    // "Seconds" is this file's elapsed-time base, not a calendar second — and the date
    // pass only ever claims columns the name-based pass gave up on.
    const t = analyzeTable(
      withDate(() => ['2023', '6', '21'], ['Year', 'Month', 'Day', 'Seconds', 'Alt (ft)']),
    );
    expect(t.columns[3].role).toBe('time');
  });

  it('reads a stated stamp, and a clock, out of the cells rather than the header', () => {
    // Both columns are called something a header test would get wrong ("Time" is elapsed
    // seconds in the next file along), so the evidence is what the cells actually hold.
    const t = analyzeTable(
      withDate(() => ['2024-05-11 14:09:44', '14:09:44'], ['Stamp', 'Time', 'Time (s)', 'Alt (ft)']),
    );
    expect(t.columns[0].role).toBe('date');
    expect(t.columns[1].role).toBe('timeOfDay');
    expect(t.columns[2].role).toBe('time');
  });

  it('leaves a column of ordinary text alone', () => {
    const t = analyzeTable(withDate(() => ['Lyrid'], ['Rocket', 'Time (s)', 'Alt (ft)']));
    expect(t.columns[0].role).toBe('ignore');
  });
});

describe('analyzeTable — a roll that is an angle, not a rate', () => {
  /** A 9-DOF log that solves an attitude: pitch/roll/yaw are Euler angles and the rates
   *  live in the gyro columns — the shape every AltimeterCloud export has. */
  function attitudeRows(headers: string[]): string[][] {
    const rows: string[][] = [headers];
    for (let i = 0; i < 40; i++) {
      const alt = i <= 20 ? i * 30 : Math.max(0, 600 - (i - 20) * 30);
      rows.push([(i * 0.1).toFixed(2), String(alt), '12.5', '179.99', '3.4', '1.2']);
    }
    return rows;
  }

  it('leaves roll alone when pitch and yaw are beside it', () => {
    // Debrief reported a peak "roll rate" of 179.99 deg/s on every AltimeterCloud file in
    // the corpus — the largest angle a ±180° column holds, and a perfectly plausible-looking
    // rocket roll rate. Pitch and yaw mean nothing as rates, so their presence settles it.
    const t = analyzeTable(attitudeRows(['Time (s)', 'Alt (ft)', 'pitch', 'roll', 'yaw', 'tilt']));
    const role = (h: string) => t.columns.find((c) => c.header === h)?.role;
    expect(role('roll')).toBe('ignore');
    expect(role('tilt')).toBe('tilt'); // the attitude Debrief does read is untouched
  });

  it('still reads a roll rate on a logger that writes one', () => {
    const t = analyzeTable(attitudeRows(['Time (s)', 'Alt (ft)', 'Roll rate (deg/s)', 'x', 'y', 'z']));
    expect(t.columns.find((c) => c.header === 'Roll rate (deg/s)')?.role).toBe('rollRate');
    // …and a bare roll with no pitch/yaw beside it is still taken as the rate it names.
    const bare = analyzeTable(attitudeRows(['Time (s)', 'Alt (ft)', 'roll', 'x', 'y', 'z']));
    expect(bare.columns.find((c) => c.header === 'roll')?.role).toBe('rollRate');
  });
});
