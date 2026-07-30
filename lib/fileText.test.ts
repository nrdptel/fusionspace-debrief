import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fileToText, textIsTheFile } from './fileText';

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

// The one question the logbook asks before it decides whether to keep a second copy of a file.
// Get it wrong one way and a raw download reopens as mojibake; wrong the other way and every
// CSV is stored twice, halving how many flights fit in the browser's quota. It had e2e cover
// and no unit cover, which is a lot of weight on one browser walk.
describe('whether a flight can be reopened from its text alone', () => {
  const decode = (bytes: Uint8Array, label?: string) => new TextDecoder(label).decode(bytes);

  it('says yes to a text export, which is nearly every file', () => {
    expect(textIsTheFile('Time (s),Altitude (m)\n0,0\n1,10\n')).toBe(true);
    // …including one with characters well outside ASCII, which decode perfectly.
    expect(textIsTheFile('Zeit;Höhe\n0;0\n1;10\n')).toBe(true);
  });

  it('says yes to a UTF-16 export, which is half NUL bytes and still text', () => {
    // The RRC3's own mDACS text file and Excel's "Unicode Text" are both this shape. An
    // earlier rule keyed on the byte pattern and would have stored a second copy of each.
    const utf16 = new Uint8Array(80);
    const line = 'Time\tAltitude\n0\t0\n';
    for (let i = 0; i < line.length; i++) utf16[i * 2] = line.charCodeAt(i);
    expect(textIsTheFile(decode(utf16, 'utf-16le'))).toBe(true);
  });

  it('says no to a raw download, whose text is what the decoder made of it', () => {
    // A .NET stream header and a run of record bytes: the decoder replaces what it cannot
    // read, and there is no way back from that to the file.
    const raw = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x81, 0x0b, 0x00, 0xdc, 0x03, 0x99, 0x7f]);
    const text = decode(raw);
    expect(text, 'the decode really lost something').toContain('�');
    expect(textIsTheFile(text)).toBe(false);
  });

  it('says yes to an AltOS raw download, because that one really is text', () => {
    // Not every raw download needs its bytes kept: an .eeprom is a JSON header and lines of
    // hex, so it round-trips through the logbook exactly like a CSV. The rule is about what
    // survives, not about which files came off a card.
    expect(textIsTheFile('{\n\t"log_format": 1\n}\n46 e9 7c 9e 3a 20 03 00\n')).toBe(true);
  });
});
