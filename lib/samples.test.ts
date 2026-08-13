import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MULTI_SAMPLE, SAMPLES, SAMPLE_FILES } from './samples';
import { importFlight } from './parsers/index';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { analyzeTable } from './flight/columns';
import { parseTable } from './csv';
import { buildFlight } from './flight/build';
import { demoFlight, isSynthetic, toMapperCsv } from './synthetic';

const PUBLIC = fileURLToPath(new URL('../public/samples/', import.meta.url));

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
      const table = analyzeTable(parseTable(text).rows);
      expect(table.headers, `${s.id}: headers no parser claims`).toEqual(['Elapsed', 'Height', 'Rate']);
      const flight = buildFlight({
        source: name,
        format: 'csv',
        formatLabel: 'Mapped by hand',
        headers: table.headers,
        dataRows: table.dataRows,
        mappings: [
          { index: 0, role: 'time', unit: 's' },
          { index: 1, role: 'altitude', unit: 'ft' },
          { index: 2, role: 'velocity', unit: 'ft/s' },
        ],
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

  it('regenerates the mapping sample byte for byte, so the file cannot drift from its generator', () => {
    // The file is committed because the app serves it statically; the generator is deterministic
    // for exactly this reason. Without this, editing `demoFlight` changes what the sample
    // DEMONSTRATES while the bytes on disk go on showing the old curve.
    const s = SAMPLES.find((x) => x.kind === 'mapping');
    expect(s, 'there is a mapping sample to check').toBeTruthy();
    const onDisk = readFileSync(PUBLIC + s!.files[0], 'utf8');
    expect(onDisk).toBe(toMapperCsv(demoFlight('the column mapper')));
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

  it('names a sample that really is several recordings', () => {
    // D10: `/compare` offered nothing to a visitor who has not flown two boards — an empty state
    // whose only exit needs something they do not have. The sample it offers has to BE a
    // comparison, or the surface demonstrates itself with one flight.
    expect(MULTI_SAMPLE, 'the registry still holds a multi-file sample').toBeDefined();
    expect(MULTI_SAMPLE!.files.length).toBeGreaterThan(1);
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
