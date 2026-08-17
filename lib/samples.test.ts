import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DROPPABLE_SAMPLES, MULTI_SAMPLE, SAMPLES, SAMPLE_FILES, STAGES_SAMPLE } from './samples';
import { importFlight } from './parsers/index';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { fmtLength, fmtSpeed } from './display';
import { analyzeTable } from './flight/columns';
import { parseTable } from './csv';
import { buildFlight } from './flight/build';
import type { ColumnRole } from './flight/columns';
import { buildComposite } from './composite';
import { demoFlight, isSynthetic, saturatedFlight, stagedPair, toLoggerCsv, toMapperCsv, toSingleLoggerCsv, SYNTHETIC_NOTE } from './synthetic';
import { demoDesign, isSyntheticDesign, SYNTHETIC_DESIGN_NOTE } from './syntheticDesign';
import { orkToXml, readPredictionDetail, predictionFiguresFrom } from './parsers/openrocket';

const PUBLIC = fileURLToPath(new URL('../public/samples/', import.meta.url));

/**
 * A committed sample file is exactly what its generator writes today — or, under
 * `WRITE_SAMPLES=1`, it is made so.
 *
 * **The write path is here because its absence has a measured cost.** Editing a generator turns
 * this check red with a diff of two 100 KB strings and no way to act on it: the app serves these
 * files statically, so they have to be regenerated, and nothing in the repo did that. The session
 * that added the staged pair wrote a throwaway test file to do it and deleted it afterwards, which
 * is the shape of a missing tool.
 *
 * It is opt-in and never on in CI, because a check that silently rewrites the thing it is checking
 * is not a check. `npm test` compares; `WRITE_SAMPLES=1 npx vitest run lib/samples.test.ts` updates
 * and then the diff is reviewed like any other.
 */
function expectGenerated(name: string, want: string): void {
  if (process.env.WRITE_SAMPLES === '1') {
    writeFileSync(PUBLIC + name, want);
    return;
  }
  expect(
    readFileSync(PUBLIC + name, 'utf8'),
    `${name} has drifted from its generator — regenerate with WRITE_SAMPLES=1 npx vitest run lib/samples.test.ts`,
  ).toBe(want);
}

/**
 * The same check for a sample that is BINARY, which `expectGenerated` cannot do: it reads utf8 and
 * compares strings, so a `.ork` archive round-tripped through a decode would compare two strings of
 * replacement characters and pass over a real difference.
 *
 * The failure message carries both lengths rather than the bytes. A `toEqual` over two 600-byte
 * `Buffer`s prints two screens of decimal numbers and tells a reader nothing they can act on; the
 * lengths plus the regenerate command are what actually get used.
 */
function expectGeneratedBytes(name: string, want: Uint8Array): void {
  if (process.env.WRITE_SAMPLES === '1') {
    writeFileSync(PUBLIC + name, want);
    return;
  }
  const onDisk = new Uint8Array(readFileSync(PUBLIC + name));
  const same = onDisk.length === want.length && onDisk.every((b, i) => b === want[i]);
  expect(
    same,
    `${name} has drifted from its generator (${onDisk.length} bytes on disk, ${want.length} generated) — regenerate with WRITE_SAMPLES=1 npx vitest run lib/samples.test.ts`,
  ).toBe(true);
}

/**
 * A sample is a promise the landing page makes: click this and see the tool work. Every way
 * that promise can break is mechanical, so every one of them is checked here rather than left
 * to someone opening the page.
 */
describe('the sample flights', () => {
  it('ships every file it offers', () => {
    const missing = SAMPLE_FILES.filter((f) => !existsSync(PUBLIC + f));
    expect(missing, `registry names files that are not in public/samples: ${missing.join(', ')}`).toEqual([]);
  });

  it('ships no file it does not offer', () => {
    // The other direction, which matters because these are hundreds of kilobytes each: a file
    // left behind by a rename is dead weight in every deploy and in the precache.
    const onDisk = readdirSync(PUBLIC);
    const orphans = onDisk.filter((f) => !SAMPLE_FILES.includes(f));
    expect(orphans, `files in public/samples that no sample uses: ${orphans.join(', ')}`).toEqual([]);
  });

  it('precaches every sample file, so the demonstrations work offline too', () => {
    // The service worker's list is hand-written JavaScript that no bundler checks against the
    // registry. A sample that is offered and not precached is a button that works at home and
    // fails at the field, which is the one place this app promises to work.
    const sw = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
    const listed = [...sw.matchAll(/'\/samples\/([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort(), 'sw.js precaches exactly the registry').toEqual([...SAMPLE_FILES].sort());
  });

  it('opens every single-file sample into a real flight, through the real parsers', () => {
    // Not "the file exists" — the file PARSES and ANALYSES. A sample that 404s is obvious; a
    // sample that loads and yields no apogee is the one that would ship.
    //
    // **`kind: 'mapping'` is excluded here and asserted on its own terms below, rather than this
    // assertion being widened.** `ROADMAP.md`'s D10 flagged the trap before the sample existed: a
    // mapper sample cannot auto-detect BY DEFINITION, and softening this to "parses or needs
    // mapping" would have stopped it failing and stopped it meaning anything — a real sample that
    // silently lost its parser would have passed too.
    for (const s of SAMPLES) {
      if (s.files.length !== 1 || s.kind === 'mapping') continue;
      const name = s.files[0];
      const bytes = readFileSync(PUBLIC + name);
      const res = importFlight({ name, text: decodeBytes(bytes), bytes });
      expect(res.kind, `${s.id}: ${name} is auto-detected as a flight`).toBe('flight');
      if (res.kind !== 'flight') continue;
      const a = analyzeFlight(res.flight);
      expect(a.metrics.apogeeAltitude, `${s.id}: ${name} yields an apogee`).toBeGreaterThan(0);
    }
  });

  /** What a flyer picks in the mapper for each sample, by id — the journey each one demonstrates.
   *  A sample with no entry here fails rather than being skipped, because a sample this file does
   *  not know the columns of is one nothing checks. */
  const MAPPINGS: Record<string, { headers: string[]; mappings: { index: number; role: ColumnRole; unit: string | null }[] }> = {
    'column-mapper': {
      headers: ['Elapsed', 'Height', 'Rate'],
      mappings: [
        { index: 0, role: 'time', unit: 's' },
        { index: 1, role: 'altitude', unit: 'ft' },
        { index: 2, role: 'velocity', unit: 'ft/s' },
      ],
    },
    'saturated-accelerometer': {
      headers: ['Elapsed', 'Height', 'Rate', 'G force'],
      mappings: [
        { index: 0, role: 'time', unit: 's' },
        { index: 1, role: 'altitude', unit: 'ft' },
        { index: 2, role: 'velocity', unit: 'ft/s' },
        { index: 3, role: 'accelTotal', unit: 'g' },
      ],
    },
  };

  it('opens a mapping sample into the MAPPER, and into a flight once its columns are set', () => {
    // Both halves, because either alone is satisfiable by a broken sample: a file that reaches the
    // mapper and cannot be mapped into a flight demonstrates the mapper failing, and a file that
    // auto-detects demonstrates something else entirely.
    for (const s of SAMPLES.filter((x) => x.kind === 'mapping')) {
      expect(s.files.length, `${s.id}: a mapping sample is one file`).toBe(1);
      const name = s.files[0];
      const bytes = readFileSync(PUBLIC + name);
      const text = decodeBytes(bytes);
      const res = importFlight({ name, text, bytes });
      expect(res.kind, `${s.id}: ${name} is NOT auto-detected — that is the point of it`).toBe('mapping');

      // …and it maps. The roles are the ones a flyer would choose off the header row, which is
      // the journey being demonstrated.
      //
      // **Per SAMPLE, not one hard-coded triple.** This asserted `['Elapsed','Height','Rate']` for
      // every mapping sample, which was true while there was one and silently stops meaning
      // anything the moment a second arrives with a fourth column: the loop would still run, still
      // pass its apogee check, and never look at the column the new sample exists for.
      const table = analyzeTable(parseTable(text).rows);
      const want = MAPPINGS[s.id];
      expect(want, `${s.id}: this test knows what columns that sample carries`).toBeTruthy();
      expect(table.headers, `${s.id}: headers no parser claims`).toEqual(want.headers);
      const flight = buildFlight({
        source: name,
        format: 'csv',
        formatLabel: 'Mapped by hand',
        headers: table.headers,
        dataRows: table.dataRows,
        mappings: want.mappings,
        notes: [],
        ...(table.synthetic ? { synthetic: table.synthetic } : {}),
      });
      const a = analyzeFlight(flight);
      expect(a.metrics.apogeeAltitude, `${s.id}: yields an apogee once mapped`).toBeGreaterThan(0);

      // A sample Debrief made up says so in the FILE, not only on the button — so it is still
      // true after a flyer mails the file to a club-mate and drops it back in six months later.
      expect(isSynthetic(flight), `${s.id}: the marker survives the mapper`).toBe(true);
      expect(s.synthetic, `${s.id}: and the registry says so where the OFFER can read it`).toBe(true);
    }
  });

  it('regenerates both mapping samples byte for byte, so the files cannot drift from their generators', () => {
    // The files are committed because the app serves them statically; the generators are
    // deterministic for exactly this reason. Without this, editing a generator changes what a
    // sample DEMONSTRATES while the bytes on disk go on showing the old curve.
    //
    // **`find` became a map when the second one arrived**, and the single-`find` version is why:
    // it checked whichever mapping sample sorted first and said nothing about any other.
    const generated: Record<string, string> = {
      'column-mapper': toMapperCsv(demoFlight('the column mapper')),
      'saturated-accelerometer': toMapperCsv(saturatedFlight('an accelerometer that ran out of range')),
    };
    const mapping = SAMPLES.filter((x) => x.kind === 'mapping');
    expect(mapping.length, 'there are mapping samples to check').toBeGreaterThan(0);
    expect(mapping.map((x) => x.id).sort(), 'every mapping sample has a generator here').toEqual(
      Object.keys(generated).sort(),
    );
    for (const s of mapping) expectGenerated(s.files[0], generated[s.id]);
  });

  /**
   * **Every figure an offer states is held against what the app reads off that offer's own files.**
   *
   * Added 2026-08-13 because two of the six offers were wrong, on the surface a stranger meets
   * first and in the sentence they read BEFORE pressing anything:
   *
   * - `one-flight` advertised *"Apogee ≈ 9,322 ft"* while the report reads **8,022 ft**. Not a
   *   rounding gap — 9,322 ft is a DIFFERENT FLIGHT, the `altusmetrum-telemetrum.csv` fixture
   *   (serial 2098, flight 12), where `lib/parsers/__fixtures__/README.md` attributes it
   *   correctly. The served sample is serial 2718, flight 14.
   * - `two-altimeters` said the pair *"agree at ≈ 1,009 ft"* while Debrief reads **1,025 ft** and
   *   **1,029 ft** — so the single number stated was neither recording's, and the 0.4% spread
   *   quoted everywhere else in the repo cannot be derived from it.
   *
   * Both had been true of something, once, which is exactly why a test rather than a proofread:
   * an offer is prose beside a file, and prose does not move when an analysis does. This is the
   * repo's own rule for two things that must agree — hold them side by side and fail on drift.
   *
   * **A figure is allowed if it is EITHER the app's own read of one of the sample's files, OR
   * present verbatim in one of those files.** The second clause is not a loophole, it is the
   * `device-summary` sample: its offer quotes *"The board states 4,034.98 ft and 700.36 ft/s"*,
   * which is the board's own claim printed in its summary file, and the whole point of that
   * sample is that Debrief's independent read (4,036 ft) sits beside it. Quoting an instrument is
   * a different act from asserting a reading, and the check has to be able to tell them apart.
   */
  it('states no figure in an offer that the sample’s own files contradict', async () => {
    // Length and speed only. A percentage, a count, a serial or a date is not a reading, and
    // matching them would make this fail on "0.4% spread" and "serial 2718".
    const FIGURE = /\b[\d,]+(?:\.\d+)?\s*(?:ft\/s|m\/s|ft|m)\b/g;
    const digits = (x: string) => x.replace(/[^\d.]/g, '');

    let checked = 0;
    for (const s of SAMPLES) {
      const stated = [...`${s.shows} ${s.source}`.matchAll(FIGURE)].map((m) => m[0]);
      if (stated.length === 0) continue;

      // What the app itself would print for these files, plus what the files literally contain.
      const ours = new Set<string>();
      let quotable = '';
      for (const name of s.files) {
        const bytes = new Uint8Array(readFileSync(PUBLIC + name));
        // A device-summary file REFUSES to open as a flight, by design, and that is the very
        // sample whose offer quotes it — so a throw here is an expected shape, not a failure. Its
        // bytes are already in `raw` above, which is the half that case needs.
        let res;
        try {
          res = importFlight({ name, text: decodeBytes(bytes), bytes });
        } catch {
          // A file that REFUSES to open as a flight is an instrument's own summary, and its
          // numbers are the only ones an offer may quote without Debrief having read them.
          quotable += decodeBytes(bytes);
          continue;
        }
        if (res.kind !== 'flight') {
          quotable += decodeBytes(bytes);
          continue;
        }
        const a = analyzeFlight(res.flight);
        for (const sys of ['imperial', 'metric'] as const) {
          ours.add(digits(fmtLength(a.metrics.apogeeAltitude, sys)));
          if (Number.isFinite(a.metrics.maxVelocity)) ours.add(digits(fmtSpeed(a.metrics.maxVelocity, sys)));
        }
      }
      // **Only files that are NOT flights are quotable, and that took two failed attempts to get
      // right.** The first cut flattened every file to its digits and asked whether the figure
      // appeared as a substring — but a flight log is tens of thousands of numbers, so "9322"
      // turns up inside that soup by coincidence. Matching whole numeric TOKENS instead was
      // better and still not enough: 9322 and 1009 both occur as real values in these logs, so
      // both mutants this test exists for still passed.
      //
      // The rule that works is semantic rather than textual. An offer may quote an INSTRUMENT's
      // own stated figures — that is the `device-summary` sample, whose whole subject is a board's
      // claim set beside Debrief's independent read — and may not quote a number it happened to
      // find inside a data log. A summary file refuses to open as a flight, and that refusal is
      // exactly the discriminator: `sample-blueraven.summary.csv` throws, `sample-altusmetrum.csv`
      // does not. So the escape hatch is open only where quoting is the point.
      const fileNumbers = new Set(
        [...quotable.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => digits(m[0])),
      );

      for (const fig of stated) {
        checked++;
        const d = digits(fig);
        const isOurs = ours.has(d);
        // Separators stripped on both sides, so "4,034.98 ft" matches a file that writes
        // "4034.98" with the unit spelled out.
        const inFile = fileNumbers.has(d);
        expect(
          isOurs || inFile,
          `${s.id}: the offer states "${fig}", which is neither Debrief's own read of its files ` +
            `(${[...ours].join(', ') || 'none'}) nor written in them`,
        ).toBe(true);
      }
    }
    // A check that examined nothing passes for the wrong reason — this is the count that says it
    // ran, and it drops to 0 the moment every offer stops quoting a figure.
    expect(checked, 'offers stating a figure at all').toBeGreaterThan(2);
  });

  it('gives the saturated sample a railed accelerometer and an honest barometer', () => {
    // The capability this sample exists to demonstrate, so it is the one asserted. Debrief reads a
    // flat top at the accelerometer's peak and says the reported maximum is a FLOOR — and the file
    // has to actually contain that, or the sample demonstrates a warning about nothing.
    const s = SAMPLES.find((x) => x.id === 'saturated-accelerometer')!;
    const text = readFileSync(PUBLIC + s.files[0], 'utf8');
    const table = analyzeTable(parseTable(text).rows);
    const flight = buildFlight({
      source: s.files[0],
      format: 'csv',
      formatLabel: 'Mapped by hand',
      headers: table.headers,
      dataRows: table.dataRows,
      mappings: MAPPINGS[s.id].mappings,
      notes: [],
      ...(table.synthetic ? { synthetic: table.synthetic } : {}),
    });
    const a = analyzeFlight(flight);

    // The warning is the product. Matched on the same words `lib/analyze/index.ts` writes, so a
    // rewording that stops saying "saturated" fails here rather than silently changing what a
    // stranger is shown.
    const saturation = a.warnings.filter((w) => /saturat|full-scale|flat top/i.test(w));
    expect(saturation, `warnings were: ${a.warnings.join(' | ')}`).toHaveLength(1);
    expect(saturation[0], 'and it says the true maximum could be higher').toMatch(/could be higher/i);

    // **It is the ONLY thing the report has to say about this flight**, which is the difference
    // between a demonstration and a pile of caveats. The file carries pad time at 1 g precisely so
    // the "cannot read the resting value / loggers differ about gravity" caveat is not also on
    // screen, standing between a stranger and the one sentence they came for.
    expect(a.warnings, `warnings were: ${a.warnings.join(' | ')}`).toHaveLength(1);

    // The peak Debrief reports is the RAIL, not the boost — 16 g against a curve built to 24.
    const g = (a.metrics.maxAcceleration ?? 0) / 9.80665;
    expect(g, `peak read as ${g.toFixed(1)} g`).toBeGreaterThan(15.5);
    expect(g, `peak read as ${g.toFixed(1)} g — it must not see the unclipped 24`).toBeLessThan(16.5);

    // …and the barometer did NOT saturate, which is what makes the file its own evidence: the
    // speed column could not have come from a 16 g boost. Kept subsonic, the same discipline
    // `demoFlight` states, so Debrief is never asked to make a transonic claim about a made-up
    // flight.
    expect(a.metrics.maxVelocity ?? 0, 'the speed the barometer implies').toBeGreaterThan(150);
    expect(a.metrics.maxVelocity ?? 0, 'and it stays subsonic on purpose').toBeLessThan(280);
  });

  it('gives the two-altimeter sample two recordings of ONE flight, not two flights', () => {
    // This is the capability the sample exists to demonstrate, so it is the one asserted rather
    // than assumed. Both files are real recordings of HMC AdvRoc's Top_Shot; the README puts
    // them at ≈1,009 ft. If a parser change ever made them disagree wildly, the sample would be
    // demonstrating the opposite of what it claims.
    const s = SAMPLES.find((x) => x.id === 'two-altimeters')!;
    expect(s.files).toHaveLength(2);
    const apogees = s.files.map((name) => {
      const bytes = readFileSync(PUBLIC + name);
      const res = importFlight({ name, text: decodeBytes(bytes), bytes });
      expect(res.kind, `${name} is auto-detected`).toBe('flight');
      if (res.kind !== 'flight') return NaN;
      return analyzeFlight(res.flight).metrics.apogeeAltitude;
    });
    for (const a of apogees) expect(a, 'each recording yields an apogee').toBeGreaterThan(0);
    // Agreement is the point of the demonstration. 10% is loose on purpose — the claim is "these
    // are the same flight", not a golden value, and the golden values live in real-files.test.ts.
    const spread = Math.abs(apogees[0] - apogees[1]) / Math.max(...apogees);
    expect(spread, `apogees ${apogees.map((a) => a.toFixed(0)).join(' vs ')} m`).toBeLessThan(0.1);
  });

  it('gives the staged pair two recordings that ALIGN into one launch, and says they are made up', () => {
    // The capability this sample exists for, asserted rather than assumed — the same shape the
    // two-altimeter case above takes, and a different claim: those two agree about one apogee,
    // these two are parts of one launch that are SUPPOSED to disagree about it.
    const s = STAGES_SAMPLE;
    expect(s, 'the registry holds a staged pair').toBeTruthy();
    expect(s!.files, 'a composite needs at least two recordings').toHaveLength(2);

    const recs = s!.files.map((name) => {
      const bytes = readFileSync(PUBLIC + name);
      const res = importFlight({ name, text: decodeBytes(bytes), bytes });
      // A NAMED PARSER, not the mapper, and that is the constraint that shaped the whole file: a
      // pair cannot go through the mapper, which takes one file at a time.
      expect(res.kind, `${name} is auto-detected as a flight`).toBe('flight');
      if (res.kind !== 'flight') throw new Error(`${name} did not parse`);
      // The marker rides through `importFlight`. It did not before 2026-08-13 — the whole
      // labelling chain reads this predicate, and on the parser path it answered false.
      expect(isSynthetic(res.flight), `${name} says Debrief made it up`).toBe(true);
      return { name, analysis: analyzeFlight(res.flight) };
    });
    expect(s!.synthetic, 'and the registry says so where the OFFER can read it').toBe(true);

    const built = buildComposite(recs.map((r) => ({ ...r, synthetic: true })));
    expect(built.ok, built.ok ? '' : `refused: ${built.refusal.why}`).toBe(true);
    if (!built.ok) return;

    // **Two DIFFERENT offsets, which is the demonstration itself.** `alignStages` puts recordings
    // on one clock by their own detected liftoffs; two boards armed at the same moment come out
    // with equal offsets and the composite looks exactly like two files that needed no aligning.
    const [a, b] = built.composite.offsets;
    expect(Math.abs(a - b), `offsets ${a} and ${b} are the same, so this shows nothing`).toBeGreaterThan(1);

    // **The order is the product**, and it is the claim `shows` makes: the booster is on the
    // ground before the sustainer reaches apogee, which no single one of these files says.
    const at = (type: string, file: string) =>
      built.composite.marks.find((m) => m.type === type && m.recording.includes(file))?.t;
    const boosterDown = at('landing', 'booster');
    const sustainerUp = at('apogee', 'sustainer');
    expect(boosterDown, 'the booster marks a landing').toBeTypeOf('number');
    expect(sustainerUp, 'the sustainer marks an apogee').toBeTypeOf('number');
    expect(boosterDown!, `booster landed at ${boosterDown}s, sustainer apogee at ${sustainerUp}s`).toBeLessThan(
      sustainerUp!,
    );

    // Every mark carries the claim, because a composite's rows come from different flights and one
    // made-up stage beside a real one has to label exactly the marks it drew.
    expect(built.composite.marks.every((m) => m.synthetic), 'every mark is labelled').toBe(true);
    // Neither file is quiet: a sample whose second recording marked nothing would demonstrate the
    // `silent` branch rather than a composite.
    expect(built.composite.silent, 'both recordings carry marks').toEqual([]);
  });

  it('regenerates the staged pair byte for byte, so the files cannot drift from their generator', () => {
    // Same reason as the mapping sample: the files are committed because the app serves them
    // statically, so editing the generator has to move the bytes or the sample goes on
    // demonstrating the old curve.
    const s = STAGES_SAMPLE!;
    const pair = stagedPair();
    expect(pair.map((p) => `sample-stage-${p.stage}.csv`), 'the registry names what the generator writes').toEqual(
      s.files,
    );
    for (const p of pair) expectGenerated(`sample-stage-${p.stage}.csv`, toLoggerCsv(p));
  });

  /**
   * The design-overlay pair: a made-up flight and a made-up design of the same rocket.
   *
   * **Both halves are invented, and that is the honest arrangement rather than the convenient
   * one.** Pairing a generated design with a REAL recording would publish a fabricated error
   * percentage about somebody's actual flight — a made-up figure attached to a measurement, which
   * is worse than either alone. Pairing it with a generated flight makes the whole comparison a
   * demonstration, and both files say so.
   *
   * The design is not served from OpenRocket's own example, which is the only real `.ork` this
   * project can reach: that file is GPL-3.0-or-later and this repository is MIT. See
   * `lib/syntheticDesign.ts`.
   */
  const DESIGN_SAMPLE = SAMPLES.find((s) => s.id === 'design-overlay');

  it('writes the design pair exactly as its generators do, bytes included', () => {
    const s = DESIGN_SAMPLE!;
    expect(s.files, 'the flight comes first, which is the order a flyer would drop them').toEqual([
      'sample-design-flight.csv',
      'sample-design.ork',
    ]);
    const flight = demoFlight('A design, and the flight it flew');
    expectGenerated('sample-design-flight.csv', toSingleLoggerCsv(flight, 3));
    expectGeneratedBytes('sample-design.ork', demoDesign(flight));
  });

  it('gives the design pair one PARSED flight and one design, which is what pairs them', () => {
    // `lib/ingest.ts` pairs a design with a flight by name, and falls back to one-of-each. The
    // rocket name in a generated design does not appear in the log's FILENAME, so this sample
    // rests entirely on that fallback — which needs exactly one PARSED flight. Every other
    // synthesized sample lands in the column mapper and could not supply it, and this assertion is
    // what stops the flight file quietly becoming a mapper file again.
    const csv = readFileSync(PUBLIC + 'sample-design-flight.csv', 'utf8');
    const res = importFlight({ name: 'sample-design-flight.csv', text: csv });
    expect(res.kind, 'the flight half must auto-detect, or the design has nothing to pair with').toBe('flight');
    if (res.kind !== 'flight') return;
    expect(isSynthetic(res.flight), 'and it says Debrief made it up').toBe(true);
  });

  it('reads ten figures out of the design, and states that they were made up', async () => {
    const bytes = new Uint8Array(readFileSync(PUBLIC + 'sample-design.ork'));
    const xml = await orkToXml(bytes);
    const read = readPredictionDetail(xml);
    expect(read.prediction, 'the archive opens and states a prediction').not.toBeNull();
    const p = read.prediction!;
    // Exactly one simulation: two or more triggers D9's picker, which is a different capability
    // and would make this sample demonstrate that instead.
    expect(p.runs.length).toBe(1);
    // All ten, or `readPredictionDetail` drops the run whole and the sample shows nothing.
    expect(p.runs[0].values.length).toBe(10);
    expect(p.synthetic, 'the design carries its own made-up marker').toBe(true);

    const figures = predictionFiguresFrom(p);
    expect(figures.notes[0], 'and the claim comes FIRST, ahead of the provenance sentence').toBe(
      SYNTHETIC_DESIGN_NOTE,
    );
    // The claim on a design is NOT the claim on a flight, and must never be confused with it:
    // `lib/ingest.ts` merges these notes into the flight's, and `isSynthetic` matches
    // `SYNTHETIC_NOTE` exactly — so a design carrying that sentence would make a REAL recording
    // announce itself as invented.
    expect(figures.notes).not.toContain(SYNTHETIC_NOTE);
    expect(isSyntheticDesign(figures.notes)).toBe(true);
  });

  /**
   * **A case that asserted `maxvelocity / maxmach` lands in the parser's 280–380 band was DELETED
   * here, and the reason is worth more than the case was.** `demoDesign` writes
   * `maxmach = maxvelocity / SOUND_MS`, so that ratio is `SOUND_MS` identically — for every
   * flight, every `MISS`, every apogee. Setting `MISS = 0.1` leaves it green while reddening the
   * cases around it. Its only live mutant was `SOUND_MS` itself, and the case above already kills
   * that one: move `SOUND_MS` outside the band and `readPredictionDetail` drops the run, so
   * `prediction` comes back null and *"reads ten figures out of the design"* fails first.
   *
   * It was written to guard the ten-attribute-and-units rule and instead restated the generator's
   * own arithmetic back to itself. Third check in this repo's history to take that shape; recorded
   * rather than quietly removed, because the shape is what recurs.
   */
  it('derives every one of the ten figures from the flight, with none typed in', () => {
    // The other half of what that case should have been doing. A constant in the design is not a
    // units bug, it is a figure that stops moving when the curve does — and one of the three found
    // by the pre-push review (`optimumdelay = 2.8 s`, against a coast of seventeen and a half
    // seconds) was absurd enough that a reader who knows the quantity would have caught it.
    const a = demoDesign(demoFlight('A design, and the flight it flew'));
    // **TWO mutants, and a figure counts as typed-in only if it is frozen under BOTH.** One is not
    // enough, and the two attempts it took are the useful part. Scaling heights and speeds alone
    // freezes `timetoapogee`, `flighttime` and `optimumdelay`, which are read off a clock that
    // mutation never touched. Scaling heights, speeds AND time together freezes `maxacceleration`,
    // because dv/dt is invariant when both halves are halved. Each mutant was the check being
    // right about a mutant that was wrong — a frozen-figure sweep is only as good as the axes it
    // disturbs, and no single scaling disturbs all of them.
    const warped = (f: (p: { t: number; altitude: number; velocity: number }) => typeof p) => {
      const m = demoFlight('a different curve');
      m.samples = m.samples.map((p) => ({ ...p, ...f({ t: p.t, altitude: p.altitude, velocity: p.velocity }) }));
      return demoDesign(m);
    };
    // Space only: catches every figure read off a height or a speed.
    const b = warped((p) => ({ ...p, altitude: p.altitude * 0.5, velocity: p.velocity * 0.5 }));
    // Time only: catches every figure read off the clock, and moves dv/dt as well.
    const c = warped((p) => ({ ...p, t: p.t * 0.5 }));
    const attrs = (bytes: Uint8Array) =>
      Object.fromEntries(
        [...new TextDecoder().decode(bytes).matchAll(/(\w+)="([-0-9.]+)"/g)].map((m) => [m[1], Number(m[2])]),
      );
    const A = attrs(a);
    const B = attrs(b);
    const C = attrs(c);
    const TEN = [
      'maxaltitude',
      'maxvelocity',
      'maxacceleration',
      'maxmach',
      'timetoapogee',
      'flighttime',
      'groundhitvelocity',
      'launchrodvelocity',
      'deploymentvelocity',
      'optimumdelay',
    ];
    const frozen = TEN.filter((k) => A[k] === B[k] && A[k] === C[k]);
    expect(frozen, 'these figures did not move when the flight did, so they are typed in').toEqual([]);
  });

  it('keeps the staged pair off the surfaces that would open it as a comparison', () => {
    // A booster and a sustainer dropped together build a COMPARISON, and a comparison reports
    // their apogees disagreeing by a factor of ten as though that were a finding — on a set that is
    // behaving exactly as designed. `components/StitchSurface.tsx` says so at length; this is the
    // registry being held to it, because both selectors would otherwise take it on `files.length`.
    expect(DROPPABLE_SAMPLES.some((x) => x.kind === 'stages'), 'the analyze page offers no staged pair').toBe(false);
    expect(MULTI_SAMPLE?.kind, '/compare gets a pair that really is one flight twice').not.toBe('stages');
    // …and the exclusion is not vacuous: there IS one to exclude.
    expect(SAMPLES.some((x) => x.kind === 'stages'), 'there is a staged pair in the registry').toBe(true);
    // **`MULTI_SAMPLE` is checked at the SELECTOR, not only at today's answer**, because the
    // assertion above passes either way while the staged pair happens to sort last — and "someone
    // reorders the registry" is precisely the failure the neighbouring test exists for. A `find`
    // on `files.length` alone would hand `/compare` two stages the day they move up.
    const src = readFileSync(new URL('./samples.ts', import.meta.url), 'utf8');
    expect(
      src.match(/MULTI_SAMPLE[^;]*;/s)?.[0] ?? '',
      "the multi-file selector excludes stages, whatever order they're in",
    ).toMatch(/kind !== 'stages'/);
    // The primary button on the analyze page indexes the filtered list, so a `stages` sample
    // ordered first must not become the one thing a first-time visitor is offered.
    expect(DROPPABLE_SAMPLES[0]?.kind ?? 'flight', 'the front door is a droppable flight').not.toBe('stages');
  });

  it('says what each sample shows and where the recording came from', () => {
    // A flyer reading numbers is entitled to know whose flight they are. And a sample whose
    // `shows` restates its label teaches nothing — the craft bar's "tooltips that restate the
    // label", one level up.
    const ids = new Set<string>();
    for (const s of SAMPLES) {
      expect(ids.has(s.id), `duplicate sample id ${s.id}`).toBe(false);
      ids.add(s.id);
      expect(s.label.trim().length, `${s.id} has a label`).toBeGreaterThan(0);
      expect(s.shows.trim().length, `${s.id} says what it shows`).toBeGreaterThan(30);
      expect(s.source.trim().length, `${s.id} names its source`).toBeGreaterThan(20);
      expect(s.shows.trim(), `${s.id}'s blurb is not its label`).not.toBe(s.label.trim());
      expect(s.files.length, `${s.id} has files`).toBeGreaterThan(0);
    }
  });
});

describe('the surfaces whose subject is more than one file offer a way in', () => {
  const COMPARE = readFileSync(new URL('../components/CompareSurface.tsx', import.meta.url), 'utf8');
  const STITCH = readFileSync(new URL('../components/StitchSurface.tsx', import.meta.url), 'utf8');

  it('offers the staged pair on /stitch, through the same reader a dropped folder goes through', () => {
    // `/stitch` asks for the rarest thing in the app — two per-stage recordings of one launch —
    // and until this sample existed its empty state's only exit needed exactly that. A private
    // loader here would be slice 1's defect back: the sample path that could only ever be one
    // UTF-8 text file, on the one surface whose subject is never one file.
    expect(STITCH).toContain('sampleFiles(sample)');
    expect(STITCH, 'read by ingestFiles, not a second parser call site').toMatch(/ingestFiles\(await sampleFiles/);
    expect(STITCH, 'no second fetch of /samples/').not.toContain("fetch(`/samples/");
    // A composite is assembled from logbook ids and its product is an address that reloads, so the
    // sample has to land in both. A sample that skipped the address would mint a composite that
    // could not be bookmarked — the one thing this surface exists to do.
    expect(STITCH, 'the sample lands in the address like every other composite').toMatch(/withIds\(new URL/);
    // §5's five states, on a control that fetches: what happens when it cannot be fetched.
    expect(STITCH).toMatch(/could not be loaded/);
    expect(STITCH, 'and it says what the sample shows').toContain('title={STAGES_SAMPLE.shows}');
  });

  it('names a sample that really is several recordings', () => {
    // D10: `/compare` offered nothing to a visitor who has not flown two boards — an empty state
    // whose only exit needs something they do not have. The sample it offers has to BE a
    // comparison, or the surface demonstrates itself with one flight.
    expect(MULTI_SAMPLE, 'the registry still holds a multi-file sample').toBeDefined();
    expect(MULTI_SAMPLE!.files.length).toBeGreaterThan(1);
  });

  it('refuses a DESIGN pair, which is the second two-file set that is not two recordings', () => {
    // `/compare` compares RECORDINGS. The design sample is two files and is not `stages`, so it
    // satisfies the old `files.length > 1 && kind !== 'stages'` predicate by shape — and opening
    // it here would leave ONE flight in a comparison built for two, because a `.ork` is not a
    // recording of anything. That is the surface demonstrating itself failing, which is exactly
    // what the `stages` exclusion beside it was written after.
    //
    // Asserted at the SELECTOR and not only at today's answer: the design entry is last in the
    // registry today, so `find` reaches `two-altimeters` first and the defect is invisible until
    // somebody reorders the list — which is the same positional luck the check above exists for.
    expect(MULTI_SAMPLE?.id, 'today it is still the two-board pair').toBe('two-altimeters');
    expect(MULTI_SAMPLE?.kind, 'and never a design').not.toBe('design');
    const src = readFileSync(new URL('./samples.ts', import.meta.url), 'utf8');
    const selector = src.match(/MULTI_SAMPLE[^;]*;/s)?.[0] ?? '';
    expect(selector, 'the selector itself excludes a design pair').toMatch(/kind !== 'design'/);
    // And the exclusion has to be true of a sample that really exists, or it guards nothing.
    expect(SAMPLES.some((s) => s.kind === 'design' && s.files.length > 1)).toBe(true);
  });

  it('chooses it by id rather than by position in the registry', () => {
    // `SAMPLES[1]` would silently become a different flight the day someone reorders the list —
    // on a surface that can only honestly offer a multi-recording one.
    const src = readFileSync(new URL('./samples.ts', import.meta.url), 'utf8');
    expect(src, 'the multi sample is found, not indexed').toMatch(/MULTI_SAMPLE.*=.*SAMPLES\.find/s);
    expect(COMPARE, 'the surface does not index the registry itself').not.toMatch(/SAMPLES\[\d+\]/);
  });

  it('opens it through the same drop path a folder takes', () => {
    // The defect slice 1 removed was the sample having its own import path, which is why it could
    // only ever be one UTF-8 text file. A second surface re-introducing one would be that back.
    expect(COMPARE).toContain('sampleFiles(sample)');
    expect(COMPARE, 'through onDropFiles, not a private loader').toMatch(/onDropFiles\(await sampleFiles/);
    expect(COMPARE, 'no second fetch of /samples/').not.toContain("fetch(`/samples/");
  });

  it('says what the sample shows, and what happens when it cannot be fetched', () => {
    // §5's five states. The files come from this site, so a lost connection is the real failure
    // and the flyer is told which one it was.
    expect(COMPARE).toContain('title={sample.shows}');
    expect(COMPARE).toMatch(/could not be loaded/);
  });
});
