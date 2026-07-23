import { describe, it, expect } from 'vitest';
import type { RawFlight } from './flight/types';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv, summaryText, summaryMarkdown, analysisJson, compareMarkdown, compareJson, compareMetricRows, compareHasClippedAccel } from './report';
import { buildComparison, type CompareInput } from './compare';

function tinyFlight(): RawFlight {
  const dt = 0.05;
  const time: number[] = [];
  const alt: number[] = [];
  for (let t = 0; t <= 40; t += dt) {
    time.push(t);
    // pad, rise to ~300 m, descend
    const ft = t - 2;
    let h = 0;
    if (ft > 0 && ft <= 16) h = 300 * (1 - (1 - ft / 16) ** 2);
    else if (ft > 16) h = Math.max(0, 300 - 15 * (ft - 16));
    alt.push(h);
  }
  return {
    source: 'tiny.csv',
    format: 'test',
    formatLabel: 'Test',
    time: Float64Array.from(time),
    channels: [{ kind: 'altitude', label: 'alt', unit: 'm', values: Float64Array.from(alt) }],
    meta: {},
    notes: [],
  };
}

describe('report exports', () => {
  const flight = tinyFlight();
  const analysis = analyzeFlight(flight);

  it('analyzedDataCsv leads with the six derived columns and one row per sample', () => {
    const csv = analyzedDataCsv(flight, analysis, 'imperial');
    const lines = csv.split('\n');
    expect(lines[0]).toMatch(
      /^time \(s\),altitude \(ft AGL\),velocity \(ft\/s\),acceleration \(g\),mach,dynamic pressure \(psi\)/,
    );
    expect(lines.length).toBe(flight.time.length + 1);
    expect(lines[1].split(',')[0]).toBe('0.000');
    // Six derived columns, then one per recorded channel (this flight logged altitude).
    expect(lines[1].split(',').length).toBeGreaterThanOrEqual(6);
  });

  it('switches CSV units with the system', () => {
    const header = analyzedDataCsv(flight, analysis, 'metric').split('\n')[0];
    expect(header).toContain('altitude (m AGL)');
    expect(header).toContain('dynamic pressure (kPa)');
  });

  it('carries every recorded channel the logger captured, not just the derived curves', () => {
    // A flight that also logged battery voltage and temperature: both must ride into the
    // data export as their own columns, in the displayed units, alongside the derived six.
    const n = flight.time.length;
    const volts = Float64Array.from({ length: n }, (_, i) => 9.1 - i * 0.0002);
    const tempC = Float64Array.from({ length: n }, () => 20);
    const rich = {
      ...flight,
      channels: [
        ...flight.channels,
        { kind: 'voltage' as const, label: 'Battery', unit: 'V', values: volts },
        { kind: 'temperature' as const, label: 'Temp', unit: '°C', values: tempC },
      ],
    };
    const csv = analyzedDataCsv(rich, analyzeFlight(rich), 'imperial');
    const header = csv.split('\n')[0];
    expect(header).toContain('Battery (V)');
    expect(header).toContain('Temp (°F)'); // temperature converts to the imperial system
    // The battery column carries real values, not blanks.
    const cols = header.split(',');
    const battCol = cols.findIndex((c) => c.includes('Battery'));
    const firstRow = csv.split('\n')[1].split(',');
    expect(Number(firstRow[battCol])).toBeGreaterThan(9);
  });

  it('summaryText carries provenance and a hedge', () => {
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(txt).toContain('Apogee');
    expect(txt).toMatch(/not gospel/i);
    expect(txt).toMatch(/Analyzed/);
  });

  it('summaryMarkdown renders balanced metric and event tables', () => {
    const md = summaryMarkdown(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(md).toContain('# Debrief — flight report');
    expect(md).toContain('| Metric | Value |');
    expect(md).toMatch(/\| Apogee \| [\d,]+ ft \|/);
    expect(md).toContain('## Events');
    expect(md).toContain('| Event | Time | Altitude | Speed | Shock |');
    expect(md).toMatch(/Made with \[Debrief\]\(https:\/\/debrief\.fusionspace\.co\)/);
    // Every table row has the same column count as its header (a broken table would
    // have a stray or missing pipe): the metric table is 2-wide, the events table 5-wide.
    const bars = (s: string) => (s.match(/\|/g) ?? []).length;
    const rows = md.split('\n');
    const tableRows = rows.filter((l) => l.startsWith('| ') && !l.includes('---'));
    expect(tableRows.length).toBeGreaterThan(3);
    expect(tableRows.every((l) => bars(l) === bars('| a | b |') || bars(l) === bars('| a | b | c | d | e |'))).toBe(true);
  });

  it('carries the deployment shock in the exported summary', () => {
    // The analysis puts the deployment snatch force on the apogee/main events; a report a
    // flyer hands in should show it (it sizes the recovery hardware), not just the screen.
    const base = analyzeFlight(flight);
    const withShock = {
      ...base,
      events: base.events.map((e) => (e.type === 'apogee' ? { ...e, peakAccel: 400 } : e)), // ~41 g
    };
    const txt = summaryText(flight, withShock, 'imperial', 1_700_000_000_000);
    expect(txt).toMatch(/\d+ g shock/);
    const md = summaryMarkdown(flight, withShock, 'imperial', 1_700_000_000_000);
    // The five-column events row (label carries "(derived)") ends with the shock cell.
    const apogeeEventRow = md.split('\n').find((l) => /^\| Apogee[^|]*\|.*\| [\d.]+ g \|$/.test(l));
    expect(apogeeEventRow).toBeTruthy();
  });

  it('carries landing energy into the exports when a descending mass is supplied', () => {
    // ½·m·v² off the measured landing descent rate — the cert-card figure. 1.2 kg.
    const recovery = { descendingMassKg: 1.2 };
    const rate = analysis.metrics.mainDescentRate!;
    const expectedJ = 0.5 * 1.2 * rate * rate;

    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Landing energy\s+[\d.]+ ft·lbf \(at [\d.]+ oz descending\)/);

    const md = summaryMarkdown(flight, analysis, 'metric', 1_700_000_000_000, undefined, recovery);
    expect(md).toMatch(/\| Landing energy \| \d+ J \(at \d+ g descending\) \|/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.landingEnergyJoules).toBeCloseTo(expectedJ, 0);
    expect(doc.recovery.landingEnergyFtLbf).toBeCloseTo(expectedJ / 1.3558179483, 0);
    expect(doc.recovery.descendingMass).toEqual({ value: expect.any(Number), unit: 'oz' });
  });

  it('omits landing energy when no descending mass is given', () => {
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000);
    expect(txt).not.toMatch(/Landing energy/);
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000));
    expect(doc.recovery).toBeUndefined();
  });

  it('carries the main-deploy verification into the exports when a set altitude is supplied', () => {
    // Measured firing 492 ft AGL (150 m); flyer set 500 ft (152.4 m) → within slop, on the mark.
    const recovery = { mainDeploy: { setM: 152.4, actualM: 150 } };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Main deploy check\s+fired at [\d,]+ ft, set [\d,]+ ft — on the mark/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.mainDeploy).toMatchObject({ setAltitude: 500, verdict: 'on' });

    // A firing well below the set altitude reads "low" (the hard-landing side).
    const low = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, { mainDeploy: { setM: 300, actualM: 150 } });
    expect(low).toMatch(/Main deploy check\s+.*— [\d,]+ ft low/);
  });

  it('carries the ejection-delay verification into the exports when a flown delay is supplied', () => {
    // Ideal coast 4.2 s; flew a 3 s delay → fires ~1.2 s before apogee (the riskier side).
    const recovery = { ejectionDelay: { printedS: 3, coastS: 4.2 } };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery);
    expect(txt).toMatch(/Ejection check\s+flew 3 s, ideal 4\.2 s — fires 1\.2 s before apogee/);

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, undefined, recovery));
    expect(doc.recovery.ejectionDelay).toMatchObject({ flownSeconds: 3, idealSeconds: 4.2, verdict: 'before' });
  });

  it('includes a device cross-check section when the file carried its own summary', () => {
    const withReported: RawFlight = {
      ...flight,
      reported: [
        { metric: 'apogeeAltitude', label: 'Apogee', value: 300, source: 'device' },
        { metric: 'maxVelocity', label: 'Max velocity', value: 9999, source: 'device' }, // deliberately off
      ],
    };
    const a = analyzeFlight(withReported);
    const md = summaryMarkdown(withReported, a, 'metric');
    expect(md).toContain("Logger’s own summary (cross-check)");
    expect(md).toContain('| Reading | Logger | Debrief | Agreement |');
    expect(md).toMatch(/\| Apogee \|.*\| agree/); // ~300 m computed vs 300 reported
    expect(md).toMatch(/\| Max velocity \|.*\| differ/); // 9999 m/s can't match

    const txt = summaryText(withReported, a, 'metric');
    expect(txt).toContain('Logger’s own summary (cross-check)');

    // A flight with no reported summary omits the section entirely.
    expect(summaryMarkdown(flight, analysis, 'metric')).not.toContain('cross-check');
  });

  it('analysisJson is valid JSON carrying units, metrics, events and provenance', () => {
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000));
    expect(doc.schema).toBe('debrief.flight/1');
    expect(doc.analyzedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(doc.units.length).toBe('ft');
    expect(doc.units.speed).toBe('ft/s');
    // Apogee is ~300 m → ~984 ft, a finite number in the chosen units.
    expect(typeof doc.metrics.apogee).toBe('number');
    expect(doc.metrics.apogee).toBeGreaterThan(900);
    // A metric the flight lacks is null, not absent or invented.
    expect(doc.metrics.peakRollRate).toBeNull();
    expect(doc.metrics.tiltAtBurnoutDeg).toBeNull();
    // Events carry provenance so nothing reads as more certain than it is.
    expect(Array.isArray(doc.events)).toBe(true);
    expect(doc.events.some((e: { type: string }) => e.type === 'apogee')).toBe(true);
    expect(doc.events.every((e: { provenance?: string }) => typeof e.provenance === 'string')).toBe(true);
    expect(doc.disclaimer).toMatch(/not gospel/i);
    // No logger summary on this flight → the section is omitted.
    expect(doc.loggerSummary).toBeUndefined();
  });

  it('analysisJson switches units and includes the logger cross-check when present', () => {
    const metricDoc = JSON.parse(analysisJson(flight, analysis, 'metric'));
    expect(metricDoc.units.length).toBe('m');
    expect(metricDoc.analyzedAt).toBeNull(); // no timestamp passed

    const withReported: RawFlight = {
      ...flight,
      reported: [{ metric: 'apogeeAltitude', label: 'Apogee', value: 300, source: 'device' }],
    };
    const doc = JSON.parse(analysisJson(withReported, analyzeFlight(withReported), 'metric'));
    expect(Array.isArray(doc.loggerSummary)).toBe(true);
    expect(doc.loggerSummary[0].metric).toBe('apogeeAltitude');
    expect(doc.loggerSummary[0].logger).toBeCloseTo(300, 0);
    expect(typeof doc.loggerSummary[0].agreementPct).toBe('number');
  });

  it('carries an optional report label and notes into the text, Markdown and JSON exports', () => {
    const meta = { label: 'Nimbus IV · J450 · Flight 3', notes: 'Gusty; drogue at apogee.\nMain a touch low.' };
    const txt = summaryText(flight, analysis, 'imperial', 1_700_000_000_000, meta);
    expect(txt).toContain('Nimbus IV · J450 · Flight 3');
    expect(txt).toContain('Gusty; drogue at apogee.');

    const md = summaryMarkdown(flight, analysis, 'imperial', 1_700_000_000_000, meta);
    expect(md).toContain('## Nimbus IV · J450 · Flight 3');
    expect(md).toContain('> Gusty; drogue at apogee.'); // notes render as a blockquote
    expect(md).toContain('> Main a touch low.'); // a multi-line note stays one quote

    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1_700_000_000_000, meta));
    expect(doc.label).toBe('Nimbus IV · J450 · Flight 3');
    expect(doc.notes).toContain('Gusty');
  });

  it('adds nothing when the label and notes are blank or whitespace', () => {
    const blank = { label: '   ', notes: '' };
    expect(summaryText(flight, analysis, 'imperial', 1, blank)).toBe(summaryText(flight, analysis, 'imperial', 1));
    expect(summaryMarkdown(flight, analysis, 'imperial', 1, blank)).toBe(summaryMarkdown(flight, analysis, 'imperial', 1));
    const doc = JSON.parse(analysisJson(flight, analysis, 'imperial', 1, blank));
    expect(doc.label).toBeUndefined();
    expect(doc.notes).toBeUndefined();
  });
});

describe('comparison report', () => {
  // Two flights of the same rocket, real ascents with slightly different apogees —
  // the redundant-altimeter case the cross-check is written for.
  const input = (id: string, peak: number): CompareInput => {
    const f = tinyFlight();
    f.source = `${id}.csv`;
    // Scale the ramp to a distinct apogee so the two disagree a little.
    const alt = Float64Array.from(f.channels[0].values, (h) => (h * peak) / 300);
    return {
      id,
      name: `${id}.csv`,
      formatLabel: 'Test',
      analysis: analyzeFlight({ ...f, channels: [{ ...f.channels[0], values: alt }] }),
    };
  };
  const comparison = buildComparison([input('a', 300), input('b', 315)]);

  it('compareMetricRows crowns the single best finite value and gives a pairwise spread', () => {
    const rows = compareMetricRows(comparison.flights, 'metric');
    const apogee = rows.find((r) => r.label === 'Apogee')!;
    expect(apogee.cells).toHaveLength(2);
    expect(apogee.best).toBe(1); // flight 'b' peaks higher
    // Apogees ~300 vs ~315 → spread ≈ 15/307.5 ≈ 4.9%.
    expect(apogee.spreadPct).toBeGreaterThan(3);
    expect(apogee.spreadPct).toBeLessThan(7);
  });

  it('reports no spread for a non-pair comparison', () => {
    const three = buildComparison([input('a', 300), input('b', 315), input('c', 330)]);
    expect(compareMetricRows(three.flights, 'metric')[0].spreadPct).toBeNull();
  });

  it('tags a clipped max acceleration and withholds the highest-g crown', () => {
    const [a, b] = comparison.flights;
    const clip = (f: typeof a, maxA: number, clipped: boolean) =>
      ({ ...f, metrics: { ...f.metrics, maxAcceleration: maxA, accelerationSource: 'device' as const, accelClipped: clipped } }) as typeof a;
    const flights = [clip(a, 157, true), clip(b, 304, false)];
    expect(compareHasClippedAccel(flights)).toBe(true);
    const acc = compareMetricRows(flights, 'metric').find((r) => r.label === 'Max acceleration')!;
    // The saturated cell is tagged; the clean one isn't…
    expect(acc.cells[0]).toMatch(/\(clipped\)/);
    expect(acc.cells[1]).not.toMatch(/\(clipped\)/);
    // …and no flight is crowned "highest", because a floor can't settle which pulled most g.
    expect(acc.best).toBe(-1);

    // With neither clipped, the higher value is crowned as usual.
    const clean = [clip(a, 157, false), clip(b, 304, false)];
    expect(compareHasClippedAccel(clean)).toBe(false);
    expect(compareMetricRows(clean, 'metric').find((r) => r.label === 'Max acceleration')!.best).toBe(1);
  });

  it('compareMarkdown carries the cross-check and a metrics table with a difference column', () => {
    const md = compareMarkdown(comparison, 'imperial');
    expect(md).toContain('# Debrief — flight comparison');
    expect(md).toContain('## Cross-check');
    expect(md).toMatch(/agree to within [\d.]+% on apogee/);
    expect(md).toContain('## Metrics');
    expect(md).toContain('| Difference |');
    // Header + every body row share the same column count (2 flights + Difference → 5 pipes).
    const bars = (s: string) => (s.match(/\|/g) ?? []).length;
    const tableRows = md.split('\n').filter((l) => l.startsWith('| ') && !l.includes('---'));
    expect(tableRows.length).toBeGreaterThan(3);
    expect(tableRows.every((l) => bars(l) === 5)).toBe(true);
    // The apogee row's difference is a percentage.
    expect(md).toMatch(/\| Apogee \|[^\n]*\| \d+(\.\d)?% \|/);
    expect(md).toMatch(/Made with \[Debrief\]/);
  });

  it('emphasizes the best flight in the Markdown table', () => {
    const md = compareMarkdown(comparison, 'metric');
    // The higher apogee is bolded; the lower is not.
    expect(md).toMatch(/\| Apogee \|[^|]*\| \*\*[^*]+\*\* \|/);
  });

  it('carries an optional label and notes into the comparison Markdown and JSON', () => {
    const meta = { label: 'Nimbus IV — booster vs sustainer', notes: 'Two bays, one flight.' };
    const md = compareMarkdown(comparison, 'imperial', undefined, meta);
    expect(md).toContain('## Nimbus IV — booster vs sustainer');
    expect(md).toContain('> Two bays, one flight.');
    const doc = JSON.parse(compareJson(comparison, 'imperial', undefined, meta));
    expect(doc.label).toBe('Nimbus IV — booster vs sustainer');
    expect(doc.notes).toBe('Two bays, one flight.');
    // Blank meta leaves both exports byte-for-byte as they were.
    const blank = { label: ' ', notes: '' };
    expect(compareMarkdown(comparison, 'imperial', undefined, blank)).toBe(compareMarkdown(comparison, 'imperial'));
    expect(JSON.parse(compareJson(comparison, 'imperial', undefined, blank)).label).toBeUndefined();
  });

  it('compareJson carries each flight, the cross-check and the pairwise differences', () => {
    const doc = JSON.parse(compareJson(comparison, 'imperial'));
    expect(doc.schema).toBe('debrief.comparison/1');
    expect(doc.units.length).toBe('ft');
    expect(doc.flights).toHaveLength(2);
    expect(typeof doc.flights[0].metrics.apogee).toBe('number');
    expect(doc.crossCheck.some((c: { metric: string }) => c.metric === 'apogee')).toBe(true);
    // A two-flight comparison carries per-metric spreads.
    const apoDiff = doc.differences.find((d: { metric: string }) => d.metric === 'Apogee');
    expect(apoDiff.spreadPct).toBeGreaterThan(0);
  });

  it('compareJson omits pairwise differences for a non-pair comparison', () => {
    const three = buildComparison([input('a', 300), input('b', 315), input('c', 330)]);
    expect(JSON.parse(compareJson(three, 'metric')).differences).toBeUndefined();
  });
});
