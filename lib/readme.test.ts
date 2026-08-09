import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * P5 slice 1 — the repo landing page is a surface, and nothing in this repo's workflow ever looked
 * at it, which is exactly why it could go stale invisibly (owner note `ON-B2`).
 *
 * Measured 2026-08-09 before this: **4,545 words, 32 KB, zero images.** A forum visitor's first
 * screenful was three paragraphs of prose before a single link, and 68% of the file was one
 * `What it does` section of 3,099 words duplicating — without citations — what the methods page
 * now says properly.
 *
 * A broken image in a README is the specific failure worth automating against: it renders as a
 * grey box on github.com and nothing else in this repo would notice.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const README = readFileSync(`${ROOT}README.md`, 'utf8');

/** `![alt](path)` — every image the README references. */
const images = [...README.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({ alt: m[1], src: m[2] }));

describe('the README shows the tool rather than describing it', () => {
  it('has images, and every one of them is actually in the repo', () => {
    expect(images.length, 'the README shows what the tool does').toBeGreaterThanOrEqual(3);
    for (const { src } of images) {
      if (/^https?:/.test(src)) continue; // an external image is a different risk, and there are none
      expect(existsSync(`${ROOT}${src}`), `README references ${src}, which is not in the repo`).toBe(true);
    }
  });

  it('gives every image alt text that says what is IN it', () => {
    // A README is read by people who cannot see it and by machines that index it. "Screenshot" is
    // not alt text; the alt is the only description of the picture that exists.
    for (const { alt, src } of images) {
      expect(alt.trim().length, `${src} has alt text`).toBeGreaterThan(25);
      expect(alt.toLowerCase(), `${src}'s alt says what is in the image, not that it is one`).not.toMatch(
        /^(a )?(screenshot|image|picture)\.?$/,
      );
    }
  });

  it('stays short enough to be read, which is the whole complaint', () => {
    // A RATCHET with headroom, not a target. The point is that it cannot drift back to 4,545
    // words one paragraph at a time — which is how it got there, since every run correctly
    // updated one sentence and none was ever asked what the file had become.
    const words = README.split(/\s+/).filter(Boolean).length;
    expect(words, `README is ${words} words`).toBeLessThan(2600);
  });

  it('puts a picture and the live link in the first screenful', () => {
    // The measurement behind the note: a visitor arriving from a forum link met three paragraphs
    // of prose before anything to click or look at.
    const head = README.split('\n').slice(0, 14).join('\n');
    expect(head, 'the live site is linked at the top').toContain('debrief.fusionspace.co');
    expect(head, 'and there is something to look at').toMatch(/!\[/);
  });

  it('still points at the pages that carry the detail it no longer repeats', () => {
    // The cut is only honest if what was cut is reachable. 3,099 words came out; the methods page
    // is where that material lives, with citations the README never had.
    expect(README).toContain('/methods/');
    expect(README).toContain('/validation/');
  });

  it('never tells a flyer their file is uploaded', () => {
    // The PRIVACY invariant extends to the copy: "the word upload must never describe something a
    // flyer does in a tool whose promise is that nothing is uploaded."
    const claims = [...README.matchAll(/[^.!?\n]*\bupload(?:s|ed|ing)?\b[^.!?\n]*/gi)].map((m) => m[0].trim());
    for (const c of claims) {
      // The denial words, and "nothing" is one — the first version of this regex did not list it
      // and failed on "Nothing is uploaded, ever", which is as flat a denial as the file contains.
      expect(c.toLowerCase(), `"${c}" — every mention of uploading must be a denial`).toMatch(
        /\bnever\b|\bnot\b|\bno\b|\bnothing\b|\bwithout\b/,
      );
    }
  });
});
