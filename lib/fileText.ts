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
