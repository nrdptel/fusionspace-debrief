import { describe, it, expect } from 'vitest';
import type { RawFlight } from './flight/types';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv, summaryText, summaryMarkdown, analysisJson, compareMarkdown, compareJson, compareMetricRows } from './report';
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

  it('analyzedDataCsv has a unit header and one row per sample', () => {
    const csv = analyzedDataCsv(analysis, 'imperial');
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'time (s),altitude (ft AGL),velocity (ft/s),acceleration (g),mach,dynamic pressure (psi)',
    );
    expect(lines.length).toBe(flight.time.length + 1);
    expect(lines[1].split(',')[0]).toBe('0.000');
    expect(lines[1].split(',')).toHaveLength(6); // every column present, even at t=0
  });

  it('switches CSV units with the system', () => {
    const header = analyzedDataCsv(analysis, 'metric').split('\n')[0];
    expect(header).toContain('altitude (m AGL)');
    expect(header).toContain('dynamic pressure (kPa)');
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
    expect(md).toContain('| Event | Time | Altitude | Speed |');
    expect(md).toMatch(/Made with \[Debrief\]\(https:\/\/debrief\.fusionspace\.co\)/);
    // Every metric row has the same column count as its header (a broken table
    // would have a stray or missing pipe).
    const bars = (s: string) => (s.match(/\|/g) ?? []).length;
    const rows = md.split('\n');
    const metricRows = rows.filter((l) => l.startsWith('| ') && !l.includes('---'));
    expect(metricRows.length).toBeGreaterThan(3);
    expect(metricRows.every((l) => bars(l) === bars('| Metric | Value |') || bars(l) === bars('| a | b | c | d |'))).toBe(
      true,
    );
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
