import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { xlsxToRows, looksLikeXlsx } from './xlsx';
import { ParseGuidanceError } from './types';

const fixture = (f: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${f}`, import.meta.url))));

describe('xlsx reader', () => {
  it('recognises an .xlsx by its ZIP signature and name', () => {
    expect(looksLikeXlsx('flight.xlsx', fixture('sample-spreadsheet.xlsx'))).toBe(true);
    expect(looksLikeXlsx('flight.csv', new Uint8Array([0x54, 0x69, 0x6d, 0x65]))).toBe(false); // "Time"
    // A ZIP that isn't named .xlsx is left alone (could be any archive).
    expect(looksLikeXlsx('data.zip', fixture('sample-spreadsheet.xlsx'))).toBe(false);
  });

  it('reads the first sheet into a table, resolving shared strings and numbers', async () => {
    const rows = await xlsxToRows(fixture('sample-spreadsheet.xlsx'));
    expect(rows[0]).toEqual(['Time (s)', 'Altitude (ft)', 'Velocity (ft/s)']); // shared-string header
    expect(rows).toHaveLength(7); // header + 6 data rows
    expect(rows[1]).toEqual(['0.0', '0', '0']); // cell text passed through verbatim
    expect(rows[3]).toEqual(['0.2', '40', '210']); // numbers straight through
    expect(rows[6]).toEqual(['0.5', '165', '-18']); // negative preserved
  });

  it('rejects a non-xlsx with a helpful message rather than throwing raw', async () => {
    await expect(xlsxToRows(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).rejects.toBeInstanceOf(ParseGuidanceError);
  });
});
