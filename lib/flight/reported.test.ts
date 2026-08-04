import { describe, it, expect } from 'vitest';
import { extractReportedSummary, compareReported, predictionVerdict, reportedByMetric } from './reported';
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

describe('a prediction is a third source, and never judged as a second measurement', () => {
  const metrics = { apogeeAltitude: 460, maxVelocity: 90, mach: 0.26 } as unknown as FlightMetrics;
  const device: ReportedValue = { metric: 'apogeeAltitude', label: 'Apogee', value: 450, source: 'device' };
  const predicted: ReportedValue = { metric: 'apogeeAltitude', label: 'Apogee', value: 400, source: 'predicted' };

  it('groups two sources of one reading into ONE row', () => {
    // The 1:1 map emitted two rows both labelled "Apogee", each showing Debrief's identical
    // read beside a different figure — and on screen, a duplicate React key.
    expect(compareReported([device, predicted], metrics)).toHaveLength(2);
    const rows = reportedByMetric([device, predicted], metrics);
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe('apogeeAltitude');
    expect(rows[0].device!.reported.value).toBe(450);
    expect(rows[0].predicted!.reported.value).toBe(400);
    // Debrief's own read is stated once, not once per source.
    expect(rows[0].computed).toBe(460);
  });

  it('keeps a row that only one source states', () => {
    const rows = reportedByMetric([device, { ...predicted, metric: 'maxVelocity', label: 'Max velocity', value: 88 }], metrics);
    expect(rows.map((r) => r.metric).sort()).toEqual(['apogeeAltitude', 'maxVelocity']);
    expect(rows.find((r) => r.metric === 'apogeeAltitude')!.predicted).toBeUndefined();
    expect(rows.find((r) => r.metric === 'maxVelocity')!.device).toBeUndefined();
  });

  it('says which WAY a flight went against its prediction, not just how far', () => {
    // The direction is the reading. `deltaPct` is unsigned because two measurements of one
    // flight have no reference between them; a prediction does — the flight.
    const over = reportedByMetric([predicted], metrics)[0].predicted!;
    expect(over.signedPct).toBeGreaterThan(0);
    expect(predictionVerdict(over)).toMatch(/^flew higher · \+15%$/);

    const under = reportedByMetric(
      [{ ...predicted, value: 600 }],
      metrics,
    )[0].predicted!;
    expect(under.signedPct).toBeLessThan(0);
    expect(predictionVerdict(under)).toMatch(/^flew lower · −23%$/);
  });

  it('never uses the discrepancy vocabulary on a prediction', () => {
    // `agree` / `consistent` / `differ` are about two instruments that measured the same
    // flight. A flight that missed its prediction is not an error — it is the answer.
    for (const v of [400, 460, 600, 1]) {
      const words = predictionVerdict(reportedByMetric([{ ...predicted, value: v }], metrics)[0].predicted!);
      expect(words, `${v} m predicted`).not.toMatch(/agree|consistent|differ/);
    }
  });

  it('calls a prediction the flight landed on "as predicted", on the same 5% a peak is judged by', () => {
    const close = reportedByMetric([{ ...predicted, value: 450 }], metrics)[0].predicted!;
    expect(predictionVerdict(close)).toMatch(/^as predicted/);
    const outside = reportedByMetric([{ ...predicted, value: 430 }], metrics)[0].predicted!;
    expect(predictionVerdict(outside)).toMatch(/^flew higher/);
  });

  it('says nothing about a figure Debrief cannot measure', () => {
    // Four of the ten a `.ork` states have no counterpart — see `METRIC_FIELD`.
    const row = reportedByMetric(
      [{ metric: 'optimumDelay', label: 'Optimum delay', value: 6, source: 'predicted' }],
      metrics,
    )[0];
    expect(row.hasComputed).toBe(false);
    expect(row.predicted!.signedPct).toBeNull();
    expect(predictionVerdict(row.predicted!)).toBe('not measured');
  });

  it('does not say "higher" about a time, a speed or an acceleration', () => {
    // "flew higher" is a sentence about ALTITUDE, and it was being said about all ten figures a
    // design states: a flight that took two and a half times longer to reach apogee than
    // predicted read `Time to apogee — flew higher · +245%`, on the row directly above Apogee.
    // Hard-coded per metric rather than derived from `REPORTED_QUANTITY`, so this test can fail:
    // built from the map it is checking, it would agree with any rewording of it.
    const m = {
      apogeeAltitude: 460,
      timeToApogee: 24,
      flightTime: 180,
      maxVelocity: 90,
      maxAcceleration: 200,
      mach: 0.26,
    } as unknown as FlightMetrics;
    const verdict = (metric: ReportedValue['metric'], value: number) =>
      predictionVerdict(reportedByMetric([{ metric, label: metric, value, source: 'predicted' }], m)[0].predicted!);

    expect(verdict('apogeeAltitude', 400)).toBe('flew higher · +15%');
    expect(verdict('apogeeAltitude', 600)).toBe('flew lower · −23%');
    expect(verdict('timeToApogee', 7)).toBe('took longer · +243%');
    expect(verdict('flightTime', 300)).toBe('took less time · −40%');
    expect(verdict('maxVelocity', 70)).toBe('flew faster · +29%');
    expect(verdict('maxMach', 0.2)).toBe('flew faster · +30%');
    expect(verdict('maxAcceleration', 150)).toBe('pulled more g · +33%');
    expect(verdict('maxAcceleration', 260)).toBe('pulled fewer g · −23%');
  });

  it('never calls a prediction a convention gap, whatever the acceleration says', () => {
    // The +1 g regularity is a MEASURED property of instruments Debrief has read files from.
    // The `.ork` format states no acceleration convention at all, so firing this on a design
    // would print a confident sentence about "the device" under a figure no device wrote — and
    // flip a real 5% under-prediction to `agree` on the strength of it.
    const m = { maxAcceleration: 200 } as unknown as FlightMetrics;
    const one = (source: ReportedValue['source']) =>
      compareReported([{ metric: 'maxAcceleration', label: 'Max acceleration', value: 200 - G0, source }], m)[0];
    expect(one('device').gravityConvention).toBe(true);
    expect(one('predicted').gravityConvention).toBeUndefined();
    expect(predictionVerdict(one('predicted'))).toMatch(/^pulled more g/);
  });

  it('states Debrief’s own read even where the other source wrote a zero', () => {
    // `hasComputed` on a COMPARISON asks "is there a ratio to take", so a stated 0 makes it
    // false. The row's Debrief column asks "did Debrief measure this", and copying the first
    // source's answer let a device figure of 0 blank Debrief's cell for the whole row — on
    // screen and in all three documents — while `analysisJson` still carried the number.
    const row = reportedByMetric(
      [
        { metric: 'apogeeAltitude', label: 'Apogee', value: 0, source: 'device' },
        { metric: 'apogeeAltitude', label: 'Apogee', value: 400, source: 'predicted' },
      ],
      metrics,
    )[0];
    expect(row.hasComputed).toBe(true);
    expect(row.computed).toBe(460);
    // The comparison against the zero is still refused — there is no percentage to state.
    expect(row.device!.hasComputed).toBe(false);
    expect(row.device!.deltaPct).toBeNull();
    expect(row.predicted!.signedPct).toBeCloseTo(15, 5);
  });
});
