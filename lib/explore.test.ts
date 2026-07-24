import { describe, it, expect } from 'vitest';
import { buildPlotChannels, planAxes, windowStats, exploreCsv } from './explore';
import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';

const series: FlightSeries = {
  time: Float64Array.from([0, 1, 2]),
  altitude: Float64Array.from([0, 50, 100]),
  altitudeRaw: Float64Array.from([0, 50, 100]),
  velocity: Float64Array.from([0, 40, 0]),
  acceleration: Float64Array.from([0, 9.80665, -9.80665]),
  axialAccel: Float64Array.from([0, 9.80665, -9.80665]),
  velocitySource: 'baro',
  accelerationSource: 'device',
  altitudeSource: 'baro',
  speedOfSound: 340,
  speedOfSoundProfile: Float64Array.from([340, 339, 338]),
  airDensity: Float64Array.from([1.2, 1.2, 1.2]),
};

const flight: RawFlight = {
  source: 'f.csv',
  format: 'test',
  formatLabel: 'Test',
  time: series.time,
  channels: [
    { kind: 'voltage', label: 'Batt', unit: 'V', values: Float64Array.from([7.4, 7.3, 7.2]) },
    { kind: 'temperature', label: 'Temp', unit: 'C', values: Float64Array.from([20, 21, 22]) },
    { kind: 'other', label: 'Empty', unit: 'x', values: Float64Array.from([NaN, NaN, NaN]) },
  ],
  meta: {},
  notes: [],
};

describe('buildPlotChannels', () => {
  const channels = buildPlotChannels(flight, series);

  it('lists the derived channels (incl. raw altitude) first, then recorded ones', () => {
    expect(channels.slice(0, 4).map((c) => c.key)).toEqual([
      'd-altitude',
      'd-altitude-raw',
      'd-velocity',
      'd-acceleration',
    ]);
    expect(channels.slice(0, 4).every((c) => c.group === 'Debrief')).toBe(true);
    expect(channels.find((c) => c.label === 'Batt')?.group).toBe('Recorded');
  });

  it('skips a channel the file declared but never filled', () => {
    expect(channels.some((c) => c.label === 'Empty')).toBe(false);
  });

  it('offers the acceleration channel only when it was measured, not derived from baro', () => {
    // A baro-derived acceleration is a noise-dominated second derivative (its peak is
    // withheld too), so the trace isn't offered — the velocity channel still is.
    const baro = buildPlotChannels(flight, { ...series, accelerationSource: 'baro' });
    expect(baro.some((c) => c.key === 'd-acceleration')).toBe(false);
    expect(baro.some((c) => c.key === 'd-velocity')).toBe(true);
  });

  it('derives Mach (velocity ÷ the local speed of sound) and dynamic pressure (½ρv²)', () => {
    const mach = channels.find((c) => c.key === 'd-mach')!;
    expect(mach.group).toBe('Debrief');
    // Against the per-sample speed of sound (340, 339, 338), not a single ground value.
    expect(Array.from(mach.values)).toEqual([0 / 340, 40 / 339, 0 / 338]);
    expect(mach.unitLabel('imperial')).toBe(''); // unitless

    const q = channels.find((c) => c.key === 'd-q')!;
    expect(Array.from(q.values)).toEqual([0, 0.5 * 1.2 * 40 * 40, 0]); // stored raw (Pa)
    expect(q.unitLabel('metric')).toBe('kPa');
    expect(q.unitLabel('imperial')).toBe('psi');
    expect(q.toDisplay(1000, 'metric')).toBeCloseTo(1, 6); // 1000 Pa → 1 kPa
  });

  it('withholds the Mach and dynamic-pressure curves when the velocity was impossible', () => {
    // Same flight, but the analysis judged the velocity physically impossible: the
    // velocity trace still shows for diagnosis, but Debrief won't derive Mach or max-Q
    // curves from it — matching the withheld headlines.
    const flagged = buildPlotChannels(flight, { ...series, velocityImplausible: true });
    expect(flagged.some((c) => c.key === 'd-velocity')).toBe(true);
    expect(flagged.some((c) => c.key === 'd-mach')).toBe(false);
    expect(flagged.some((c) => c.key === 'd-q')).toBe(false);
  });

  it('converts known units by the unit system and leaves native units alone', () => {
    const alt = channels.find((c) => c.key === 'd-altitude')!;
    expect(alt.toDisplay(100, 'imperial')).toBeCloseTo(328.084, 1);
    expect(alt.unitLabel('imperial')).toBe('ft');
    expect(alt.unitLabel('metric')).toBe('m');

    const accel = channels.find((c) => c.key === 'd-acceleration')!;
    expect(accel.toDisplay(9.80665, 'imperial')).toBeCloseTo(1, 3); // m/s² → g
    expect(accel.unitLabel('imperial')).toBe('g');

    const batt = channels.find((c) => c.label === 'Batt')!;
    expect(batt.toDisplay(7.4, 'imperial')).toBe(7.4); // native unit, no conversion
    expect(batt.unitLabel('imperial')).toBe('V');
  });
});

describe('planAxes', () => {
  it('puts the first distinct unit left and the second right', () => {
    expect(planAxes(['ft', 'ft', 'V'])).toEqual({ leftUnit: 'ft', rightUnit: 'V' });
  });
  it('leaves the right axis empty when everything shares a unit', () => {
    expect(planAxes(['ft', 'ft'])).toEqual({ leftUnit: 'ft', rightUnit: undefined });
  });
  it('ignores a third distinct unit (nowhere to put it)', () => {
    expect(planAxes(['ft', 'V', 'g'])).toEqual({ leftUnit: 'ft', rightUnit: 'V' });
  });
});

describe('windowStats', () => {
  const x = Float64Array.from([0, 1, 2, 3, 4]);
  const y = Float64Array.from([0, 10, 20, 30, 40]);

  it('summarizes the samples whose x falls in range', () => {
    const s = windowStats(x, y, 1, 3)!;
    expect(s.count).toBe(3);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.mean).toBe(20);
    expect(s.delta).toBe(20); // y[3] - y[1]
    expect(s.rate).toBe(10); // 20 / (3 - 1)
  });

  it('ignores NaN y values and returns null for an empty window', () => {
    const yn = Float64Array.from([NaN, 10, NaN, 30, 40]);
    // Window [0,0]: only x=0, whose y is NaN → no finite samples → null.
    expect(windowStats(x, yn, 0, 0)).toBeNull();
    // Window [0,2]: x=0 (NaN, skipped), 1 (10), 2 (NaN, skipped) → one sample.
    const s = windowStats(x, yn, 0, 2)!;
    expect(s.count).toBe(1);
    expect(s.mean).toBe(10);
  });
});

describe('exploreCsv', () => {
  it('emits the X column then each Y series, with quoted headers and blank gaps', () => {
    const csv = exploreCsv(
      { label: 'Time', unit: 's', values: Float64Array.from([0, 1, 2]) },
      [
        { label: 'Altitude (AGL)', unit: 'ft', values: Float64Array.from([0, 100, NaN]) },
        { label: 'Batt', unit: 'V', values: Float64Array.from([7.4, 7.3, 7.2]) },
      ],
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Time (s)","Altitude (AGL) (ft)","Batt (V)"');
    expect(lines[1]).toBe('0,0,7.4');
    expect(lines[3]).toBe('2,,7.2'); // NaN altitude → blank cell
  });

  it('stops at the shortest column', () => {
    const csv = exploreCsv(
      { label: 't', unit: 's', values: Float64Array.from([0, 1, 2, 3]) },
      [{ label: 'y', unit: '', values: Float64Array.from([0, 1]) }],
    );
    expect(csv.split('\n')).toHaveLength(1 + 2); // header + 2 rows
  });

  it('defangs a formula-injected channel label (it arrives via the file/share link)', () => {
    const csv = exploreCsv(
      { label: 'Time', unit: 's', values: Float64Array.from([0, 1]) },
      [{ label: '=HYPERLINK("http://evil")', unit: '', values: Float64Array.from([1, 2]) }],
    );
    // The header is quoted and prefixed with ' so a spreadsheet reads it as text.
    expect(csv.split('\n')[0]).toBe('"Time (s)","\'=HYPERLINK(""http://evil"")"');
  });
});
