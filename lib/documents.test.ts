import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KEPT_DOCUMENTS, documentsCarryingProse } from './documents';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';

const root = fileURLToPath(new URL('../', import.meta.url));
const REPORT = readFileSync(`${root}components/FlightReport.tsx`, 'utf8');

const FIXTURE = 'lib/parsers/__fixtures__/altusmetrum-telemetrum.csv';
async function sample() {
  const name = FIXTURE.split('/').pop()!;
  const bytes = new Uint8Array(readFileSync(root + FIXTURE));
  const res = await importFlight({ name, text: new TextDecoder().decode(bytes), bytes } as never);
  if (res.kind !== 'flight') throw new Error(`fixture did not parse: ${res.kind}`);
  return { flight: res.flight, analysis: analyzeFlight(res.flight) };
}

describe('the documents a flyer keeps are one list', () => {
  it('has a stable, unique id for every document', () => {
    // The ids are what `lib/buildInfo.test.ts` and `lib/synthetic.test.ts` address documents by.
    // Those used to key on display NAMES, which meant renaming a button silently un-checked a
    // document — so a duplicate or a missing id is the failure that matters here.
    const ids = KEPT_DOCUMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of KEPT_DOCUMENTS) {
      expect(d.id, `${d.label} has an id`).toBeTruthy();
      expect(d.label.length, `${d.id} has a button label`).toBeGreaterThan(3);
      expect(d.title.length, `${d.id}'s title teaches something rather than restating the label`)
        .toBeGreaterThan(30);
      expect(d.title, `${d.id}'s title is not its label`).not.toBe(d.label);
      expect(d.ext.startsWith('.') || d.ext.startsWith('-'), `${d.id} has a file extension`).toBe(true);
      expect(d.mime, `${d.id} has a MIME type`).toMatch(/\//);
    }
  });

  it('every document actually builds, from a real flight, with NO context at all', () => {
    // `ctx` is optional throughout precisely so a check can do this. If an exporter ever requires
    // a piece of context, this fails rather than the checks quietly asserting against a document
    // built differently from the one a flyer gets.
    return sample().then(({ flight, analysis }) => {
      for (const doc of KEPT_DOCUMENTS) {
        const text = doc.build(flight, analysis, 'metric');
        expect(typeof text, `${doc.id} returns text`).toBe('string');
        expect(text.length, `${doc.id} is not empty`).toBeGreaterThan(100);
      }
    });
  });

  it('the report renders its save strip FROM the list, and writes no button by hand', () => {
    // This is the assertion that makes the registry load-bearing rather than decorative. Without
    // it, someone adds a seventh export as one more hand-written <Button> and both ratchets stay
    // green while the new document carries neither a build stamp nor a synthetic label.
    expect(REPORT, 'the strip maps the registry').toMatch(/KEPT_DOCUMENTS\.map\(/);
    for (const doc of KEPT_DOCUMENTS) {
      // No BUTTON spells out a document's own label; they come from the list.
      //
      // Scoped to `</Button>` rather than to any `>label<`, and the difference is not pedantry:
      // the looser form matched the clipboard-refused fallback, which is prose TELLING a flyer to
      // press "Save .csv". A check that reads source cannot tell code from prose about code —
      // the same trap DESIGN.md §9's card ratchet sprang on a comment earlier this run.
      const asButton = new RegExp(`>\\s*${doc.label.replace(/\./g, '\\.')}\\s*</Button>`);
      expect(REPORT, `${doc.label} is a hand-written button in the report`).not.toMatch(asButton);
    }
    // …and the six per-document closures the strip used to call are gone with it.
    for (const dead of ['downloadSummary', 'downloadMarkdown', 'downloadHtml', 'downloadData', 'downloadJson', 'downloadRecord']) {
      expect(REPORT, `${dead} survived the conversion`).not.toContain(`function ${dead}(`);
    }
  });

  it('names the data CSV as the one document that carries no prose, with the reason in one place', () => {
    // The exemption D11 slice 4 made for the build stamp and D10 slice 3 inherited for the
    // synthetic label. Stated once, on the document, rather than twice in two test files.
    const bare = KEPT_DOCUMENTS.filter((d) => !d.carriesProse);
    expect(bare.map((d) => d.id)).toEqual(['csv']);
    expect(documentsCarryingProse().length).toBe(KEPT_DOCUMENTS.length - 1);
  });
});
