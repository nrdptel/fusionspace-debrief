import { describe, it, expect } from 'vitest';
import { unionTimeBase } from './overlay';

const f = (xs: number[]) => Float64Array.from(xs);

describe('unionTimeBase', () => {
  it('keeps every sample of each trace and invents none', () => {
    // A flight at 0, 1, 2 and a prediction at 0.5, 1.5 — no shared instant but t=0 here.
    const { time, values } = unionTimeBase([
      { time: f([0, 1, 2]), values: f([10, 20, 30]) },
      { time: f([0.5, 1.5]), values: f([5, 15]) },
    ]);
    expect(Array.from(time)).toEqual([0, 0.5, 1, 1.5, 2]);
    // Each trace holds its own values and NaN where the other one has a sample. Nothing is
    // interpolated into those gaps: that is the difference between a union and a resample.
    expect(Array.from(values[0])).toEqual([10, NaN, 20, NaN, 30]);
    expect(Array.from(values[1])).toEqual([NaN, 5, NaN, 15, NaN]);
  });

  it('shares one slot when both traces have a sample at the same instant', () => {
    // Both start at t=0, as a flight and a simulation of it do. A duplicated x would be a
    // zero-width interval on the axis.
    const { time, values } = unionTimeBase([
      { time: f([0, 1]), values: f([1, 2]) },
      { time: f([0, 2]), values: f([3, 4]) },
    ]);
    expect(Array.from(time)).toEqual([0, 1, 2]);
    expect(Array.from(values[0])).toEqual([1, 2, NaN]);
    expect(Array.from(values[1])).toEqual([3, NaN, 4]);
  });

  it('never moves a value onto an instant its own trace did not record', () => {
    // The property that makes this not a resample, stated as an invariant rather than a case:
    // every finite output sample must equal an input sample at exactly that instant.
    const a = { time: f([0, 3, 7, 11]), values: f([0, 30, 70, 110]) };
    const b = { time: f([1, 3, 9]), values: f([100, 300, 900]) };
    const { time, values } = unionTimeBase([a, b]);
    for (const [k, trace] of [a, b].entries()) {
      for (let i = 0; i < time.length; i++) {
        const v = values[k][i];
        if (!Number.isFinite(v)) continue;
        const j = Array.from(trace.time).indexOf(time[i]);
        expect(j, `t=${time[i]} is an instant trace ${k} recorded`).toBeGreaterThanOrEqual(0);
        expect(v).toBe(trace.values[j]);
      }
    }
    // And every input sample survives — a union loses nothing.
    expect(values[0].filter(Number.isFinite).length).toBe(4);
    expect(values[1].filter(Number.isFinite).length).toBe(3);
  });

  it('drops a non-finite instant rather than putting NaN on the axis', () => {
    const { time, values } = unionTimeBase([{ time: f([0, NaN, 2]), values: f([1, 2, 3]) }]);
    expect(Array.from(time)).toEqual([0, 2]);
    expect(Array.from(values[0])).toEqual([1, 3]);
  });

  it('places a trace that is not ascending, rather than stopping at the step back', () => {
    // altosEeprom bypasses buildFlight's sort and its own comment says records come back a tick
    // or two out of order at a boundary. A merge walk would strand everything after the step.
    const { time, values } = unionTimeBase([{ time: f([0, 2, 1, 3]), values: f([10, 30, 20, 40]) }]);
    expect(Array.from(time)).toEqual([0, 1, 2, 3]);
    expect(Array.from(values[0])).toEqual([10, 20, 30, 40]);
  });

  it('handles an empty trace and a single-sample trace without inventing an axis', () => {
    expect(Array.from(unionTimeBase([{ time: f([]), values: f([]) }]).time)).toEqual([]);
    const one = unionTimeBase([
      { time: f([5]), values: f([1]) },
      { time: f([]), values: f([]) },
    ]);
    expect(Array.from(one.time)).toEqual([5]);
    expect(Array.from(one.values[1])).toEqual([NaN]);
  });
});
