import { describe, it, expect } from 'vitest';
import { tableTsv, tableHtml } from './copyTable';

const header = ['Metric', 'flight <1>', 'flight & 2'];
const rows = [
  ['Apogee', '9,322 ft', '2,502 ft'],
  ['Max velocity', '896 ft/s', '—'],
];

describe('tableTsv', () => {
  it('is a tab-separated grid a spreadsheet lands in cells', () => {
    expect(tableTsv(header, rows).split('\n')).toEqual([
      'Metric\tflight <1>\tflight & 2',
      'Apogee\t9,322 ft\t2,502 ft',
      'Max velocity\t896 ft/s\t—',
    ]);
  });

  it('never lets a cell break the grid', () => {
    // A tab or newline inside a cell would silently shift every column after it.
    const out = tableTsv(['a'], [['one\ttwo\nthree']]);
    expect(out.split('\n')).toHaveLength(2);
    expect(out.split('\n')[1]).toBe('one two three');
  });
});

describe('tableHtml', () => {
  it('is a real table, so a document or spreadsheet keeps the structure', () => {
    const html = tableHtml(header, rows);
    expect(html.startsWith('<table><thead><tr><th>Metric</th>')).toBe(true);
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // header + two rows
    expect((html.match(/<td>/g) ?? []).length).toBe(6);
  });

  it('escapes what a flyer’s own file names can contain', () => {
    const html = tableHtml(header, rows);
    expect(html).toContain('flight &lt;1&gt;');
    expect(html).toContain('flight &amp; 2');
    expect(html).not.toContain('<1>');
  });
});
