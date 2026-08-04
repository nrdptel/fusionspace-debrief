// Reading a ZIP container, clean-room from the published format (PKWARE APPNOTE.TXT),
// with no third-party library: members are inflated by the browser's own
// DecompressionStream. Everything runs in the browser; nothing is uploaded.
//
// Two of the files Debrief opens are ZIPs wearing another extension — an .xlsx
// workbook and an OpenRocket .ork design — so this lives here rather than inside
// either parser. It began inside `parsers/xlsx.ts`, which left the .ork reader with a
// choice between importing from a module named for a format it has nothing to do with
// and growing a second copy of the same byte-offset arithmetic. Where two surfaces do
// the same job they share a module rather than a resemblance.
//
// Separate from `lib/zip.ts`, which WRITES the report bundle. Both are ZIP and neither
// needs the other: they share no code, and their `ZipEntry` types describe different
// things — a member to be written (name + data) against one already in an archive
// (method, size, offset). One file exporting both names would have to rename one of
// them, and every call site would then read a little less like what it does.
//
// The user-facing noun and the error channel are both passed in. The messages name the
// file the flyer actually dropped — "This .ork file is not a readable ZIP archive" is
// guidance, while the same sentence about an .xlsx is a bug report about a file they
// never touched — and the caller decides which error type carries it, so this module
// depends on no parser's vocabulary.

export interface ZipMember {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** What a caller needs this reader to know to speak to the flyer in its own terms. */
export interface ZipContext {
  /** The extension as the flyer knows it, e.g. `.xlsx` or `.ork`. */
  what: string;
  /**
   * How to get a good copy, appended to the unsupported-compression message. The one
   * message where a general "re-save it" is worth less than naming the program that
   * wrote the file, and the two callers name different programs — so it is passed in
   * rather than lost in the move to a shared module.
   */
  resaveAdvice?: string;
  /** How this caller reports a container it cannot read. Returns `never`: every call
   *  site throws, and typing it that way means the reader needs no `return` after one. */
  fail: (message: string) => never;
}

/** Every ZIP begins with the local-file-header magic "PK\x03\x04". */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function u16(v: DataView, o: number): number {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number): number {
  return v.getUint32(o, true);
}

/** Parse a ZIP's central directory into a name → member map. Sizes are read from
 *  the central directory (always authoritative), not the local headers, which may
 *  be zeroed when a streaming writer uses a trailing data descriptor.
 *
 *  `what` is the extension as the flyer knows it, e.g. `.xlsx` or `.ork`. */
export function readCentralDirectory(bytes: Uint8Array, ctx: ZipContext): Map<string, ZipMember> {
  const { what, fail } = ctx;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find the End Of Central Directory record (0x06054b50) by scanning back from
  // the end, past the variable-length comment (max 65535 bytes).
  const min = Math.max(0, bytes.length - (22 + 0xffff));
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail(`This ${what} file is not a readable ZIP archive (no directory found). It may be corrupt.`);

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16); // central directory offset
  const entries = new Map<string, ZipMember>();
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < count; i++) {
    if (u32(view, p) !== 0x02014b50) break; // central file header signature
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localHeaderOffset = u32(view, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Runtime data is always ArrayBuffer-backed; the cast satisfies the stricter
  // Uint8Array<ArrayBuffer> stream-writer signature in current lib.dom.
  writer.write(bytes as Uint8Array<ArrayBuffer>);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Extract one archive member's bytes, inflating it if it was DEFLATE-compressed. */
export async function readMember(bytes: Uint8Array, member: ZipMember, ctx: ZipContext): Promise<Uint8Array> {
  const { what, resaveAdvice, fail } = ctx;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = member.localHeaderOffset;
  if (u32(view, o) !== 0x04034b50) fail(`This ${what} file is damaged (a member could not be located).`);
  const nameLen = u16(view, o + 26);
  const extraLen = u16(view, o + 28);
  const start = o + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + member.compressedSize);
  if (member.method === 0) return data.slice(); // stored, no compression
  if (member.method === 8) return inflateRaw(data); // DEFLATE
  return fail(`This ${what} uses an unsupported compression method. ${resaveAdvice ?? 'Re-save it and try again.'}`);
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Read one attribute off an already-isolated start tag, resolving entities in its value.
 *
 *  Here rather than in either reader for the same reason as everything above it: both
 *  scan XML as text and both want this. It decodes where the .xlsx copy it replaced did
 *  not — a strict improvement that changes nothing in practice for that caller, whose
 *  four reads are a cell ref, a cell type, a relationship id and a part path, none of
 *  which can carry an entity. */
export function tagAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

/** Resolve XML character and named entities. Here for the same reason the ZIP reader
 *  is: both containers above hold XML, and both readers scan it as text. */
export function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return XML_ENTITIES[code] ?? m;
  });
}
