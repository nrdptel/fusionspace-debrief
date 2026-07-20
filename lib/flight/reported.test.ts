import { describe, it, expect } from 'vitest';
import { extractReportedSummary } from './reported';

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
    expect(r).toHaveLength(3);
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
