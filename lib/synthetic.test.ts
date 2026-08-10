import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { demoFlight, isSynthetic, syntheticFromRows, toMapperCsv, PROVENANCE_COLUMN, SYNTHETIC_KEY, SYNTHETIC_NOTE, SYNTHETIC_TAG } from './synthetic';
import { analyzeTable } from './flight/columns';
import { parseTable } from './csv';
import { buildFlight } from './flight/build';
import { analyzeFlight } from './analyze';
import { analyzedDataCsv, reportTable } from './report';
import { KEPT_DOCUMENTS, documentsCarryingProse } from './documents';
import { toCanonical, fromCanonical } from './canonical';
import { importRecent } from './reopen';
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

  it('is recognisable from the flight alone, wherever the flight came from', () => {
    // The one predicate every SCREEN surface branches on. It reads the note rather than a field,
    // which is what makes it equally true of a file just dropped and of the same flight read back
    // out of a saved record — the hop where a new optional field on `RawFlight` would have been
    // dropped by four of the five persistence paths.
    const { flight } = synthetic();
    expect(isSynthetic(flight)).toBe(true);
    expect(isSynthetic(fromCanonical(toCanonical(flight)))).toBe(true);
  });

  it('survives being REOPENED from the logbook, which is the hop the mapper route takes', () => {
    // **The defect the pre-push review found in this feature's own first cut**, and the reason it
    // is asserted here rather than left to the e2e: a hand-mapped flight is rebuilt by
    // `importRecent` from the stored text plus the stored mapping, and that rebuild passed
    // headers, rows, mappings and `reported` — but not `synthetic`. So the one route a generated
    // demonstration file can take into the app lost the claim the moment the flyer clicked its
    // logbook row. It went further than the screen: a reopen is a save, `fileFacts` reads the
    // rebuilt flight, and a save is a replace in place — so one click deleted the stored flag for
    // good, after which a made-up apogee could wear "highest of your remembered flights".
    //
    // Falsified by removing the spread in `lib/reopen.ts`: this fails and nothing else does,
    // which is exactly why the hole existed — every other assertion builds its flight directly.
    const csv = toMapperCsv(demoFlight('the column mapper'));
    const back = importRecent({
      name: 'demo-mapper-flight.csv',
      text: csv,
      mapping: [
        { index: 0, role: 'time', unit: 's' },
        { index: 1, role: 'altitude', unit: 'ft' },
        { index: 2, role: 'velocity', unit: 'ft/s' },
      ],
    });
    expect(back.kind, 'the stored mapping still builds this file').toBe('flight');
    if (back.kind !== 'flight') return;
    expect(isSynthetic(back.flight), 'a reopened demonstration is still a demonstration').toBe(true);
    expect(back.flight.notes[0]).toBe(SYNTHETIC_NOTE);
  });

  it('is not claimed of a real flight, and cannot be provoked by the WORD', () => {
    // Both falsifications, because "does this string appear anywhere" is the version of this
    // predicate that compiles, passes the happy case, and libels a flyer's own flight the first
    // time they write "synthetic parachute" in a note.
    expect(isSynthetic({ notes: [] })).toBe(false);
    expect(isSynthetic({ notes: ['SYNTHETIC'] })).toBe(false);
    expect(isSynthetic({ notes: ['This flight is SYNTHETIC — numbers Debrief made up'] })).toBe(false);
    expect(isSynthetic({})).toBe(false);
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
   * Every sink the 2026-08-09 surface audit found, with its verdict.
   *
   * **This docblock used to claim "adding an exporter without adding it here fails the count
   * below", and that is only true of exporters registered in `lib/documents.ts`** — those are
   * spread in below, so adding one does move `SINKS.length`. For an exporter anywhere else it
   * fails nothing, and this run proved it: the three sinks added on 2026-08-09 (the explore `.csv`,
   * the sample-table column copy, the landing-coordinate copy) had all shipped unlabelled and not
   * one of them made a single test go red. The sentence is corrected rather than deleted because
   * the false version is the one a future session would have trusted while shipping a fourth.
   *
   * So: **this list is a hand-kept ledger for everything outside the registry, and the only thing
   * that finds a missing row is re-running the audit.** The states mean different things and are
   * held to different standards, deliberately:
   *   - `carries` — a document in `lib/documents.ts`. Checked mechanically, above, by building it.
   *   - `labelled` — covered somewhere the registry cannot reach. Its `why` MUST name the check
   *     that holds it, and the assertion below enforces that a named check exists rather than
   *     taking the prose on trust.
   *   - `todo` / `unreachable` — not covered, with a reason worth acting on.
   */
  const SINKS: {
    name: string;
    state: 'carries' | 'labelled' | 'unreachable' | 'todo';
    why?: string;
    /** Required on every `labelled` row: the file that holds the check, and a string from it
     *  that is unique to the assertion. Asserted below by reading the file — so a row cannot
     *  claim coverage by prose alone, which is what `labelled` was for its first hour. */
    check?: { file: string; contains: string };
  }[] = [
    ...documentsCarryingProse().map((d) => ({ name: `${d.label} (${d.ext})`, state: 'carries' as const })),
    { name: 'Save data .csv (.csv)', state: 'labelled', why: 'a per-ROW `Provenance` column, first, on `COMPETITION.md` row 41\'s precedent — NMEA marks simulation in every sentence, HL7 in a required field on every message, DICOM on every instance, because the claim has to live in a field the consumer already parses. A header comment does not survive selecting the data block and pasting it, which is the gesture this export exists for. `carriesProse: false` still stands: the column is data, not prose.', check: { file: 'lib/synthetic.test.ts', contains: 'because a header comment does not survive a paste' } },
    { name: 'clipboard report table', state: 'labelled', why: 'a third `Provenance` column on every row — the same per-record rule the data CSV and the logbook table follow, because all three land in a spreadsheet where a caption row is a cell a sort moves away from the rows it was about. The first reading of this sink proposed a caption row, which is the answer `COMPETITION.md` row 41 measured as the weak one.', check: { file: 'lib/synthetic.test.ts', contains: 'the readings a flyer copies carry it per row too' } },
    { name: 'share link', state: 'todo', why: 'SharePayload is {n,t} — name plus raw file text. The TEXT carries the marker, so a shared link re-reads it; asserting that needs the share round trip, which is its own slice.' },
    { name: 'print card', state: 'labelled', why: '`FlightCard` takes a REQUIRED `synthetic` prop and draws §2\'s caveat amber as a filled BAND above the stats rather than a line of text — a picture is skimmed, and a grey sentence under a 56 px apogee is not read. Required with no default for the same reason `MetricGrid`\'s is: the safe-looking default is the defect value.', check: { file: 'e2e/analyze.spec.ts', contains: 'the shareable card carries it as a band' } },
    { name: 'card .png', state: 'labelled', why: 'the `.png` download and the clipboard image are `canvas.toBlob()` over the same draw as the print card, so all three are one answer — which is why the claim is drawn onto the CANVAS and not rendered beside it in the DOM.', check: { file: 'e2e/analyze.spec.ts', contains: 'the shareable card carries it as a band' } },
    { name: 'plot .png / .svg', state: 'todo', why: 'CORRECTED 2026-08-09. The old reason read "carries no figure a reader could mistake for a measurement", and that is false: `lib/svgChart.ts` draws a labelled y-axis in the flyer\'s length unit and a title, and the image travels without the report. The SVG has a title slot; the PNG is rasterised from the same draw.' },
    { name: 'explore .csv', state: 'todo', why: '`lib/explore.ts#exploreCsv` emits a header of column names and nothing else, and `ChannelExplorer` offers it on every report — a second data export, missed by the 2026-08-09 audit entirely because it is not in `lib/documents.ts`.' },
    { name: 'sample-table column copy', state: 'todo', why: '`SampleTable#copyColumn` calls `copyTable([label], out)` — the clipboard header is the bare channel name, so a column of made-up altitudes pastes into a spreadsheet with nothing attached. Also missed by the audit.' },
    { name: 'landing-coordinate copy', state: 'todo', why: '`GroundTrack` writes a bare lat/lon pair with `clipboard.writeText`. **Reachable today, and the first draft of this reason said it was not** — repeating, two lines above the correction that names it, the exact mistake the .gpx row is in the middle of correcting. The mapper has `latitude` and `longitude` roles (`lib/flight/columns.ts`), so a mapped CSV carrying the marker and lat/lon columns needs no new generator at all.' },
    { name: '.zip bundle', state: 'todo', why: 'its entries are the .md/.csv/.json above; it inherits whatever they do.' },
    { name: 'metric grid (screen)', state: 'labelled', why: '`MetricGrid` takes a REQUIRED `synthetic` prop and renders §5 `Notice` at `warn` above the tiles — the short form, because the report carries the sentence at the top and two copies of 200 characters cost ~230 px of an 844 px phone. Two notices and not one because a screenshot of the readings does not carry the top of the page.', check: { file: 'e2e/analyze.spec.ts', contains: 'the notice sits above the first reading' } },
    { name: 'logbook row', state: 'labelled', why: '`RecentMeta.synthetic`, written by `fileFacts` at every save site, rendered as a §5 `Chip` at `warn` beside the logger with the claim in `sr-only` text rather than a `title` — and excluded from `personalBests`, so a made-up apogee cannot wear the star that says "highest of your remembered flights".', check: { file: 'e2e/analyze.spec.ts', contains: 'never wears its star' } },
    { name: 'logbook backup .json', state: 'labelled', why: '`normalizeFlight` carries `synthetic` explicitly, and the `Required<RecentFlight>` fixture stops that file COMPILING if a member is added and not carried — so the backup round trip cannot silently drop it.', check: { file: 'lib/recents.test.ts', contains: 'a backup carries every member of a flight' } },
    { name: 'logbook clipboard table', state: 'labelled', why: 'a conditional `Provenance` COLUMN, on the same rule as the grouping pair beside it and on the NMEA/HL7/DICOM precedent in `COMPETITION.md` row 41 — a per-row cell survives a sort, a filter and a partial paste into a spreadsheet where a caption row does not. The header and the cell are `lib/logbook.ts` rather than JSX precisely so this row has something to point at.', check: { file: 'lib/logbook.test.ts', contains: 'provenanceCell' } },
    { name: 'comparison table + .csv/.md/.html/.json', state: 'todo', why: 'CompareFlight carries id/name/formatLabel/flownAt and no provenance field. `lib/compareFromLogbook.ts` builds them through `importRecent`, so the flight itself now knows — what is missing is a member on the shape the comparison actually reads.' },
    { name: 'composite readings (screen, /stitch)', state: 'todo', why: 'ADDED 2026-08-09 by the pre-push review, and it is the miss that matters most in this batch: `/stitch` is a top-level route that renders every stage\'s apogee, max speed and burn by name and has no report above it to carry a notice. Reachable today — two mapped CSVs carrying the marker, compared, then the comparison\'s own link to `/stitch/?ids=…`. `StitchSurface` needs the same `synthetic` prop `MetricGrid` took.' },
    { name: 'composite timeline clipboard table', state: 'todo', why: 'ADDED 2026-08-09 by the pre-push review. `/stitch`\'s "Copy the timeline" writes marks with altitudes through `copyTable` and carries nothing — the same shape as the logbook table, and it wants the same `Provenance` column from `lib/logbook.ts` rather than a second answer to one question.' },
    { name: '.gpx track', state: 'todo', why: 'CORRECTED 2026-08-09, and the correction is the lesson. The old reason — "the generated flight has no GPS" — exempted a SINK on a property of one generated FILE. The marker is a metadata row any mappable CSV can carry, including one with lat/lon columns, so the sink is reachable the moment such a file exists. `trackGpx` already writes a `<desc>` a sentence can ride in. D10\'s own *done when* names .gpx explicitly, so this was an exemption against the milestone\'s text.' },
    { name: '.kml track', state: 'todo', why: 'same correction as .gpx, and named separately because the fix is: `trackKml` writes `<Document><name>` and a per-flight `<name>`, both of which can carry it. Also named explicitly in D10\'s *done when*.' },
    { name: 'stitch composite .zip', state: 'labelled', why: 'CORRECTED 2026-08-09 in the other direction — it was exempted as unreachable and is in fact covered. `StitchSurface` writes each stage with `toCanonical(importRecent(rec).flight, …)` and `lib/canonical.ts` writes `notes` verbatim. **It was only covered from the moment `lib/reopen.ts` stopped dropping the marker**, which is the same fix, and the first draft of this row claimed coverage that ran through the hole — held now by the reopen assertion above rather than by the canonical one, which never goes through `importRecent`.', check: { file: 'lib/synthetic.test.ts', contains: 'survives being REOPENED from the logbook' } },
  ];

  it('cannot claim a sink is covered without naming the check that covers it', () => {
    // **`labelled` was, for its first hour, a state the suite was structurally incapable of
    // falsifying**: the equality assertion below only compares the `carries` rows against
    // `lib/documents.ts`, so a `labelled` row was subject to nothing but a length check on its
    // prose — while the docblock claimed its `why` "names the check that actually holds it, so the
    // claim is followable". Two of the five named no check at all. That is the same shape as the
    // exemption list `MAINTAINING.md` already warns about: a row marked done is not re-checked.
    //
    // So the claim is now read off disk. A `labelled` row must name a file and a string in it, the
    // file must exist, and the string must be there — which fails when someone deletes the walk
    // the row points at, and fails when someone marks a row `labelled` and invents a check.
    for (const s of SINKS.filter((x) => x.state === 'labelled')) {
      expect(s.check, `${s.name} claims coverage and names no check`).toBeTruthy();
      const src = readFileSync(new URL(`../${s.check!.file}`, import.meta.url), 'utf8');
      expect(
        src.includes(s.check!.contains),
        `${s.name} points at ${s.check!.file} for "${s.check!.contains}", which is not in it`,
      ).toBe(true);
    }
  });

  it('accounts for every sink the audit found — none silently forgotten', () => {
    // 25 rows. It was 20, and the five that arrived are the useful half of re-running the audit
    // rather than trusting the record — three from the re-run (the channel explorer's own `.csv`,
    // the sample table's per-column clipboard copy, the ground track's landing coordinate) and
    // two more from the pre-push review, which found the whole `/stitch` composite surface
    // missing: it renders per-stage apogees and copies a timeline table, on a top-level route
    // with no report above it. None of the five is in `lib/documents.ts`, which is exactly why a
    // registry-driven check cannot see them and this hand-kept list has to.
    expect(SINKS.length, 'a new exporter must be added to SINKS').toBe(25);
    for (const s of SINKS) {
      if (s.state !== 'carries') {
        expect(s.why, `${s.name} is not covered and gives no reason`).toBeTruthy();
        expect((s.why ?? '').length, `${s.name}'s reason is too thin to act on`).toBeGreaterThan(40);
      }
    }
    // The ones claimed as covered are exactly the ones asserted above, in the same order — and
    // both come from `lib/documents.ts`, so neither list can drift from the app's own.
    //
    // `labelled` is deliberately a SEPARATE state from `carries` rather than folded into it: a
    // document is checked here, by building it and searching the text, and a screen surface or a
    // clipboard table cannot be. Marking those `carries` would make this equality fail; marking
    // them `todo` when they are done would leave the next session re-doing them. The `why` on a
    // `labelled` row names the check that actually holds it, so the claim is followable rather
    // than asserted here.
    expect(SINKS.filter((s) => s.state === 'carries').map((s) => s.name)).toEqual(
      CARRIES.map((s) => s.name),
    );
    expect(CARRIES.length, 'every prose document in the registry is checked').toBe(
      KEPT_DOCUMENTS.filter((d) => d.carriesProse).length,
    );
  });

  /**
   * **Every route into the logbook writes the same facts, and this is the only thing that can
   * say so.** There are three save sites — a launch day's folder (`lib/ingest.ts`), the column
   * mapper (`lib/mapped.ts`) and a single dropped file (`components/Analyzer.tsx`) — and until
   * `fileFacts` they were three copies of one object literal. The failure mode is silent in the
   * worst way: the row is stored, survives a backup, and is simply missing the fact. Nothing
   * throws and nothing goes red, because `saveRecent` only ever runs against a browser's
   * IndexedDB and every unit test builds its rows by hand.
   *
   * It matters most for exactly this member: the mapper is the ONLY route a generated
   * demonstration file can take into the logbook, so a `synthetic` written at the other two
   * sites and forgotten at that one would have shipped as fully working.
   *
   * **The list of save sites is DISCOVERED, not typed in, and that is the half that matters.** A
   * first cut iterated three literal paths, and the docblock above it claimed to be "the only
   * thing that can say so" about *every* route — which it could not be: the one failure the
   * `fileFacts` extraction exists to prevent is a FOURTH save site, and a hard-coded list is
   * blind to exactly that. It walks `lib/` and `components/` instead, so a new caller has to
   * either use the helper or fail here.
   *
   * Falsified three ways: delete the spread from any one site (that file is named), hand-write
   * `apogeeM:` back beside it (named again), and add a fourth `saveRecent(` caller anywhere in
   * the tree (named, with no list to update first).
   */
  /** The `saveRecent({ … })` object literal, brace-matched, or null. Scoped rather than
   *  file-wide so a legitimate `flownAt:` elsewhere in the same module is not a violation. */
  const saveRecentCall = (src: string): string | null => {
    const at = src.indexOf('saveRecent({');
    if (at < 0) return null;
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
    }
    return null;
  };

  it('every route into the logbook writes the file’s facts from one place', () => {
    const roots = ['lib', 'components'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
        if (e.name.startsWith('__') || e.name.startsWith('.')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) files.push(rel);
      }
    };
    for (const r of roots) walk(r);

    // Every file that CALLS `saveRecent(` — the definition and the re-export in `lib/recents.ts`
    // are not calls, so the module that owns it is excluded by name rather than by pattern.
    const callers = files.filter(
      (f) => f !== 'lib/recents.ts' && readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes('saveRecent({'),
    );
    expect(
      [...callers].sort(),
      'the save sites are discovered, so this list moving is a new route into the logbook',
    ).toEqual(['components/Analyzer.tsx', 'lib/ingest.ts', 'lib/mapped.ts']);

    for (const file of callers) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      const call = saveRecentCall(src);
      expect(call, `${file} matched as a save site and the call could not be read`).toBeTruthy();
      expect(call!.includes('...fileFacts('), `${file} builds a logbook row without fileFacts()`).toBe(true);
      // And does not ALSO hand-write any member `fileFacts` owns, which is how a second copy
      // creeps back in one member at a time. All five, not just the first one anyone thought of.
      //
      // Scoped to the CALL rather than the file, and that correction is worth keeping: the
      // file-wide version failed on `lib/ingest.ts:230`, which writes `flownAt:` onto a
      // RawFlight while pairing a device summary. Perfectly correct code, and a check that
      // calls it a violation is one somebody weakens rather than obeys.
      for (const member of ['apogeeM:', 'maxVelocityMs:', 'apogeeCaveats:', 'synthetic:', 'flownAt:']) {
        expect(call!.includes(member), `${file} hand-writes ${member} inside saveRecent({…})`).toBe(false);
      }
    }
  });

  it('the data CSV says it on EVERY ROW, because a header comment does not survive a paste', () => {
    // **The sink the audit named as the gap that would mislead most, closed on a citation rather
    // than a preference.** This is the export a flyer pastes into a spreadsheet, so an unlabelled
    // number here is the likeliest of all to be read as measured — and a CSV has no comment syntax
    // every reader agrees on, which is why `lib/documents.ts` marks it `carriesProse: false` and
    // why it carries no build stamp either. `COMPETITION.md` row 41 settles what to do instead:
    // NMEA 0183 marks simulation in every sentence, HL7 v2 in a required field on every message,
    // DICOM on every instance, and the shared principle is that the claim lives in a field the
    // consumer must already parse to get the numbers at all.
    //
    // So it is asserted per ROW, not once: selecting the data block and pasting it is exactly the
    // gesture a header would not survive.
    const csv = analyzedDataCsv(flight, analysis, 'metric');
    // Read back with the app's OWN CSV reader rather than `split(',')`. The first cut split on
    // commas and failed — not because the export was wrong but because the cell reads "made up by
    // Debrief, not flown" and is correctly quoted, which a naive splitter counts as two fields.
    // Parsing it the way a reader does is both the honest check and the stronger one: it proves a
    // spreadsheet sees one column, which is the entire claim.
    const rows = parseTable(csv).rows;
    expect(rows[0][0], `header was: ${rows[0].slice(0, 3).join(' | ')}`).toBe(PROVENANCE_COLUMN.toLowerCase());
    expect(rows.length, 'the generated flight is 5,144 samples plus a header').toBeGreaterThan(5000);
    const unmarked = rows.slice(1).filter((r) => !r[0].includes(SYNTHETIC_TAG));
    expect(unmarked.length, `${unmarked.length} data rows carry no provenance cell`).toBe(0);
    // …and every row still has the header's field count, which is how a per-row marker breaks a
    // CSV when the cell is not quoted.
    const ragged = rows.slice(1).filter((r) => r.length !== rows[0].length);
    expect(ragged.length, 'a provenance cell must not change the column count').toBe(0);
    expect(SINKS.find((s) => s.name === 'Save data .csv (.csv)')?.state).toBe('labelled');
  });

  it('the readings a flyer copies carry it per row too', () => {
    // The other spreadsheet destination, and the one a cert document is actually built from. Two
    // columns become three, and every reading answers for itself.
    const t = reportTable(analysis, 'metric', undefined, undefined, true);
    expect(t.header).toEqual(['Reading', 'Value', PROVENANCE_COLUMN]);
    expect(t.rows.length, 'a report has readings to copy').toBeGreaterThan(3);
    expect(t.rows.every((r) => r[2].includes(SYNTHETIC_TAG)), 'every row answers for itself').toBe(true);
    // And a real flight keeps the two-column table thousands of pastes already expect.
    const real = reportTable(analysis, 'metric');
    expect(real.header).toEqual(['Reading', 'Value']);
    expect(real.rows.every((r) => r.length === 2)).toBe(true);
  });

  it('does not put a provenance column on a REAL flight', () => {
    // The other direction, and the one that would be a silent regression: every real flight's data
    // export gaining a column of the word "recorded" is a change to a file thousands of readers
    // parse by position. The column exists only where there is something to say.
    const real = buildFlight({
      source: 'real.csv',
      format: 'csv',
      formatLabel: 'Generic CSV',
      headers: ['Elapsed', 'Height'],
      dataRows: Array.from({ length: 60 }, (_, i) => [String(i * 0.1), String(i <= 30 ? i * 20 : Math.max(0, 600 - (i - 30) * 25))]),
      mappings: [
        { index: 0, role: 'time' as const, unit: 's' },
        { index: 1, role: 'altitude' as const, unit: 'm' },
      ],
    });
    const csv = analyzedDataCsv(real, analyzeFlight(real), 'metric');
    expect(csv.split('\n')[0].startsWith('time (s)')).toBe(true);
    expect(csv).not.toContain(PROVENANCE_COLUMN.toLowerCase());
    expect(csv).not.toContain('recorded');
  });
});
