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
import { decodeXml, looksLikeZip, readCentralDirectory, readMember, tagAttr, type ZipContext, type ZipMember } from '../zipRead';

/** An .xlsx is a ZIP, which begins with the local-file-header magic "PK\x03\x04". */
export function looksLikeXlsx(name: string, bytes: Uint8Array): boolean {
  return looksLikeZip(bytes) && /\.xlsx$/i.test(name);
}

/** Every container failure this reader can hit is a user-facing one. */
const fail = (message: string): never => {
  throw new ParseGuidanceError(message);
};

/** What the shared ZIP reader needs to speak about an .xlsx in the flyer's terms. */
const ZIP: ZipContext = {
  what: '.xlsx',
  resaveAdvice: 'Re-save it from your spreadsheet app and try again.',
  fail: (message) => {
    throw new ParseGuidanceError(message);
  },
};

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

const attr = tagAttr;

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
function firstSheetPath(entries: Map<string, ZipMember>, workbookXml: string | null, relsXml: string | null): string {
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
  const entries = readCentralDirectory(bytes, ZIP);
  const textOf = async (name: string): Promise<string | null> => {
    const e = entries.get(name);
    if (!e) return null;
    return new TextDecoder('utf-8').decode(await readMember(bytes, e, ZIP));
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
