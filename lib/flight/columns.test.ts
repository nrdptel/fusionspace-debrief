import { describe, it, expect } from 'vitest';
import { analyzeTable } from './columns';

/** A headerless table: time, an altitude arc (rise then fall), and a flat voltage. */
function headerlessRows(): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i * 0.1).toFixed(2);
    const alt = i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25); // single interior peak at i=30
    const volt = (9.1 - i * 0.001).toFixed(2);
    rows.push([t, String(alt), volt]);
  }
  return rows;
}

describe('analyzeTable — headerless role inference from data shape', () => {
  it('guesses time and altitude from the data when there are no headers', () => {
    const t = analyzeTable(headerlessRows());
    expect(t.headerRow).toBe(-1); // detected as headerless
    expect(t.columns[0].role).toBe('time'); // monotonic from ~0
    expect(t.columns[1].role).toBe('altitude'); // widest range with an interior peak
    expect(t.columns[2].role).toBe('ignore'); // flat voltage — never mistaken for altitude
  });

  it('infers time but not altitude when nothing has an apogee shape', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) rows.push([(i * 0.1).toFixed(2), '9.1', '25.0']); // clock + two flats
    const t = analyzeTable(rows);
    expect(t.columns[0].role).toBe('time');
    expect(t.columns[1].role).toBe('ignore');
    expect(t.columns[2].role).toBe('ignore');
  });

  it('does not let a small-range column (lat/lon, temp) win altitude', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 60; i++) {
      const t = (i * 0.1).toFixed(2);
      const lat = (34.5 + Math.sin(i / 10) * 0.001).toFixed(6); // tiny wander, no big peak
      rows.push([t, lat]);
    }
    const parsed = analyzeTable(rows);
    expect(parsed.columns[0].role).toBe('time');
    expect(parsed.columns[1].role).toBe('ignore');
  });

  it('leaves a headered table to name-based inference (no shape override)', () => {
    const rows = [
      ['Time (s)', 'Height', 'Battery'],
      ['0.0', '0', '9.1'],
      ['0.1', '15', '9.1'],
      ['0.2', '40', '9.0'],
      ['0.3', '20', '9.0'],
    ];
    const t = analyzeTable(rows);
    expect(t.headerRow).toBe(0);
    expect(t.columns[0].role).toBe('time');
    expect(t.columns[1].role).toBe('altitude');
    expect(t.columns[2].role).toBe('voltage');
  });
});
