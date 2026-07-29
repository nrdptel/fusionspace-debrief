import { describe, it, expect } from 'vitest';
import { unreadNote, MAX_NAMED_UNREAD } from './ingest';

// `ingestFiles` itself needs real Files and a real IndexedDB, so it is exercised end to end in
// e2e/compare.spec.ts. The SENTENCE it hands the surfaces is pure, and it makes claims about a
// flyer's logbook — so it is held here, where every case can be stated.
describe('what a drop was too full to read', () => {
  const N = (s: string) => unreadNote(s === '' ? [] : s.split(','), [], 6);

  it('says nothing when everything was read', () => {
    expect(unreadNote([], ['a.csv'], 6)).toBe('');
  });

  it('names the files, because a flyer has to know which ones to drop again', () => {
    const note = N('flight-7.csv,flight-8.csv');
    expect(note).toContain('flight-7.csv');
    expect(note).toContain('flight-8.csv');
    expect(note).toContain('2 files were not read');
  });

  it('reads as English for exactly one file', () => {
    // The plural strings were written first and the singular branch shipped untested, saying
    // "Drop it on their own to keep it."
    const note = N('flight-7.csv');
    expect(note).toContain('1 file was not read');
    expect(note).toContain("It isn't in your logbook");
    expect(note).toContain('drop it on their own to read it');
    expect(note).not.toMatch(/\bthem\b|\bthey\b|files were/i);
  });

  it('stops naming and starts counting, rather than printing a folder', () => {
    // A drop carries up to MAX_DROPPED_FILES (200). Uncapped, this ran to 7,500 characters —
    // nearly four phone screens of filenames above the comparison they were annotating.
    const many = Array.from({ length: 200 }, (_, i) => `f${i}.csv`);
    const note = unreadNote(many, [], 6);
    expect(note).toContain('200 files were not read');
    expect(note).toContain(`and ${200 - MAX_NAMED_UNREAD} more`);
    expect(note).toContain('f0.csv');
    expect(note, 'the 200th name is not printed').not.toContain('f199.csv');
    expect(note.length, 'a note, not a page').toBeLessThan(400);
  });

  it('does not claim a file is absent from the logbook when its NAME is in there', () => {
    // The one that mattered. A logbook entry is identified by name, parser and bytes, so two
    // different files can share a name — a launch day of six `data.csv` exports is the documented
    // case, and a folder drop yields basenames, so per-flight subfolders collapse to one name.
    // Telling a flyer "data.csv is not in your logbook" while a row called `data.csv` sits in it
    // is false, and "drop it again" cannot tell them which one to drop.
    const note = unreadNote(['data.csv'], ['data.csv'], 6);
    expect(note, 'still says it was not read, which is true').toContain('1 file was not read');
    expect(note, 'but claims nothing about the logbook').not.toContain('logbook');
    expect(note.toLowerCase()).toContain('drop it on their own to read it');
  });

  it('claims absence only when EVERY named file is absent', () => {
    const mixed = unreadNote(['data.csv', 'other.csv'], ['data.csv'], 6);
    expect(mixed, 'one collision is enough to withhold the claim').not.toContain('logbook');
    const clean = unreadNote(['a.csv', 'b.csv'], ['c.csv'], 6);
    expect(clean).toContain("They aren't in your logbook");
  });

  it('says READ them, never KEEP them', () => {
    // Nothing opened these files, so nothing knows they are flights. A pad photo or a
    // note-to-self past the cap is named here and rejected on the second drop — measured — and
    // "keep" promised otherwise.
    const note = N('notes-to-self.txt');
    expect(note).toContain('to read it');
    expect(note).not.toContain('keep');
  });
});
