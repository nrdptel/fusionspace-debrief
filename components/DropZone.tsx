'use client';

import { useRef, useState } from 'react';

export default function DropZone({
  onFile,
  onSample,
  busy,
}: {
  onFile: (file: File) => void;
  onSample: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    if (files && files[0]) onFile(files[0]);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed p-10 text-center transition ${
          dragging
            ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-500/60 dark:bg-indigo-950/30'
            : 'border-zinc-300 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/30'
        }`}
      >
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">
          Drop a flight log here
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          CSV or text export from your altimeter — or any logger&apos;s CSV.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            Choose a file
          </button>
          <button
            type="button"
            onClick={onSample}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Try a sample flight
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.log,text/csv,text/plain"
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
