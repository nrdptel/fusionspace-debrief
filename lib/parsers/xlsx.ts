// Read the first worksheet of an .xlsx workbook into a plain table of cell text,
// so a spreadsheet a flyer already keeps their data in drops straight into the
// column mapper like any CSV. Clean-room from the published specs — the ZIP
// container (PKWARE APPNOTE.TXT) and SpreadsheetML (ECMA-376 / ISO/IEC 29500) —
// with no third-party library: the ZIP entries are inflated by the browser's own
// DecompressionStream, and the XML is read with small purpose-built scanners
// rather than a DOM. Everything runs in the browser; nothing is uploaded.
//
// Deliberately minimal: the first sheet, shared and inline strings, numbers and
// booleans. That is what an altimeter export or a hand-kept data sheet contains.
// Anything it cannot read throws a helpful, user-facing message so the file falls
// back gracefully instead of failing silently.

import { ParseGuidanceError } from './types';

/** An .xlsx is a ZIP, which begins with the local-file-header magic "PK\x03\x04". */
export function looksLikeXlsx(name: string, bytes: Uint8Array): boolean {
  const zip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return zip && /\.xlsx$/i.test(name);
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function u16(v: DataView, o: number): number {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number): number {
  return v.getUint32(o, true);
}

/** Parse a ZIP's central directory into a name → entry map. Sizes are read from
 *  the central directory (always authoritative), not the local headers, which may
 *  be zeroed when a streaming writer uses a trailing data descriptor. */
function readCentralDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
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
  if (eocd < 0) throw new ParseGuidanceError('This .xlsx file is not a readable ZIP archive (no directory found). It may be corrupt.');

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16); // central directory offset
  const entries = new Map<string, ZipEntry>();
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
async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = entry.localHeaderOffset;
  if (u32(view, o) !== 0x04034b50) throw new ParseGuidanceError('This .xlsx file is damaged (a member could not be located).');
  const nameLen = u16(view, o + 26);
  const extraLen = u16(view, o + 28);
  const start = o + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.slice(); // stored, no compression
  if (entry.method === 8) return inflateRaw(data); // DEFLATE
  throw new ParseGuidanceError('This .xlsx uses an unsupported compression method. Re-save it from your spreadsheet app and try again.');
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return XML_ENTITIES[code] ?? m;
  });
}

/** Concatenate the text of every <t> run inside an XML fragment (a shared-string
 *  <si> or an inline-string <is> can hold several runs across formatting). */
function textRuns(fragment: string): string {
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1] ? decodeXml(m[1]) : '';
  return out;
}

/** The shared string table: <sst><si>…</si><si>…</si></sst>, indexed by position. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ? textRuns(m[1]) : '');
  return out;
}

/** Column letters ("A", "AB") from a cell ref → zero-based index. */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? '';
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const attr = (tag: string, name: string): string | null => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

/** Read a worksheet's rows into dense arrays of cell text, resolving shared strings. */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const inner = rm[2] ?? '';
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    let auto = 0; // fallback column when a cell carries no r="" reference
    while ((cm = cellRe.exec(inner))) {
      const tag = cm[1] ?? cm[3] ?? '';
      const body = cm[2] ?? '';
      const ref = attr(tag, 'r');
      const col = ref ? colIndex(ref) : auto;
      auto = col + 1;
      const type = attr(tag, 't');
      let value = '';
      if (type === 's') {
        const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
        value = shared[parseInt(v, 10)] ?? '';
      } else if (type === 'inlineStr') {
        value = textRuns(body);
      } else {
        const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        value = v != null ? decodeXml(v) : '';
      }
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Resolve the first worksheet's part name from the workbook, falling back to the
 *  conventional xl/worksheets/sheet1.xml when the relationships can't be followed. */
function firstSheetPath(entries: Map<string, ZipEntry>, workbookXml: string | null, relsXml: string | null): string {
  if (workbookXml && relsXml) {
    const rid = attr(workbookXml.match(/<sheet\b[^>]*>/)?.[0] ?? '', 'r:id');
    if (rid) {
      const rel = relsXml.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`))?.[0];
      const target = rel ? attr(rel, 'Target') : null;
      if (target) {
        const path = target.replace(/^\//, '').replace(/^(\.\.\/)?/, 'xl/');
        if (entries.has(path)) return path;
        if (entries.has(target.replace(/^\//, ''))) return target.replace(/^\//, '');
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

/** Read the first worksheet of an .xlsx workbook into a table of cell strings. */
export async function xlsxToRows(bytes: Uint8Array): Promise<string[][]> {
  const entries = readCentralDirectory(bytes);
  const textOf = async (name: string): Promise<string | null> => {
    const e = entries.get(name);
    if (!e) return null;
    return new TextDecoder('utf-8').decode(await readEntry(bytes, e));
  };

  const workbookXml = await textOf('xl/workbook.xml');
  const relsXml = await textOf('xl/_rels/workbook.xml.rels');
  const sheetPath = firstSheetPath(entries, workbookXml, relsXml);
  const sheetXml = await textOf(sheetPath);
  if (!sheetXml) throw new ParseGuidanceError('This .xlsx has no readable worksheet. Save the sheet with your data as the first tab and try again.');

  const sharedXml = await textOf('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const rows = parseSheet(sheetXml, shared);

  // Trim trailing all-empty rows the spreadsheet may pad with.
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  if (rows.length < 2) throw new ParseGuidanceError('This spreadsheet’s first sheet has no tabular data to read. Check the data is on the first tab.');
  return rows;
}
