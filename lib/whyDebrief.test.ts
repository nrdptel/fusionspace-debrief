import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WHY } from './whyDebrief';

/**
 * P5 slice 2. `COMPETITION.md`'s standing conclusion opens by saying it "is what the landing
 * surface and the README should say, and right now they do not say it" — so the landing surface
 * now says it, and this holds the two side by side.
 *
 * **Every one of these is a claim about a competitor**, which is why it is worth a test rather
 * than a careful moment. The ledger is where the evidence lives, row by row, with each claim
 * marked verified or `UNVERIFIED`; a claim on the landing page that has quietly stopped being true
 * in the ledger is the worst kind of stale copy, because a flyer cannot check it and a rival can.
 * This repo's standing rule covers exactly this case: where two lists must agree, a test holds
 * them side by side and fails when they drift.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LEDGER = readFileSync(`${ROOT}COMPETITION.md`, 'utf8');
/** Whitespace-normalised, because the ledger is hard-wrapped: "different\n   manufacturers" is one
 *  phrase to a reader and two lines to a substring match, and a check that a reflow can break is a
 *  check the next session deletes. */
const CONCLUSION = LEDGER.slice(LEDGER.indexOf('## Standing conclusion')).replace(/\s+/g, ' ');

describe('the landing surface says what the ledger concluded', () => {
  it('makes a claim for each item the ledger stands behind', () => {
    expect(CONCLUSION.length, 'the standing conclusion is still in the ledger').toBeGreaterThan(500);
    expect(WHY.length, 'one claim per conclusion item').toBe(4);
  });

  it('keeps every claim tied to a phrase the ledger still carries', () => {
    // Anchored on the load-bearing WORDS of each conclusion item rather than on whole sentences —
    // a sentence match would fail on a comma and teach the next session to weaken the test.
    const anchors: [string, string[]][] = [
      ['Reads every board', ['reads every board', 'column mapper']],
      ['Two altimeters side by side', ['several recordings of one flight', 'different manufacturers']],
      ['A staged launch', ['staged launch reads as a staged launch', 'on one clock']],
      ['Nothing uploaded', ['nothing is uploaded', 'no signal']],
    ];
    for (const [what, phrases] of anchors) {
      for (const p of phrases) {
        expect(
          CONCLUSION.toLowerCase(),
          `"${what}" is on the landing page; the ledger must still say "${p}"`,
        ).toContain(p.toLowerCase());
      }
    }
  });

  it('does not publish the broader claim the ledger explicitly warns off', () => {
    // The ledger's own words: overlaying several of its OWN files is something Featherweight's
    // tool now does too (row 15), so "the only tool that compares two altimeters" would be false.
    // The cross-vendor part is what is unique, and the copy has to carry it.
    const multi = WHY.find((w) => w.title.toLowerCase().includes('side by side'));
    expect(multi, 'the multi-recording claim exists').toBeDefined();
    expect(
      `${multi!.title} ${multi!.body}`.toLowerCase(),
      'the cross-vendor qualifier is the whole claim, not decoration',
    ).toMatch(/different maker|different manufacturer|any maker/);
  });

  it('says a composite combines nothing, which is the part a rival would skip', () => {
    // Also the ledger's own instruction, and the MEASUREMENT invariant one level up: a composite
    // adds ORDER and no reading. A claim that implied a merged staged flight would be the one
    // thing `lib/composite.ts` refuses to do, advertised on the front page.
    const staged = WHY.find((w) => w.title.toLowerCase().includes('staged'));
    expect(staged, 'the staging claim exists').toBeDefined();
    expect(`${staged!.title} ${staged!.body}`.toLowerCase()).toMatch(/nothing is combined|not combined|combines nothing/);
  });

  it('never says a flyer uploads anything', () => {
    // The PRIVACY invariant reaches the copy. This is the surface where the promise is made.
    for (const w of WHY) {
      const t = `${w.title} ${w.body}`.toLowerCase();
      if (!t.includes('upload')) continue;
      expect(t, `"${w.title}" mentions uploading, so it must be a denial`).toMatch(/never|nothing|not |no /);
    }
  });

  it('is worth reading rather than four labels', () => {
    for (const w of WHY) {
      expect(w.title.length, `${w.title} is a real claim`).toBeGreaterThan(20);
      expect(w.body.split(/\s+/).length, `${w.title} explains itself`).toBeGreaterThan(20);
      // The craft bar's "tooltips that restate the label" one level up: the body must teach
      // something the title does not already say.
      expect(w.body.toLowerCase()).not.toContain(w.title.toLowerCase());
    }
  });
});
