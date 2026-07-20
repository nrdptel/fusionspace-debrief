import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fileToText } from './fileText';

const bytesOf = (f: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./parsers/__fixtures__/${f}`, import.meta.url))));

describe('fileToText', () => {
  it('flattens an .xlsx workbook to CSV text', async () => {
    const text = await fileToText('flight.xlsx', bytesOf('sample-spreadsheet.xlsx'));
    const lines = text.split('\n');
    expect(lines[0]).toBe('Time (s),Altitude (ft),Velocity (ft/s)');
    expect(lines[2]).toBe('0.1,12,120');
    expect(lines).toHaveLength(7);
  });

  it('decodes a plain text/CSV file from its bytes unchanged', async () => {
    const csv = 'Time,Alt\n0,0\n0.1,15\n';
    const text = await fileToText('flight.csv', new TextEncoder().encode(csv));
    expect(text).toBe(csv);
  });
});
