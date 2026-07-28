import { describe, it, expect } from 'vitest';
import { extractReportedSummary, compareReported } from './reported';
import type { ReportedValue } from './types';
import type { FlightMetrics } from '../analyze/types';

const G0 = 9.80665;

describe('extractReportedSummary', () => {
  it('reads an AltimeterCloud-style summary grid into canonical SI', () => {
    // The real export is a grid of key,value pairs, several per line.
    const rows = [
      ['Apogee meters', '209.28', '', 'Landing meters', '-0.906', 'Burnout time (ms)', '1832', ''],
      ['Apogee time', '6.665', '', 'Landing time', '45.784', 'Burnout velocity (m/s)', '59.830', ''],
      ['Device tag', 'BECs Nano 1', '', 'Max velocity up', '62.828', 'Ejection time (ms)', '6277'],
      ['Settings string', 'fp=1013', '', 'Orig_pressure', '1013.25', 'Max acc ascent (mG)', '31300.6', ''],
    ];
    const r = extractReportedSummary(rows);
    const by = (m: string) => r.find((x) => x.metric === m);
    expect(by('apogeeAltitude')).toMatchObject({ value: 209.28, source: 'device', label: 'Apogee' });
    expect(by('maxVelocity')!.value).toBeCloseTo(62.828, 3);
    // milli-g → m/s²: 31300.6 mG = 31.3006 g
    expect(by('maxAcceleration')!.value).toBeCloseTo((31300.6 * G0) / 1000, 3);
    // The grid also states the device's own burnout velocity — kept as a cross-check.
    expect(by('burnoutVelocity')!.value).toBeCloseTo(59.83, 3);
    expect(r).toHaveLength(4);
  });

  it('reads the device descent velocity as a downward magnitude', () => {
    // The device writes descent velocity signed (downward-negative); compare magnitudes.
    const r = extractReportedSummary([['Descent velocity (m/s)', '-5.625']]);
    expect(r).toHaveLength(1);
    expect(r[0].metric).toBe('mainDescentRate');
    expect(r[0].value).toBeCloseTo(5.625, 3);
  });

  it('returns nothing for a file with no recognised summary', () => {
    expect(extractReportedSummary([['Time (s)', 'Altitude (ft)'], ['0', '0']])).toEqual([]);
    expect(extractReportedSummary([])).toEqual([]);
  });

  it('ignores a known key whose paired value is not a number', () => {
    expect(extractReportedSummary([['Apogee meters', 'n/a']])).toEqual([]);
  });

  it('takes only the first occurrence of a metric', () => {
    const r = extractReportedSummary([
      ['Apogee meters', '100'],
      ['Apogee meters', '200'],
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(100);
  });
});

describe('compareReported', () => {
  const rep = (metric: ReportedValue['metric'], value: number): ReportedValue => ({ metric, label: metric, value, source: 'device' });
  const withMetric = (metric: string, value: number) => ({ [metric]: value }) as unknown as FlightMetrics;

  it('calls a tight peak match "agree"', () => {
    const [c] = compareReported([rep('apogeeAltitude', 100)], withMetric('apogeeAltitude', 102));
    expect(c.status).toBe('agree'); // 2% on a peak
    expect(c.agree).toBe(true);
  });

  it('flags a peak past the tight bound as "differ" — no wider band for a peak', () => {
    const [c] = compareReported([rep('apogeeAltitude', 100)], withMetric('apogeeAltitude', 112));
    expect(c.status).toBe('differ'); // 12% on a peak is a real gap
    expect(c.agree).toBe(false);
  });

  it('treats a modest descent-rate gap as "consistent", not a discrepancy', () => {
    // A windowed figure like a descent rate is expected to vary between two reads by
    // more than a peak would, so 15% is consistent — not flagged as differing.
    const [c] = compareReported([rep('mainDescentRate', 6)], withMetric('mainDescentRate', 5.1)); // 15%
    expect(c.status).toBe('consistent');
    expect(c.agree).toBe(false);
  });

  it('still flags a descent rate beyond the wider windowed band as "differ"', () => {
    const [c] = compareReported([rep('mainDescentRate', 6)], withMetric('mainDescentRate', 9)); // 50%
    expect(c.status).toBe('differ');
  });

  it('has no status when there is nothing to compare', () => {
    const [c] = compareReported([rep('mainDescentRate', 6)], withMetric('apogeeAltitude', 100));
    expect(c.status).toBeNull();
    expect(c.hasComputed).toBe(false);
  });
});

describe('the gravity convention, not a disagreement', () => {
  const at = (value: number): ReportedValue => ({ metric: 'maxAcceleration', label: 'Max acceleration', value, source: 'device' });
  const metrics = (maxAcceleration: number) => ({ maxAcceleration }) as FlightMetrics;

  it('names an exact one-gravity gap for what it is', () => {
    // Every AltimeterCloud file in the corpus lands here: Debrief 316.76 m/s² against the
    // device's 306.95, and 314.07 against 304.26 — +1.00 g to two decimals, every time. An
    // accelerometer at rest reads 1 g; Debrief reports that specific force and the device
    // reports acceleration net of gravity. Shown as a bare 3.2%, it teaches a flyer to
    // discount the cross-check.
    const [c] = compareReported([at(306.95)], metrics(316.76));
    expect(c.gravityConvention).toBe(true);
    expect(c.deltaPct).toBeGreaterThan(3); // the raw percentage is unchanged and still shown
  });

  it('is not claimed for a gap that merely happens to be small', () => {
    // 3.2% of a different peak is 3.2% — the claim is about an exact gravity, not a band.
    const [near] = compareReported([at(100)], metrics(103.2));
    expect(near.gravityConvention).toBeFalsy();
    // …nor for two gravities, nor for the device reading higher.
    expect(compareReported([at(300)], metrics(300 + 2 * 9.80665))[0].gravityConvention).toBeFalsy();
    expect(compareReported([at(300)], metrics(300 - 9.80665))[0].gravityConvention).toBeFalsy();
  });

  it('applies to acceleration only — a 1 m/s² gap in a speed is just a gap', () => {
    const [c] = compareReported(
      [{ metric: 'maxVelocity', label: 'Max velocity', value: 100, source: 'device' }],
      { maxVelocity: 109.80665 } as FlightMetrics,
    );
    expect(c.gravityConvention).toBeFalsy();
  });

  it('neither figure is adjusted into the other', () => {
    const [c] = compareReported([at(306.95)], metrics(316.76));
    expect(c.reported.value).toBe(306.95);
    expect(c.computed).toBe(316.76);
  });
});

// A deployment shock is a reading taken AT an instant, and Debrief keeps it where that
// instant lives: `peakAccel` on the apogee and main events, not on `FlightMetrics`. So the
// cross-check resolves this one metric through the events. No corpus file exercises the
// comparison — every logger that STATES a shock (Blue Raven, via its summary) writes a log
// with no accelerometer in it, and every logger Debrief MEASURES one from states none — so
// the path is covered here or it is covered nowhere.
describe('a deployment shock, which lives on an event rather than on the metrics', () => {
  const ev = (type: 'apogee' | 'main', peakAccel?: number) =>
    ({ type, label: type, time: 1, index: 1, altitude: 100, provenance: 'derived' as const, ...(peakAccel != null ? { peakAccel } : {}) });
  const stated = (metric: 'apogeeShock' | 'mainShock', g: number): ReportedValue => ({
    metric,
    label: metric === 'apogeeShock' ? 'Apogee deployment shock' : 'Main deployment shock',
    value: g * G0,
    source: 'device',
  });

  it('compares the device’s figure against the shock Debrief measured at that event', () => {
    const [c] = compareReported([stated('apogeeShock', 115.8)], {} as FlightMetrics, [ev('apogee', 118 * G0), ev('main', 187 * G0)]);
    expect(c.hasComputed).toBe(true);
    expect(c.computed / G0).toBeCloseTo(118, 3);
    // ~1.9% apart: inside the tight band, so this reads as agreement.
    expect(c.status).toBe('agree');
  });

  it('picks the right event for each of the two shocks', () => {
    const events = [ev('apogee', 20 * G0), ev('main', 90 * G0)];
    const [apo] = compareReported([stated('apogeeShock', 20)], {} as FlightMetrics, events);
    const [main] = compareReported([stated('mainShock', 90)], {} as FlightMetrics, events);
    expect(apo.computed / G0).toBeCloseTo(20, 3);
    expect(main.computed / G0).toBeCloseTo(90, 3);
  });

  it('has nothing to compare when the flight recorded no acceleration', () => {
    // Every Blue Raven low-rate flight: the device states the shock, the log has no
    // accelerometer, so Debrief's column is empty rather than zero.
    const [c] = compareReported([stated('mainShock', 187.5)], {} as FlightMetrics, [ev('apogee'), ev('main')]);
    expect(c.hasComputed).toBe(false);
    expect(c.computed).toBeNaN();
    expect(c.status).toBeNull();
  });

  it('does not fall back to a metrics field of the same name', () => {
    // The lookup must go through the events. If it indexed `metrics` it would find nothing
    // here and silently report "not computed" on a flight that measured a shock.
    const [c] = compareReported([stated('apogeeShock', 50)], { apogeeShock: 999 } as unknown as FlightMetrics, [ev('apogee', 50 * G0)]);
    expect(c.computed / G0).toBeCloseTo(50, 3);
  });
});
