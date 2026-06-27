// A small, dependency-free delimited-text reader. Altimeter exports are rarely
// pristine RFC-4180 CSV — they come tab-, comma-, or semicolon-separated, with
// comment/preamble lines, occasional quoted fields, and trailing junk — so this
// is deliberately forgiving.

export interface ParsedTable {
  delimiter: string;
  rows: string[][];
}

const DELIMITERS = [',', '\t', ';', '|'];

/** Guess the delimiter by which one yields the most consistent column count. */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
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
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    rows.push(splitLine(line, d));
  }
  return { delimiter: d, rows };
}

/** Is a cell a finite number? Tolerates surrounding whitespace and a leading +. */
export function isNumeric(cell: string): boolean {
  if (cell === '') return false;
  const v = Number(cell);
  return Number.isFinite(v);
}

// --- Writing ---------------------------------------------------------------

/** Quote a cell only when it needs it (a comma, quote or newline), doubling any
 *  embedded quotes — enough to keep grouped numbers like "1,234 ft" intact. */
export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Join a grid of string cells into CSV text, quoting each cell as needed. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
