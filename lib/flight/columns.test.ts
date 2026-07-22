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

  it('tells a tilt angle from a roll angle (roll is a rate channel, tilt is its own)', () => {
    const rows = [
      ['Flight_Time_(s)', 'Baro_Altitude_AGL_(feet)', 'Tilt_Angle_(deg)', 'Roll_Angle_(deg)'],
      ['0.0', '0', '0', '0'],
      ['0.1', '15', '2', '30'],
      ['0.2', '40', '5', '65'],
      ['0.3', '20', '8', '90'],
    ];
    const t = analyzeTable(rows);
    const by = (h: string) => t.columns.find((c) => c.header === h)!;
    expect(by('Tilt_Angle_(deg)').role).toBe('tilt');
    // "Roll_Angle" keys off "roll" as a rate channel, not stolen by the tilt test.
    expect(by('Roll_Angle_(deg)').role).toBe('rollRate');
    expect(by('Baro_Altitude_AGL_(feet)').role).toBe('altitude');
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

  it('invents no unit for a column of plain numbers', () => {
    expect(by('Alt').unit).toBeNull();
    expect(by('Time').unit).toBeNull();
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
