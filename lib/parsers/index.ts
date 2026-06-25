// The parser registry. importFlight tries every named parser; if one recognises
// the file with enough confidence it returns a finished flight. Otherwise it
// falls back to the generic path: an analysed table plus a best-guess column
// mapping for the user to confirm. Adding a logger = adding one module here.

import type { ParseInput, Parser } from './types';
import type { RawFlight } from '../flight/types';
import { parseTable } from '../csv';
import { analyzeTable, type AnalyzedTable } from '../flight/columns';
import type { ColumnMapping } from '../flight/build';
import { altusMetrumParser } from './altusmetrum';
import { perfectFliteParser } from './perfectflite';
import { eggtimerParser } from './eggtimer';
import { blueRavenParser } from './blueraven';
import { featherweightFipParser } from './featherweightFip';

export type { ParseInput, Parser } from './types';

export const PARSERS: Parser[] = [
  altusMetrumParser,
  perfectFliteParser,
  eggtimerParser,
  blueRavenParser,
  featherweightFipParser,
];

const AUTO_THRESHOLD = 0.6;

export interface AutoResult {
  kind: 'flight';
  flight: RawFlight;
  parser: Parser;
  confidence: number;
}

export interface MappingResult {
  kind: 'mapping';
  table: AnalyzedTable;
  suggested: ColumnMapping[];
}

export type ImportResult = AutoResult | MappingResult;

function suggestMapping(table: AnalyzedTable): ColumnMapping[] {
  return table.columns
    .filter((c) => c.role !== 'ignore')
    .map((c) => ({
      index: c.index,
      role: c.role,
      unit: c.unit ?? (c.role === 'time' ? 's' : null),
    }));
}

/**
 * Identify and import a flight file. Named formats parse straight through;
 * anything else comes back as a table + suggested mapping for confirmation.
 */
export function importFlight(raw: ParseInput): ImportResult {
  // Strip a UTF-8 BOM (common on Windows exports) so the first header cell and
  // delimiter detection aren't thrown off.
  const input: ParseInput = { name: raw.name, text: raw.text.replace(/^﻿/, '') };

  let best: { parser: Parser; score: number } | null = null;
  for (const parser of PARSERS) {
    const score = parser.detect(input);
    if (score > 0 && (!best || score > best.score)) best = { parser, score };
  }

  if (best && best.score >= AUTO_THRESHOLD) {
    return {
      kind: 'flight',
      flight: best.parser.parse(input),
      parser: best.parser,
      confidence: best.score,
    };
  }

  const { rows } = parseTable(input.text);
  const table = analyzeTable(rows);
  return { kind: 'mapping', table, suggested: suggestMapping(table) };
}
