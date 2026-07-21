import { describe, it, expect } from 'vitest';
import { zip } from './zip';

// A tiny independent ZIP reader — parses the central directory and inflates each
// member with the browser's DecompressionStream — so the round-trip checks the
// bytes the writer actually emits, not a shared helper. Mirrors the reader in
// lib/parsers/xlsx.ts but stands alone for the test.
async function unzip(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');

  const count = u16(eocd + 8);
  const dec = new TextDecoder('utf-8');
  const out = new Map<string, Uint8Array>();
  let p = u32(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error('bad central header');
    const method = u16(p + 10);
    const compSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const lho = u32(p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (u32(lho) !== 0x04034b50) throw new Error('bad local header');
    const lNameLen = u16(lho + 26);
    const lExtraLen = u16(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(start, start + compSize);

    let raw: Uint8Array;
    if (method === 0) {
      raw = comp.slice();
    } else {
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      w.write(comp as Uint8Array<ArrayBuffer>);
      w.close();
      raw = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }
    out.set(name, raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe('zip', () => {
  it('round-trips text and binary entries', async () => {
    const binary = new Uint8Array(1000);
    for (let i = 0; i < binary.length; i++) binary[i] = (i * 37) & 0xff;

    const blob = await zip([
      { name: 'report/summary.md', data: '# Debrief\n\nApogee: 1234 m\n' },
      { name: 'data.csv', data: 'time,alt\n0,0\n1,10\n' },
      { name: 'raw.bin', data: binary },
    ]);

    expect(blob.type).toBe('application/zip');
    const entries = await unzip(blob);
    expect([...entries.keys()]).toEqual(['report/summary.md', 'data.csv', 'raw.bin']);

    const dec = new TextDecoder();
    expect(dec.decode(entries.get('report/summary.md')!)).toBe('# Debrief\n\nApogee: 1234 m\n');
    expect(dec.decode(entries.get('data.csv')!)).toBe('time,alt\n0,0\n1,10\n');
    expect(entries.get('raw.bin')!).toEqual(binary);
  });

  it('preserves UTF-8 filenames and content', async () => {
    const blob = await zip([{ name: 'résumé-µ.txt', data: 'åpogee ≈ 1 km — π' }]);
    const entries = await unzip(blob);
    expect(new TextDecoder().decode(entries.get('résumé-µ.txt')!)).toBe('åpogee ≈ 1 km — π');
  });

  it('compresses repetitive data below its raw size', async () => {
    const repetitive = 'A'.repeat(5000);
    const blob = await zip([{ name: 'a.txt', data: repetitive }]);
    // 5000 identical bytes deflate to a tiny fraction; the whole archive (headers
    // included) must still come out well under the raw payload.
    expect(blob.size).toBeLessThan(1000);
    const entries = await unzip(blob);
    expect(new TextDecoder().decode(entries.get('a.txt')!)).toBe(repetitive);
  });

  it('produces an empty but valid archive for no entries', async () => {
    const blob = await zip([]);
    const entries = await unzip(blob);
    expect(entries.size).toBe(0);
  });
});
