'use client';

import { useRef } from 'react';
import { FLIGHT_FILE_ACCEPT } from '@/lib/fileAccept';
import { Button } from './ui';

export default function DropZone({
  onFiles,
  onSample,
  busy,
}: {
  onFiles: (files: File[]) => void;
  onSample: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    if (files && files.length > 0) onFiles(Array.from(files));
  };

  return (
    <div>
      {/* The box has no drag handlers of its own. A file dropped ANYWHERE in the window is
          read now (components/useWindowFileDrop.ts) — the browser's default for a dropped
          file is to navigate to it, which used to throw a flyer out of the app whenever they
          released one in the margin, or on a report, where this box isn't rendered at all.
          A local handler here would also have ingested the same files twice as the drop
          bubbled up to the window. This stays as the visible affordance and the picker. */}
      <div
        aria-label="Flight log drop zone"
        className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center transition dark:border-zinc-700 dark:bg-zinc-900/30"
      >
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">
          Drop a flight log here
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          CSV, text, or Excel export from your altimeter — or any logger&apos;s CSV or
          spreadsheet. Drop several at once, or a whole launch day&apos;s folder, to compare
          them — anywhere on the page.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose files
          </Button>
          <Button onClick={onSample} disabled={busy}>
            Try a sample flight
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          aria-label="Choose a flight log file"
          accept={FLIGHT_FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Your file is read in this browser and never uploaded — parsing and analysis happen entirely
        on your device.
      </p>
    </div>
  );
}
