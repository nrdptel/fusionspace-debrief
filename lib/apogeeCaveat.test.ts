import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';
import { apogeeSub, apogeeCaveat, apogeeIsQualified } from './readings';
import { summaryText, summaryMarkdown, summaryHtml, analysisJson, reportTable, compareMetricRows, compareMarkdown, compareHtml, compareHasUnprovenApogee } from './report';
import { flightCardStats } from './flightCard';
import type { FlightMetrics } from './analyze/types';

const CORPUS = path.join(__dirname, 'parsers', '__corpus__');
/** The one corpus flight whose altitude channel Debrief disowns: it reads 31 ft, while a second
 *  altimeter in the same airframe recorded 2,115 m. */
const UNPROVEN_FIXTURE = path.join(
  CORPUS,
  'blueraven',
  'blueraven__issuiuc-sg1.2-20231118__SG1.2-Sustainer-November-BlueRaven-Low.txt',
);
const has = existsSync(UNPROVEN_FIXTURE);

/** The clause a flyer must not lose, in the words `lib/readings.ts` owns. */
const UNPROVEN_TEXT = 'too slow to be a flight';

describe('an apogee Debrief does not trust says so wherever it goes', () => {
  const base = { altitudeUnproven: false, apogeeIsFloor: false, timeToApogee: 12.3 } as unknown as FlightMetrics;

  it('carries the caveats alone, without the time the tables print as their own row', () => {
    const m = { ...base, altitudeUnproven: true } as FlightMetrics;
    expect(apogeeCaveat(m)).toContain(UNPROVEN_TEXT);
    expect(apogeeCaveat(m), 'no "N s to apogee" — the table has a row for that').not.toMatch(/to apogee/);
    // …while the TILE still leads with the caveat and keeps the time.
    expect(apogeeSub(m)).toMatch(/^unproven/);
    expect(apogeeSub(m)).toMatch(/to apogee/);
  });

  it('says nothing at all about an apogee it does trust', () => {
    expect(apogeeCaveat(base)).toBeUndefined();
    expect(apogeeIsQualified(base)).toBe(false);
  });

  it('names both when a record is unproven AND ends at its own peak', () => {
    const m = { ...base, altitudeUnproven: true, apogeeIsFloor: true } as FlightMetrics;
    const c = apogeeCaveat(m)!;
    expect(c).toContain(UNPROVEN_TEXT);
    expect(c).toContain('at least this high');
    expect(apogeeIsQualified(m)).toBe(true);
  });

  it('withholds a comparison crown for an unproven apogee, not only for a floor', () => {
    expect(apogeeIsQualified({ ...base, altitudeUnproven: true } as FlightMetrics)).toBe(true);
    expect(apogeeIsQualified({ ...base, apogeeIsFloor: true } as FlightMetrics)).toBe(true);
  });
});

describe.skipIf(!has)('the artifact that leaves the device carries it too', () => {
  const read = () => {
    const r = importFlight({ name: path.basename(UNPROVEN_FIXTURE), text: readFileSync(UNPROVEN_FIXTURE, 'utf8') });
    if (r.kind !== 'flight') throw new Error('the unproven fixture did not parse as a flight');
    return { flight: r.flight, analysis: analyzeFlight(r.flight) };
  };

  it('the fixture really is in the state this test exists for', () => {
    const { analysis } = read();
    // If either of these flips, this whole file is testing nothing — say so loudly rather than
    // passing green over a fixture that stopped exhibiting the condition.
    expect(analysis.metrics.altitudeUnproven, 'fixture must be altitudeUnproven').toBe(true);
    expect(analysis.metrics.apogeeIsFloor, 'and NOT apogeeIsFloor — that is the gap that was open').toBe(false);
  });

  /**
   * **This is the assertion that was missing.** `lib/report.ts` gated the apogee caveat on
   * `apogeeIsFloor`, so this flight put "unproven — this record's climb is too slow to be a
   * flight" on the metric tile and printed a bare "31 ft" into every artifact a flyer keeps: the
   * .txt and .md a cert package is built from, the clipboard table, the JSON, and the share card
   * that travels furthest from the report explaining it. Holding the surfaces side by side is the
   * only shape that catches a caveat present on one and absent on another.
   */
  it('the caveat rides WITH the apogee, on every artifact', () => {
    const { flight, analysis } = read();
    const sys = 'imperial' as const;

    // **The assertion is "beside the value", not "somewhere in the document", and the difference
    // is the whole point.** The .txt/.md/.html already carried a separate warning that the record
    // does not describe a rocket flight — so a document-wide search passes on those three even
    // with the defect fully restored, and only the clipboard table, the JSON and the share card
    // look bare. That would be an assert that mostly cannot fail. A caveat has to travel attached
    // to the number, because the number is what gets quoted out of the document.
    const nearApogee = (blob: string): string => {
      const i = blob.search(/apogee/i);
      return i < 0 ? '' : blob.slice(i, i + 220);
    };
    // The tile is not in this list: it IS the sub, with no "Apogee" label to sit beside, and
    // `apogeeSub` leading with the caveat is asserted directly in the unit block above.
    const artifacts: [string, string][] = [
      ['.txt', summaryText(flight, analysis, sys)],
      ['.md', summaryMarkdown(flight, analysis, sys)],
      ['.html', summaryHtml(flight, analysis, sys)],
      ['table', JSON.stringify(reportTable(analysis, sys))],
      ['card', JSON.stringify(flightCardStats(analysis.metrics, sys))],
    ];
    const missing = artifacts.filter(([, blob]) => !/unproven/i.test(nearApogee(blob)));
    expect(
      missing.map(([name]) => name),
      'these print the apogee with no qualifier attached to it',
    ).toEqual([]);
  });

  it('the JSON carries the flag as DATA, beside the one it always carried', () => {
    const { flight, analysis } = read();
    // `analysisJson` returns the serialized document, not an object.
    const j = JSON.parse(analysisJson(flight, analysis, 'imperial')) as Record<string, Record<string, unknown>>;
    const m = (j.metrics ?? j) as Record<string, unknown>;
    expect(Object.keys(m)).toContain('altitudeUnproven');
    expect(m.altitudeUnproven).toBe(true);
    // Its long-standing sibling, to show the two now travel together.
    expect(Object.keys(m)).toContain('apogeeIsFloor');
  });

  it('a comparison tags the cell and withholds the "highest" crown', () => {
    const { analysis } = read();
    // **The two flights must have DIFFERENT apogees, and a first version of this test did not
    // give them one.** `compareMetricRows` zeroes the crown on a TIE regardless of `rankBlocked`
    // (`if (finite < 2 || ties !== 1) best = -1`), so building both from one metrics object made
    // the crown assertion pass identically under the old `anyFloor` gate — the widening it exists
    // to guard was completely unpinned. Caught by the pre-push review, which proved it by
    // simulating the old gate and watching the test stay green.
    const higher = { ...analysis.metrics, apogeeAltitude: 2115, altitudeUnproven: false };
    const rows = compareMetricRows(
      [
        { id: 'a', name: 'unproven', formatLabel: 'Blue Raven', metrics: analysis.metrics },
        { id: 'b', name: 'sibling', formatLabel: 'Blue Raven', metrics: higher },
      ] as unknown as Parameters<typeof compareMetricRows>[0],
      'imperial',
    );
    const apogee = rows.find((r) => r.label === 'Apogee');
    expect(apogee, 'the comparison has an Apogee row').toBeTruthy();
    expect(JSON.stringify(apogee), 'the disowned cell is tagged').toContain('(unproven)');
    // A crown says "this one went highest". It cannot be settled from a set containing a channel
    // Debrief has disowned — and until 2026-08-03 it was withheld only for a FLOOR apogee. Read
    // `best` directly rather than by regex: an index-based match missed a crown at position ≥ 2.
    expect(
      (apogee as unknown as { best: number }).best,
      'no "highest" crown once one flight in the set is disowned',
    ).toBe(-1);
  });

  it('a comparison export explains its own tag', () => {
    // **Every per-cell tag in that table earns a legend line** — the rule is written in
    // `lib/report.ts` beside the predicates. It matters more here than for the other tags:
    // `CompareFlight` carries no `warnings`, so a comparison export has NO document-level text at
    // all, and the parenthetical is the only signal the number is disowned. The first version of
    // this fix shipped the tag with no legend, on the artifact most likely to reach a cert package.
    const { analysis } = read();
    const flights = [
      { id: 'a', name: 'unproven', formatLabel: 'Blue Raven', metrics: analysis.metrics },
      { id: 'b', name: 'sibling', formatLabel: 'Blue Raven', metrics: { ...analysis.metrics, apogeeAltitude: 2115, altitudeUnproven: false } },
    ] as unknown as Parameters<typeof compareHasUnprovenApogee>[0];
    expect(compareHasUnprovenApogee(flights)).toBe(true);

    const comparison = { flights, name: 'set' } as unknown as Parameters<typeof compareMarkdown>[0];
    for (const [what, blob] of [
      ['markdown', compareMarkdown(comparison, 'imperial')],
      ['html', compareHtml(comparison, 'imperial')],
    ] as [string, string][]) {
      expect(blob, `${what} tags the cell`).toContain('(unproven)');
      expect(blob, `${what} explains the tag`).toMatch(/does not trust that recording/);
    }
  });

  it('…and still crowns a set it CAN settle', () => {
    // The other half, without which the assertion above is satisfied by any bug that suppresses
    // every crown. Two trusted flights, different apogees: the crown is awarded.
    const { analysis } = read();
    const clean = { ...analysis.metrics, altitudeUnproven: false, apogeeIsFloor: false };
    const rows = compareMetricRows(
      [
        { id: 'a', name: 'lower', formatLabel: 'Blue Raven', metrics: { ...clean, apogeeAltitude: 500 } },
        { id: 'b', name: 'higher', formatLabel: 'Blue Raven', metrics: { ...clean, apogeeAltitude: 2115 } },
      ] as unknown as Parameters<typeof compareMetricRows>[0],
      'imperial',
    );
    const apogee = rows.find((r) => r.label === 'Apogee') as unknown as { best: number };
    expect(apogee.best, 'the taller flight is crowned').toBe(1);
  });
});
