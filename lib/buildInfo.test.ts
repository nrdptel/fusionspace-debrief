import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importFlight } from './parsers/index';
import { analyzeFlight } from './analyze';
import { decodeBytes } from './encoding';
import { BUILD_SHA, buildFields, buildLine } from './buildInfo';
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

  /** The documents that carry the stamp, and the one that deliberately does not. */
  const DOCUMENTS: { name: string; text: () => string }[] = [
    { name: '.txt summary', text: () => summaryText(flight, analysis, 'metric') },
    { name: '.md summary', text: () => summaryMarkdown(flight, analysis, 'metric') },
    { name: '.html report', text: () => summaryHtml(flight, analysis, 'metric') },
    { name: '.json analysis', text: () => analysisJson(flight, analysis, 'metric') },
    { name: 'canonical flight record', text: () => toCanonical(flight) },
  ];

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
    for (const doc of DOCUMENTS.slice(0, 3)) {
      expect(doc.text(), `${doc.name} uses the shared wording`).toContain(line);
    }
  });

  it('puts it in the machine-readable documents as data, not as prose', () => {
    const fields = buildFields();
    expect(fields.build).toBe(BUILD_SHA);
    for (const name of ['.json analysis', 'canonical flight record']) {
      const doc = DOCUMENTS.find((d) => d.name === name)!;
      const parsed = JSON.parse(doc.text()) as Record<string, unknown>;
      expect(parsed.build, `${name} carries a machine-readable build field`).toBe(BUILD_SHA);
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
