// Minimal ZIP writer — bundle a flight's report artifacts (summary, tables,
// figures) into one download, entirely in the browser. Clean-room from the
// published ZIP format (PKWARE APPNOTE.TXT): each entry is DEFLATE-compressed by
// the browser's own CompressionStream, framed with its CRC-32 into a local record
// and a central-directory record, closed by an end-of-central-directory record.
// No third-party library; nothing is uploaded.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  // Runtime data is always ArrayBuffer-backed; the cast satisfies the stricter
  // Uint8Array<ArrayBuffer> stream-writer signature in current lib.dom.
  writer.write(bytes as Uint8Array<ArrayBuffer>);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

export interface ZipEntry {
  /** Path within the archive (forward slashes for folders). */
  name: string;
  data: string | Uint8Array;
}

/** Pack entries into a ZIP Blob, each DEFLATE-compressed. */
export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const local: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entries) {
    const raw = (typeof e.data === 'string' ? enc.encode(e.data) : e.data) as Uint8Array<ArrayBuffer>;
    const name = enc.encode(e.name) as Uint8Array<ArrayBuffer>;
    const crc = crc32(raw);
    const comp = await deflateRaw(raw);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // local file header signature
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0x0800, true); // flags: UTF-8 filename
    lh.setUint16(8, 8, true); // method: deflate
    lh.setUint16(12, 0x21, true); // mod date: 1980-01-01 (fixed, so archives are reproducible)
    lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, name.length, true);
    local.push(new Uint8Array(lh.buffer), name, comp);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); // central file header signature
    ch.setUint16(4, 20, true); // version made by
    ch.setUint16(6, 20, true); // version needed
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 8, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, comp.length, true);
    ch.setUint32(24, raw.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true); // offset of local header
    central.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + comp.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
  eocd.setUint16(8, entries.length, true); // entries on this disk
  eocd.setUint16(10, entries.length, true); // total entries
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true); // central directory offset
  return new Blob([...local, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}
