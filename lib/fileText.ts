import { decodeBytes } from './encoding';
import { toCsv } from './csv';
import { looksLikeXlsx, xlsxToRows } from './parsers/xlsx';
import { looksLikeOrk, orkToXml } from './parsers/openrocket';

// Turn a dropped file's raw bytes into the text the importer reads.
// An .xlsx workbook is unzipped in the browser and its first sheet flattened to
// CSV, so a spreadsheet drops in like any logger export; an OpenRocket .ork is
// unzipped to the design XML inside it; every other file is decoded from its bytes
// with the encoding sniffed (UTF-8 / UTF-16). Async only because inflating a ZIP
// member is — which is the whole reason this step exists ahead of the parsers,
// since `Parser.parse` is synchronous.
export async function fileToText(name: string, bytes: Uint8Array): Promise<string> {
  if (looksLikeXlsx(name, bytes)) return toCsv(await xlsxToRows(bytes));
  if (looksLikeOrk(name, bytes)) return orkToXml(bytes);
  return decodeBytes(bytes);
}

/**
 * Can this file be REOPENED from that text?
 *
 * The logbook stores a flight as text and re-parses it on every reopen, which works exactly
 * as long as the text is enough to get the flight back. For a raw binary download it is not:
 * the decoder replaces every byte it can't read with U+FFFD and there is no way back, so a
 * logbook row holding that text reopens as rubbish.
 *
 * An .xlsx is a deliberate NO-op here, and it is worth saying why, because it is the obvious
 * thing to add. Its text is not the workbook — it is the first worksheet flattened to CSV —
 * but that CSV is what the column mapper reads on the way in and on the way back, so the row
 * reopens as the same flight without the workbook. Keeping a second, whole copy of every
 * spreadsheet would cost the quota and buy nothing.
 *
 * So the logbook asks this and keeps the BYTES only for the files that answer no. It is
 * deliberately not "keep bytes for everything": every row already holds a whole file's text,
 * and a second copy of every CSV would halve how many flights fit in the browser's quota.
 */
export function textIsTheFile(text: string): boolean {
  return !text.includes('�');
}
