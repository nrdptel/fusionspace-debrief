import { describe, it, expect } from 'vitest';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';
import { metricTiles } from '../readings';
import { flightCardStats } from '../flightCard';
import { headlineRows } from '../report';

/**
 * A flight whose accelerometer column exists and was never filled — every sample exactly zero.
 * `gravityRemoved` is the case that matters: the analyzer adds a full g back to put such a
 * channel on specific force, which turns a column of zeros into a flat +9.80665.
 */
function deadAccelColumn(gravityRemoved: boolean): RawFlight {
  const dt = 0.05;
  const time: number[] = [];
  const alt: number[] = [];
  for (let t = 0; t <= 40; t += dt) {
    time.push(t);
    const ft = t - 1;
    alt.push(ft <= 0 ? 0 : ft <= 8 ? 300 * (1 - (1 - ft / 8) ** 2) : Math.max(0, 300 - (ft - 8) * 10));
  }
  return {
    source: 'dead.csv',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [
      { kind: 'altitude', label: 'Altitude', unit: 'm', values: Float64Array.from(alt) },
      {
        kind: 'accelAxial',
        label: 'Acceleration',
        unit: 'm/s^2',
        values: new Float64Array(time.length), // all zero — the column was never written
        ...(gravityRemoved ? { gravityRemoved: true } : {}),
      },
    ],
    meta: {},
    notes: [],
  };
}

describe('an accelerometer column that was never filled is not a measurement', () => {
  it('reads as no accelerometer, on a flagged channel and an unflagged one alike', () => {
    for (const gravityRemoved of [false, true]) {
      const a = analyzeFlight(deadAccelColumn(gravityRemoved));
      const m = a.metrics;
      const where = `gravityRemoved=${gravityRemoved}`;

      // The whole point: the source says baro, so every surface that asks is already right.
      expect(m.accelerationSource, `${where}: a dead column is not a device measurement`).toBe('baro');

      // And nothing fabricated survives. Before this, a flagged channel reported exactly
      // 1.0000 g of peak acceleration and a thrust-to-weight of exactly 1.00, both labelled
      // measured, because every zero had become +9.80665.
      expect(m.maxAcceleration, `${where}: no peak acceleration is reported`).toBeNaN();
      expect(m.avgBoostAcceleration, `${where}: no boost average is reported`).toBeNull();
      expect(m.liftoffTWR, `${where}: no thrust-to-weight is reported`).toBeNull();
    }
  });

  it('keeps the fabricated figure off all six surfaces that ask for one', () => {
    // The guard used to live on ONE of these, testing the array after the shift — so it was
    // the one surface where it could not work. These are the readings a flyer would see.
    const a = analyzeFlight(deadAccelColumn(true));
    const m = a.metrics;

    const tile = metricTiles(m, 'metric').find((t) => t.label === 'Max acceleration');
    expect(tile, 'the metric grid has no max-acceleration tile').toBeUndefined();

    const row = headlineRows(m, 'metric').find(([l]) => l === 'Max acceleration');
    expect(row, 'the report (and every text export built from it) has no max-acceleration row').toBeUndefined();

    const card = flightCardStats(m, 'metric').find((s) => s.reading === 'Max acceleration');
    expect(card, 'the shareable card has no max-accel stat').toBeUndefined();
  });

  it('still reads a channel that carries real data, flagged or not', () => {
    // The guard must not swallow a live channel. One non-zero sample is a measurement.
    const live = deadAccelColumn(true);
    (live.channels[1].values as Float64Array)[200] = 42;
    const a = analyzeFlight(live);
    expect(a.metrics.accelerationSource, 'a channel with any real sample is still a device read').toBe('device');
    expect(Number.isFinite(a.metrics.maxAcceleration)).toBe(true);
  });
});
