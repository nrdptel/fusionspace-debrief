import { describe, it, expect } from 'vitest';
import { describeLog, recordedBy } from './logInfo';
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

describe('recordedBy — who the file says drew these fixes', () => {
  const flight = (meta: Record<string, string | number>) =>
    ({ meta, channels: [], series: {} } as unknown as Parameters<typeof recordedBy>[0]);

  it('names the board, its serial and the flight number, in that order', () => {
    // The order is fixed rather than the map's, because `flight.meta` is a parser's free-form bag
    // and its key order is whatever the file happened to state.
    expect(recordedBy(flight({ flight: 12, device: 'Altus Metrum TeleMetrum', serial: 2098 }))).toBe(
      'Altus Metrum TeleMetrum · serial 2098 · flight 12',
    );
  });

  it('takes only the keys that IDENTIFY the recording', () => {
    // Ground level and sample rate are a panel's job. A track file gets the identity and nothing
    // else, or the field stops being one a reader can act on.
    expect(recordedBy(flight({ device: 'Entacore AIM', groundLevel: 231, sampleRate: '50 Hz (low-rate)' }))).toBe(
      'Entacore AIM',
    );
  });

  it('returns null when the file named nothing, so no empty element is written', () => {
    expect(recordedBy(flight({}))).toBeNull();
    expect(recordedBy(flight({ groundLevel: 231 }))).toBeNull();
    // An empty or whitespace value is the same as absent — a parser that read a blank field must
    // not produce `serial ` with nothing after it.
    expect(recordedBy(flight({ device: '   ' }))).toBeNull();
  });

  it('reads a key however the parser spelled it', () => {
    // Parsers write `device`, `Serial`, `flight_number` — the map is free-form by design.
    expect(recordedBy(flight({ Device: 'Blue Raven', SERIAL: '1537' }))).toBe('Blue Raven · serial 1537');
  });
});
