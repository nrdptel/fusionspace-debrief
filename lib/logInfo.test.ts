import { describe, it, expect } from 'vitest';
import { describeLog } from './logInfo';
import type { RawFlight } from './flight/types';

function flight(time: number[], over: Partial<RawFlight> = {}): RawFlight {
  return {
    source: 'f.csv',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [
      { kind: 'altitude', label: 'Alt', unit: 'm', values: Float64Array.from(time.map(() => 0)) },
      { kind: 'voltage', label: 'Batt', unit: 'V', values: Float64Array.from(time.map(() => 0)) },
    ],
    meta: { product: 'TeleMetrum', serial: '1234' },
    notes: [],
    ...over,
  };
}

describe('describeLog', () => {
  it('reads rate, count and duration off a steady clock', () => {
    const info = describeLog(flight([0, 0.1, 0.2, 0.3, 0.4]));
    expect(info.sampleCount).toBe(5);
    expect(info.sampleHz).toBeCloseTo(10, 6);
    expect(info.durationSec).toBeCloseTo(0.4, 6);
    expect(info.uniform).toBe(true);
  });

  it('flags a non-uniform clock', () => {
    // Gaps of 0.1, 0.1, 1.0 — clearly not steady.
    expect(describeLog(flight([0, 0.1, 0.2, 1.2])).uniform).toBe(false);
  });

  it('lists recorded channels and tidies metadata keys', () => {
    const info = describeLog(flight([0, 1, 2]));
    expect(info.channels.map((c) => c.label)).toEqual(['Alt', 'Batt']);
    expect(info.meta).toEqual([
      { key: 'Product', value: 'TeleMetrum' },
      { key: 'Serial', value: '1234' },
    ]);
  });

  it('handles a degenerate single-sample log without dividing by zero', () => {
    const info = describeLog(flight([5]));
    expect(info.sampleHz).toBeNull();
    expect(info.durationSec).toBe(0);
    expect(info.uniform).toBe(true);
  });
});
