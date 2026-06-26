'use client';

import Link from 'next/link';

// Route error boundary. Debrief does its work in the browser, so the likely
// trigger is an unexpected failure while reading or analyzing a file. We show a
// friendly, on-brand recovery instead of Next's bare error screen — and
// deliberately don't render the error message, to avoid leaking internals.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">Hold on</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Something went sideways
      </h1>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        Debrief hit an unexpected error. Your file never left your browser. Try again, and if a
        particular flight log keeps doing this, a bug report with the file would help.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
        >
          Back to Debrief
        </Link>
      </div>
    </main>
  );
}
