import { describe, it, expect } from 'vitest';
import type { RawFlight } from './flight/types';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv, summaryText, summaryMarkdown } from './report';

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
});
