'use client';

import { useEffect, useRef, useState } from 'react';

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
}: {
  onFiles: (files: File[]) => void;
  /** Whether a dropped file should be read. When false the drop is still swallowed. */
  accept: boolean;
}): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every element the pointer crosses, so a bare boolean
  // flickers off the moment the cursor moves between two children. Count them instead.
  const depth = useRef(0);
  // Read through refs so the listeners can be bound once: rebinding them on every render
  // would drop a drag in progress each time `accept` or a new callback identity landed.
  const onFilesRef = useRef(onFiles);
  const acceptRef = useRef(accept);
  useEffect(() => {
    onFilesRef.current = onFiles;
    acceptRef.current = accept;
  }, [onFiles, accept]);

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
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFilesRef.current(files);
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
