import { describe, it, expect } from 'vitest';
import { filesFromEntries, MAX_DROPPED_FILES, MAX_WALKED_ENTRIES, type DropEntry, type DropDirectoryReader } from './dropEntries';

// Fakes rather than a real drag: none of what follows can be produced by dropping a folder in a
// headless browser, and all three edges are ones this gets wrong silently rather than loudly.

const file = (name: string): DropEntry => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok) => ok(new File([`T,Alt\n0,0\n`], name, { type: 'text/csv' })),
});

/** A directory whose reader answers in BATCHES of `batch`, the way a real one does. */
const dir = (name: string, children: DropEntry[], batch = 100): DropEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: (): DropDirectoryReader => {
    let i = 0;
    return {
      readEntries: (ok) => {
        const next = children.slice(i, i + batch);
        i += next.length;
        ok(next);
      },
    };
  },
});

describe('filesFromEntries', () => {
  it('walks a dropped folder into the files inside it', async () => {
    const found = await filesFromEntries([dir('launch-day', [file('a.csv'), file('b.csv'), file('c.csv')])]);
    expect(found.map((f) => f.name)).toEqual(['a.csv', 'b.csv', 'c.csv']);
  });

  it('reads a directory to the END, not just its first batch', async () => {
    // `readEntries` answers at most ~100 entries per call and must be called again until it
    // returns an empty array. Reading it once is the single most common way this is written
    // wrong, and it loses the 101st file in silence rather than failing.
    const many = Array.from({ length: 250 }, (_, i) => file(`flight-${i}.csv`));
    const found = await filesFromEntries([dir('season', many, 100)], 500);
    expect(found).toHaveLength(250);
    expect(found[249].name).toBe('flight-249.csv');
  });

  it('takes a mixed drop of loose files and folders in one list', async () => {
    const found = await filesFromEntries([file('loose.csv'), dir('day', [file('inner.csv')]), null]);
    expect(found.map((f) => f.name)).toEqual(['loose.csv', 'inner.csv']);
  });

  it('walks nested folders, and stops before an unbounded one', async () => {
    const deep = dir('d1', [dir('d2', [dir('d3', [file('deep.csv')])])]);
    expect((await filesFromEntries([deep])).map((f) => f.name)).toEqual(['deep.csv']);
    // A symlink loop or a mounted volume must not turn one drop into an unbounded walk.
    const tooDeep = dir('d1', [dir('d2', [dir('d3', [dir('d4', [dir('d5', [file('buried.csv')])])])])]);
    expect(await filesFromEntries([tooDeep])).toEqual([]);
  });

  it('skips the filesystem clutter rather than reporting it as unreadable', async () => {
    // A macOS folder carries .DS_Store and a checkout carries .git; naming those in the
    // "left out" sentence is noise about the flyer's filesystem, not about their flights.
    const found = await filesFromEntries([dir('day', [file('.DS_Store'), file('real.csv'), dir('.git', [file('config')])])]);
    expect(found.map((f) => f.name)).toEqual(['real.csv']);
  });

  it('takes only what could be a flight log out of a folder', async () => {
    // A launch-day folder also holds the phone photos of the pad. Handing those to the parser
    // means reading each one whole and decoding it as text before rejecting it — tens of
    // seconds and hundreds of megabytes, for a "left out" sentence listing the camera roll.
    const found = await filesFromEntries([
      dir('launch-day', [file('IMG_4821.HEIC'), file('flight.csv'), file('notes.txt'), file('clip.mov'), file('TELEMETRY')]),
    ]);
    expect(found.map((f) => f.name), 'an extensionless dump is still worth a look').toEqual([
      'flight.csv',
      'notes.txt',
      'TELEMETRY',
    ]);
  });

  it('still opens a file the flyer dropped directly, whatever it is called', async () => {
    // They chose it. A folder's contents are a guess about what is in there; a dropped file is
    // an instruction, and refusing it by extension would break every logger with its own.
    const found = await filesFromEntries([file('BLRVN87.weird'), file('data')]);
    expect(found.map((f) => f.name)).toEqual(['BLRVN87.weird', 'data']);
  });

  it('gives up on a tree too wide to walk, rather than enumerating it forever', async () => {
    // The depth cap alone does not bound this: a wide tree of empty folders never puts a file
    // in `out`, so the file cap never trips and the walk enumerates b^depth entries.
    const wide = (depth: number): DropEntry =>
      depth === 0
        ? file('nothing.csv')
        : dir(`d${depth}`, Array.from({ length: 40 }, () => wide(depth - 1)));
    const found = await filesFromEntries([wide(3)], MAX_DROPPED_FILES);
    // It returns whatever it reached before giving up, and it RETURNS — that is the assertion.
    expect(found.length).toBeLessThanOrEqual(MAX_DROPPED_FILES);
    expect(MAX_WALKED_ENTRIES).toBeGreaterThan(0);
  });

  it('bounds what one drop can yield', async () => {
    const huge = Array.from({ length: MAX_DROPPED_FILES + 50 }, (_, i) => file(`f${i}.csv`));
    expect(await filesFromEntries([dir('everything', huge)])).toHaveLength(MAX_DROPPED_FILES);
    expect(await filesFromEntries([dir('everything', huge)], 5)).toHaveLength(5);
  });

  it('survives an entry that refuses to answer', async () => {
    const refuses: DropEntry = { isFile: true, isDirectory: false, name: 'locked.csv', file: (_ok, err) => err?.(new Error('denied')) };
    const unreadable: DropEntry = {
      isFile: false,
      isDirectory: true,
      name: 'sealed',
      createReader: () => ({ readEntries: (_ok, err) => err?.(new Error('denied')) }),
    };
    const found = await filesFromEntries([refuses, unreadable, file('fine.csv')]);
    expect(found.map((f) => f.name), 'one refusal does not lose the rest of the drop').toEqual(['fine.csv']);
  });
});
