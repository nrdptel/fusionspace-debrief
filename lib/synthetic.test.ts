import { describe, expect, it } from 'vitest';
import { demoFlight, syntheticFromRows, toMapperCsv, SYNTHETIC_KEY, SYNTHETIC_NOTE } from './synthetic';
import { analyzeTable } from './flight/columns';
import { parseTable } from './csv';
import { buildFlight } from './flight/build';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv } from './report';
import { KEPT_DOCUMENTS, documentsCarryingProse } from './documents';
import { toCanonical, fromCanonical } from './canonical';
import type { RawFlight } from './flight/types';
import type { FlightAnalysis } from './analyze/types';

/** The generated demonstration flight, taken through the real mapper path a dropped file takes. */
function synthetic(): { flight: RawFlight; analysis: FlightAnalysis } {
  const csv = toMapperCsv(demoFlight('the column mapper'));
  const table = analyzeTable(parseTable(csv).rows);
  const mappings = [
    { index: 0, role: 'time' as const, unit: 's' },
    { index: 1, role: 'altitude' as const, unit: 'ft' },
    { index: 2, role: 'velocity' as const, unit: 'ft/s' },
  ];
  const flight = buildFlight({
    source: 'demo-mapper-flight.csv',
    format: 'csv',
    formatLabel: 'Mapped by hand',
    headers: table.headers,
    dataRows: table.dataRows,
    mappings,
    // A note from the parser, so "the marker comes FIRST" is a claim that can be false. Without
    // one, `notes[0]` is the marker whichever order the code appends in, and the assertion below
    // cannot fail — which is the class of assert this repo has been caught writing before.
    notes: ['a note the parser left'],
    ...(table.synthetic ? { synthetic: table.synthetic } : {}),
  });
  return { flight, analysis: analyzeFlight(flight) };
}

describe('a flight Debrief made up', () => {
  it('is a plausible flight, so the demonstration is worth looking at', () => {
    // Not a simulation and never described as one — but a demonstration nobody would believe
    // demonstrates nothing. Every figure here is MEASURED off the generator.
    const f = demoFlight('the column mapper');
    const alt = f.samples.map((s) => s.altitude);
    const apogee = Math.max(...alt);
    const vmax = Math.max(...f.samples.map((s) => s.velocity));

    expect(f.samples.length, '20 Hz for the whole flight').toBe(5144);
    expect(apogee).toBeCloseTo(1666.4, 1);
    expect(vmax).toBeCloseTo(173.1, 1);
    expect(vmax / 340, 'subsonic — Debrief is never asked to claim a Mach number it cannot back')
      .toBeLessThan(0.8);
    expect(alt[0], 'starts on the pad').toBe(0);
    expect(alt[alt.length - 1], 'and ends on the ground').toBe(0);
    // Two descent legs that are obviously different, which is what makes the rates worth reading.
    expect(f.samples.some((s) => s.velocity === -7.5)).toBe(true);
    expect(f.samples.some((s) => s.velocity === -4.2)).toBe(true);
  });

  it('is deterministic, because the file it writes is committed', () => {
    expect(toMapperCsv(demoFlight('x'))).toBe(toMapperCsv(demoFlight('x')));
  });

  it('writes a file the COLUMN MAPPER has to handle, not one a parser claims', () => {
    const csv = toMapperCsv(demoFlight('the column mapper'));
    const table = analyzeTable(parseTable(csv).rows);
    // The header names are ones no vendor signature matches — that is what sends it to the mapper.
    expect(table.headers).toEqual(['Elapsed', 'Height', 'Rate']);
    expect(table.dataRows.length).toBe(5144);
    // …and the marker rode in ahead of the header, where a logger's own summary block goes.
    expect(table.synthetic).toBe(SYNTHETIC_NOTE);
  });

  it('reads the marker by KEY, and returns Debrief’s words rather than the file’s', () => {
    // Matched on the key so a flyer who edits the wording still gets a labelled flight; the
    // sentence returned is always Debrief's so nobody can weaken the claim by editing the file.
    expect(syntheticFromRows([[SYNTHETIC_KEY, 'anything at all']])).toBe(SYNTHETIC_NOTE);
    expect(syntheticFromRows([['synthetic', 'lower case still counts']])).toBe(SYNTHETIC_NOTE);
    expect(syntheticFromRows([['Apogee', '1000']])).toBeNull();
    expect(syntheticFromRows([]), 'an ordinary file says nothing').toBeNull();
  });
});

/**
 * **The asymmetry check `ROADMAP.md`'s D10 asks for, and the honest version of it.**
 *
 * The *done when* wants "a test that enumerates the export surfaces from the same list the
 * exporters are registered in and fails when a synthetic flight reaches one without its label".
 * **There is no such list**: the surface audit run 2026-08-09 found **26 sinks across 6 call
 * sites**, each a separate `download(...)` at its own call site, with `lib/download.ts` the only
 * shared thing — and it takes an already-serialized `Blob`, so it cannot see a flight, let alone a
 * flag on one. Creating that registry and routing every exporter through it is the milestone's real
 * cost, and it is not this slice.
 *
 * So this list lives here, and every entry is either COVERED or exempt WITH A REASON. That is the
 * property worth having in the meantime: a sink cannot be quietly forgotten, because adding one
 * without touching this file leaves it unlisted, and the count assertion at the bottom fails.
 */
describe('a synthetic flight says so wherever it can go', () => {
  const { flight, analysis } = synthetic();

  /** Enumerated from `lib/documents.ts` — the same list the report's download strip renders from,
   *  which is what `ROADMAP.md`'s D10 asks for and what a list kept in this file could never be.
   *  A seventh export gets a button and a check in the same commit, or neither. */
  const CARRIES = documentsCarryingProse().map((d) => ({
    name: `${d.label} (${d.ext})`,
    text: () => d.build(flight, analysis, 'metric'),
  }));

  for (const sink of CARRIES) {
    it(`${sink.name} says the flight is synthetic`, () => {
      expect(sink.text(), `${sink.name} carries a made-up flight without saying so`).toContain(
        'SYNTHETIC',
      );
    });
  }

  it('survives the canonical round trip, so a saved record cannot launder it', () => {
    // The failure this closes is the worst one available here: save the record, mail it, drop it
    // back in, and it reads as a real flight. `toCanonical` writes notes verbatim, which is why
    // the marker is a note and not a field — the audit found four of the five persistence hops
    // silently drop a new optional field on RawFlight.
    const back = fromCanonical(toCanonical(flight));
    expect(back.notes[0]).toBe(SYNTHETIC_NOTE);
  });

  it('puts it FIRST, ahead of whatever the parser wanted to say', () => {
    expect(flight.notes[0]).toBe(SYNTHETIC_NOTE);
    expect(flight.notes, 'and does not displace the parser’s own note').toContain(
      'a note the parser left',
    );
  });

  it('is never counted as a measurement — the label is the flight’s, not the reading’s', () => {
    // A synthetic flight still analyses; what must never happen is a figure from it being
    // presented as a measurement of something. The label rides with the flight, so every surface
    // that shows a number from it also shows the sentence.
    expect(analysis.metrics.apogeeAltitude).toBeGreaterThan(0);
    expect(flight.notes.some((n) => n.includes('not a recording of anything'))).toBe(true);
  });

  /**
   * Every sink the 2026-08-09 surface audit found, with its verdict. **Adding an exporter without
   * adding it here fails the count below**, which is the whole point: this file is the place the
   * question gets asked, until a registry exists to ask it automatically.
   */
  const SINKS: { name: string; state: 'carries' | 'unreachable' | 'todo'; why?: string }[] = [
    ...documentsCarryingProse().map((d) => ({ name: `${d.label} (${d.ext})`, state: 'carries' as const })),
    { name: 'Save data .csv (.csv)', state: 'todo', why: 'a CSV has no comment syntax every reader agrees on — the same reason it carries no build stamp (D11 slice 4). `lib/documents.ts` states the exemption once, as `carriesProse: false`, so it cannot drift into being forgotten. Needs a column or a decision.' },
    { name: 'clipboard report table', state: 'todo', why: 'reportTable() builds rows only; the label needs a caption row.' },
    { name: 'share link', state: 'todo', why: 'SharePayload is {n,t} — name plus raw file text. The TEXT carries the marker, so a shared link re-reads it; asserting that needs the share round trip, which is its own slice.' },
    { name: 'print card', state: 'todo', why: 'FlightCard takes series/metrics/stem and no RawFlight.' },
    { name: 'card .png', state: 'todo', why: 'drawn from the same props as the print card.' },
    { name: 'plot .png / .svg', state: 'unreachable', why: 'a chart image of a made-up flight carries no figure a reader could mistake for a measurement, and the report it comes from does say so.' },
    { name: '.zip bundle', state: 'todo', why: 'its entries are the .md/.csv/.json above; it inherits whatever they do.' },
    { name: 'metric grid (screen)', state: 'todo', why: 'MetricGrid takes FlightMetrics only — needs a prop.' },
    { name: 'logbook row', state: 'todo', why: 'RecentMeta has no member for it; re-parsing on reopen restores it to the flight but not to the row.' },
    { name: 'logbook backup .json', state: 'todo', why: 'serializeLogbook spreads, so it survives; normalizeFlight rebuilds explicitly and would drop a new field.' },
    { name: 'logbook clipboard table', state: 'todo', why: 'its own header/row literal in RecentFlights.' },
    { name: 'comparison table + .csv/.md/.html/.json', state: 'todo', why: 'CompareFlight carries id/name/formatLabel/flownAt and no provenance field.' },
    { name: '.gpx track', state: 'unreachable', why: 'the generated flight has no GPS, so no track exists to export. A synthesized GPS flight would change this and must revisit it.' },
    { name: '.kml track', state: 'unreachable', why: 'same as .gpx — trackKml reads the GPS fixes and the generated flight has none, so the control is not rendered at all rather than rendered and empty.' },
    { name: 'stitch composite .zip', state: 'unreachable', why: 'no synthesized staged pair exists yet; the slice that adds one must revisit this.' },
  ];

  it('accounts for every sink the audit found — none silently forgotten', () => {
    // 20 rows for 26 sinks: the comparison's four documents are one row because they share one
    // input shape, and the two clipboard tables are named separately because they do not.
    expect(SINKS.length, 'a new exporter must be added to SINKS').toBe(20);
    for (const s of SINKS) {
      if (s.state !== 'carries') {
        expect(s.why, `${s.name} is not covered and gives no reason`).toBeTruthy();
        expect((s.why ?? '').length, `${s.name}'s reason is too thin to act on`).toBeGreaterThan(40);
      }
    }
    // The ones claimed as covered are exactly the ones asserted above, in the same order — and
    // both come from `lib/documents.ts`, so neither list can drift from the app's own.
    expect(SINKS.filter((s) => s.state === 'carries').map((s) => s.name)).toEqual(
      CARRIES.map((s) => s.name),
    );
    expect(CARRIES.length, 'every prose document in the registry is checked').toBe(
      KEPT_DOCUMENTS.filter((d) => d.carriesProse).length,
    );
  });

  it('the data CSV is the one gap that would mislead, and it is named as such', () => {
    // Recorded rather than glossed: this is the export a flyer pastes into a spreadsheet, and it
    // is the one on this list where an unlabelled number is most likely to be read as measured.
    // It is why the sample is NOT offered in the app yet.
    const csv = analyzedDataCsv(flight, analysis, 'metric');
    expect(csv).not.toContain('SYNTHETIC');
    expect(SINKS.find((s) => s.name === 'Save data .csv (.csv)')?.state).toBe('todo');
  });
});
