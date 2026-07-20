import { describe, it, expect } from 'vitest';
import { decodeBytes } from './encoding';

const enc8 = (s: string) => new TextEncoder().encode(s);
/** Encode a string as UTF-16 bytes, optionally with a BOM, in the given endianness. */
function enc16(s: string, endian: 'le' | 'be', bom: boolean): Uint8Array {
  const units = [...s].map((ch) => ch.codePointAt(0)!); // test strings stay in the BMP
  const out = new Uint8Array((units.length + (bom ? 1 : 0)) * 2);
  const dv = new DataView(out.buffer);
  let o = 0;
  if (bom) {
    dv.setUint16(o, 0xfeff, endian === 'le');
    o += 2;
  }
  for (const u of units) {
    dv.setUint16(o, u, endian === 'le');
    o += 2;
  }
  return out;
}

const SAMPLE = 'Time\tAltitude\tPressure\n0.00\t0\t1013.2\n0.05\t3\t1012.9\n';

describe('decodeBytes', () => {
  it('reads plain UTF-8 unchanged (the common case)', () => {
    expect(decodeBytes(enc8(SAMPLE))).toBe(SAMPLE);
  });

  it('strips a UTF-8 BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc8(SAMPLE)]);
    expect(decodeBytes(withBom)).toBe(SAMPLE);
  });

  it('decodes UTF-16 LE and BE with a BOM, dropping the mark', () => {
    expect(decodeBytes(enc16(SAMPLE, 'le', true))).toBe(SAMPLE);
    expect(decodeBytes(enc16(SAMPLE, 'be', true))).toBe(SAMPLE);
  });

  it('decodes BOM-less UTF-16 from the NUL pattern', () => {
    expect(decodeBytes(enc16(SAMPLE, 'le', false))).toBe(SAMPLE);
    expect(decodeBytes(enc16(SAMPLE, 'be', false))).toBe(SAMPLE);
  });

  it('keeps non-ASCII UTF-8 intact and never misfires on it', () => {
    const s = 'temp °C, drift 12° from NE — apogee 2,445 m\n';
    expect(decodeBytes(enc8(s))).toBe(s);
  });

  it('drops a UTF-8 BOM that a UTF-16 re-encode carried in as characters', () => {
    // The RRC3 mDACS export is UTF-16LE whose content still starts with a UTF-8 BOM,
    // so the raw decode yields "ï»¿Time…" — that stray mark must not stick to the header.
    const carried = 'ï»¿' + SAMPLE;
    expect(decodeBytes(enc16(carried, 'le', true))).toBe(SAMPLE);
  });

  it('handles an empty or tiny buffer without guessing UTF-16', () => {
    expect(decodeBytes(new Uint8Array([]))).toBe('');
    expect(decodeBytes(enc8('a,b\n'))).toBe('a,b\n');
  });
});
