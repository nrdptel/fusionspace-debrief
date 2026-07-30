import { decodeBytes } from './encoding';
import { toCsv } from './csv';
import { looksLikeXlsx, xlsxToRows } from './parsers/xlsx';

// Turn a dropped file's raw bytes into the CSV-shaped text the importer reads.
// An .xlsx workbook is unzipped in the browser and its first sheet flattened to
// CSV, so a spreadsheet drops in like any logger export; every other file is
// decoded from its bytes with the encoding sniffed (UTF-8 / UTF-16). Async only
// because inflating the workbook's ZIP members is.
export async function fileToText(name: string, bytes: Uint8Array): Promise<string> {
  if (looksLikeXlsx(name, bytes)) return toCsv(await xlsxToRows(bytes));
  return decodeBytes(bytes);
}

/**
 * Is that text the WHOLE file, or only a view of it?
 *
 * The logbook stores a flight as text and re-parses it on every reopen, which works
 * exactly as long as the text is the file. For a raw binary download it is not: the
 * decoder replaces every byte it can't read with U+FFFD and there is no way back, so a
 * logbook row holding that text reopens as rubbish. An .xlsx is the same in a different
 * way — the text is one worksheet flattened to CSV, never the workbook.
 *
 * So the logbook asks this, and keeps the BYTES for the files that answer no. It is
 * deliberately not "keep bytes for everything": every row already holds a whole file's
 * text, and a second copy of every CSV would halve how many flights fit in the browser's
 * quota to buy nothing for the formats that round-trip perfectly today.
 */
export function textIsTheFile(name: string, bytes: Uint8Array, text: string): boolean {
  if (looksLikeXlsx(name, bytes)) return false;
  return !text.includes('�');
}
