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
 *  invent a cross-check that contradicts a sound read — and the horizontal velocities a GPS
 *  summary states are not the vertical speeds Debrief reads, so they stay out for the same
 *  reason.
 *
 *  `magnitude` marks a figure the device writes SIGNED, downward-negative: it states a main
 *  descent as "-29.0" where Debrief's main descent rate is a downward speed. Compared as
 *  magnitudes, the same way the AltimeterCloud key already is (lib/flight/reported.ts). */
const SUMMARY_KEYS: Record<
  string,
  { metric: ReportedValue['metric']; label: string; quantity: string; magnitude?: true }
> = {
  'max altitude': { metric: 'apogeeAltitude', label: 'Apogee', quantity: 'length' },
  'max velocity': { metric: 'maxVelocity', label: 'Max velocity', quantity: 'speed' },
  'max vertical velocity': { metric: 'maxVelocity', label: 'Max velocity', quantity: 'speed' },
  'max motor burn acceleration': { metric: 'maxAcceleration', label: 'Max acceleration', quantity: 'accel' },
  // The two descent rates. These are the numbers a flyer sizes a parachute against and shows
  // an RSO, and on a record that stops before the ground they are the ONLY ones there are —
  // the corpus Blue Raven `jan18` stops 250 m up, above where its own summary says the main
  // fired, so Debrief has no main leg to read and the device's figure is all the flight has.
  'drogue descent rate': { metric: 'drogueDescentRate', label: 'Drogue descent', quantity: 'speed', magnitude: true },
  'main chute descent rate': { metric: 'mainDescentRate', label: 'Main descent', quantity: 'speed', magnitude: true },
  // The deployment shocks. Debrief measures these itself wherever the logger recorded
  // acceleration — `peakAccel` on the apogee and main events, on 16 of the 32 corpus flights
  // that analyse end to end — and a Blue Raven states them for every flight, including the ones
  // whose log carries no accelerometer at all. Both channels' figures, side by side, is exactly
  // what this panel is for.
  //
  // `Max landing accel` is deliberately NOT here, and it is the row a careless reading would
  // take. It is the ground impact — 280.0 Gs on the corpus jan18 — not a flight load, and there
  // is nothing in Debrief it lines up against. Publishing it beside the deployment shocks would
  // put a landing among the flight's loads.
  'apo channel max accel': { metric: 'apogeeShock', label: 'Apogee deployment shock', quantity: 'accel' },
  'main channel max accel': { metric: 'mainShock', label: 'Main deployment shock', quantity: 'accel' },
};

/** How a stated figure read: its SI value, or which way it failed. The caller needs the
 *  difference, because a unit that doesn't match the quantity is a fact about the FILE worth
 *  telling the flyer, while a row that isn't a number at all is just a row. */
type Stated =
  | { ok: true; si: number }
  | { ok: false; why: 'not-a-number' }
  | { ok: false; why: 'wrong-quantity'; unit: string }
  | { ok: false; why: 'zero' };

/** A stated "4034.98 feet" as canonical SI — never assumed to be in feet. The unit is read
 *  from the value, as a Featherweight summary writes it ("700.36 feet/sec", "24.1 Gs"), and a
 *  figure whose unit names a different quantity than the metric is is left out rather than
 *  guessed at. A stated ZERO is left out too: a device that fills a row it has no measurement
 *  for writes 0.0, and "your main came down at 0 ft/s" under a device label is a wrong claim,
 *  not a missing one. Both corpus Blue Ravens show it — one states 0.0 for every deployment
 *  figure it has. */
function statedValue(raw: string, quantity: string, magnitude?: true): Stated {
  const m = /^\s*(-?[\d.,]+)\s*(.*)$/.exec(raw);
  if (!m) return { ok: false, why: 'not-a-number' };
  const n = parseNumber(m[1]);
  if (!Number.isFinite(n)) return { ok: false, why: 'not-a-number' };
  // Zero first, and deliberately BEFORE the unit is looked at. A row the device has no
  // measurement for carries no measurement whatever unit it is written in, and complaining
  // about the unit of a 0.0 is noise: the corpus Blue Raven `lemiv-l3` writes
  // `Main chute descent rate,0.0 feet` — both wrong at once, and only the zero matters.
  // Zero in any unit is zero, so this needs no conversion.
  if (n === 0) return { ok: false, why: 'zero' };
  const unitText = m[2].replace(/[()]/g, '').trim();
  const unit = resolveUnit(unitText);
  if (!unit) return { ok: false, why: 'not-a-number' };
  if (unit.quantity !== quantity) return { ok: false, why: 'wrong-quantity', unit: unitText };
  const si = unit.toCanonical(n);
  return { ok: true, si: magnitude ? Math.abs(si) : si };
}

/** What a dropped device-summary file contributes to the flight it belongs to: the device's
 *  own headline figures (for the side-by-side cross-check, never merged into Debrief's read),
 *  the launch date it states, and a note for anything it stated that could not be used.
 *  Returns null when the text isn't a summary at all. */
export function summaryFigures(
  text: string,
): { rocket: string; reported: ReportedValue[]; notes: string[]; flownAt?: FlownAt } | null {
  const summary = readSummary(text);
  if (!summary) return null;
  const reported: ReportedValue[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of summary.rows) {
    const def = SUMMARY_KEYS[norm(key)];
    if (!def || seen.has(def.metric)) continue;
    const stated = statedValue(value, def.quantity, def.magnitude);
    if (!stated.ok) {
      // A figure withheld because of the FILE says why, rather than vanishing. This is not
      // hypothetical: the corpus Blue Raven writes `Main chute descent rate,-29.0 feet` —
      // a rate with a length for a unit — and that row is the main descent speed, the one
      // number a flyer sizes a canopy against. Debrief will not decide the device meant
      // feet per second; it hands the flyer what the file actually says.
      if (stated.why === 'wrong-quantity') {
        notes.push(
          `The device summary states “${key.trim()}: ${value.trim()}”, but “${stated.unit}” is not a ${def.quantity}, so this figure is left out of the cross-check rather than guessed at. Read it against your device's own documentation.`,
        );
      }
      continue;
    }
    seen.add(def.metric);
    reported.push({ metric: def.metric, label: def.label, value: stated.si, source: 'device' });
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
  return { rocket: summary.rocket ?? 'this device', reported, notes, ...(flownAt ? { flownAt } : {}) };
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
