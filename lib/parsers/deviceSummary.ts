// A device *summary* file: the headline figures an altimeter's app writes out
// beside the flight record, as key,value rows with no time series at all.
// Featherweight's Interface Program exports one next to every Blue Raven and GPS
// log ("Rocket Name,…" / "Max Altitude,6295.75 feet" / …).
//
// There is no flight in such a file, so it can't become one — but it must not
// fall to the generic column mapper either, which offers the flyer a table with
// nothing to map and no way forward. Recognise it, read back the figures it
// carries so they can see the drop worked, and point them at the file that holds
// the record. Those same figures are what the cross-check compares Debrief's own
// read against, so a flyer who drops the pair gets them either way.

import { ParseGuidanceError, type Parser, type ParseInput } from './types';
import { isNumeric, parseTable } from '../csv';

/** Summary keys worth quoting back, in the order they read best. Matched on a
 *  normalised key, so "Max Altitude" and "Max altitude" are the same row. */
const HEADLINE = [
  'max altitude',
  'max velocity',
  'max vertical velocity',
  'max motor burn acceleration',
  'tilt angle at burnout',
  'pad altitude asl',
  'pad altitude',
  'launch date',
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Summary {
  rocket: string | null;
  rows: [string, string][];
}

/** Read a two-column key,value summary — or null if the file isn't one. */
function readSummary(text: string): Summary | null {
  const { rows } = parseTable(text, ',');
  const pairs: [string, string][] = [];
  let looked = 0;
  for (const row of rows) {
    const filled = row.filter((c) => c !== '');
    if (filled.length === 0) continue;
    looked++;
    // A summary row is a label followed by its value — or by a small vector, since a
    // Blue Raven states its pad attitude and accelerometer offsets per body axis
    // ("Gravity direction on pad,0.0084,-0.0102,-0.9999"). A flight's data rows lead
    // with a number (the timestamp), so they never read as one of these.
    if (filled.length < 2 || filled.length > 5 || isNumeric(filled[0])) continue;
    pairs.push([filled[0], filled.slice(1).join(', ')]);
  }
  // Nearly every line must be a key/value pair — a real log's data rows are wider,
  // so a flight file never looks like this — and there must be a few of them.
  if (looked < 4 || pairs.length < 4 || pairs.length / looked < 0.9) return null;
  const rocket = pairs.find(([k]) => norm(k) === 'rocket name')?.[1] ?? null;
  // Anchored on the label a Featherweight summary always opens with, plus at least
  // one headline figure — so a stray two-column CSV isn't claimed as a summary.
  if (rocket === null) return null;
  if (!pairs.some(([k]) => HEADLINE.includes(norm(k)))) return null;
  return { rocket, rows: pairs };
}

export const deviceSummaryParser: Parser = {
  id: 'device-summary',
  label: 'Device summary',

  detect(input: ParseInput): number {
    return readSummary(input.text) ? 0.95 : 0;
  },

  parse(input: ParseInput): never {
    const summary = readSummary(input.text);
    if (!summary) throw new Error('This doesn’t look like a device summary file.');
    const quoted = HEADLINE.map((key) => summary.rows.find(([k]) => norm(k) === key))
      .filter((r): r is [string, string] => !!r)
      .map(([k, v]) => `${k}: ${v}`);
    throw new ParseGuidanceError(
      `This is the summary file for “${summary.rocket}” — the device's own headline figures (${quoted.join('; ')}), not the flight record. ` +
        'Drop the log file saved alongside it (for a Blue Raven, the low-rate file) and Debrief will read the flight, then show these figures beside its own independent read as a cross-check.',
    );
  },
};
