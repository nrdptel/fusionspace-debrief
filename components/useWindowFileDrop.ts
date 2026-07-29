'use client';

import { useEffect, useRef, useState } from 'react';
import { filesFromEntries, type DropEntry } from '@/lib/dropEntries';

/**
 * Catch a flight log dropped anywhere in the window, not only on the dashed box.
 *
 * A browser's default action for a dropped file is to NAVIGATE TO IT. Debrief had exactly
 * two drop targets — the drop zone on the idle screen and the one on the comparison surface
 * — and neither exists once a report is open. So the most natural gesture on that screen,
 * "I've read this one, here's the next," dropped the file on the altitude chart and left the
 * app for a page of raw CSV. It cost the report, its zoom, its label and its notes, none of
 * which have an address to come back to. The same happened on the idle screen for anything
 * released in the margins: measured with a real DragEvent, `dragover` on the drop zone is
 * cancelled, on the footer it is not.
 *
 * So the window handles it. Two jobs, and the first matters even where the second doesn't:
 *
 *  1. **Never let the browser navigate.** `preventDefault` on every file dragover/drop that
 *     reaches the window. This alone turns a lost report into a no-op.
 *  2. **Read it, where reading it is what the flyer meant.** `accept` is false in the column
 *     mapper, where taking the file would throw away the mapping in progress — the drop is
 *     still swallowed, and the caller says why nothing happened rather than leaving it
 *     silent.
 *
 * Only file drags engage: `types` carrying `Files` is the test, so dragging selected text or
 * a link across the page behaves normally.
 */
export function useWindowFileDrop({
  onFiles,
  accept,
  onEmptyFolder,
}: {
  onFiles: (files: File[]) => void;
  /** Whether a dropped file should be read. When false the drop is still swallowed. */
  accept: boolean;
  /** A folder was dropped and nothing inside it could be a flight log. Named so the surface can
   *  say that, rather than the flyer watching a folder disappear into nothing. */
  onEmptyFolder?: (folderNames: string[]) => void;
}): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every element the pointer crosses, so a bare boolean
  // flickers off the moment the cursor moves between two children. Count them instead.
  const depth = useRef(0);
  // Read through refs so the listeners can be bound once: rebinding them on every render
  // would drop a drag in progress each time `accept` or a new callback identity landed.
  const onFilesRef = useRef(onFiles);
  const acceptRef = useRef(accept);
  const onEmptyFolderRef = useRef(onEmptyFolder);
  useEffect(() => {
    onFilesRef.current = onFiles;
    acceptRef.current = accept;
    onEmptyFolderRef.current = onEmptyFolder;
  }, [onFiles, accept, onEmptyFolder]);

  useEffect(() => {
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault(); // the one line that stops the browser leaving Debrief
      if (e.dataTransfer) e.dataTransfer.dropEffect = acceptRef.current ? 'copy' : 'none';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!acceptRef.current) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      const files = Array.from(dt.files ?? []);

      // A dropped FOLDER arrives in `dt.files` as one entry that IS the folder — a File with
      // no bytes behind it, whose `arrayBuffer()` rejects — so "drop a launch day's folder at
      // once", which the methods page advertises and `lib/ingest` is written around, produced
      // one unreadable item and blamed the folder for not being a flight log.
      //
      // The contents come from the entry API. It has to be read SYNCHRONOUSLY, here, because
      // the DataTransfer is emptied the moment this handler returns — the walk itself is async
      // and runs on entries already in hand. Taken only when a directory is actually in the
      // drop: a plain file drop keeps the `dt.files` path it has always used, so the common
      // gesture gains no new failure mode.
      const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file');
      const entries = items.map((it) =>
        typeof it.webkitGetAsEntry === 'function' ? (it.webkitGetAsEntry() as DropEntry | null) : null,
      );
      const folders = entries.filter((en): en is DropEntry => !!en?.isDirectory);
      if (folders.length === 0) {
        if (files.length > 0) onFilesRef.current(files);
        return;
      }

      // Item by item, not list against list. An item the browser will not describe returns a
      // null entry, and its real `File` is in `dt.files` — choosing the walk's result over the
      // whole of `dt.files` dropped that file with no flight and no "left out" line to show for
      // it. So: the folders are walked, everything else is taken as the browser gave it.
      const loose = entries.map((en, i) => (en?.isDirectory ? null : files[i])).filter((f): f is File => !!f);
      filesFromEntries(folders)
        .then((found) => {
          // The accept gate is checked again HERE. It was checked on the event, but delivery has
          // moved off that turn: a flyer can open the column mapper while a big folder is still
          // being walked, and firing into it would discard the mapping in progress — the one
          // thing `accept: false` exists to protect.
          if (!acceptRef.current) return;
          const use = [...loose, ...found];
          if (use.length > 0) {
            onFilesRef.current(use);
            return;
          }
          // Nothing usable came out. Saying so is the whole point: feeding the DIRECTORY entry
          // back into ingest — which is what `dt.files` holds for a folder, a File with no bytes
          // whose `arrayBuffer()` rejects — reproduces the exact "couldn't be read as a flight"
          // this change exists to remove, and blames the folder for it a second time.
          onEmptyFolderRef.current?.(folders.map((f) => f.name));
        })
        .catch(() => {
          // A browser that throws rather than calling an error callback must not swallow the
          // gesture in silence, and must not raise an unhandled rejection either.
          if (acceptRef.current) onEmptyFolderRef.current?.(folders.map((f) => f.name));
        });
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return { dragging };
}
