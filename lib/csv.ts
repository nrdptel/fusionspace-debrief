// A small, dependency-free delimited-text reader. Altimeter exports are rarely
// pristine RFC-4180 CSV — they come tab-, comma-, or semicolon-separated, with
// comment/preamble lines, occasional quoted fields, and trailing junk — so this
// is deliberately forgiving.

export interface ParsedTable {
  delimiter: string;
  rows: string[][];
}

const DELIMITERS = [',', '\t', ';', '|'];

// Split on LF, CRLF, or a lone CR — the last is how a classic-Mac (or some
// oddball firmware) export ends its lines, which a plain /\r?\n/ would miss,
// collapsing the whole file to a single unreadable line.
const LINE_SPLIT = /\r\n|\r|\n/;

// A European decimal written with a comma — "1,5" meaning 1.5. Only meaningful
// when the field delimiter isn't itself a comma (i.e. a semicolon CSV), where it
// would otherwise read as a non-number and leave the column empty.
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;

/** Guess the delimiter by which one yields the most consistent column count. */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(LINE_SPLIT)
    .filter((l) => l.trim().length > 0)
    .slice(0, 50);
  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -Infinity;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const max = Math.max(...counts);
    if (max < 2) continue;
    // Reward many columns; penalise rows whose count differs from the mode.
    const mode = modeOf(counts);
    const consistent = counts.filter((c) => c === mode).length / counts.length;
    const score = mode * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function modeOf(nums: number[]): number {
  const freq = new Map<number, number>();
  let mode = nums[0] ?? 0;
  let modeN = 0;
  for (const n of nums) {
    const c = (freq.get(n) ?? 0) + 1;
    freq.set(n, c);
    if (c > modeN) {
      modeN = c;
      mode = n;
    }
  }
  return mode;
}

/** Split a single line on a delimiter, honouring double-quoted fields. */
export function splitLine(line: string, delimiter: string): string[] {
  // Fast path: with no quote anywhere, there's nothing to honour, so a native
  // split (then trim) gives the identical result far more cheaply than the
  // char-by-char scan — and altimeter CSVs are overwhelmingly unquoted, so this
  // is the hot path when parsing a big log on the main thread.
  if (line.indexOf('"') === -1) {
    const parts = line.split(delimiter);
    for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
    return parts;
  }

  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Parse delimited text into rows of trimmed string cells. */
export function parseTable(text: string, delimiter?: string): ParsedTable {
  const d = delimiter ?? detectDelimiter(text);
  // A semicolon delimiter is the strong signal of a European-locale export, where
  // the decimal point is a comma. Canonicalise those cells (1,5 → 1.5) so the
  // numbers read — and so the mapper preview shows them the way they'll be parsed.
  const decimalComma = d === ';';
  const rows: string[][] = [];
  for (const line of text.split(LINE_SPLIT)) {
    if (line.length === 0) continue;
    const cells = splitLine(line, d);
    if (decimalComma) {
      for (let i = 0; i < cells.length; i++) {
        if (DECIMAL_COMMA.test(cells[i])) cells[i] = cells[i].replace(',', '.');
      }
    }
    rows.push(cells);
  }
  return { delimiter: d, rows };
}

/** Parse a cell to a number, tolerating a trailing unit a logger appends to the
 *  value ("100.5F", "9.1 V", "1013hPa", "540deg/s"). Returns NaN for an empty cell,
 *  or one that isn't a leading number followed only by a non-numeric unit — so a
 *  time-of-day ("16:24:04"), a date ("2023-08-09") or a version isn't read as one. */
export function parseNumber(cell: string): number {
  const t = cell.trim();
  if (t === '') return NaN;
  const v = Number(t);
  if (Number.isFinite(v)) return v;
  const m = t.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*[^\d\s].*$/);
  // Group 1 is the leading number; accept it only when the trailing unit carries no
  // further digit (which would signal a date/time/version, not a value + unit).
  if (m && !/\d/.test(t.slice(m[1].length))) return Number(m[1]);
  return NaN;
}

/** Is a cell a finite number (allowing a trailing unit, per parseNumber)? */
export function isNumeric(cell: string): boolean {
  return Number.isFinite(parseNumber(cell));
}

// --- Writing ---------------------------------------------------------------

// A cell a spreadsheet would run as a formula starts with one of these (or a
// leading tab/CR). Untrusted text reaches an export here — a flight's column
// labels and file name, which can arrive via a shared link — so a value like
// "=HYPERLINK(...)" must not execute when the CSV is opened in Excel/Sheets.
const FORMULA_LEAD = /^[=@\t\r]/;

/** Defang a cell that a spreadsheet would treat as a formula (CWE-1236) by
 *  prefixing a quote, so it's read as text. A real number is left untouched (a
 *  leading +/- there is a sign, not a formula) so the data still round-trips. */
export function formulaGuard(value: string): string {
  if (value === '') return value;
  const c = value[0];
  const risky = FORMULA_LEAD.test(value) || ((c === '+' || c === '-') && !Number.isFinite(Number(value)));
  return risky ? `'${value}` : value;
}

/** Quote a cell only when it needs it (a comma, quote or newline), doubling any
 *  embedded quotes — enough to keep grouped numbers like "1,234 ft" intact —
 *  after defanging any spreadsheet-formula cell. */
export function csvCell(value: string): string {
  const v = formulaGuard(value);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Join a grid of string cells into CSV text, quoting each cell as needed. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
