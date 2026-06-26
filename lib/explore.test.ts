import { describe, it, expect } from 'vitest';
import { buildPlotChannels, planAxes } from './explore';
import type { RawFlight } from './flight/types';
import type { FlightSeries } from './analyze/types';

const series: FlightSeries = {
  time: Float64Array.from([0, 1, 2]),
  altitude: Float64Array.from([0, 50, 100]),
  velocity: Float64Array.from([0, 40, 0]),
  acceleration: Float64Array.from([0, 9.80665, -9.80665]),
  velocitySource: 'baro',
  accelerationSource: 'baro',
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

  it('lists the three derived channels first, then recorded ones', () => {
    expect(channels.slice(0, 3).map((c) => c.key)).toEqual(['d-altitude', 'd-velocity', 'd-acceleration']);
    expect(channels.slice(0, 3).every((c) => c.group === 'Debrief')).toBe(true);
    expect(channels.find((c) => c.label === 'Batt')?.group).toBe('Recorded');
  });

  it('skips a channel the file declared but never filled', () => {
    expect(channels.some((c) => c.label === 'Empty')).toBe(false);
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
