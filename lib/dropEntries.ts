// Reading a dropped FOLDER.
//
// `DataTransfer.files` holds one entry per dropped item, and for a folder that entry is the
// folder — a `File` with no bytes behind it, whose `arrayBuffer()` rejects. So dropping a
// launch day's folder produced exactly one unreadable item and the app blamed the flyer's
// folder for not being a flight log, on the gesture `lib/ingest` is named for and the methods
// page advertises by name.
//
// The contents come from the File System Entry API instead (`DataTransferItem.webkitGetAsEntry`),
// which every browser Debrief targets supports under that prefixed name. It is kept here, pure
// and injectable, rather than inside the drop handler: the traversal has three sharp edges and
// none of them is testable through a real drag in a headless browser.
//
//  1. `readEntries` returns a BATCH, not a directory. It answers at most ~100 entries per call
//     and must be called again until it returns an empty array — the single most common way
//     this is written wrong, and it silently loses the 101st file rather than failing.
//  2. The entries must be taken from the event SYNCHRONOUSLY (the caller's job — see
//     `useWindowFileDrop`); the `DataTransfer` is emptied when the handler returns.
//  3. A folder can be arbitrarily deep and arbitrarily wide, and a flyer can drop their home
//     directory by accident. Both are bounded here rather than left to exhaust the tab.

import { FLIGHT_FILE_EXTENSIONS } from './fileAccept';

/** The part of the File System Entry API this needs, named structurally so a test can pass a
 *  plain object and so nothing here depends on a DOM lib type that varies by TS version. */
export interface DropEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(onOk: (f: File) => void, onErr?: (e: unknown) => void): void;
  createReader?(): DropDirectoryReader;
}

export interface DropDirectoryReader {
  readEntries(onOk: (entries: DropEntry[]) => void, onErr?: (e: unknown) => void): void;
}

/** How many files one drop may yield. A launch day is a handful; this is the guard against a
 *  flyer dropping a whole photo library, not a limit anyone should meet in practice. The
 *  surfaces cap what they ANALYSE much lower (MAX_COMPARE), so this only bounds the read. */
export const MAX_DROPPED_FILES = 200;

/** How deep to walk. Loggers write flat folders, sometimes one level per flight; nothing
 *  legitimate is nested deeper than this, and it stops a symlink loop or a mounted volume
 *  turning one drop into an unbounded walk. */
export const MAX_DROP_DEPTH = 4;

/** How many entries the walk may enumerate before giving up. A dropped volume, or a symlink
 *  loop the depth cap alone does not stop, is a wide tree rather than a deep one: `out` never
 *  fills, so the file cap never trips, and the walk enumerates forever. */
export const MAX_WALKED_ENTRIES = 5_000;

const readBatch = (reader: DropDirectoryReader): Promise<DropEntry[]> =>
  new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    );
  });

const entryFile = (entry: DropEntry): Promise<File | null> =>
  new Promise((resolve) => {
    if (typeof entry.file !== 'function') return resolve(null);
    entry.file(
      (f) => resolve(f),
      () => resolve(null),
    );
  });

/** Every file inside the dropped entries, folders walked, in the order they were found.
 *
 *  Nulls are tolerated: `webkitGetAsEntry()` returns null for an item the browser will not
 *  describe, and the caller passes what it got rather than filtering first, so a mixed drop of
 *  files and folders comes through in one list.
 *
 *  Dot-files are skipped. A macOS folder carries `.DS_Store`, a git checkout carries `.git`,
 *  and neither is a flight log — they would only ever arrive at the parser to be rejected by
 *  name in the "left out" sentence, which is noise about the flyer's filesystem rather than
 *  about their flights. */
export async function filesFromEntries(
  entries: (DropEntry | null)[],
  max: number = MAX_DROPPED_FILES,
  maxDepth: number = MAX_DROP_DEPTH,
): Promise<File[]> {
  const out: File[] = [];
  const queue: { entry: DropEntry; depth: number }[] = [];
  for (const e of entries) if (e && !e.name.startsWith('.')) queue.push({ entry: e, depth: 0 });
  // Every entry this walk has queued or read, so the bound below covers the WALK rather than
  // one directory's read: a wide tree of empty folders enumerates nothing a flyer wants and
  // could otherwise queue b^depth entries while `out` never grows and never trips its own cap.
  let seen = queue.length;

  while (queue.length > 0 && out.length < max) {
    const { entry, depth } = queue.shift() as { entry: DropEntry; depth: number };
    if (entry.isFile) {
      // Inside a folder, take only what could be a flight log. A launch-day folder also holds
      // the phone photos of the pad, and handing those to `ingest` means reading each one whole
      // and decoding it as text before rejecting it — tens of seconds and hundreds of megabytes
      // for a "left out" sentence listing the flyer's camera roll. A file the flyer dropped
      // DIRECTLY (depth 0) is always tried: they chose it, extension or not.
      if (depth > 0 && !looksLikeAFlightFile(entry.name)) continue;
      const f = await entryFile(entry);
      if (f) out.push(f);
      continue;
    }
    if (!entry.isDirectory || depth >= maxDepth || typeof entry.createReader !== 'function') continue;
    const reader = entry.createReader();
    // Until it says there is nothing left — one call is a batch, not the directory.
    for (;;) {
      if (seen > MAX_WALKED_ENTRIES) break;
      const batch = await readBatch(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        if (child && !child.name.startsWith('.')) {
          queue.push({ entry: child, depth: depth + 1 });
          seen++;
        }
      }
    }
    if (seen > MAX_WALKED_ENTRIES) break;
  }
  return out;
}

/** Whether a name found INSIDE a dropped folder is worth opening. Keyed off the same list the
 *  file pickers offer, so the two cannot drift; an extensionless file is allowed through
 *  because plenty of loggers write one. */
function looksLikeAFlightFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return true; // no extension at all — a logger's own dump, worth a look
  const ext = name.slice(dot).toLowerCase();
  return (FLIGHT_FILE_EXTENSIONS as readonly string[]).includes(ext);
}
