// The parser registry. importFlight tries every named parser; if one recognises
// the file with enough confidence it returns a finished flight. Otherwise it
// falls back to the generic path: an analysed table plus a best-guess column
// mapping for the user to confirm. Adding a logger = adding one module here.

import { ParseGuidanceError, type FileInput, type ParseInput, type Parser } from './types';
import type { RawFlight } from '../flight/types';
import { decodeBytes } from '../encoding';
import { parseTable } from '../csv';
import { analyzeTable, type AnalyzedTable } from '../flight/columns';
import type { ColumnMapping } from '../flight/build';
import { altusMetrumParser } from './altusmetrum';
import { altosEepromParser } from './altosEeprom';
import { perfectFliteParser } from './perfectflite';
import { eggtimerParser } from './eggtimer';
import { blueRavenParser } from './blueraven';
import { featherweightFipParser } from './featherweightFip';
import { entacoreAimParser } from './entacoreAim';
import { featherweightGpsParser, featherweightGpsGroundStationParser } from './featherweightGps';
import { altimeterCloudParser } from './altimeterCloud';
import { missileworksRrc3Parser } from './missileworksRrc3';
import { deviceSummaryParser } from './deviceSummary';

export type { FileInput, ParseInput, Parser } from './types';
export { ParseGuidanceError } from './types';

export const PARSERS: Parser[] = [
  altusMetrumParser,
  altosEepromParser,
  perfectFliteParser,
  eggtimerParser,
  blueRavenParser,
  featherweightFipParser,
  entacoreAimParser,
  featherweightGpsParser,
  featherweightGpsGroundStationParser,
  missileworksRrc3Parser,
  altimeterCloudParser,
  // Not a flight at all — a device's key,value summary export. Registered so it is
  // recognised and explained rather than dropped into the column mapper.
  deviceSummaryParser,
];

const AUTO_THRESHOLD = 0.6;

/**
 * Fill in whichever half of the file the caller didn't have, so every parser is handed
 * the whole thing — the bytes AND the decoded text — rather than a shape that varies by
 * call site. This is the single place either one is derived.
 *
 * Bytes are encoded from text through a getter, not up front: a text import that no
 * binary parser ever looks at (which is nearly all of them, and some are tens of MB)
 * should not pay for a second copy of the file. The re-encode is UTF-8, so it round-trips
 * a file that really was text and is only ever a fallback for a caller — the share link, a
 * logbook row saved before the logbook kept bytes — that has nothing better.
 */
function wholeFile(raw: FileInput): ParseInput {
  // Strip a UTF-8 BOM (common on Windows exports) so the first header cell and
  // delimiter detection aren't thrown off. `decodeBytes` already does this for the
  // bytes path, including the double-encoded form the RRC3 mDACS export writes.
  const text = raw.text !== undefined ? raw.text.replace(/^﻿/, '') : decodeBytes(raw.bytes as Uint8Array);
  if (raw.bytes) return { name: raw.name, text, bytes: raw.bytes };
  let encoded: Uint8Array | null = null;
  const input = { name: raw.name, text };
  Object.defineProperty(input, 'bytes', {
    get: () => (encoded ??= new TextEncoder().encode(text)),
    enumerable: true,
  });
  return input as ParseInput;
}

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

/** The mapping the column mapper opens pre-filled with — every column the table analysis
 *  could name, with the unit it read. Exported so a test can drive the generic path a
 *  flyer sees, rather than a hand-written approximation of it. */
export function suggestMapping(table: AnalyzedTable): ColumnMapping[] {
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
export function importFlight(raw: FileInput, parsers: Parser[] = PARSERS): ImportResult {
  const input = wholeFile(raw);

  let best: { parser: Parser; score: number } | null = null;
  for (const parser of parsers) {
    const score = parser.detect(input);
    if (score > 0 && (!best || score > best.score)) best = { parser, score };
  }

  if (best && best.score >= AUTO_THRESHOLD) {
    try {
      const flight = best.parser.parse(input);
      // A parser can match a file's signature yet still produce nothing usable —
      // a truncated capture, or a firmware variant it didn't expect. Treat an
      // empty result like a parse failure and fall through to the generic mapper.
      if (flight.time.length >= 2 && flight.channels.length > 0) {
        return { kind: 'flight', flight, parser: best.parser, confidence: best.score };
      }
    } catch (err) {
      // A deliberate, user-facing message (e.g. "this is the high-rate file —
      // upload the low-rate one") must reach the user, not be hidden behind a
      // mapper. Any other (unexpected) failure falls through to the mapper so a
      // recognised-but-unreadable file can still be salvaged by hand.
      if (err instanceof ParseGuidanceError) throw err;
    }
  }

  const { rows } = parseTable(input.text);
  const table = analyzeTable(rows);
  return { kind: 'mapping', table, suggested: suggestMapping(table) };
}
