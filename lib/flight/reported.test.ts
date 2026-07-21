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
