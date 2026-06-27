import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves a plain cell untouched', () => {
    expect(csvCell('Apogee')).toBe('Apogee');
    expect(csvCell('1234 ft')).toBe('1234 ft');
  });

  it('quotes cells with a comma, quote or newline, doubling quotes', () => {
    expect(csvCell('1,234 ft')).toBe('"1,234 ft"');
    expect(csvCell('a "b" c')).toBe('"a ""b"" c"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('toCsv', () => {
  it('joins a grid, quoting only where needed', () => {
    const csv = toCsv([
      ['Metric', 'flight-a', 'flight-b'],
      ['Apogee', '1,234 ft', '987 ft'],
    ]);
    expect(csv).toBe('Metric,flight-a,flight-b\nApogee,"1,234 ft",987 ft');
  });
});
