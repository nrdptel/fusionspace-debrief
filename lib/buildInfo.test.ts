import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './parsers/index';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { BUILD_SHA, buildFields, buildLine } from './buildInfo';
import { KEPT_DOCUMENTS, documentsCarryingProse } from './documents';
import { toCanonical } from './canonical';
import { analysisJson, analyzedDataCsv, summaryHtml, summaryMarkdown, summaryText } from './report';

/**
 * Every document a flyer KEEPS names the build that wrote it.
 *
 * Debrief's methods change most weeks, so a cert package filed in March and questioned in June
 * needs to be able to say which version produced its numbers. `COMPETITION.md` row 36 tracks the
 * gap against AltosUI, whose CSV writer stamps its own version.
 *
 * **This is a two-lists-must-agree test, which is why it enumerates rather than spot-checks.** The
 * failure it exists to prevent is a SEVENTH export being added later and quietly not carrying the
 * stamp — the same shape as every other drift this repo has measured about itself. A new entry in
 * `DOCUMENTS` is one line; forgetting one is a silent hole.
 */

const FIXTURE = fileURLToPath(new URL('./parsers/__fixtures__/altusmetrum-telemetrum.csv', import.meta.url));

function sample() {
  const bytes = readFileSync(FIXTURE);
  const res = importFlight({ name: 'a.csv', text: decodeBytes(bytes), bytes });
  if (res.kind !== 'flight') throw new Error('fixture did not parse');
  return { flight: res.flight, analysis: analyzeFlight(res.flight) };
}

describe('every document a flyer keeps names the build that wrote it', () => {
  const { flight, analysis } = sample();

  /** The documents that carry the stamp, and the one that deliberately does not.
   *
   *  **Enumerated from `lib/documents.ts` rather than listed here, since 2026-08-09.** This used to
   *  be a hand-kept array in this file, and a list in a test cannot fail for the thing it exists to
   *  catch: a seventh export added without a line here left the test green and the document
   *  unstamped. The registry is what the report's download strip renders from, so a document with a
   *  button is a document that is checked. */
  const DOCUMENTS = documentsCarryingProse().map((d) => ({
    id: d.id,
    name: `${d.label} (${d.ext})`,
    text: () => d.build(flight, analysis, 'metric'),
  }));
  const byId = (id: string) => DOCUMENTS.find((d) => d.id === id)!;

  for (const doc of DOCUMENTS) {
    it(`${doc.name} carries the build`, () => {
      const text = doc.text();
      expect(text, `${doc.name} does not name the build`).toContain(BUILD_SHA);
    });
  }

  it('formats the human-readable stamp in exactly one place', () => {
    // Four prose documents say it; one function decides how. Asserted on the rendered STRING
    // rather than on the call site, because a second phrasing would still compile.
    const line = buildLine();
    expect(line).toContain(BUILD_SHA);
    // The PROSE documents by id, not by position: `slice(0, 3)` said the same thing while the
    // list was hand-kept in this file and would quietly mean something else the moment the
    // registry's order changed.
    for (const id of ['txt', 'md', 'html']) {
      const doc = byId(id);
      expect(doc.text(), `${doc.name} uses the shared wording`).toContain(line);
    }
  });

  it('puts it in the machine-readable documents as data, not as prose', () => {
    const fields = buildFields();
    expect(fields.build).toBe(BUILD_SHA);
    for (const id of ['json', 'record']) {
      const doc = byId(id);
      const parsed = JSON.parse(doc.text()) as Record<string, unknown>;
      expect(parsed.build, `${doc.name} carries a machine-readable build field`).toBe(BUILD_SHA);
    }
  });

  it('leaves the data CSV alone, and that is a decision rather than an omission', () => {
    // A CSV has no comment syntax every reader agrees on. A leading `#` line breaks a
    // spreadsheet's column detection and a trailing one becomes a ragged data row — and this
    // export exists to be pasted into a spreadsheet. The .json beside it in the same ZIP bundle
    // carries the stamp, so the bundle as a whole is traceable and the CSV stays clean.
    const csv = analyzedDataCsv(flight, analysis, 'metric');
    expect(csv.split('\n')[0], 'the first line is still the header row').toMatch(/^time \(s\),/);
    expect(csv).not.toContain(buildLine());
  });

  it('never claims the numbers are right, only which code produced them', () => {
    // A stamp locates a disagreement in time; it does not settle it. If this line ever grows a
    // word like "verified" or "validated" it has changed meaning, and the measurement-not-
    // simulation spine cares about exactly that kind of drift.
    expect(buildLine()).not.toMatch(/verif|valid|correct|accurate|certif/i);
  });
});

/**
 * P5 — the build a flyer is LOOKING at, not just the one that wrote a file they saved.
 *
 * `buildLine()` has been on every kept document since D11 slice 4 while the screen said nothing,
 * so a flyer who noticed a reading change between two visits could answer "which version produced
 * this?" about a saved report and not about the page in front of them.
 */
describe('the running build is visible on the page, not only in saved documents', () => {
  const FOOTER = readFileSync(new URL('../components/SiteFooter.tsx', import.meta.url), 'utf8');

  it('renders the same line the documents carry, from the same module', () => {
    // Not a second phrasing built in the component. The whole reason `buildLine()` exists is that
    // six documents must not drift into six wordings; a seventh surface writing its own would be
    // the same defect on the surface a flyer sees most.
    expect(FOOTER).toContain("from '@/lib/buildInfo'");
    expect(FOOTER, 'the shared formatter, not a hand-built string').toContain('buildLine()');
    expect(FOOTER, 'no second phrasing of the build line').not.toMatch(/`Debrief \$\{/);
  });

  it('links the build to the commit it was made from', () => {
    // An identifier nobody can resolve is decoration. The methods change most weeks, which is the
    // whole reason the stamp exists, so `Debrief a1b2c3d` is only useful if a1b2c3d can be read.
    expect(FOOTER).toContain('/commit/${BUILD_SHA}');
    expect(FOOTER, 'an outbound link carries the standing rel').toMatch(/rel="noopener noreferrer"/);
  });

  it('says nothing at all outside a production build', () => {
    // `BUILD_SHA` is exactly 'dev' there, and a version line reading "Debrief dev" on a real visit
    // would be worse than no line — it looks like a build identifier and identifies nothing.
    expect(FOOTER).toContain("BUILD_SHA !== 'dev'");
  });
});
