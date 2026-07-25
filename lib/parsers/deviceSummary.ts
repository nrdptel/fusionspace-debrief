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
import { isNumeric, parseNumber, parseTable } from '../csv';
import type { ReportedValue } from '../flight/types';
import { flownAtFromText, type FlownAt } from '../flight/flownAt';
import { resolveUnit } from '../units';

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


/** The figures a summary states that line up against something Debrief reads, keyed by the
 *  (normalised) label the file writes. The unit is NOT assumed: a Featherweight summary
 *  writes it into the value ("4034.98 feet", "700.36 feet/sec", "24.1 Gs"), and the app can
 *  be set to metric, so it is parsed from there and converted — a figure whose unit doesn't
 *  resolve is dropped rather than guessed at.
 *
 *  Deliberately small. "Distance at apogee" is downrange, not altitude, and mapping it would
 *  invent a cross-check that contradicts a sound read. */
const SUMMARY_KEYS: Record<string, { metric: ReportedValue['metric']; label: string; quantity: string }> = {
  'max altitude': { metric: 'apogeeAltitude', label: 'Apogee', quantity: 'length' },
  'max velocity': { metric: 'maxVelocity', label: 'Max velocity', quantity: 'speed' },
  'max vertical velocity': { metric: 'maxVelocity', label: 'Max velocity', quantity: 'speed' },
  'max motor burn acceleration': { metric: 'maxAcceleration', label: 'Max acceleration', quantity: 'accel' },
};

/** A stated "4034.98 feet" as canonical SI, or null when the number or the unit isn't
 *  readable — an unconvertible figure is left out, never assumed to be in feet. */
function statedValue(raw: string, quantity: string): number | null {
  const m = /^\s*(-?[\d.,]+)\s*(.*)$/.exec(raw);
  if (!m) return null;
  const n = parseNumber(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = resolveUnit(m[2].replace(/[()]/g, '').trim());
  if (!unit || unit.quantity !== quantity) return null;
  return unit.toCanonical(n);
}

/** What a dropped device-summary file contributes to the flight it belongs to: the device's
 *  own headline figures (for the side-by-side cross-check, never merged into Debrief's read)
 *  and the launch date it states. Returns null when the text isn't a summary at all. */
export function summaryFigures(text: string): { rocket: string; reported: ReportedValue[]; flownAt?: FlownAt } | null {
  const summary = readSummary(text);
  if (!summary) return null;
  const reported: ReportedValue[] = [];
  const seen = new Set<string>();
  for (const [key, value] of summary.rows) {
    const def = SUMMARY_KEYS[norm(key)];
    if (!def || seen.has(def.metric)) continue;
    const si = statedValue(value, def.quantity);
    if (si == null) continue;
    seen.add(def.metric);
    reported.push({ metric: def.metric, label: def.label, value: si, source: 'device' });
  }
  // The launch date, where the summary states one. A GPS summary writes an explicit UTC
  // stamp; a Blue Raven writes its own clock as a separate date and time of day.
  const row = (k: string) => summary.rows.find(([key]) => norm(key) === k)?.[1] ?? '';
  const utc = row('launch time utc');
  let flownAt = utc ? flownAtFromText(utc, 'UTC') : null;
  if (!flownAt) {
    const local = row('launch time local time zone');
    if (local) flownAt = flownAtFromText(local, 'logger');
  }
  return { rocket: summary.rocket ?? 'this device', reported, ...(flownAt ? { flownAt } : {}) };
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
