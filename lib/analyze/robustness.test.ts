import { describe, it, expect } from 'vitest';
import type { RawFlight } from '../flight/types';
import { analyzeFlight } from './index';

// A compact rise-and-fall flight at 50 Hz with a rest tail, altitude only.
function triangleFlight(mutate?: (alt: number[], time: number[]) => void): RawFlight {
  const dt = 0.02;
  const time: number[] = [];
  const alt: number[] = [];
  const padT = 1.5;
  const upT = 8; // climb
  const downT = 20; // descent
  const peak = 1500;
  const total = padT + upT + downT + 4;
  for (let t = 0; t <= total; t += dt) {
    time.push(t);
    const ft = t - padT;
    let h: number;
    if (ft <= 0) h = 0;
    else if (ft <= upT) h = peak * (1 - (1 - ft / upT) ** 2); // ease to apogee
    else if (ft <= upT + downT) h = peak * (1 - (ft - upT) / downT);
    else h = 0;
    alt.push(Math.max(0, h));
  }
  mutate?.(alt, time);
  return {
    source: 't',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
    meta: {},
    notes: [],
  };
}

describe('analysis robustness', () => {
  it('rejects a multi-sample (3-wide) ejection spike at apogee', () => {
    const clean = analyzeFlight(triangleFlight());
    const spiked = analyzeFlight(
      triangleFlight((alt) => {
        const ap = alt.indexOf(Math.max(...alt));
        alt[ap] += 80;
        alt[ap + 1] += 80;
        alt[ap + 2] += 80;
      }),
    );
    expect(Math.abs(spiked.metrics.apogeeAltitude - clean.metrics.apogeeAltitude)).toBeLessThan(15);
  });

  it('keeps the spike in altitudeRaw while cleaning it from altitude', () => {
    const spiked = analyzeFlight(
      triangleFlight((alt) => {
        const ap = alt.indexOf(Math.max(...alt));
        alt[ap] += 80;
        alt[ap + 1] += 80;
        alt[ap + 2] += 80;
      }),
    );
    // The raw trace still carries the ~80 m pop; the cleaned trace does not.
    const rawPeak = Math.max(...spiked.series.altitudeRaw);
    const cleanPeak = Math.max(...spiked.series.altitude);
    expect(rawPeak).toBeGreaterThan(cleanPeak + 50);
  });

  it('handles a descent-only log without inventing ascent numbers', () => {
    const dt = 0.05;
    const time: number[] = [];
    const alt: number[] = [];
    for (let t = 0; t <= 60; t += dt) {
      time.push(t);
      alt.push(Math.max(0, 1000 - 18 * t));
    }
    const flight: RawFlight = {
      source: 'd',
      format: 'test',
      formatLabel: 'Test',
      time: Float64Array.from(time),
      channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
      meta: {},
      notes: [],
    };
    const a = analyzeFlight(flight);
    expect(a.warnings.join(' ')).toMatch(/no clear ascent/i);
    expect(Number.isNaN(a.metrics.maxVelocity)).toBe(true);
    expect(a.metrics.burnTime).toBeNull();
    // It should not throw and should still place an apogee marker (the high point).
    expect(a.events.some((e) => e.type === 'apogee')).toBe(true);
  });

  it('still finds a clean apogee and landing on the triangle flight', () => {
    const a = analyzeFlight(triangleFlight());
    expect(a.metrics.apogeeAltitude).toBeGreaterThan(1450);
    expect(a.metrics.apogeeAltitude).toBeLessThan(1550);
    expect(a.events.some((e) => e.type === 'landing')).toBe(true);
  });

  it('does not pin liftoff to a lateral accel spike hundreds of metres up', () => {
    // A per-axis (body-frame) accelerometer channel that is quiet through boost
    // but throws a brief >2 g lateral blip at ejection near apogee — the kind of
    // channel a multi-axis logger exposes. Liftoff must still land near the pad.
    const flight = triangleFlight();
    const n = flight.time.length;
    const alt = flight.channels[0].values;
    const apIdx = alt.indexOf(Math.max(...alt));
    const acc = new Float64Array(n).fill(1 * 9.80665); // ~1 g resting/lateral
    acc[apIdx - 12] = 6 * 9.80665; // ejection blip near (just before) apogee, two samples wide
    acc[apIdx - 11] = 6 * 9.80665;
    flight.channels.push({ kind: 'accelAxial', label: 'ax', unit: 'm/s²', values: acc });
    const a = analyzeFlight(flight);
    // Liftoff (~pad time 1.5 s) to apogee (~9.5 s) is several seconds, not the
    // fraction of a second a spike-pinned liftoff would report.
    expect(a.metrics.timeToApogee).toBeGreaterThan(4);
    const liftoff = a.events.find((e) => e.type === 'liftoff');
    expect(liftoff && liftoff.time).toBeLessThan(3);
  });
});

// A gap in the ascent is a gap in the SAMPLED ALTITUDE, not only in the clock: a GPS log
// keeps writing a row every second through a dropout, same cadence, empty altitude field.
// The corpus has exactly one file in that state and none in the two below, so these are
// built rather than found — the guard's edges are where a real log would first surprise it.
describe('an ascent hole withholds the derived peak, and a sparse cadence does not', () => {
  /** A 1 Hz GPS-ish climb: coarse enough that a few missing fixes really do hide the peak. */
  function coarseFlight(mutate: (alt: number[], time: number[]) => void): RawFlight {
    const time: number[] = [];
    const alt: number[] = [];
    const padT = 4;
    const upT = 20;
    const peak = 3000;
    for (let t = 0; t <= padT + upT + 60; t += 1) {
      time.push(t);
      const ft = t - padT;
      let h: number;
      if (ft <= 0) h = 0;
      else if (ft <= upT) h = peak * (1 - (1 - ft / upT) ** 2);
      else h = Math.max(0, peak - 30 * (ft - upT));
      alt.push(h);
    }
    mutate(alt, time);
    return {
      source: 'c.csv',
      format: 'test',
      formatLabel: 'Test',
      time: Float64Array.from(time),
      channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
      meta: {},
      notes: [],
    };
  }

  it('withholds the peak when fixes drop out mid-ascent', () => {
    const holed = coarseFlight((alt) => {
      for (let i = 10; i < 14; i++) alt[i] = NaN; // four consecutive fixes, mid-climb
    });
    const a = analyzeFlight(holed);
    expect(a.metrics.maxVelocity, 'no peak off a bridged hole').toBeNaN();
    expect(a.metrics.maxVelocityWithheld, 'and it says which kind of withholding').toBe('gap');
    expect(a.warnings.some((w) => /gap in the sampled ascent/i.test(w)), 'and says why').toBe(true);
  });

  it('withholds it when the dropout lands at the very start of the ascent', () => {
    // `prevUsable` used to begin unset, so a hole in the first samples after liftoff had
    // nothing to be bracketed against and was never counted at all.
    const holed = coarseFlight((alt) => {
      for (let i = 5; i < 9; i++) alt[i] = NaN;
    });
    const a = analyzeFlight(holed);
    expect(a.metrics.maxVelocity, 'a hole at the start is still a hole').toBeNaN();
    expect(a.metrics.maxVelocityWithheld).toBe('gap');
  });

  it('keeps the peak on a single dropped fix', () => {
    const one = coarseFlight((alt) => {
      alt[12] = NaN;
    });
    const a = analyzeFlight(one);
    expect(a.metrics.maxVelocity, 'a first derivative still has a neighbour').not.toBeNaN();
    expect(a.metrics.maxVelocityWithheld).toBeNull();
  });

  it('keeps the peak on a logger that simply writes altitude sparsely', () => {
    // Every third row carries a fix. That is a two-row "hole" between every pair of them
    // and no dropout anywhere — withholding here would be a wrong answer with a confident
    // explanation ("a dropout or a paused logger") attached to it.
    const sparse = coarseFlight((alt) => {
      for (let i = 0; i < alt.length; i++) if (i % 3 !== 0) alt[i] = NaN;
    });
    const a = analyzeFlight(sparse);
    expect(a.metrics.maxVelocity, 'a regular cadence is not a dropout').not.toBeNaN();
    expect(a.metrics.maxVelocityWithheld).toBeNull();
  });
});
