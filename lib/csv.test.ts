import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, splitLine, detectDelimiter, parseTable, isNumeric } from './csv';

describe('splitLine', () => {
  it('splits on the delimiter and trims cells', () => {
    expect(splitLine(' 0 , 5 , 12 ', ',')).toEqual(['0', '5', '12']);
    expect(splitLine('0\t5\t12', '\t')).toEqual(['0', '5', '12']);
  });

  it('honours double-quoted fields containing the delimiter and escaped quotes', () => {
    expect(splitLine('0,"pad, armed",5', ',')).toEqual(['0', 'pad, armed', '5']);
    expect(splitLine('"a ""b"" c",1', ',')).toEqual(['a "b" c', '1']);
  });
});

describe('detectDelimiter', () => {
  it('picks the delimiter giving the most consistent columns', () => {
    expect(detectDelimiter('time,altitude\n0,0\n0.1,5')).toBe(',');
    expect(detectDelimiter('time;altitude\n0;0\n0.1;5')).toBe(';');
    expect(detectDelimiter('time\taltitude\n0\t0\n0.1\t5')).toBe('\t');
  });
});

describe('parseTable', () => {
  it('reads CRLF and skips blank lines', () => {
    const { rows } = parseTable('time,altitude\r\n0,0\r\n\r\n0.1,5\r\n');
    expect(rows).toEqual([
      ['time', 'altitude'],
      ['0', '0'],
      ['0.1', '5'],
    ]);
  });
});

describe('isNumeric', () => {
  it('accepts finite numbers (incl. sign and scientific) and rejects the rest', () => {
    expect(isNumeric('0')).toBe(true);
    expect(isNumeric('-1.0')).toBe(true);
    expect(isNumeric('5e1')).toBe(true);
    expect(isNumeric('')).toBe(false);
    expect(isNumeric('12 ft')).toBe(false);
    expect(isNumeric('Infinity')).toBe(false);
  });
});

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
